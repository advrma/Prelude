"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MatchView } from "@/lib/hub/reveal";
import type { Level } from "@/lib/types";
import { usePersona } from "@/components/PersonaProvider";
import { Avatar, Chip, EmptyState, LEVEL_NAMES, LockIcon, ScoreDial, Spinner, TypingDots, cx } from "@/components/ui";

interface Inbox {
  as: string;
  firstName: string;
  predates: { total: number; done: number; inProgress: string[] };
  matches: MatchView[];
}

const UNLOCK_COPY: Record<1 | 2 | 3, { title: string; body: string; cta: string }> = {
  1: {
    title: "Unlock major, year & photos?",
    body: "If you both say yes, you'll each see the other's major, year and photos. Nothing else.",
    cta: "Yes, show photos",
  },
  2: {
    title: "Unlock first names + say hi?",
    body: "If you both say yes, you'll see each other's first name and can send a few short messages.",
    cta: "Yes, swap names",
  },
  3: {
    title: "Go on a real date?",
    body: "If you both say yes, your agents negotiate a time, a public place and a budget, then offer you 3 options.",
    cta: "Yes, plan a date",
  },
};

function pronounWord(p: string) {
  return p.startsWith("she") ? "Her" : p.startsWith("he") ? "Him" : "Them";
}

