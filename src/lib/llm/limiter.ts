import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

// Per-model limits (§8.3): RPM token bucket that queues (never fails) + daily counter that
// resets at midnight America/Los_Angeles and stops a model at RPD_STOP.

const WINDOW_MS = 60_000;
const USAGE_TZ = "America/Los_Angeles";

export interface UsageSnapshot {
  day: string;
  timezone: string;
  rpmCap: number;
  rpdStop: number;
  models: Record<string, { today: number; lastMinute: number; stopped: boolean }>;
}

interface UsageFile {
  day: string;
  counts: Record<string, number>;
}

/** Calendar day in Los Angeles for a timestamp, e.g. "2026-10-25". */
export function laDay(ms: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: USAGE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(ms),
  );
}

export interface LimiterOptions {
  rpmCap?: () => number;
  rpdStop?: () => number;
  /** usage.json path; null keeps counts in memory only. */
  file?: () => string | null;
}

export class Limiter {
  private recent = new Map<string, number[]>();
  private chains = new Map<string, Promise<void>>();
  private usage: UsageFile | null = null;
  private rpmCap: () => number;
  private rpdStop: () => number;
  private file: () => string | null;

  constructor(opts: LimiterOptions = {}) {
    this.rpmCap = opts.rpmCap ?? config.rpmCap;
    this.rpdStop = opts.rpdStop ?? config.rpdStop;
    this.file = opts.file ?? (() => path.join(config.stateDir(), "usage.json"));
  }

  private load(): UsageFile {
    const today = laDay();
    if (!this.usage) {
      const file = this.file();
      try {
        this.usage = file ? (JSON.parse(fs.readFileSync(file, "utf8")) as UsageFile) : null;
      } catch {
        this.usage = null;
      }
      this.usage ??= { day: today, counts: {} };
    }
    if (this.usage.day !== today) this.usage = { day: today, counts: {} }; // LA midnight reset
    return this.usage;
  }

  private save() {
    const file = this.file();
    if (!file || !this.usage) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(this.usage, null, 2), "utf8");
    } catch {
      /* read-only disk: keep counting in memory */
    }
  }

  today(model: string): number {
    return this.load().counts[model] ?? 0;
  }

  /** False once the model hit RPD_STOP today; the router then skips it until LA midnight. */
  canUse(model: string): boolean {
    return this.today(model) < this.rpdStop();
  }

  private lastMinute(model: string, now = Date.now()): number[] {
    const kept = (this.recent.get(model) ?? []).filter((t) => now - t < WINDOW_MS);
    this.recent.set(model, kept);
    return kept;
  }

  private async takeSlot(model: string): Promise<void> {
    for (;;) {
      const now = Date.now();
      const times = this.lastMinute(model, now);
      if (times.length < this.rpmCap()) {
        times.push(now);
        const usage = this.load();
        usage.counts[model] = (usage.counts[model] ?? 0) + 1;
        this.save();
        return;
      }
      const wait = times[0] + WINDOW_MS - now + 5;
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  /** Wait (FIFO per model) until a request fits under RPM_CAP, then count it. */
  acquire(model: string): Promise<void> {
    const prev = this.chains.get(model) ?? Promise.resolve();
    const next = prev.then(() => this.takeSlot(model));
    this.chains.set(
      model,
      next.catch(() => undefined),
    );
    return next;
  }

  snapshot(models: string[] = []): UsageSnapshot {
    const usage = this.load();
    const names = [...new Set([...models, ...Object.keys(usage.counts)])];
    return {
      day: usage.day,
      timezone: USAGE_TZ,
      rpmCap: this.rpmCap(),
      rpdStop: this.rpdStop(),
      models: Object.fromEntries(
        names.map((m) => [m, { today: usage.counts[m] ?? 0, lastMinute: this.lastMinute(m).length, stopped: !this.canUse(m) }]),
      ),
    };
  }
}

const g = globalThis as unknown as { __preludeLimiter?: Limiter };
/** Process-wide limiter shared by every route and script. */
export function getLimiter(): Limiter {
  return (g.__preludeLimiter ??= new Limiter());
}
