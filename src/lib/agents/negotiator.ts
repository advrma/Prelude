import { getMode } from "../config";
import { readCachedNegotiation, writeCachedNegotiation } from "../cachefiles";
import { findPlace, loadPlaces } from "../data";
import { guardOutgoing } from "../hub/guard";
import {
  budgetLabel,
  dayName,
  firstStartAt,
  fmtTime,
  foodFits,
  isFreeAt,
  isWeekday,
  minBudget,
  overlapWindows,
  placeOpen,
  rankPlaces,
  resolveDate,
  withinBudget,
} from "../hub/schedule";
import { mockNegotiateTurn } from "../llm/mock";
import { llm } from "../llm/router";
import type { NegotiationSide } from "../llm/types";
import { NegotiateTurnSchema, type NegotiateTurn } from "../schemas";
import { getState, updateState } from "../store";
import type { AgentMessage, DateOption, DatePlan, Place, Student, Weekday } from "../types";
import { negotiatorSystem } from "./prompts";

// Date negotiator (§7.5). Two agents, each knowing only its own student's logistics, trade typed
// turns (propose → counter → … → accept | need_human). The hub validates every option in code
// against BOTH students' real constraints and fills up to 3 options deterministically.

export const MAX_ROUNDS = 4;

export function sideOf(s: Student): NegotiationSide {
  return {
    id: s.id,
    pronouns: s.vibe.pronouns,
    freeBusy: s.private.freeBusy,
    busy: s.private.busy,
    budgetBand: s.private.budgetBand,
    food: s.private.food,
    dateVibe: s.private.dateVibe,
  };
}

export interface Candidate {
  day?: string;
  start?: string;
  place?: string;
}

/** Why a candidate fails for this pair (empty = valid). Checked in code, never trusted to the LLM. */
export function validateOption(c: Candidate, a: NegotiationSide, b: NegotiationSide): string[] {
  const reasons: string[] = [];
  const place = findPlace(c.place);
  if (!place) reasons.push("unknown place");
  else if (!place.public) reasons.push("not a public place");
  if (!isWeekday(c.day)) reasons.push("bad day");
  if (!c.start || !/^\d{2}:\d{2}$/.test(c.start)) reasons.push("bad time");
  if (reasons.length) return reasons;
  const day = c.day as Weekday;
  const p = place!;
  if (!isFreeAt(a.freeBusy, day, c.start!)) reasons.push(`side A not free ${day} ${c.start}`);
  if (!isFreeAt(b.freeBusy, day, c.start!)) reasons.push(`side B not free ${day} ${c.start}`);
  if (!placeOpen(p, day, c.start!)) reasons.push("place closed then");
  if (!withinBudget(p, minBudget(a.budgetBand, b.budgetBand))) reasons.push("over budget");
  if (!foodFits(p, [...a.food, ...b.food])) reasons.push("doesn't fit food needs");
  return reasons;
}

function foodNote(a: NegotiationSide, b: NegotiationSide, p: Place): string | null {
  const needs = [...new Set([...a.food, ...b.food])];
  if (!needs.length) return null;
  return p.servesFood ? `${needs.join(" + ")} friendly` : "no food needed";
}

