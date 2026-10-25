"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { OnboardProfile } from "@/lib/schemas";
import { usePersona } from "@/components/PersonaProvider";
import { Chip, LockIcon, MoonIcon, ShieldIcon, Spinner, TypingDots, cx } from "@/components/ui";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

/** Quick replies per question index. Identity questions offer exact, explicit choices. */
const QUICK: Record<number, { options: string[]; multi?: boolean }> = {
  1: { options: ["Woman", "Man", "Nonbinary", "Self-describe: ", "Prefer not to say"] },
  2: { options: ["Women", "Men", "Nonbinary people", "Everyone"], multi: true },
  3: { options: ["she/her", "he/him", "they/them"] },
  4: { options: ["Something serious", "Casual", "See where it goes", "Friends first"] },
  6: { options: ["Early bird", "Night owl", "Flexible"] },
};

function Row({ label, value, tone }: { label: string; value: string; tone?: "amber" | "coral" }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className={cx("text-right", tone === "amber" && "text-amber", tone === "coral" && "text-coral")}>{value}</span>
    </div>
  );
}

function Section({ title, who, icon, children }: { title: string; who: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="font-semibold">{title}</p>
        <Chip>
          {icon} {who}
        </Chip>
      </div>
      {children}
    </div>
  );
}

const nice = (s: string) => s.replace(/-/g, " ").replace(/_/g, " ");

