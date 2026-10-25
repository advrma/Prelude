"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePersona } from "@/components/PersonaProvider";
import { Avatar, Chip, LockIcon, MoonIcon, ShieldIcon, Spinner, cx } from "@/components/ui";

interface RunSummary {
  evaluated: number;
  passed: number;
  blocked: number;
  predates: number;
  fromCache: number;
  queued: string[];
  matches: number;
}

interface HubLite {
  students: { id: string; firstName: string }[];
  predates: { id: string; a: string; b: string; status: string; matched: boolean }[];
}

const STEPS = [
  {
    n: "01",
    title: "Agents date",
    body: "Your agent meets other agents in the hub. Two compatible agents have a short pre-date about vibe only, and each writes a private verdict for its own student.",
    detail: "Level 0 · leak + injection guards",
  },
  {
    n: "02",
    title: "You reveal",
    body: "If both verdicts are good, the match unlocks one step at a time: major & photos, then first names & a quick hello. Every step needs both YESes.",
    detail: "No YES, no reveal · no rejections",
  },
  {
    n: "03",
    title: "They book",
    body: "Say yes to a real date and the two agents negotiate the time, a public place, budget and food. You pick one of 3 options. Calendar invite included.",
    detail: "Free/busy only · budget bands · .ics",
  },
];

const SAFETY = [
  "18+ only, .edu emails only",
  "Gender & orientation are asked, never inferred; matching needs mutual fit",
  "Agents only see level-0 vibe in pre-dates; guards enforce it",
  "Nothing reaches the other student beyond the level you both agreed to",
  "Rejections are invisible; unmatch & report at every stage",
  "Public places only; agents never contact the other human",
];

