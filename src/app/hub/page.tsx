"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PairResult } from "@/lib/types";
import { Avatar, Chip, EmptyState, LEVEL_NAMES, ShieldIcon, Spinner, cx } from "@/components/ui";
import { UsageBadge } from "@/components/UsageBadge";

interface HubData {
  mode: string;
  threshold: number;
  lastRunAt: string | null;
  students: {
    id: string;
    firstName: string;
    avatar: string;
    pronouns: string;
    gender: string;
    wantsToMeet: string[] | "everyone";
    age: number;
    ageRange: [number, number];
    intent: string;
    campus: string;
    interests: string[];
  }[];
  pairs: PairResult[];
  predates: {
    id: string;
    a: string;
    b: string;
    status: string;
    matched: boolean;
    matcherScore: number;
    scores: Record<string, number | null>;
    guardBlocks: number;
    source: string | null;
  }[];
  matches: { id: string; a: string; b: string; stage: 0 | 1 | 2 | 3; booked: boolean }[];
  guard: { blocked: number };
  reports: number;
}

function Stat({ value, label, tone }: { value: string | number; label: string; tone?: "amber" | "coral" | "mint" }) {
  return (
    <div className="card p-4">
      <p className={cx("font-display text-3xl", tone === "amber" && "text-amber", tone === "coral" && "text-coral", tone === "mint" && "text-mint")}>{value}</p>
      <p className="label mt-1">{label}</p>
    </div>
  );
}

const key = (a: string, b: string) => [a, b].sort().join("|");

