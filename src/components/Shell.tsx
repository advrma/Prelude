"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePersona } from "./PersonaProvider";
import { Avatar, cx, MoonIcon } from "./ui";
import { UsageBadge } from "./UsageBadge";

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem("prelude.theme");
    } catch {
      /* ignore */
    }
    const initial = saved === "light" || saved === "dark" ? saved : window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);
  const flip = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem("prelude.theme", next);
    } catch {
      /* ignore */
    }
  };
  return (
    <button onClick={flip} className="btn btn-ghost btn-sm !px-2.5" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} title="Toggle light/dark">
      {theme === "light" ? (
        <MoonIcon size={16} />
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}

export function PersonaSwitcher({ compact = false }: { compact?: boolean }) {
  const { as, setAs, students, current } = usePersona();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Demo: switch which student you're viewing as"
      >
        {current ? <Avatar src={current.avatar} alt="" size={22} className="!rounded-full" /> : null}
        <span className={cx(compact && "hidden sm:inline")}>
          <span className="text-muted">View as</span> {current?.firstName ?? "…"}
        </span>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul role="listbox" className="card rise absolute right-0 z-50 mt-2 max-h-[70vh] w-64 overflow-auto p-1.5">
          {students.map((s) => (
            <li key={s.id}>
              <button
                role="option"
                aria-selected={s.id === as}
                onClick={() => {
                  setAs(s.id);
                  setOpen(false);
                }}
                className={cx(
                  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-surface-2",
                  s.id === as && "bg-surface-2",
                )}
              >
                <Avatar src={s.avatar} alt="" size={32} className="!rounded-full" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {s.firstName} <span className="font-normal text-muted">({s.pronouns})</span>
                  </span>
                  <span className="block truncate text-xs text-muted">{s.tagline}</span>
                </span>
              </button>
            </li>
          ))}
          <li className="px-2.5 pb-1.5 pt-2 text-[11px] text-muted">Demo switcher. All personas are fictional.</li>
        </ul>
      )}
    </div>
  );
}

const NAV = [
  { href: "/matches", label: "Matches" },
  { href: "/hub", label: "Hub" },
  { href: "/onboard", label: "Join" },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:gap-4">
          <Link href="/" className="mr-auto flex items-center gap-2" aria-label="Prelude home">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber to-coral text-[#1a1020] shadow-[0_0_24px_var(--glow)]">
              <MoonIcon size={16} />
            </span>
            <span className="font-display text-xl tracking-tight">Prelude</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  "rounded-full px-3 py-1.5 text-sm transition-colors hover:text-text",
                  path?.startsWith(n.href) ? "bg-surface-2 text-text" : "text-muted",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <PersonaSwitcher compact />
          <ThemeToggle />
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-2 sm:hidden" aria-label="Main mobile">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "flex-1 rounded-full px-3 py-1.5 text-center text-sm",
                path?.startsWith(n.href) ? "bg-surface-2 text-text" : "text-muted",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>18+ only · fictional demo personas · rejections are invisible · public places only</p>
          <UsageBadge />
        </div>
      </footer>
    </div>
  );
}