function Progress({ stage }: { stage: Level }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label={`Reveal progress: level ${stage} of 3`}>
      {([0, 1, 2, 3] as Level[]).map((l) => {
        const open = l <= stage;
        return (
          <li key={l} className="min-w-0">
            <div className={cx("h-1.5 rounded-full", open ? "bg-gradient-to-r from-amber to-coral" : "bg-line")} />
            <p className={cx("mt-1.5 flex items-center gap-1 truncate text-[11px]", open ? "text-text" : "text-muted")}>
              <LockIcon open={open} className={cx("h-3 w-3 shrink-0", open ? "text-amber" : "")} />
              <span className="truncate">{LEVEL_NAMES[l]}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function ChatBox({ m, as, onChange }: { m: MatchView; as: string; onChange: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/match/${m.id}/chat`, { method: "POST", body: JSON.stringify({ as, text }) });
    setBusy(false);
    if (!r.ok) {
      setErr((await r.json()).error ?? "Couldn't send");
      return;
    }
    setText("");
    onChange();
  };
  return (
    <div className="rounded-2xl border border-line bg-surface-2/50 p-3">
      <p className="label mb-2">Say hi · short chat</p>
      <ul className="mb-2 max-h-48 space-y-1.5 overflow-y-auto text-sm">
        {(m.chat ?? []).length === 0 && <li className="text-muted">No messages yet. Break the ice!</li>}
        {(m.chat ?? []).map((c, i) => (
          <li key={i} className={cx("flex", c.from === as && "justify-end")}>
            <span className={cx("max-w-[80%] rounded-2xl px-3 py-1.5", c.from === as ? "bg-amber/20" : "bg-coral/15")}>
              <span className="mr-1 text-[11px] font-semibold text-muted">{c.from === as ? "You" : m.other.firstName}</span>
              {c.text}
            </span>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input className="field !py-2 text-sm" maxLength={280} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${m.other.firstName}…`} aria-label="Chat message" />
        <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
      {err && <p className="mt-1.5 text-xs text-danger">{err}</p>}
    </div>
  );
}

function MatchCard({ m, as, onChange }: { m: MatchView; as: string; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const title = m.other.firstName ?? `Someone into ${m.sharedTags[0] ?? "the same things"}`;
  const act = async (path: "yes" | "no" | "report", body: Record<string, unknown>) => {
    setBusy(path);
    await fetch(`/api/match/${m.id}/${path}`, { method: "POST", body: JSON.stringify({ as, ...body }) });
    setBusy(null);
    onChange();
  };
  const next = m.nextLevel as 1 | 2 | 3 | null;
  const v = m.myVerdict;
  return (
    <article className={cx("card rise overflow-hidden", m.stage === 3 && "card-glow")}>
      <div className="flex gap-4 p-4 sm:p-5">
        <div className="relative shrink-0">
          <Avatar src={m.other.avatar} alt={m.stage >= 1 ? `${title}'s photo` : "Locked photo"} size={84} className={cx(m.stage < 1 && "opacity-80")} />
          {m.stage >= 1 && m.other.photos && m.other.photos.length > 1 && (
            <Avatar src={m.other.photos[1]} alt="" size={34} className="absolute -bottom-2 -right-2 !rounded-xl ring-2 ring-surface" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl sm:text-2xl">{title}</h2>
              <p className="text-sm text-muted">
                {m.stage >= 1 ? `${m.other.major} · ${m.other.year}` : `${pronounWord(m.other.pronouns)}: details unlock with both your yeses`}
              </p>
            </div>
            <div className="relative">
              <button className="btn btn-ghost btn-sm !px-2.5" onClick={() => setMenu((x) => !x)} aria-label="More: unmatch or report" aria-expanded={menu}>
                ⋯
              </button>
              {menu && (
                <div className="card rise absolute right-0 z-20 mt-1 w-48 p-1.5 text-sm">
                  <button
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-surface-2"
                    onClick={() => {
                      if (window.confirm("Unmatch? It ends quietly. They're never told.")) void act("no", {});
                    }}
                  >
                    Unmatch quietly
                  </button>
                  <button
                    className="w-full rounded-lg px-3 py-2 text-left text-danger hover:bg-surface-2"
                    onClick={() => {
                      const reason = window.prompt("What happened? (goes to the Prelude safety log)") ?? "";
                      void act("report", { reason });
                    }}
                  >
                    Report…
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {m.sharedTags.slice(0, 4).map((t) => (
              <Chip key={t} tone="amber">
                {t}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t border-line px-4 py-4 sm:px-5">
        <Progress stage={m.stage} />

        {v && (
          <div className="flex gap-3 rounded-2xl bg-surface-2/50 p-3">
            <ScoreDial score={v.score} size={64} label="your agent's score" />
            <div className="min-w-0 text-sm">
              <p className="label">Your agent&apos;s private verdict</p>
              <p className="mt-1">{v.summaryForStudent}</p>
              {v.flags.map((f) => (
                <p key={f} className="mt-1.5 text-amber">
                  ⚑ {f}
                </p>
              ))}
            </div>
          </div>
        )}

        {m.stage >= 2 && <ChatBox m={m} as={as} onChange={onChange} />}

        {m.stage === 3 ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-mint/40 bg-mint/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-lg text-mint">You both said yes to a real date</p>
              <p className="text-sm text-muted">
                {m.datePlan?.final ? "It's booked. Grab the calendar invite." : "Your agents will negotiate the details. You'll pick from 3 options."}
              </p>
            </div>
            <Link href={`/match/${m.id}/date?as=${as}`} className="btn btn-primary">
              {m.datePlan?.final ? "See the plan" : "Plan the date →"}
            </Link>
          </div>
        ) : next && m.waitingOnMe ? (
          <div className="rounded-2xl border border-amber/40 bg-amber/5 p-4">
            <p className="font-semibold">{UNLOCK_COPY[next].title}</p>
            <p className="mt-1 text-sm text-muted">{UNLOCK_COPY[next].body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={!!busy} onClick={() => act("yes", { level: next })}>
                {busy === "yes" ? <Spinner /> : null} {UNLOCK_COPY[next].cta}
              </button>
              <button
                className="btn btn-ghost"
                disabled={!!busy}
                onClick={() => {
                  if (window.confirm("Not now ends this match quietly. They'll never be told. Continue?")) void act("no", {});
                }}
              >
                Not now
              </button>
            </div>
          </div>
        ) : next && m.waitingOnThem ? (
          <p className="flex items-center gap-2 rounded-2xl border border-dashed border-line p-3 text-sm text-muted">
            <TypingDots /> You said yes to level {next}. Waiting for them. Nothing is revealed until you both do.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <Link href={`/predate/${m.predateId}?as=${as}`} className="text-muted underline-offset-4 hover:text-text hover:underline">
            ▶ Watch the pre-date
          </Link>
          <span className="text-xs text-muted">vibe overlap {Math.round(m.matcherScore * 100)}%</span>
        </div>
      </div>
    </article>
  );
}

export default function MatchesPage() {
  const { as, current } = usePersona();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    if (!as) return;
    fetch(`/api/matches?as=${as}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        return r.json();
      })
      .then((d: Inbox) => {
        setInbox(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [as]);

  useEffect(() => {
    setInbox(null);
    load();
  }, [load]);

  // Keep the inbox fresh while pre-dates run, and so the other persona's YES shows up.
  useEffect(() => {
    const t = setInterval(load, inbox?.predates.inProgress.length ? 2500 : 6000);
    return () => clearInterval(t);
  }, [load, inbox?.predates.inProgress.length]);

  const runMatching = async () => {
    setRunning(true);
    await fetch("/api/match/run", { method: "POST" });
    setRunning(false);
    load();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <p className="label">Matches inbox</p>
      <h1 className="mt-1 font-display text-3xl sm:text-4xl">
        {current ? (
          <>
            Good evening, <span className="text-amber">{current.firstName}</span>
          </>
        ) : (
          "Your matches"
        )}
      </h1>

      {error && <p className="mt-4 rounded-2xl border border-danger/50 bg-danger/10 p-3 text-sm">{error}</p>}

      {!inbox && !error && (
        <div className="mt-6 space-y-4" aria-busy>
          <div className="shimmer h-48 rounded-3xl" />
          <div className="shimmer h-48 rounded-3xl" />
        </div>
      )}

      {inbox && (
        <>
          <p className="mt-2 text-muted">
            {inbox.predates.total === 0
              ? "Your agent hasn't been out yet tonight."
              : `Your agent went on ${inbox.predates.total} pre-date${inbox.predates.total === 1 ? "" : "s"} tonight. ${
                  inbox.matches.length ? `${inbox.matches.length} felt right.` : inbox.predates.inProgress.length ? "" : "None felt quite right, and that's okay. Nobody was told no."
                }`}
          </p>

          {inbox.predates.inProgress.length > 0 && (
            <div className="card mt-5 flex flex-wrap items-center gap-3 p-4 text-sm">
              <span className="live-dot" />
              <span>
                Your agent is on {inbox.predates.inProgress.length} pre-date{inbox.predates.inProgress.length === 1 ? "" : "s"} right now.
              </span>
              <Link className="btn btn-ghost btn-sm ml-auto" href={`/predate/${inbox.predates.inProgress[0]}?as=${inbox.as}`}>
                Watch live →
              </Link>
            </div>
          )}

          <div className="mt-6 space-y-5">
            {inbox.predates.total === 0 ? (
              <EmptyState
                title="No pre-dates yet"
                action={
                  <button className="btn btn-primary" onClick={runMatching} disabled={running}>
                    {running ? <Spinner /> : null} Run tonight&apos;s matching
                  </button>
                }
              >
                The hub pairs students whose filters fit both ways, then their agents meet for a short chat at level 0 (vibe only).
              </EmptyState>
            ) : inbox.matches.length === 0 && inbox.predates.inProgress.length === 0 ? (
              <EmptyState title="Nothing to reveal tonight">
                Your agent only brings you matches where <em>both</em> agents felt a spark. Tomorrow&apos;s another night.
              </EmptyState>
            ) : (
              inbox.matches.map((m) => <MatchCard key={m.id} m={m} as={inbox.as} onChange={load} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
