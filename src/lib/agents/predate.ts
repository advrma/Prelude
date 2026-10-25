import { bus, predateChannel } from "../bus";
import { config, getMode } from "../config";
import { writeCachedPredate } from "../cachefiles";
import { guardOutgoing } from "../hub/guard";
import { ensureMatch } from "../hub/pool";
import { llm } from "../llm/router";
import type { LlmMessage } from "../llm/types";
import { getState, updateState, type StoreState } from "../store";
import type { AgentMessage, PreDate, Student, Verdict } from "../types";
import { predateSystem } from "./prompts";
import { runVerdict } from "./verdict";

// Pre-date runner (§7.2): A and B alternate for PREDATE_TURNS, every message passes the guard,
// then both verdicts run. Progress is emitted on the bus so SSE routes can stream it.

export type PredateEvent =
  | { type: "meta"; predate: PublicPredate; replay: boolean }
  | { type: "typing"; from: string }
  | { type: "message"; message: AgentMessage }
  | { type: "verdict"; verdict: Verdict }
  | { type: "done"; predate: PublicPredate }
  | { type: "error"; error: string };

export interface Participant {
  id: string;
  label: string;
  pronouns: string;
  avatar: string;
}

export interface PublicPredate extends PreDate {
  participants: { a: Participant; b: Participant };
  viewer?: string;
}

/** What a client may see: no hub-log originals; with `as`, only that student's own verdict and no other-side identity. */
export function publicPredate(pd: PreDate, students: Student[], as?: string): PublicPredate {
  const viewer = as && (as === pd.a || as === pd.b) ? as : undefined;
  const who = (id: string): Participant => {
    const s = students.find((x) => x.id === id);
    if (viewer && id !== viewer) return { id, label: "Their agent", pronouns: s?.vibe.pronouns ?? "they/them", avatar: "/avatars/locked.svg" };
    return {
      id,
      label: s?.private.firstName ? `${s.private.firstName}'s agent` : "Agent",
      pronouns: s?.vibe.pronouns ?? "they/them",
      avatar: s?.private.photos[0] ?? "/avatars/locked.svg",
    };
  };
  const verdicts = viewer ? (pd.verdicts[viewer] ? { [viewer]: pd.verdicts[viewer] } : {}) : pd.verdicts;
  return {
    ...pd,
    transcript: pd.transcript.map(({ blocked, ...m }) => (blocked ? { ...m, blocked: { reason: blocked.reason } } : m)),
    verdicts,
    participants: { a: who(pd.a), b: who(pd.b) },
    viewer,
  };
}

function emit(id: string, ev: PredateEvent) {
  bus.emit(predateChannel(id), ev);
}

