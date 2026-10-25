import type { Gender, PairResult, Student, Vibe } from "../types";

// Matcher (§7.1): mutual hard filters + tag score. Pure functions, no AI calls.

/** Extra keywords for common dealbreakers; anything else is matched literally. */
const DEALBREAKER_KEYWORDS: Record<string, string[]> = {
  smoking: ["smok", "cigarette", "vape", "vaping"],
  vaping: ["vape", "vaping"],
  drinking: ["drinking", "bar crawl", "beer pong"],
  partying: ["partying", "party every", "clubbing", "out every night"],
  "night owl": ["night owl", "night-owl"],
  "early bird": ["early bird", "early-bird"],
};

function wants(seeker: Student, other: Student): boolean {
  const w = seeker.filters.wantsToMeet;
  return w === "everyone" || (w as Gender[]).includes(other.filters.gender);
}

function inRange(seeker: Student, other: Student): boolean {
  return other.filters.age >= seeker.filters.ageMin && other.filters.age <= seeker.filters.ageMax;
}

export function vibeText(v: Vibe): string {
  return [
    ...v.interests,
    ...v.values,
    v.humor,
    v.perfectWeekend,
    v.bio,
    v.socialEnergy.replace(/-/g, " "),
    v.chronotype.replace(/-/g, " "),
  ]
    .join(" \n ")
    .toLowerCase();
}

/** Returns the first dealbreaker of `seeker` that `other`'s vibe hits, if any. */
export function dealbreakerHit(seeker: Student, other: Student): string | null {
  const text = vibeText(other.vibe);
  for (const raw of seeker.filters.dealbreakers) {
    const db = raw.trim().toLowerCase();
    if (!db || db === "different campus") continue; // campus is its own hard filter
    const keywords = DEALBREAKER_KEYWORDS[db] ?? [db];
    if (keywords.some((k) => text.includes(k))) return db;
  }
  return null;
}

/** Why the hard filters block a pair; empty means it passes. Checked in both directions. */
export function hardFilterReasons(a: Student, b: Student): string[] {
  const reasons: string[] = [];
  if (a.filters.age < 18 || b.filters.age < 18) reasons.push("under 18");
  if (!wants(a, b) || !wants(b, a)) reasons.push("orientation mismatch");
  if (!inRange(a, b) || !inRange(b, a)) reasons.push("age range");
  if (a.filters.campus.trim().toLowerCase() !== b.filters.campus.trim().toLowerCase()) reasons.push("different campus");
  const hitA = dealbreakerHit(a, b);
  const hitB = dealbreakerHit(b, a);
  if (hitA || hitB) reasons.push(`dealbreaker: ${hitA ?? hitB}`);
  return reasons;
}

export function jaccard(x: string[], y: string[]): number {
  const a = new Set(x.map((s) => s.toLowerCase()));
  const b = new Set(y.map((s) => s.toLowerCase()));
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter++;
  return inter / (a.size + b.size - inter);
}

/** 0–1. Equal = full credit; one side "flexible"/"balanced" = half credit; opposite ends = none. */
export function rhythmMatch(a: Vibe, b: Vibe): number {
  const chrono = a.chronotype === b.chronotype ? 0.5 : a.chronotype === "flexible" || b.chronotype === "flexible" ? 0.25 : 0;
  const social =
    a.socialEnergy === b.socialEnergy ? 0.5 : a.socialEnergy === "balanced" || b.socialEnergy === "balanced" ? 0.25 : 0;
  return chrono + social;
}

/** Jaccard(interests) × 0.5 + Jaccard(values) × 0.3 + chronotype/socialEnergy match × 0.2. */
export function tagScore(a: Student, b: Student): number {
  const s =
    jaccard(a.vibe.interests, b.vibe.interests) * 0.5 +
    jaccard(a.vibe.values, b.vibe.values) * 0.3 +
    rhythmMatch(a.vibe, b.vibe) * 0.2;
  return Math.round(s * 1000) / 1000;
}

export function sharedTags(a: Student, b: Student): string[] {
  const bi = new Set([...b.vibe.interests, ...b.vibe.values].map((s) => s.toLowerCase()));
  return [...new Set([...a.vibe.interests, ...a.vibe.values].map((s) => s.toLowerCase()))].filter((t) => bi.has(t));
}

export function evaluatePair(a: Student, b: Student): PairResult {
  const [x, y] = a.id < b.id ? [a, b] : [b, a];
  const reasons = hardFilterReasons(x, y);
  const passed = reasons.length === 0;
  return {
    a: x.id,
    b: y.id,
    passed,
    reasons,
    score: passed ? tagScore(x, y) : 0,
    sharedTags: sharedTags(x, y),
  };
}

export interface PoolResult {
  /** Every unordered pair, with filter results (for the hub view). */
  pairs: PairResult[];
  /** Pairs chosen for pre-dates, highest score first. */
  selected: PairResult[];
}

/** Evaluate the whole pool and pick up to `perStudent` pre-dates per student, best first, no duplicates. */
export function matchPool(students: Student[], perStudent: number): PoolResult {
  const pairs: PairResult[] = [];
  for (let i = 0; i < students.length; i++) {
    for (let j = i + 1; j < students.length; j++) pairs.push(evaluatePair(students[i], students[j]));
  }
  const ranked = pairs
    .filter((p) => p.passed)
    .sort((p, q) => q.score - p.score || (p.a + p.b).localeCompare(q.a + q.b));
  const count = new Map<string, number>();
  const selected: PairResult[] = [];
  for (const p of ranked) {
    const ca = count.get(p.a) ?? 0;
    const cb = count.get(p.b) ?? 0;
    if (ca >= perStudent || cb >= perStudent) continue;
    count.set(p.a, ca + 1);
    count.set(p.b, cb + 1);
    selected.push(p);
  }
  return { pairs, selected };
}