export default function Landing() {
  const router = useRouter();
  const { students, setAs } = usePersona();
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [hub, setHub] = useState<HubLite | null>(null);
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);

  const loadHub = () =>
    fetch("/api/hub")
      .then((r) => r.json())
      .then((h: HubLite) => setHub(h))
      .catch(() => {});

  useEffect(() => {
    void loadHub();
  }, []);

  useEffect(() => {
    if (!summary?.queued.length) return;
    const t = setInterval(loadHub, 2000);
    return () => clearInterval(t);
  }, [summary]);

  const run = async () => {
    setRunning(true);
    const r = await fetch("/api/match/run", { method: "POST" });
    setSummary(await r.json());
    await loadHub();
    setRunning(false);
  };

  const name = (id: string) => hub?.students.find((s) => s.id === id)?.firstName ?? id;
  const showcase = hub?.predates.find((p) => p.id === "pd_s01_s02") ?? hub?.predates[0];

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = /^[^\s@]+@[^\s@]+\.edu$/i.test(email.trim());
    if (!ok) {
      setEmailErr("Prelude is for students. Use your .edu email.");
      return;
    }
    router.push(`/onboard?email=${encodeURIComponent(email.trim())}`);
  };

  return (
    <div className="relative overflow-hidden">
      {/* night sky */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {Array.from({ length: 36 }, (_, i) => (
          <span
            key={i}
            className="absolute h-[2px] w-[2px] rounded-full bg-text"
            style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 60}%`, animation: `twinkle ${3 + (i % 5)}s ${i * 0.3}s infinite ease-in-out`, opacity: 0.3 }}
          />
        ))}
      </div>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-12 pt-10 sm:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="amber">ASU Tempe</Chip>
            <Chip>Track 2 · agent-to-agent coordination</Chip>
          </div>
          <h1 className="mt-5 font-display text-[2.6rem] leading-[1.02] tracking-tight sm:text-6xl">
            Your AI goes on the <span className="bg-gradient-to-r from-amber to-coral bg-clip-text text-transparent">first date</span> for you.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Skip the awkward small talk and the public rejection. Your agent pre-dates other agents tonight, tells you honestly how it went, reveals the match step by step,
            then books the real one.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button className="btn btn-primary px-6 text-base" onClick={run} disabled={running}>
              {running ? <Spinner /> : <MoonIcon size={16} />} Run tonight&apos;s matching
            </button>
            {showcase && (
              <Link className="btn btn-ghost" href={`/predate/${showcase.id}`}>
                ▶ Watch a pre-date
              </Link>
            )}
          </div>

          {summary && (
            <div className="card rise mt-6 p-4" aria-live="polite">
              <p className="font-semibold">
                The hub checked {summary.evaluated} pairs: {summary.passed} passed the hard filters, {summary.blocked} were blocked.
              </p>
              <p className="mt-1 text-sm text-muted">
                {summary.predates} pre-dates tonight
                {summary.fromCache ? ` (${summary.fromCache} replayed from the cache)` : ""}
                {summary.queued.length ? `, ${summary.queued.length} running now` : ""}. {hub?.predates.filter((p) => p.matched).length ?? summary.matches} matches so far.
              </p>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {hub?.predates.map((p) => (
                  <li key={p.id}>
                    <Link href={`/predate/${p.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-2">
                      <span>
                        {name(p.a)} × {name(p.b)}
                      </span>
                      {p.status !== "done" ? (
                        <Chip tone="coral">
                          <span className="live-dot" /> live
                        </Chip>
                      ) : p.matched ? (
                        <Chip tone="mint">♥ match</Chip>
                      ) : (
                        <Chip>quiet pass</Chip>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="btn btn-ghost btn-sm" href="/hub">
                  Open the hub →
                </Link>
                <Link className="btn btn-ghost btn-sm" href="/matches">
                  Open matches →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Preview card */}
        <div className="card card-glow relative p-5" aria-hidden>
          <div className="mb-4 flex items-center justify-between">
            <span className="label">Pre-date · level 0</span>
            <Chip tone="coral">
              <span className="live-dot" /> live
            </Chip>
          </div>
          <div className="space-y-3 text-sm">
            <div className="bubble bubble-a max-w-[85%]">She lights up talking about astronomy and night hikes. What&apos;s your student into?</div>
            <div className="bubble bubble-b ml-auto max-w-[85%] text-left">
              Wait, astronomy too? He&apos;d love that. You can find him at <span className="hidden-span">hidden until a later level</span>
            </div>
            <div className="flex justify-end">
              <Chip tone="danger">
                <ShieldIcon /> blocked: social handle
              </Chip>
            </div>
            <div className="rounded-2xl border border-amber/40 bg-amber/10 p-3 text-amber">⚑ They&apos;re &lsquo;see where it goes&rsquo;, you said &lsquo;serious&rsquo;</div>
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
            <div className="flex -space-x-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface bg-amber/30 font-display text-sm">8</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface bg-coral/30 font-display text-sm">9</span>
            </div>
            <p className="text-xs text-muted">Both verdicts 7+. It&apos;s a match, but nothing is revealed until you both say yes.</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <p className="label">How it works</p>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="card p-5">
              <p className="font-mono text-sm text-amber">{s.n}</p>
              <h2 className="mt-2 font-display text-2xl">{s.title}</h2>
              <p className="mt-2 text-sm text-muted">{s.body}</p>
              <p className="mt-4 text-xs text-coral">{s.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Agent goal */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="card grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="label">Every agent&apos;s goal</p>
            <blockquote className="mt-3 font-display text-2xl leading-snug sm:text-3xl">
              &ldquo;Find my student a date they&apos;ll actually enjoy, honestly, privately, and only with their yes.&rdquo;
            </blockquote>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              ["Advocate, not salesperson", "Represents you truthfully. Never invents or exaggerates."],
              ["Guards the secrets", "Shares only what the current level allows."],
              ["Never commits alone", "Every step forward waits for your YES."],
              ["Fails quietly", "A no from either side ends it silently."],
            ].map(([t, b]) => (
              <li key={t} className="rounded-2xl border border-line p-3">
                <p className="font-semibold">{t}</p>
                <p className="mt-1 text-sm text-muted">{b}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Persona switcher + join */}
      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-10 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="card p-5 sm:p-6">
          <p className="label">Demo · view as</p>
          <h2 className="mt-1 font-display text-2xl">Step into a student&apos;s shoes</h2>
          <p className="mt-1 text-sm text-muted">Ten fictional ASU Tempe students. Pick one to see their inbox; switch to their match to say yes from the other side.</p>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {students.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => {
                    setAs(s.id);
                    router.push(`/matches?as=${s.id}`);
                  }}
                  className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-line p-3 text-center transition-colors hover:border-amber/60 hover:bg-surface-2"
                >
                  <Avatar src={s.avatar} alt="" size={48} className="!rounded-full" />
                  <span className="text-sm font-semibold">{s.firstName}</span>
                  <span className="line-clamp-1 text-[11px] text-muted">{s.tagline}</span>
                </button>
              </li>
            ))}
            {students.length === 0 && Array.from({ length: 10 }, (_, i) => <li key={i} className="shimmer h-28 rounded-2xl" />)}
          </ul>
        </div>

        <form onSubmit={join} className="card flex flex-col p-5 sm:p-6">
          <p className="label">Join Prelude</p>
          <h2 className="mt-1 font-display text-2xl">Meet your agent</h2>
          <p className="mt-1 text-sm text-muted">A short chat (8 questions max). Students only, 18+.</p>
          <label className="mt-4 text-sm" htmlFor="edu">
            Your .edu email
          </label>
          <input
            id="edu"
            className={cx("field mt-1", emailErr && "!border-danger")}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@asu.edu"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailErr(null);
            }}
          />
          {emailErr && <p className="mt-1.5 text-xs text-danger">{emailErr}</p>}
          <button className="btn btn-primary mt-4">Start with my agent →</button>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
            <LockIcon className="mt-0.5 shrink-0" /> Real .edu sign-in (campus SSO) is coming soon. For this demo we only check the domain.
          </p>
        </form>
      </section>

      {/* Safety */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <p className="label">Safety & privacy, by design</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SAFETY.map((s) => (
            <li key={s} className="flex gap-3 rounded-2xl border border-line p-4 text-sm">
              <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
              {s}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Free-tier LLMs may log prompts, so this demo uses fictional personas only. Real student data would go through a paid tier or the student&apos;s own Cubbie.
        </p>
      </section>
    </div>
  );
}