export default function HubPage() {
  const [d, setD] = useState<HubData | null>(null);
  const [busy, setBusy] = useState<"run" | "reset" | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/hub")
      .then((r) => r.json())
      .then(setD)
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const running = d?.predates.some((p) => p.status === "queued" || p.status === "running");
  useEffect(() => {
    const t = setInterval(load, running ? 2000 : 8000);
    return () => clearInterval(t);
  }, [load, running]);

  const name = useCallback((id: string) => d?.students.find((s) => s.id === id)?.firstName ?? id, [d]);
  const pairMap = useMemo(() => new Map((d?.pairs ?? []).map((p) => [key(p.a, p.b), p])), [d]);
  const pdMap = useMemo(() => new Map((d?.predates ?? []).map((p) => [key(p.a, p.b), p])), [d]);
  const blocked = (d?.pairs ?? []).filter((p) => !p.passed);
  const nearMisses = blocked.filter((p) => !p.reasons.includes("orientation mismatch"));
  const reasonCounts = blocked.reduce<Record<string, number>>((acc, p) => {
    for (const r of p.reasons) acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});

  const act = async (what: "run" | "reset") => {
    setBusy(what);
    if (what === "reset") await fetch("/api/seed", { method: "POST" });
    else await fetch("/api/match/run", { method: "POST" });
    setBusy(null);
    load();
  };

  if (!d)
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10">
        <div className="shimmer h-10 w-1/3 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="shimmer h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );

  const ran = d.pairs.length > 0;
  const done = d.predates.filter((p) => p.status === "done").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label">For judges · the hub&apos;s view</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">The hub</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Hard filters run first with <strong className="text-text">no AI</strong>: mutual orientation, both age ranges, same campus, dealbreakers. Only pairs that pass both ways get a pre-date.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => act("run")} disabled={!!busy}>
            {busy === "run" ? <Spinner /> : null} Run tonight&apos;s matching
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (window.confirm("Reset the demo? This clears matches, YESes and picks, and reloads the 10 personas.")) void act("reset");
            }}
            disabled={!!busy}
          >
            Reset demo
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat value={d.students.length} label="students" />
        <Stat value={ran ? d.pairs.length : "–"} label="pairs checked" />
        <Stat value={ran ? d.pairs.length - blocked.length : "–"} label="passed filters" tone="amber" />
        <Stat value={ran ? blocked.length : "–"} label="blocked" />
        <Stat value={`${done}/${d.predates.length}`} label="pre-dates done" tone="coral" />
        <Stat value={d.matches.length} label={`matches (both ≥ ${d.threshold})`} tone="mint" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>LLM usage today:</span>
        <UsageBadge />
        <Chip tone={d.guard.blocked ? "danger" : "default"}>
          <ShieldIcon /> {d.guard.blocked} guard blocks in hub log
        </Chip>
        <Chip>{d.reports} reports</Chip>
      </div>

      {/* Pool */}
      <section className="mt-8">
        <h2 className="font-display text-2xl">The pool</h2>
        <p className="text-sm text-muted">Gender and who they want to meet are always asked, never inferred. All personas are fictional.</p>
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
          {d.students.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setFocus((f) => (f === s.id ? null : s.id))}
                className={cx("card h-full w-full p-3 text-left transition-transform hover:-translate-y-0.5", focus === s.id && "card-glow")}
                aria-pressed={focus === s.id}
              >
                <div className="flex items-center gap-3">
                  <Avatar src={s.avatar} alt="" size={40} className="!rounded-full" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {s.firstName} <span className="text-xs font-normal text-muted">{s.age}</span>
                    </p>
                    <p className="truncate text-xs text-muted">{s.pronouns}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs">
                  <span className="text-amber">{s.gender}</span>
                  <span className="text-muted"> → wants </span>
                  <span className="text-coral">{s.wantsToMeet === "everyone" ? "everyone" : s.wantsToMeet.join(" + ")}</span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {s.intent.replace(/-/g, " ")} · ages {s.ageRange[0]}–{s.ageRange[1]}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {!ran ? (
        <div className="mt-8">
          <EmptyState
            title="Matching hasn't run yet"
            action={
              <button className="btn btn-primary" onClick={() => act("run")} disabled={!!busy}>
                Run tonight&apos;s matching
              </button>
            }
          >
            Run it to see which pairs pass the hard filters, which are blocked and why, and to send agents on pre-dates.
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Matrix */}
          <section className="mt-10">
            <h2 className="font-display text-2xl">Who can meet whom</h2>
            <p className="text-sm text-muted">Every pair, both directions. Hover or tap a cell for the reason. Click a student above to highlight their row.</p>
            <div className="card mt-4 overflow-x-auto p-3 sm:p-5">
              <table className="mx-auto border-separate border-spacing-1 text-center text-[11px]">
                <thead>
                  <tr>
                    <th />
                    {d.students.map((s) => (
                      <th key={s.id} scope="col" className={cx("w-8 font-mono font-normal text-muted sm:w-14", focus === s.id && "text-amber")}>
                        <span className="sm:hidden">{s.firstName.slice(0, 2)}</span>
                        <span className="hidden sm:inline">{s.firstName}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.students.map((row) => (
                    <tr key={row.id}>
                      <th scope="row" className={cx("pr-1 text-right font-mono font-normal text-muted", focus === row.id && "text-amber")}>
                        <span className="sm:hidden">{row.firstName.slice(0, 2)}</span>
                        <span className="hidden sm:inline">{row.firstName}</span>
                      </th>
                      {d.students.map((col) => {
                        if (row.id === col.id) return <td key={col.id} className="h-8 w-8 rounded-md bg-surface-2/40 sm:h-10 sm:w-14" />;
                        const p = pairMap.get(key(row.id, col.id));
                        const pd = pdMap.get(key(row.id, col.id));
                        const dim = focus && focus !== row.id && focus !== col.id;
                        const title = !p
                          ? ""
                          : p.passed
                            ? `${row.firstName} × ${col.firstName}: passed · vibe ${Math.round(p.score * 100)}%${pd ? ` · pre-date ${pd.status}${pd.status === "done" ? (pd.matched ? " · MATCH" : " · no match") : ""}` : " · not selected"}`
                            : `${row.firstName} × ${col.firstName}: blocked · ${p.reasons.join(", ")}`;
                        return (
                          <td
                            key={col.id}
                            title={title}
                            className={cx(
                              "h-8 w-8 rounded-md font-mono sm:h-10 sm:w-14",
                              !p && "bg-surface-2/40",
                              p && !p.passed && "bg-surface-2/60 text-muted/60",
                              p?.passed && !pd?.matched && "bg-amber/20 text-amber",
                              pd?.matched && "bg-mint/25 text-mint",
                              dim && "opacity-25",
                            )}
                          >
                            {!p ? "" : !p.passed ? "×" : pd?.matched ? "♥" : Math.round(p.score * 100)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-mint/40" /> matched
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-amber/30" /> passed (vibe %)
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-surface-2" /> × blocked by a hard filter
                </span>
              </div>
            </div>
          </section>

          {/* Blocks */}
          <section className="mt-10 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-2xl">Blocked, and why</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(reasonCounts)
                  .sort((x, y) => y[1] - x[1])
                  .map(([r, n]) => (
                    <Chip key={r} tone={r.startsWith("dealbreaker") ? "coral" : r === "age range" ? "amber" : "default"}>
                      {r} · {n}
                    </Chip>
                  ))}
              </div>
              <p className="mt-4 text-sm text-muted">Near-misses: orientation fits both ways, but another hard filter says no.</p>
              <ul className="mt-2 space-y-2">
                {nearMisses.map((p) => (
                  <li key={key(p.a, p.b)} className="card flex flex-wrap items-center justify-between gap-2 p-3">
                    <span className="font-semibold">
                      {name(p.a)} × {name(p.b)}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {p.reasons.map((r) => (
                        <Chip key={r} tone="coral">
                          {r}
                        </Chip>
                      ))}
                    </span>
                  </li>
                ))}
                {blocked
                  .filter((p) => p.reasons.length === 1 && p.reasons[0] === "orientation mismatch")
                  .filter((p) => {
                    // one-way interest: e.g. Kai is open to everyone but Sofia isn't looking for nonbinary partners
                    const A = d.students.find((s) => s.id === p.a)!;
                    const B = d.students.find((s) => s.id === p.b)!;
                    const wants = (x: typeof A, y: typeof A) => x.wantsToMeet === "everyone" || x.wantsToMeet.includes(y.gender);
                    return wants(A, B) !== wants(B, A);
                  })
                  // Most instructive first: someone open to everyone who isn't wanted back.
                  .sort((x, y) => {
                    const open = (p: PairResult) =>
                      [p.a, p.b].some((id) => d.students.find((s) => s.id === id)?.wantsToMeet === "everyone") ? 0 : 1;
                    return open(x) - open(y);
                  })
                  .slice(0, 4)
                  .map((p) => (
                    <li key={key(p.a, p.b)} className="card flex flex-wrap items-center justify-between gap-2 p-3">
                      <span className="font-semibold">
                        {name(p.a)} × {name(p.b)}
                      </span>
                      <Chip>orientation: one-way only</Chip>
                    </li>
                  ))}
              </ul>
            </div>

            {/* Pre-dates */}
            <div>
              <h2 className="font-display text-2xl">Tonight&apos;s pre-dates</h2>
              <ul className="mt-3 space-y-2">
                {d.predates.map((p) => (
                  <li key={p.id} className="card flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {name(p.a)} × {name(p.b)}
                      </p>
                      <p className="text-xs text-muted">
                        vibe {Math.round(p.matcherScore * 100)}%
                        {p.status === "done" && ` · verdicts ${p.scores[p.a] ?? "–"} / ${p.scores[p.b] ?? "–"}`}
                        {p.source && ` · ${p.source}`}
                      </p>
                    </div>
                    {p.guardBlocks > 0 && (
                      <Chip tone="danger">
                        <ShieldIcon /> {p.guardBlocks}
                      </Chip>
                    )}
                    {p.status !== "done" ? (
                      <Chip tone="coral">
                        {p.status === "running" && <span className="live-dot" />} {p.status}
                      </Chip>
                    ) : p.matched ? (
                      <Chip tone="mint">♥ match</Chip>
                    ) : (
                      <Chip>no match</Chip>
                    )}
                    <Link href={`/predate/${p.id}`} className="btn btn-ghost btn-sm">
                      Watch
                    </Link>
                  </li>
                ))}
              </ul>

              {d.matches.length > 0 && (
                <>
                  <h3 className="mt-6 font-display text-xl">Matches · reveal progress</h3>
                  <ul className="mt-2 space-y-2">
                    {d.matches.map((m) => (
                      <li key={m.id} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
                        <span className="flex-1 font-semibold">
                          {name(m.a)} × {name(m.b)}
                        </span>
                        <Chip tone={m.stage === 3 ? "mint" : "amber"}>
                          L{m.stage} · {LEVEL_NAMES[m.stage].toLowerCase()}
                        </Chip>
                        {m.booked && <Chip tone="mint">☕ booked</Chip>}
                        <Link className="text-xs text-muted underline" href={`/matches?as=${m.a}`}>
                          as {name(m.a)}
                        </Link>
                        <Link className="text-xs text-muted underline" href={`/matches?as=${m.b}`}>
                          as {name(m.b)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
