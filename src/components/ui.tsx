import Image from "next/image";
import type { ReactNode } from "react";
import type { Level } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Tone = "default" | "amber" | "coral" | "mint" | "danger";

export function Chip({ children, tone = "default", title, className }: { children: ReactNode; tone?: Tone; title?: string; className?: string }) {
  return (
    <span className={cx("chip", tone !== "default" && `chip-${tone}`, className)} title={title}>
      {children}
    </span>
  );
}

export const LEVEL_NAMES: Record<Level, string> = {
  0: "Vibe",
  1: "Major & photos",
  2: "Name & chat",
  3: "Real date",
};

export function LevelChip({ level }: { level: Level }) {
  return (
    <Chip tone={level === 0 ? "default" : "amber"} title={`Disclosure level ${level}: ${LEVEL_NAMES[level]}`}>
      L{level} · {LEVEL_NAMES[level].toLowerCase()}
    </Chip>
  );
}

export function BlockedChip({ reason }: { reason: string }) {
  const injection = reason.includes("injection");
  return (
    <Chip tone="danger" title={`Guard: ${reason}. The other agent never saw the original.`}>
      <ShieldIcon /> {injection && !reason.startsWith("leak") ? "injection wrapped" : reason.replace("leak blocked: ", "blocked: ").replace(" · injection attempt (wrapped)", " + injection")}
    </Chip>
  );
}

export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1", className)} aria-label="typing">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </span>
  );
}

/** 0–10 ring. Mint at 7+, amber 5–6, coral below. */
export function ScoreDial({ score, size = 104, label = "score" }: { score: number; size?: number; label?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(10, score)) / 10;
  const color = score >= 7 ? "var(--mint)" : score >= 5 ? "var(--amber)" : "var(--coral)";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${label} ${score} out of 10`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dasharray 0.9s cubic-bezier(.2,.8,.2,1)", filter: `drop-shadow(0 0 6px ${color})` }}
      />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill="var(--text)" style={{ font: "400 30px var(--font-display)" }}>
        {score}
      </text>
      <text x="50" y="72" textAnchor="middle" fill="var(--muted)" style={{ font: "600 8px var(--font-mono)", letterSpacing: "0.1em" }}>
        / 10
      </text>
    </svg>
  );
}

export function Avatar({ src, alt, size = 40, className }: { src: string; alt: string; size?: number; className?: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={Math.round(size * 1.25)}
      unoptimized
      className={cx("rounded-2xl object-cover border border-line bg-surface-2", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
    </svg>
  );
}

export function LockIcon({ open = false, className }: { open?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      {open ? <path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7" /> : <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />}
    </svg>
  );
}

/** Render guarded text with the redaction marker highlighted. */
export function GuardedText({ text }: { text: string }) {
  const parts = text.split(/(\[hidden until a later level\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p === "[hidden until a later level]" ? (
          <span key={i} className="hidden-span" title="Redacted by the leak guard">
            hidden until a later level
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-line text-amber">
        <MoonIcon />
      </div>
      <h3 className="font-display text-xl">{title}</h3>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function MoonIcon({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden fill="currentColor">
      <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a.6.6 0 0 0-.8-.7A9.5 9.5 0 1 0 21.2 15a.6.6 0 0 0-.7-.8z" />
    </svg>
  );
}