function cleanTurn(text: string): string {
  return text
    .replace(/^\s*(?:agent\s*[ab]|your agent|their agent|me)\s*:\s*/i, "")
    .replace(/^["“]|["”]$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function firstSentence(s: string): string {
  const m = /^.*?[.!?](\s|$)/.exec(s);
  return (m ? m[0] : s).trim().slice(0, 160);
}

interface View {
  from: string; // student id
  content: string; // public, guarded text
  forOther: string; // what the other agent received
}

/** Rolling summary of older turns + the last 3 messages, from this speaker's point of view. */
export function contextFor(speakerId: string, views: View[], turn: number, total: number): LlmMessage[] {
  const text = (v: View) => (v.from === speakerId ? v.content : v.forOther);
  const who = (v: View) => (v.from === speakerId ? "You" : "Other agent");
  const older = views.slice(0, Math.max(0, views.length - 3));
  const recent = views.slice(-3);
  const parts: string[] = [];
  if (older.length) parts.push(`Summary of earlier turns:\n${older.map((v) => `- ${who(v)}: ${firstSentence(text(v))}`).join("\n")}`);
  if (recent.length) parts.push(`Most recent messages:\n${recent.map((v) => `${who(v)}: ${text(v)}`).join("\n")}`);
  if (turn === 0) parts.push("You open the conversation. Say hi and share something about your student, then ask a question.");
  else if (turn === total - 1) parts.push("This is your final turn. Wrap up warmly in 1–2 sentences. No question needed.");
  else parts.push("Your turn. Reply in 1–3 sentences.");
  return [{ role: "user", content: parts.join("\n\n") }];
}

function sourceForMode(): PreDate["source"] {
  const m = getMode();
  return m === "live" ? "live" : m === "replay" ? "replay" : "mock";
}

async function patch(id: string, fn: (pd: PreDate, state: StoreState) => void) {
  await updateState((s) => {
    const pd = s.predates.find((p) => p.id === id);
    if (pd) fn(pd, s);
  });
}

async function execute(id: string): Promise<PreDate> {
  const state = await getState();
  const pd0 = state.predates.find((p) => p.id === id);
  if (!pd0) throw new Error(`pre-date ${id} not found`);
  const A = state.students.find((s) => s.id === pd0.a);
  const B = state.students.find((s) => s.id === pd0.b);
  if (!A || !B) throw new Error(`students for ${id} not found`);

  const total = config.predateTurns();
  const source = sourceForMode();
  await patch(id, (pd) => {
    Object.assign(pd, { status: "running", transcript: [], verdicts: {}, matched: false, source, models: [], error: undefined, startedAt: new Date().toISOString(), finishedAt: undefined });
  });

  const views: View[] = [];
  const models = new Set<string>();
  const transcript: AgentMessage[] = [];

  try {
    for (let turn = 0; turn < total; turn++) {
      const speaker = turn % 2 === 0 ? A : B;
      emit(id, { type: "typing", from: `agent:${speaker.id}` });
      const res = await llm({
        task: "predate_turn",
        system: predateSystem(speaker.vibe),
        messages: contextFor(speaker.id, views, turn, total),
        mock: {
          kind: "predate_turn",
          seed: id,
          turn,
          totalTurns: total,
          me: speaker.vibe,
          lastOther: views.at(-1)?.forOther,
          history: views.slice(0, -1).map((v) => (v.from === speaker.id ? v.content : v.forOther)),
        },
      });
      models.add(res.model);
      const g = guardOutgoing(cleanTurn(res.text) || "…", { firstName: speaker.private.firstName, major: speaker.private.major });
      const msg: AgentMessage = {
        id: `${id}-t${turn}`,
        predateId: id,
        from: `agent:${speaker.id}`,
        type: "chat",
        level: 0,
        content: g.content,
        ...(g.blocked ? { blocked: g.blocked } : {}),
        data: { model: res.model, ...(res.fallback ? { fallback: res.fallback } : {}), ...(res.cached ? { cached: true } : {}) },
        at: new Date().toISOString(),
      };
      views.push({ from: speaker.id, content: g.content, forOther: g.forOther });
      transcript.push(msg);
      await patch(id, (pd, s) => {
        pd.transcript.push(msg);
        if (g.original)
          s.hubLog.push({ messageId: msg.id, predateId: id, from: msg.from, reason: g.blocked!.reason, original: g.original, at: msg.at });
      });
      emit(id, { type: "message", message: msg });
    }

    emit(id, { type: "typing", from: "hub" });
    const [va, vb] = await Promise.all([runVerdict(pd0, A, B, transcript), runVerdict(pd0, B, A, transcript)]);
    for (const v of [va, vb]) {
      models.add(v.model);
      emit(id, { type: "verdict", verdict: v.verdict });
    }
    const threshold = config.matchThreshold();
    let final: PreDate | undefined;
    await patch(id, (pd, s) => {
      pd.verdicts = { [A.id]: va.verdict, [B.id]: vb.verdict };
      pd.matched = va.verdict.score >= threshold && vb.verdict.score >= threshold;
      pd.status = "done";
      pd.models = [...models];
      pd.finishedAt = new Date().toISOString();
      ensureMatch(s, pd);
      final = structuredClone(pd);
    });
    writeCachedPredate(final!);
    const after = await getState();
    emit(id, { type: "done", predate: publicPredate(final!, after.students) });
    return final!;
  } catch (err) {
    const error = String((err as Error)?.message ?? err);
    await patch(id, (pd) => {
      pd.status = "failed";
      pd.error = error;
    });
    emit(id, { type: "error", error });
    throw err;
  }
}

const g = globalThis as unknown as { __preludeRuns?: Map<string, Promise<PreDate>>; __preludeQueueRunning?: boolean };
const runs = (g.__preludeRuns ??= new Map());

/** Start (or join) the run for a pre-date. Concurrent callers share one run. */
export function startPredate(id: string): Promise<PreDate> {
  const existing = runs.get(id);
  if (existing) return existing;
  const p = execute(id).finally(() => runs.delete(id));
  runs.set(id, p);
  return p;
}

export function isRunning(id: string): boolean {
  return runs.has(id);
}

/** Reset a finished/failed pre-date so it can be run again (e.g. "Run again live"). */
export async function resetPredate(id: string): Promise<boolean> {
  if (runs.has(id)) return false;
  let ok = false;
  await patch(id, (pd) => {
    Object.assign(pd, { status: "queued", transcript: [], verdicts: {}, matched: false, error: undefined, finishedAt: undefined });
    ok = true;
  });
  return ok;
}

/** Run every queued pre-date one after another in the background. Safe to call repeatedly. */
export async function runQueued(): Promise<number> {
  if (g.__preludeQueueRunning) return 0;
  g.__preludeQueueRunning = true;
  let n = 0;
  const tried = new Set<string>();
  try {
    for (;;) {
      const state = await getState();
      const next = state.predates.find((p) => p.status === "queued" && !runs.has(p.id) && !tried.has(p.id));
      if (!next) break;
      tried.add(next.id);
      try {
        await startPredate(next.id);
      } catch {
        /* marked failed; move on */
      }
      n++;
    }
  } finally {
    g.__preludeQueueRunning = false;
  }
  return n;
}