function toOption(c: Required<Candidate>, place: Place, a: NegotiationSide, b: NegotiationSide, agreed: boolean, now: Date): DateOption {
  const budget = minBudget(a.budgetBand, b.budgetBand);
  const shared = place.tags.filter((t) => [...a.dateVibe, ...b.dateVibe].includes(t));
  const why = [
    agreed ? "Your agents agreed on this one" : null,
    `both free ${dayName(c.day)} at ${fmtTime(c.start)}`,
    `fits ${budgetLabel(budget)}`,
    foodNote(a, b, place),
    shared.length ? shared.slice(0, 2).join(" + ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    day: c.day,
    start: c.start,
    place: place.name,
    placeId: place.id,
    area: place.area,
    estCostPerPerson: place.typicalCost,
    why: why.charAt(0).toUpperCase() + why.slice(1),
    date: resolveDate(c.day as Weekday, now),
  };
}

/**
 * Exactly 3 options when possible: valid negotiated candidates first (agreed one first), then
 * deterministic picks from the overlap of free windows + places within both budgets and diets.
 */
export function buildOptions(candidates: Candidate[], a: NegotiationSide, b: NegotiationSide, now = new Date(), places = loadPlaces()): DateOption[] {
  const out: DateOption[] = [];
  const key = (o: { day: string; start: string; place: string }) => `${o.day}|${o.start}|${o.place}`;
  const seen = new Set<string>();
  candidates.forEach((c, i) => {
    if (validateOption(c, a, b).length) return;
    const place = findPlace(c.place)!;
    const full = { day: c.day!, start: c.start!, place: place.name };
    if (seen.has(key(full))) return;
    seen.add(key(full));
    out.push(toOption(full, place, a, b, i === 0, now));
  });

  if (out.length < 3) {
    const budget = minBudget(a.budgetBand, b.budgetBand);
    const ranked = rankPlaces(places, [...a.dateVibe, ...b.dateVibe]).filter((p) => withinBudget(p, budget) && foodFits(p, [...a.food, ...b.food]));
    const windows = overlapWindows(a.freeBusy, b.freeBusy);
    const generated: { day: string; start: string; place: Place }[] = [];
    for (const w of windows) for (const p of ranked) {
      const start = firstStartAt(p, w);
      if (start) generated.push({ day: w.day, start, place: p });
    }
    // Prefer variety: new day and new place, then new place, then anything not yet listed.
    const passes: ((g: (typeof generated)[number]) => boolean)[] = [
      (g) => !out.some((o) => o.day === g.day) && !out.some((o) => o.placeId === g.place.id),
      (g) => !out.some((o) => o.placeId === g.place.id),
      () => true,
    ];
    for (const ok of passes) {
      for (const g of generated) {
        if (out.length >= 3) break;
        const full = { day: g.day, start: g.start, place: g.place.name };
        if (seen.has(key(full)) || !ok(g) || validateOption(full, a, b).length) continue;
        seen.add(key(full));
        out.push(toOption(full, g.place, a, b, false, now));
      }
    }
  }
  return out.slice(0, 3);
}

function turnLine(t: NegotiateTurn, mine: boolean): string {
  const d = t.data ?? {};
  const details = [d.day, d.start, d.place, d.budgetBand].filter(Boolean).join(", ");
  return `${mine ? "You" : "Other agent"} → ${t.type.toUpperCase()}: ${t.content}${details ? ` [${details}]` : ""}`;
}

export interface NegotiationResult {
  plan: DatePlan;
  turns: NegotiateTurn[];
}

/** Run the two-agent negotiation (no store access; used by the route and tests). */
export async function negotiate(matchId: string, A: Student, B: Student, now = new Date()): Promise<NegotiationResult> {
  const places = loadPlaces();
  const sides = [sideOf(A), sideOf(B)];
  const students = [A, B];
  const turns: { by: number; turn: NegotiateTurn }[] = [];
  const messages: AgentMessage[] = [];
  let outcome: DatePlan["outcome"] = "need_human";

  for (let i = 0; i < MAX_ROUNDS * 2; i++) {
    const me = i % 2;
    const side = sides[me];
    const round = Math.floor(i / 2) + 1;
    const lastOther = [...turns].reverse().find((t) => t.by !== me)?.turn;
    const history = turns.map((t) => turnLine(t.turn, t.by === me)).join("\n");
    const res = await llm({
      task: "negotiate",
      system: negotiatorSystem(side, places, MAX_ROUNDS),
      messages: [
        {
          role: "user",
          content: `${history ? `Negotiation so far:\n${history}\n\n` : "You go first: make a proposal.\n\n"}Round ${round} of ${MAX_ROUNDS}. Your move. Reply with JSON only.`,
        },
      ],
      schema: NegotiateTurnSchema,
      mock: { kind: "negotiate", seed: matchId, side, lastOther, round, maxRounds: MAX_ROUNDS },
    });
    const parsed = NegotiateTurnSchema.safeParse(res.json);
    const turn: NegotiateTurn = parsed.success
      ? parsed.data
      : mockNegotiateTurn({ kind: "negotiate", seed: matchId, side, lastOther, round, maxRounds: MAX_ROUNDS });
    // The first move must be a proposal; "accept" with nothing on the table means "propose".
    if (i === 0 && (turn.type === "accept" || turn.type === "counter")) turn.type = "propose";
    const g = guardOutgoing(turn.content);
    turns.push({ by: me, turn });
    messages.push({
      id: `${matchId}-n${i}`,
      matchId,
      from: `agent:${students[me].id}`,
      type: turn.type,
      level: 3,
      content: g.content,
      ...(g.blocked ? { blocked: g.blocked } : {}),
      data: { ...turn.data, model: parsed.success ? res.model : "mock", ...(res.fallback || !parsed.success ? { fallback: res.fallback ?? "mock" } : {}) },
      at: new Date().toISOString(),
    });
    if (turn.type === "accept") {
      outcome = "agreed";
      break;
    }
    if (turn.type === "need_human") break;
  }

  // Candidates: the accepted proposal first, then every other proposal (latest first).
  const proposals = turns.filter((t) => t.turn.type === "propose" || t.turn.type === "counter").map((t) => t.turn.data);
  const accepted = outcome === "agreed" ? turns.at(-1)!.turn.data : undefined;
  const candidates: Candidate[] = [...(accepted ? [accepted] : []), ...proposals.reverse()];
  if (!accepted) candidates.unshift({}); // keep index 0 from being labelled "agreed"
  const options = buildOptions(candidates, sides[0], sides[1], now, places);
  const mode = getMode();
  return {
    turns: turns.map((t) => t.turn),
    plan: {
      negotiation: messages,
      options,
      picks: { [A.id]: null, [B.id]: null },
      outcome,
      source: mode === "live" ? "live" : mode === "replay" ? "replay" : "mock",
    },
  };
}

const g = globalThis as unknown as { __preludeNegotiations?: Map<string, Promise<DatePlan>> };
const running = (g.__preludeNegotiations ??= new Map());

/**
 * Start (or return) the negotiation for a stage-3 match. Uses data/cache/negotiations when present
 * (options are re-dated to the coming week), unless `fresh`.
 */
export function startNegotiation(matchId: string, opts: { fresh?: boolean } = {}): Promise<DatePlan> {
  const existing = running.get(matchId);
  if (existing) return existing;
  const p = (async () => {
    const state = await getState();
    const m = state.matches.find((x) => x.id === matchId);
    if (!m) throw new Error("match not found");
    if (m.stage < 3) throw new Error("both students must say yes to a real date first");
    if (m.datePlan && !opts.fresh) return m.datePlan;
    const A = state.students.find((s) => s.id === m.a)!;
    const B = state.students.find((s) => s.id === m.b)!;

    let plan: DatePlan;
    const cached = opts.fresh ? undefined : readCachedNegotiation(matchId);
    if (cached && cached.a === m.a && cached.b === m.b) {
      const now = new Date();
      plan = {
        ...cached.plan,
        options: cached.plan.options.map((o) => ({ ...o, date: isWeekday(o.day) ? resolveDate(o.day, now) : o.date })),
        picks: { [m.a]: null, [m.b]: null },
        final: undefined,
        source: "replay",
      };
    } else {
      plan = (await negotiate(matchId, A, B)).plan;
      writeCachedNegotiation({ matchId, a: m.a, b: m.b, plan });
    }
    await updateState((s) => {
      const mm = s.matches.find((x) => x.id === matchId);
      if (mm) mm.datePlan = plan;
    });
    return plan;
  })().finally(() => running.delete(matchId));
  running.set(matchId, p);
  return p;
}

/** A student picks an option. Same pick on both sides → final. */
export function pickOption(plan: DatePlan, studentId: string, index: number): { ok: true } | { ok: false; error: string; status: number } {
  if (!(studentId in plan.picks)) return { ok: false, error: "Not your date", status: 403 };
  if (plan.final) return { ok: false, error: "Already booked", status: 409 };
  if (index < 0 || index >= plan.options.length) return { ok: false, error: "No such option", status: 400 };
  plan.picks[studentId] = index;
  const picks = Object.values(plan.picks);
  if (picks.length === 2 && picks.every((p) => p === index)) plan.final = plan.options[index];
  return { ok: true };
}
