"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchView } from "@/lib/hub/reveal";
import type { AgentMessage, DateOption } from "@/lib/types";
import { usePersona } from "@/components/PersonaProvider";
import { Avatar, Chip, EmptyState, GuardedText, LockIcon, Spinner, TypingDots, cx } from "@/components/ui";

const DAY: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

function fmtTime(hhmm?: string) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
}

function fmtDate(o: DateOption) {
  if (!o.date) return DAY[o.day] ?? o.day;
  const [y, mo, d] = o.date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 12)).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

const TYPE_TONE: Record<string, "amber" | "coral" | "mint" | "danger" | "default"> = {
  propose: "amber",
  counter: "coral",
  accept: "mint",
  need_human: "danger",
};

function NegBubble({ m, mine, label }: { m: AgentMessage; mine: boolean; label: string }) {
  const d = (m.data ?? {}) as { day?: string; start?: string; place?: string };
  return (
    <li className={cx("rise flex", !mine && "justify-end")}>
      <div className={cx("max-w-[88%] sm:max-w-[75%]", !mine && "text-right")}>
        <div className={cx("mb-1 flex flex-wrap items-center gap-1.5", !mine && "justify-end")}>
          <span className={cx("text-xs font-semibold", mine ? "text-amber" : "text-coral")}>{label}</span>
          <Chip tone={TYPE_TONE[m.type] ?? "default"}>{m.type.replace("_", " ")}</Chip>
          <Chip>L3 · real date</Chip>
        </div>
        <div className={cx("bubble text-left", mine ? "bubble-a" : "bubble-b")}>
          <GuardedText text={m.content} />
          {(d.day || d.place) && (
            <p className="mt-2 border-t border-line/70 pt-2 font-mono text-[11px] text-muted">
              {[d.day && DAY[d.day], fmtTime(d.start), d.place].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export default function DatePlannerPage() {
  const { id } = useParams<{ id: string }>();
  const { as } = usePersona();
  const [m, setM] = useState<MatchView | null>(null);
  const [status, setStatus] = useState<"loading" | "missing" | "ready">("loading");
  const [negotiating, setNegotiating] = useState(false);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const animatedFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!as) return null;
    const r = await fetch(`/api/match/${id}?as=${as}`);
    if (r.status === 404) {
      setStatus("missing");
      return null;
    }
    const view = (await r.json()) as MatchView;
    setM(view);
    setStatus("ready");
    return view;
  }, [id, as]);

  const negotiate = useCallback(
    async (fresh = false) => {
      if (!as) return;
      setNegotiating(true);
      setError(null);
      setShown(0);
      animatedFor.current = null;
      const r = await fetch(`/api/match/${id}/negotiate`, { method: "POST", body: JSON.stringify({ as, fresh }) });
      const body = await r.json();
      setNegotiating(false);
      if (!r.ok) setError(body.error ?? "Negotiation failed");
      else setM(body.match);
    },
    [id, as],
  );

  // Load, then kick off the negotiation automatically once both said yes to a date.
  useEffect(() => {
    started.current = false;
    setStatus("loading");
    void load().then((view) => {
      if (view && view.stage === 3 && !view.datePlan && !started.current) {
        started.current = true;
        void negotiate();
      }
    });
  }, [load, negotiate]);

  // Reveal negotiation turns one by one the first time we see them.
  const total = m?.datePlan?.negotiation.length ?? 0;
  useEffect(() => {
    if (!m?.datePlan) return;
    const key = `${m.id}:${m.datePlan.negotiation[0]?.id ?? ""}:${total}`;
    if (animatedFor.current === key) return;
    animatedFor.current = key;
    setShown(0);
    let i = 0;
    const t = setInterval(() => {
      i++;
      setShown(i);
      if (i >= total) clearInterval(t);
    }, 850);
    return () => clearInterval(t);
  }, [m?.datePlan, m?.id, total]);

  // Pick up the other student's pick.
  useEffect(() => {
    if (!m?.datePlan || m.datePlan.final) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [m?.datePlan, load]);

  const pick = async (option: number) => {
    if (!as) return;
    setBusy(option);
    const r = await fetch(`/api/match/${id}/pick`, { method: "POST", body: JSON.stringify({ as, option }) });
    const body = await r.json();
    setBusy(null);
    if (!r.ok) setError(body.error ?? "Couldn't pick");
    else if (body.match) setM(body.match);
  };

  if (status === "missing")
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState title="No date to plan here" action={<Link className="btn btn-primary" href="/matches">Back to matches</Link>}>
          Either this match isn&apos;t yours (check &ldquo;View as&rdquo;), or it was closed.
        </EmptyState>
      </div>
    );

  if (!m)
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
        <div className="shimmer h-10 w-2/3 rounded-xl" />
        <div className="shimmer h-64 rounded-3xl" />
      </div>
    );

  const name = m.other.firstName ?? "your match";
  const plan = m.datePlan;
  const allShown = !!plan && shown >= plan.negotiation.length;
  const final = plan?.final;
  const myAgent = `agent:${m.me.id}`;
  const theirsDiffers = plan && plan.theirPick !== null && plan.myPick !== null && plan.theirPick !== plan.myPick && !final;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
      <Link href={`/matches?as=${m.me.id}`} className="text-sm text-muted hover:text-text">
        ← Back to matches
      </Link>
      <div className="mt-3 flex items-center gap-4">
        <Avatar src={m.other.avatar} alt="" size={56} className="!rounded-full" />
        <div>
          <p className="label">Date planner · level 3</p>
          <h1 className="font-display text-3xl sm:text-4xl">
            You &amp; <span className="text-coral">{name}</span>
          </h1>
        </div>
      </div>

      {m.stage < 3 ? (
        <div className="mt-8">
          <EmptyState title="Not unlocked yet" action={<Link className="btn btn-primary" href={`/matches?as=${m.me.id}`}>Go to matches</Link>}>
            <span className="inline-flex items-center gap-1">
              <LockIcon /> You both need to say yes to a real date first.
            </span>
          </EmptyState>
        </div>
      ) : (
        <>
          <section className="card mt-6 p-4 sm:p-6" aria-label="Agent negotiation">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-xl">The agents negotiate</h2>
                <p className="text-sm text-muted">Each agent only knows its own student&apos;s schedule, budget and food needs. The hub just passes messages.</p>
              </div>
              {plan?.source && <Chip tone={plan.source === "live" ? "coral" : "amber"}>source: {plan.source}</Chip>}
            </div>
            <ol className="space-y-4" aria-live="polite">
              {negotiating && !plan && (
                <li className="flex items-center gap-2 py-6 text-muted">
                  <TypingDots /> Your agents are comparing calendars, budgets and food needs…
                </li>
              )}
              {plan?.negotiation.slice(0, shown).map((msg) => (
                <NegBubble key={msg.id} m={msg} mine={msg.from === myAgent} label={msg.from === myAgent ? "Your agent" : `${name}'s agent`} />
              ))}
              {plan && !allShown && (
                <li className="flex items-center gap-2 text-muted">
                  <TypingDots />
                </li>
              )}
            </ol>
            {error && <p className="mt-3 rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm">{error}</p>}
            {plan && allShown && (
              <p className="rise mt-4 text-sm text-muted">
                {plan.outcome === "agreed"
                  ? `Agreed in ${plan.negotiation.length} turns. The hub double-checked every option against both real schedules, budgets and diets.`
                  : "The agents couldn't fully agree, so the hub found options that fit you both from your free windows."}
              </p>
            )}
          </section>

          {plan && allShown && (
            <section className="rise mt-6" aria-label="Date options">
              {final ? (
                <div className="card card-glow p-6 text-center">
                  <p className="text-5xl" aria-hidden>
                    ☕
                  </p>
                  <h2 className="mt-2 font-display text-3xl text-mint">It&apos;s a date</h2>
                  <p className="mt-2 text-lg">
                    {fmtDate(final)} at {fmtTime(final.start)}
                  </p>
                  <p className="text-muted">
                    {final.place} · {final.area} · {final.estCostPerPerson} pp
                  </p>
                  <a className="btn btn-primary mt-5" href={`/api/match/${id}/ics?as=${m.me.id}`} download>
                    📅 Add to calendar (.ics)
                  </a>
                  <p className="mx-auto mt-4 max-w-md text-xs text-muted">
                    Public place, as always. Tell a friend where you&apos;ll be. You can still unmatch or report from your inbox at any time.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <h2 className="font-display text-2xl">Pick one</h2>
                    <p className="text-sm text-muted">If you both pick the same option, it&apos;s booked.</p>
                  </div>
                  {theirsDiffers && (
                    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-coral/50 bg-coral/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm">
                        {name} picked <strong>option {plan.theirPick! + 1}</strong>. Happy with theirs?
                      </p>
                      <button className="btn btn-primary btn-sm" onClick={() => pick(plan.theirPick!)} disabled={busy !== null}>
                        Accept their pick
                      </button>
                    </div>
                  )}
                  <div className="grid gap-4 md:grid-cols-3">
                    {plan.options.map((o, i) => {
                      const mine = plan.myPick === i;
                      const theirs = plan.theirPick === i;
                      return (
                        <article key={`${o.day}${o.start}${o.place}`} className={cx("card flex flex-col p-5", mine && "card-glow")}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="label">Option {i + 1}</span>
                            <span className="flex gap-1">
                              {mine && <Chip tone="amber">your pick</Chip>}
                              {theirs && <Chip tone="coral">their pick</Chip>}
                            </span>
                          </div>
                          <p className="mt-2 font-display text-2xl leading-tight">{fmtDate(o)}</p>
                          <p className="text-lg text-amber">{fmtTime(o.start)}</p>
                          <p className="mt-2 font-semibold">{o.place}</p>
                          <p className="text-sm text-muted">
                            {o.area} · {o.estCostPerPerson} pp
                          </p>
                          <p className="mt-3 flex-1 text-sm text-muted">{o.why}</p>
                          <button className={cx("btn mt-4", mine ? "btn-ghost" : "btn-primary")} onClick={() => pick(i)} disabled={busy !== null || mine}>
                            {busy === i ? <Spinner /> : null}
                            {mine ? "Picked ✓" : "Pick this"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-xs text-muted">
                    Demo tip: switch &ldquo;View as&rdquo; to {name} to make the other pick.
                    {" "}
                    <button className="underline" onClick={() => void negotiate(true)} disabled={negotiating}>
                      Re-run the negotiation
                    </button>
                  </p>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
