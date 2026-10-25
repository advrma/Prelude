"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Participant, PredateEvent, PublicPredate } from "@/lib/agents/predate";
import type { AgentMessage, Verdict } from "@/lib/types";
import {
  Avatar,
  BlockedChip,
  Chip,
  EmptyState,
  GuardedText,
  LevelChip,
  LockIcon,
  ScoreDial,
  ShieldIcon,
  Spinner,
  TypingDots,
  cx,
} from "@/components/ui";

interface State {
  meta?: PublicPredate;
  replay: boolean;
  messages: AgentMessage[];
  typing: string | null;
  verdicts: Record<string, Verdict>;
  final?: PublicPredate;
  error?: string;
  status: "connecting" | "streaming" | "done" | "error";
}

const initial: State = { replay: false, messages: [], typing: null, verdicts: {}, status: "connecting" };

type Action = { type: "reset" } | { type: "event"; ev: PredateEvent } | { type: "fail"; error: string };

function reducer(s: State, a: Action): State {
  if (a.type === "reset") return initial;
  if (a.type === "fail") return { ...s, status: "error", error: a.error, typing: null };
  const ev = a.ev;
  switch (ev.type) {
    case "meta":
      return { ...s, meta: ev.predate, replay: ev.replay, status: "streaming" };
    case "typing":
      return { ...s, typing: ev.from };
    case "message":
      if (s.messages.some((m) => m.id === ev.message.id)) return s;
      return { ...s, messages: [...s.messages, ev.message], typing: null };
    case "verdict":
      return { ...s, verdicts: { ...s.verdicts, [ev.verdict.studentId]: ev.verdict } };
    case "done": {
      const verdicts = { ...s.verdicts };
      for (const [k, v] of Object.entries(ev.predate.verdicts)) if (v) verdicts[k] = v;
      return { ...s, final: ev.predate, verdicts, typing: null, status: "done" };
    }
    case "error":
      return { ...s, status: "error", error: ev.error, typing: null };
  }
}

