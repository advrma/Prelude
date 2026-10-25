"use client";

import { useEffect, useState } from "react";
import { Chip } from "./ui";

interface Usage {
  mode: "mock" | "live" | "replay";
  day: string;
  rpdStop: number;
  rpmCap: number;
  models: Record<string, { today: number; lastMinute: number; stopped: boolean }>;
}

const MODE_TONE = { live: "coral", mock: "amber", replay: "mint" } as const;

/** Footer badge: LLM mode + requests per model today (§8.3). */
export function UsageBadge() {
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/usage")
        .then((r) => r.json())
        .then((d: Usage) => alive && setU(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (!u) return <Chip>loading usage…</Chip>;
  return (
    <div className="flex flex-wrap items-center gap-1.5" title={`Free tier caps: ${u.rpmCap}/min and ${u.rpdStop}/day per model. Resets at midnight Los Angeles time.`}>
      <Chip tone={MODE_TONE[u.mode]}>
        {u.mode === "live" && <span className="live-dot" />} {u.mode}
      </Chip>
      {Object.entries(u.models).map(([m, s]) => (
        <Chip key={m} tone={s.stopped ? "danger" : "default"}>
          {m}: {s.today}/{u.rpdStop} today
        </Chip>
      ))}
    </div>
  );
}
