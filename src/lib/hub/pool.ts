import { config } from "../config";
import { readCachedPredate } from "../cachefiles";
import type { StoreState } from "../store";
import type { Match, PreDate } from "../types";
import { matchPool } from "./matcher";

// Turns matcher output into pre-date + match records. Pure over the state object (no store import).

export function predateIdFor(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `pd_${x}_${y}`;
}

export function matchIdFor(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `m_${x}_${y}`;
}

/** Create the match record for a finished, matched pre-date (idempotent). */
export function ensureMatch(state: StoreState, pd: PreDate): Match | undefined {
  if (pd.status !== "done" || !pd.matched) return undefined;
  const id = matchIdFor(pd.a, pd.b);
  let m = state.matches.find((x) => x.id === id);
  if (!m) {
    m = { id, a: pd.a, b: pd.b, predateId: pd.id, stage: 0, yes: { [pd.a]: null, [pd.b]: null }, closed: false, chat: [], createdAt: new Date().toISOString() };
    state.matches.push(m);
  }
  return m;
}

export interface RunSummary {
  evaluated: number;
  passed: number;
  blocked: number;
  predates: number;
  created: number;
  fromCache: number;
  queued: string[];
  matches: number;
}

/**
 * Run the matcher over the pool and create pre-dates for the selected pairs.
 * Pairs with a finished pre-date in data/cache/predates are loaded as done ("replay"); the rest are queued.
 */
export function runMatching(state: StoreState, opts: { useCache?: boolean } = {}): RunSummary {
  const useCache = opts.useCache ?? true;
  const { pairs, selected } = matchPool(state.students, config.predatesPerStudent());
  state.pairs = pairs;
  let created = 0;
  let fromCache = 0;
  for (const p of selected) {
    const id = predateIdFor(p.a, p.b);
    if (state.predates.some((x) => x.id === id)) continue;
    const cached = useCache ? readCachedPredate(id) : undefined;
    if (cached && cached.a === p.a && cached.b === p.b) {
      const pd: PreDate = { ...cached, source: "replay", matcherScore: p.score, sharedTags: p.sharedTags };
      state.predates.push(pd);
      ensureMatch(state, pd);
      fromCache++;
    } else {
      state.predates.push({
        id,
        a: p.a,
        b: p.b,
        status: "queued",
        transcript: [],
        verdicts: {},
        matched: false,
        matcherScore: p.score,
        sharedTags: p.sharedTags,
      });
    }
    created++;
  }
  state.lastRunAt = new Date().toISOString();
  return {
    evaluated: pairs.length,
    passed: pairs.filter((p) => p.passed).length,
    blocked: pairs.filter((p) => !p.passed).length,
    predates: state.predates.length,
    created,
    fromCache,
    queued: state.predates.filter((p) => p.status === "queued").map((p) => p.id),
    matches: state.matches.length,
  };
}