function VerdictPanel({
  who,
  verdict,
  phase,
  isPrivate,
  side,
}: {
  who: Participant;
  verdict?: Verdict;
  phase: "waiting" | "writing" | "shown";
  isPrivate: boolean;
  side: "a" | "b";
}) {
  return (
    <aside className={cx("card p-5", verdict && verdict.score >= 7 && "card-glow")} aria-label={`${who.label} verdict`}>
      <div className="mb-4 flex items-center gap-3">
        <Avatar src={who.avatar} alt="" size={40} className="!rounded-full" />
        <div className="min-w-0">
          <p className="label">Private verdict</p>
          <p className={cx("truncate font-semibold", side === "a" ? "text-amber" : "text-coral")}>{who.label.replace("'s agent", "")}</p>
        </div>
      </div>
      {isPrivate ? (
        <div className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
          <LockIcon className="mb-2 text-amber" />
          Their verdict stays private to them. You&apos;ll only ever know if you <em>both</em> said yes.
        </div>
      ) : verdict ? (
        <div className="rise space-y-4">
          <div className="flex items-center gap-4">
            <ScoreDial score={verdict.score} size={92} />
            <p className="text-sm text-muted">
              {verdict.score >= 7 ? "Recommends the next step" : "Recommends passing, quietly"}
            </p>
          </div>
          <div>
            <p className="label mb-1.5">Highlights</p>
            <ul className="space-y-1.5 text-sm">
              {verdict.highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <span className="text-mint" aria-hidden>
                    ✓
                  </span>
                  {h}
                </li>
              ))}
            </ul>
          </div>
          {verdict.flags.length > 0 && (
            <div>
              <p className="label mb-1.5">Honest flags</p>
              <ul className="space-y-1.5 text-sm">
                {verdict.flags.map((f) => (
                  <li key={f} className="flex gap-2 rounded-xl border border-amber/40 bg-amber/10 px-2.5 py-1.5 text-amber">
                    <span aria-hidden>⚑</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <blockquote className="border-l-2 border-line pl-3 text-sm italic text-muted">&ldquo;{verdict.summaryForStudent}&rdquo;</blockquote>
        </div>
      ) : (
        <div className="space-y-3" aria-live="polite">
          <div className="shimmer h-20 rounded-2xl" />
          <div className="shimmer h-3 w-3/4 rounded-full" />
          <div className="shimmer h-3 w-1/2 rounded-full" />
          <p className="flex items-center gap-2 pt-1 text-xs text-muted">
            {phase === "writing" ? (
              <>
                <TypingDots /> writing the verdict…
              </>
            ) : (
              <>
                <LockIcon /> revealed when the pre-date ends
              </>
            )}
          </p>
        </div>
      )}
    </aside>
  );
}

function Bubble({ m, side, who }: { m: AgentMessage; side: "a" | "b"; who: Participant }) {
  const fallback = (m.data as { fallback?: string } | undefined)?.fallback;
  return (
    <li className={cx("rise flex items-end gap-2.5", side === "b" && "flex-row-reverse")}>
      <Avatar src={who.avatar} alt="" size={34} className="mb-1 shrink-0 !rounded-full" />
      <div className={cx("max-w-[85%] sm:max-w-[78%]", side === "b" && "items-end text-right")}>
        <div className={cx("mb-1 flex flex-wrap items-center gap-1.5", side === "b" && "justify-end")}>
          <span className={cx("text-xs font-semibold", side === "a" ? "text-amber" : "text-coral")}>{who.label}</span>
          <LevelChip level={m.level} />
          {m.blocked && <BlockedChip reason={m.blocked.reason} />}
          {fallback && (
            <Chip tone="danger" title="All models failed; this turn came from the fallback">
              fallback: {fallback}
            </Chip>
          )}
        </div>
        <div className={cx("bubble text-left", side === "a" ? "bubble-a" : "bubble-b", m.blocked && "ring-1 ring-danger/60")}>
          <GuardedText text={m.content} />
        </div>
      </div>
    </li>
  );
}

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const [as, setAs] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [run, setRun] = useState<{ n: number; fresh: boolean }>({ n: 0, fresh: false });
  const [s, dispatch] = useReducer(reducer, initial);
  const endRef = useRef<HTMLLIElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setAs(new URLSearchParams(window.location.search).get("as") ?? undefined);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let es: EventSource | null = null;
    let closed = false;
    dispatch({ type: "reset" });
    const qs = new URLSearchParams();
    if (as) qs.set("as", as);
    if (run.fresh) qs.set("fresh", "1");
    fetch(`/api/predate/${id}${as ? `?as=${as}` : ""}`).then((r) => {
      if (closed) return;
      if (r.status === 404) {
        setMissing(true);
        return;
      }
      es = new EventSource(`/api/predate/${id}/stream?${qs}`);
      es.onmessage = (e) => {
        const ev = JSON.parse(e.data) as PredateEvent;
        dispatch({ type: "event", ev });
        if (ev.type === "done" || ev.type === "error") es?.close();
      };
      es.onerror = () => {
        es?.close();
        if (!closed) dispatch({ type: "fail", error: "Connection lost. Try replaying." });
      };
    });
    return () => {
      closed = true;
      es?.close();
    };
  }, [id, as, ready, run]);

  // Desktop: the transcript scrolls inside its card. Mobile: follow the conversation only while it streams.
  useEffect(() => {
    const list = listRef.current;
    if (list && list.scrollHeight > list.clientHeight + 4) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    else if (s.status === "streaming" && s.messages.length > 1) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [s.messages.length, s.typing, s.status]);

  const pd = s.final ?? s.meta;
  const viewer = pd?.viewer;
  const models = useMemo(() => {
    const set = new Set<string>(s.final?.models ?? []);
    for (const m of s.messages) {
      const model = (m.data as { model?: string } | undefined)?.model;
      if (model) set.add(model);
    }
    return [...set];
  }, [s.messages, s.final]);
  const blockedCount = s.messages.filter((m) => m.blocked).length;

  if (missing)
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          title="This pre-date doesn't exist (yet)"
          action={
            <Link className="btn btn-primary" href="/">
              Run tonight&apos;s matching
            </Link>
          }
        >
          Pre-dates are created when the hub runs matching. If the demo was reset, run it again.
        </EmptyState>
      </div>
    );

  const a = pd?.participants.a;
  const b = pd?.participants.b;
  const live = s.status === "streaming" && !s.replay;
  const done = s.status === "done";
  const writingVerdicts = s.typing === "hub";
  const typingSide = s.typing?.startsWith("agent:") ? (s.typing === `agent:${pd?.a}` ? "a" : "b") : null;
  const matched = s.final?.matched;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href={viewer ? `/matches?as=${viewer}` : "/hub"} className="text-sm text-muted hover:text-text">
            ← {viewer ? "Back to matches" : "Back to the hub"}
          </Link>
          <p className="label mt-3">Watch the date · pre-date at level 0</p>
          <h1 className="mt-1 font-display text-3xl leading-tight sm:text-4xl">
            {a && b ? (
              <>
                <span className="text-amber">{a.label.replace("'s agent", "")}</span>
                <span className="text-muted"> × </span>
                <span className="text-coral">{b.label.replace("'s agent", "")}</span>
              </>
            ) : (
              <span className="shimmer inline-block h-9 w-64 rounded-xl align-middle" />
            )}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {live && (
              <Chip tone="coral">
                <span className="live-dot" /> live
              </Chip>
            )}
            {s.replay && <Chip tone="mint">replay</Chip>}
            {done && <Chip>finished</Chip>}
            {pd?.source && <Chip tone={pd.source === "live" ? "coral" : "amber"}>source: {pd.source}</Chip>}
            {models.length > 0 && <Chip title="Models that produced this pre-date">model: {models.join(", ")}</Chip>}
            <Chip tone={blockedCount ? "danger" : "default"}>
              <ShieldIcon /> {blockedCount} guard {blockedCount === 1 ? "block" : "blocks"}
            </Chip>
          </div>
        </div>
        {pd && (
          <div className="card flex items-center gap-4 p-4 lg:max-w-md">
            <div className="text-center">
              <p className="font-display text-3xl text-amber">{Math.round(pd.matcherScore * 100)}%</p>
              <p className="label">vibe overlap</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-xs text-muted">Why the hub paired them (tags only; no AI):</p>
              <div className="flex flex-wrap gap-1">
                {pd.sharedTags.length ? pd.sharedTags.map((t) => <Chip key={t} tone="amber">{t}</Chip>) : <Chip>rhythm match</Chip>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main: verdict A | transcript | verdict B */}
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
        <div className="order-2 lg:order-1">
          {a && (
            <VerdictPanel
              who={a}
              side="a"
              verdict={s.verdicts[a.id]}
              phase={writingVerdicts ? "writing" : "waiting"}
              isPrivate={!!viewer && viewer !== a.id && done}
            />
          )}
        </div>

        <section className="card order-1 flex min-h-[420px] flex-col p-3 sm:p-5 lg:order-2" aria-label="Agent-to-agent transcript">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-3">
            <p className="text-sm text-muted">
              Agents may only discuss <span className="text-text">vibe</span>: interests, values, humor, rhythm. Names, majors, socials and dorms are blocked.
            </p>
          </div>
          <ol ref={listRef} className="flex-1 space-y-4 overflow-y-auto pr-1 lg:max-h-[68vh]" aria-live="polite">
            {s.status === "connecting" && (
              <li className="flex items-center gap-2 py-10 text-muted">
                <Spinner /> Connecting to the hub…
              </li>
            )}
            {a &&
              b &&
              s.messages.map((m) => {
                const side = m.from === `agent:${a.id}` ? "a" : "b";
                return <Bubble key={m.id} m={m} side={side} who={side === "a" ? a : b} />;
              })}
            {typingSide && a && b && (
              <li className={cx("flex items-end gap-2.5", typingSide === "b" && "flex-row-reverse")}>
                <Avatar src={(typingSide === "a" ? a : b).avatar} alt="" size={34} className="!rounded-full opacity-70" />
                <div className={cx("bubble", typingSide === "a" ? "bubble-a text-amber" : "bubble-b text-coral")}>
                  <TypingDots />
                </div>
              </li>
            )}
            {writingVerdicts && (
              <li className="flex items-center justify-center gap-2 py-3 text-sm text-muted">
                <TypingDots /> Each agent is writing a private verdict for its own student…
              </li>
            )}
            {done && (
              <li className="rise">
                <div
                  className={cx(
                    "rounded-2xl border p-4 text-center",
                    matched ? "border-mint/50 bg-mint/10" : "border-line bg-surface-2/60",
                  )}
                >
                  {matched ? (
                    <>
                      <p className="font-display text-2xl text-mint">It&apos;s a match</p>
                      <p className="mt-1 text-sm text-muted">
                        Both verdicts are 7+. Now each student decides, one level at a time. Nothing more is revealed without both YESes.
                      </p>
                      <div className="mt-3 flex flex-wrap justify-center gap-2">
                        {viewer ? (
                          <Link className="btn btn-primary btn-sm" href={`/matches?as=${viewer}`}>
                            See it in your matches →
                          </Link>
                        ) : (
                          a &&
                          b && (
                            <>
                              <Link className="btn btn-primary btn-sm" href={`/matches?as=${a.id}`}>
                                Open as {a.label.replace("'s agent", "")}
                              </Link>
                              <Link className="btn btn-ghost btn-sm" href={`/matches?as=${b.id}`}>
                                Open as {b.label.replace("'s agent", "")}
                              </Link>
                            </>
                          )
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="font-display text-xl">No match. Quietly.</p>
                      <p className="mt-1 text-sm text-muted">
                        At least one agent recommended passing. Neither student ever sees a rejection; this pre-date simply never shows up for them.
                      </p>
                    </>
                  )}
                </div>
              </li>
            )}
            {s.status === "error" && (
              <li className="rounded-2xl border border-danger/50 bg-danger/10 p-4 text-sm">
                {s.error ?? "Something went wrong."}{" "}
                <button className="underline" onClick={() => setRun((r) => ({ n: r.n + 1, fresh: false }))}>
                  Try again
                </button>
              </li>
            )}
            <li ref={endRef} aria-hidden />
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button className="btn btn-ghost btn-sm" disabled={!done && s.status !== "error"} onClick={() => setRun((r) => ({ n: r.n + 1, fresh: false }))}>
              ↺ Replay
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={!done && s.status !== "error"}
              onClick={() => setRun((r) => ({ n: r.n + 1, fresh: true }))}
              title="Run this pre-date again with the current LLM mode (mock without a key, real Gemini with one)"
            >
              ⚡ Run it again
            </button>
            <span className="ml-auto text-xs text-muted">{s.messages.length} turns</span>
          </div>
        </section>

        <div className="order-3">
          {b && (
            <VerdictPanel
              who={b}
              side="b"
              verdict={s.verdicts[b.id]}
              phase={writingVerdicts ? "writing" : "waiting"}
              isPrivate={!!viewer && viewer !== b.id && done}
            />
          )}
        </div>
      </div>
    </div>
  );
}