export default function OnboardPage() {
  const { setAs, refresh } = usePersona();
  const [email, setEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const [multi, setMulti] = useState<string[]>([]);
  const [profile, setProfile] = useState<OnboardProfile | null>(null);
  const [saved, setSaved] = useState<{ id: string; firstName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("email");
    if (e && /\.edu$/i.test(e)) setEmail(e);
  }, []);

  const turn = async (history: Msg[]) => {
    setThinking(true);
    setError(null);
    try {
      const r = await fetch("/api/onboard", { method: "POST", body: JSON.stringify({ action: "turn", messages: history }) });
      const t = await r.json();
      if (!r.ok) throw new Error(t.error ?? "Something went wrong");
      const next = [...history, { role: "assistant" as const, content: t.reply }];
      setMsgs(next);
      setStep(t.step);
      if (t.blocked) setBlocked(true);
      else if (t.done) {
        setDone(true);
        const f = await fetch("/api/onboard", { method: "POST", body: JSON.stringify({ action: "finalize", messages: next }) });
        const fin = await f.json();
        if (!f.ok) throw new Error(fin.error ?? "Couldn't build the profile");
        setProfile(fin.profile);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThinking(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  useEffect(() => {
    if (email && msgs.length === 0) void turn([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs.length, thinking, profile]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || thinking || done || blocked) return;
    const next = [...msgs, { role: "user" as const, content: t }];
    setMsgs(next);
    setInput("");
    setMulti([]);
    void turn(next);
  };

  const save = async () => {
    if (!profile || !email) return;
    setError(null);
    const r = await fetch("/api/onboard", { method: "POST", body: JSON.stringify({ action: "save", email, profile }) });
    const b = await r.json();
    if (!r.ok) {
      setError(b.error ?? "Couldn't save");
      return;
    }
    setSaved({ id: b.id, firstName: b.firstName });
    refresh();
    setAs(b.id);
  };

  const runMatching = async () => {
    setRunning(true);
    await fetch("/api/match/run", { method: "POST" });
    setRunning(false);
    window.location.href = `/matches?as=${saved!.id}`;
  };

  if (!email)
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:py-20">
        <form
          className="card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^[^\s@]+@[^\s@]+\.edu$/i.test(emailInput.trim())) setEmail(emailInput.trim());
            else setEmailErr("Prelude is for students. Use your .edu email.");
          }}
        >
          <p className="label">Join Prelude</p>
          <h1 className="mt-1 font-display text-3xl">Meet your agent</h1>
          <p className="mt-2 text-sm text-muted">Students only, 18+. A short chat, then you confirm your profile.</p>
          <label htmlFor="edu" className="mt-5 block text-sm">
            Your .edu email
          </label>
          <input
            id="edu"
            type="email"
            className={cx("field mt-1", emailErr && "!border-danger")}
            placeholder="you@asu.edu"
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              setEmailErr(null);
            }}
          />
          {emailErr && <p className="mt-1.5 text-xs text-danger">{emailErr}</p>}
          <button className="btn btn-primary mt-4 w-full">Continue</button>
          <p className="mt-3 flex gap-1.5 text-xs text-muted">
            <LockIcon className="mt-0.5 shrink-0" /> Real .edu sign-in is coming soon. For the demo we only check the domain.
          </p>
        </form>
      </div>
    );

  const quick = !done && !blocked && !thinking ? QUICK[step] : undefined;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <p className="label">Onboarding · {email}</p>
      <h1 className="mt-1 font-display text-3xl sm:text-4xl">Meet your agent</h1>
      <p className="mt-1 text-sm text-muted">
        Question {Math.min(step + 1, 8)} of 8 · it asks, it never guesses. Private details are only revealed step by step, with your yes.
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full bg-gradient-to-r from-amber to-coral transition-all duration-500" style={{ width: `${(Math.min(step, 8) / 8) * 100}%` }} />
      </div>

      <div className="card mt-5 p-3 sm:p-5">
        <ol className="space-y-3" aria-live="polite">
          {msgs.map((m, i) => (
            <li key={i} className={cx("rise flex gap-2", m.role === "user" && "justify-end")}>
              {m.role === "assistant" && (
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber to-coral text-[#1a1020]">
                  <MoonIcon size={14} />
                </span>
              )}
              <div className={cx("bubble max-w-[85%]", m.role === "assistant" ? "bubble-a" : "bubble-b")}>{m.content}</div>
            </li>
          ))}
          {thinking && (
            <li className="flex gap-2">
              <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber to-coral text-[#1a1020]">
                <MoonIcon size={14} />
              </span>
              <div className="bubble bubble-a text-amber">
                <TypingDots />
              </div>
            </li>
          )}
        </ol>

        {quick && (
          <div className="mt-4 flex flex-wrap gap-2">
            {quick.options.map((o) =>
              quick.multi ? (
                <button
                  key={o}
                  className={cx("btn btn-ghost btn-sm", multi.includes(o) && "!border-amber !bg-amber/15 !text-amber")}
                  aria-pressed={multi.includes(o)}
                  onClick={() => setMulti((cur) => (o === "Everyone" ? ["Everyone"] : cur.includes(o) ? cur.filter((x) => x !== o) : [...cur.filter((x) => x !== "Everyone"), o]))}
                >
                  {o}
                </button>
              ) : (
                <button
                  key={o}
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (o.endsWith(": ")) {
                      setInput(o);
                      inputRef.current?.focus();
                    } else send(o);
                  }}
                >
                  {o.replace(": ", "…")}
                </button>
              ),
            )}
            {quick.multi && (
              <button className="btn btn-primary btn-sm" disabled={!multi.length} onClick={() => send(multi.join(" and "))}>
                Done
              </button>
            )}
          </div>
        )}

        {!done && !blocked && (
          <form
            className="mt-4 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              ref={inputRef}
              className="field min-h-[48px] resize-none"
              rows={1}
              value={input}
              maxLength={600}
              placeholder={thinking ? "Your agent is typing…" : "Type your answer…"}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              aria-label="Your answer"
              disabled={thinking}
            />
            <button className="btn btn-primary" disabled={thinking || !input.trim()}>
              Send
            </button>
          </form>
        )}
        {blocked && (
          <p className="mt-4 rounded-2xl border border-line p-3 text-sm text-muted">
            Prelude is 18+ only. <Link href="/" className="underline">Back home</Link>
          </p>
        )}
        {error && <p className="mt-3 rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm">{error}</p>}
        <div ref={endRef} />
      </div>

      {done && !blocked && !profile && (
        <p className="mt-6 flex items-center gap-2 text-muted">
          <Spinner /> Building your profile…
        </p>
      )}

      {profile && !saved && (
        <section className="card rise mt-6 p-5 sm:p-6" aria-label="Profile preview">
          <h2 className="font-display text-2xl">Does this look like you, {profile.firstName}?</h2>
          <p className="mt-1 text-sm text-muted">Here&apos;s exactly what your agent knows, and who can ever see each part.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Section title="Your vibe" who="pre-date agents (L0)" icon={<MoonIcon size={10} />}>
              <div className="flex flex-wrap gap-1">
                {profile.interests.map((i) => (
                  <Chip key={i} tone="amber">
                    {i}
                  </Chip>
                ))}
              </div>
              <p className="mt-2 text-sm text-muted">{profile.bio}</p>
              <Row label="Pronouns" value={profile.pronouns} />
              <Row label="Rhythm" value={`${nice(profile.chronotype)} · ${nice(profile.socialEnergy)}`} />
            </Section>
            <Section title="Hub-only filters" who="never shared" icon={<ShieldIcon />}>
              <Row label="Gender" value={profile.genderSelfDescribe ? `${profile.genderSelfDescribe} (self-described)` : nice(profile.gender)} tone="amber" />
              <Row label="Wants to meet" value={profile.wantsToMeet === "everyone" ? "everyone" : profile.wantsToMeet.join(", ")} tone="coral" />
              <Row label="Age" value={String(profile.age)} />
              <Row label="Looking for" value={nice(profile.intent)} />
              <Row label="Dealbreakers" value={profile.dealbreakers.join(", ") || "none"} />
            </Section>
            <Section title="Unlocks with both yeses" who="L1 → L2" icon={<LockIcon className="h-3 w-3" />}>
              <Row label="L1 · Major" value={profile.major} />
              <Row label="L1 · Year" value={profile.year} />
              <Row label="L1 · Photos" value="2 generated avatars" />
              <Row label="L2 · First name" value={profile.firstName} />
            </Section>
            <Section title="For planning only" who="your negotiator (L3)" icon={<LockIcon className="h-3 w-3" />}>
              <Row label="Budget" value={nice(profile.budgetBand).replace("under ", "under $")} />
              <Row label="Food" value={profile.food.join(", ") || "no restrictions"} />
              <Row label="Free time" value="Thu–Sun evenings (edit later)" />
            </Section>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={save}>
              Looks right, create my agent
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setMsgs([]);
                setProfile(null);
                setDone(false);
                setStep(0);
                void turn([]);
              }}
            >
              Start over
            </button>
          </div>
        </section>
      )}

      {saved && (
        <section className="card card-glow rise mt-6 p-6 text-center">
          <p className="font-display text-3xl">Your agent is ready, {saved.firstName}.</p>
          <p className="mt-2 text-muted">Tonight it&apos;ll meet compatible agents in the hub. You&apos;ll only hear about the ones that felt right on both sides.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button className="btn btn-primary" onClick={runMatching} disabled={running}>
              {running ? <Spinner /> : null} Run tonight&apos;s matching
            </button>
            <Link className="btn btn-ghost" href={`/matches?as=${saved.id}`}>
              Go to my inbox
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
