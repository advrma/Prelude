import { BUDGET_BANDS, WEEKDAYS, type BudgetBand, type BusyBlock, type Place, type TimeWindow, type Weekday } from "../types";

// Pure scheduling helpers shared by the negotiator, its validator and the mock provider.

export const DATE_MINUTES = 60;
export const TIMEZONE = "America/Phoenix"; // Tempe: MST all year, no DST

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const mins = h * 60 + m;
  return mins >= 23 * 60 + 59 ? 24 * 60 : mins; // "23:59" means "until midnight"
}

export function fromMin(mins: number): string {
  const m = Math.max(0, Math.min(mins, 23 * 60 + 59));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function roundUpToHalfHour(mins: number): number {
  return Math.ceil(mins / 30) * 30;
}

/** "19:30" → "7:30pm", "17:00" → "5pm". */
export function fmtTime(hhmm: string): string {
  const mins = toMin(hhmm);
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

const DAY_NAMES: Record<Weekday, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};
export function dayName(day: string): string {
  return DAY_NAMES[day as Weekday] ?? day;
}

export function isWeekday(day: unknown): day is Weekday {
  return typeof day === "string" && (WEEKDAYS as string[]).includes(day);
}

export function budgetRank(b: BudgetBand): number {
  return BUDGET_BANDS.indexOf(b);
}

export function budgetLabel(b: BudgetBand): string {
  return `under $${b.split("_")[1]}`;
}

export function minBudget(a: BudgetBand, b: BudgetBand): BudgetBand {
  return budgetRank(a) <= budgetRank(b) ? a : b;
}

export function withinBudget(place: Place, budget: BudgetBand): boolean {
  return budgetRank(place.costBand) <= budgetRank(budget);
}

function normFood(f: string): string {
  return f.trim().toLowerCase();
}

/** Places without food fit any diet; otherwise every need must be on the place's foodOk list. */
export function foodFits(place: Place, food: string[]): boolean {
  if (!place.servesFood) return true;
  const ok = new Set(place.foodOk.map(normFood));
  return food.map(normFood).filter((f) => f && f !== "none" && f !== "no restrictions").every((f) => ok.has(f));
}

export function placeOpen(place: Place, day: Weekday, start: string, minutes = DATE_MINUTES): boolean {
  if (place.days && !place.days.includes(day)) return false;
  const s = toMin(start);
  return s >= toMin(place.open) && s + minutes <= toMin(place.close);
}

export function isFreeAt(windows: TimeWindow[], day: Weekday, start: string, minutes = DATE_MINUTES): boolean {
  const s = toMin(start);
  return windows.some((w) => w.day === day && s >= toMin(w.start) && s + minutes <= toMin(w.end));
}

/** The labelled busy block that overlaps this slot, if any (used to explain conflicts out loud). */
export function busyAt(busy: BusyBlock[] | undefined, day: Weekday, start: string, minutes = DATE_MINUTES): BusyBlock | undefined {
  const s = toMin(start);
  return busy?.find((b) => b.day === day && s < toMin(b.end) && s + minutes > toMin(b.start));
}

/** Intersections of two students' free windows that are long enough for a date. */
export function overlapWindows(a: TimeWindow[], b: TimeWindow[], minutes = DATE_MINUTES): TimeWindow[] {
  const out: TimeWindow[] = [];
  for (const x of a) {
    for (const y of b) {
      if (x.day !== y.day) continue;
      const s = Math.max(toMin(x.start), toMin(y.start));
      const e = Math.min(toMin(x.end), toMin(y.end));
      if (e - s >= minutes) out.push({ day: x.day, start: fromMin(s), end: e >= 24 * 60 ? "23:59" : fromMin(e) });
    }
  }
  return out;
}

/** Earliest half-hour start inside `window` when `place` is open for a full date, or null. */
export function firstStartAt(place: Place, window: TimeWindow, minutes = DATE_MINUTES): string | null {
  if (place.days && !place.days.includes(window.day)) return null;
  const s = roundUpToHalfHour(Math.max(toMin(window.start), toMin(place.open)));
  const e = Math.min(toMin(window.end), toMin(place.close));
  return s + minutes <= e ? fromMin(s) : null;
}

export function tagOverlap(place: Place, wanted: string[]): number {
  const w = new Set(wanted.map((t) => t.toLowerCase()));
  return place.tags.filter((t) => w.has(t.toLowerCase())).length;
}

/** Places ranked by fit with a date vibe: tag overlap desc, then cheaper, then list order. */
export function rankPlaces(places: Place[], dateVibe: string[]): Place[] {
  return places
    .map((p, i) => ({ p, i, o: tagOverlap(p, dateVibe) }))
    .sort((x, y) => y.o - x.o || budgetRank(x.p.costBand) - budgetRank(y.p.costBand) || x.i - y.i)
    .map((x) => x.p);
}

/**
 * Resolve a weekday to a calendar date (YYYY-MM-DD) 1–7 days after `now`, in Tempe time.
 * Starting tomorrow avoids proposing a time that has already passed today.
 */
export function resolveDate(day: Weekday, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
    if (parts.weekday === day) return `${parts.year}-${parts.month}-${parts.day}`;
  }
  throw new Error(`bad weekday ${day}`);
}

/** "2026-10-29" → "Thu, Oct 29". */
export function fmtDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
