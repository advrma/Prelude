"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export interface PersonaSummary {
  id: string;
  firstName: string;
  pronouns: string;
  avatar: string;
  tagline: string;
}

interface Ctx {
  as: string | null;
  setAs: (id: string) => void;
  students: PersonaSummary[];
  current?: PersonaSummary;
  refresh: () => void;
}

const PersonaCtx = createContext<Ctx>({ as: null, setAs: () => {}, students: [], refresh: () => {} });

const KEY = "prelude.as";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** "View as" demo persona: ?as= in the URL wins, then the last choice in localStorage, then the first persona. */
export function PersonaProvider({ children }: { children: ReactNode }) {
  const [as, setAsState] = useState<string | null>(null);
  const [students, setStudents] = useState<PersonaSummary[]>([]);

  const refresh = useCallback(() => {
    fetch("/api/students")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: PersonaSummary[]) => setStudents(list))
      .catch(() => setStudents([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The provider lives in the layout, so re-read ?as= on every client-side navigation.
  const pathname = usePathname();
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("as");
    if (fromUrl) {
      setAsState(fromUrl);
      try {
        window.localStorage.setItem(KEY, fromUrl);
      } catch {
        /* private mode */
      }
    } else setAsState((cur) => cur ?? (readStored() || "s01"));
  }, [pathname]);

  const setAs = useCallback((id: string) => {
    setAsState(id);
    try {
      window.localStorage.setItem(KEY, id);
    } catch {
      /* private mode */
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has("as")) {
      url.searchParams.set("as", id);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  return (
    <PersonaCtx.Provider value={{ as, setAs, students, current: students.find((s) => s.id === as), refresh }}>{children}</PersonaCtx.Provider>
  );
}

export function usePersona() {
  return useContext(PersonaCtx);
}
