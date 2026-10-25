// All domain types (PLAN.md §5). Additions beyond the plan are marked "+" and logged in DECISIONS.md.

export type Gender = "woman" | "man" | "nonbinary" | "self-describe" | "prefer-not";
export type Intent = "serious" | "casual" | "see-where-it-goes" | "friends-first";
export type BudgetBand = "under_10" | "under_15" | "under_30" | "under_50";
export type Pronouns = "she/her" | "he/him" | "they/them";
export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export const GENDERS: Gender[] = ["woman", "man", "nonbinary", "self-describe", "prefer-not"];
export const INTENTS: Intent[] = ["serious", "casual", "see-where-it-goes", "friends-first"];
export const BUDGET_BANDS: BudgetBand[] = ["under_10", "under_15", "under_30", "under_50"];
export const WEEKDAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Used ONLY by the hub; never shown to the other agent. */
export interface Filters {
  gender: Gender;
  genderSelfDescribe?: string;
  wantsToMeet: Gender[] | "everyone";
  age: number; // must be >= 18
  ageMin: number;
  ageMax: number;
  intent: Intent;
  dealbreakers: string[];
  campus: string;
}

/** Level 0: the only thing agents may discuss in a pre-date. */
export interface Vibe {
  /** + Agents talk about their student in the third person, so they need the student's stated pronouns. */
  pronouns: Pronouns;
  interests: string[];
  values: string[];
  humor: string;
  perfectWeekend: string;
  socialEnergy: "homebody" | "balanced" | "out-every-night";
  chronotype: "early-bird" | "flexible" | "night-owl";
  bio: string;
}

export interface TimeWindow {
  day: Weekday;
  start: string; // "HH:MM" 24h, America/Phoenix (Tempe)
  end: string;
}

/** + A busy block with a label, so the negotiator can explain conflicts ("lab until 7"). */
export interface BusyBlock extends TimeWindow {
  label: string;
}

/** Revealed only through levels 1–2, or used only by the negotiator. */
export interface Private {
  firstName: string;
  major: string;
  year: string;
  photos: string[];
  contact: string; // demo placeholder only
  /** Free windows for the next 7 days, in the student's order of preference. */
  freeBusy: TimeWindow[];
  /** + Labelled busy blocks (classes, labs, shifts). Only the student's own negotiator sees them. */
  busy?: BusyBlock[];
  budgetBand: BudgetBand;
  food: string[];
  dateVibe: string[];
}

export interface Student {
  id: string;
  email: string;
  verifiedEdu: boolean;
  filters: Filters;
  vibe: Vibe;
  private: Private;
}

// ---- Hub records (§5.2) ----

export type Level = 0 | 1 | 2 | 3;
export type MsgType = "chat" | "propose" | "counter" | "accept" | "need_human" | "system";

export interface AgentMessage {
  id: string;
  predateId?: string;
  matchId?: string;
  from: string; // "agent:<studentId>" or "hub"
  type: MsgType;
  level: Level;
  content: string;
  data?: Record<string, unknown>;
  /** Set when a guard rewrote/flagged it. `original` lives only in the hub log, never in transcripts or API output. */
  blocked?: { reason: string; original?: string };
  at: string;
}

export interface Verdict {
  studentId: string;
  score: number; // 0–10
  highlights: string[];
  flags: string[];
  summaryForStudent: string;
}

export interface PreDate {
  id: string;
  a: string;
  b: string;
  status: "queued" | "running" | "done" | "failed";
  transcript: AgentMessage[];
  verdicts: Partial<Record<string, Verdict>>;
  matched: boolean;
  /** + Matcher context shown in the "Watch the date" header. */
  matcherScore: number;
  sharedTags: string[];
  /** + How it was produced: real Gemini, mock provider, or replayed from data/cache. */
  source?: "live" | "mock" | "replay";
  models?: string[];
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface ChatLine {
  from: string; // studentId
  text: string;
  at: string;
}

export interface Match {
  id: string;
  a: string;
  b: string;
  predateId: string;
  stage: Level;
  yes: Record<string, Level | null>;
  closed: boolean;
  /** + Who said no / unmatched. The match disappears only for them; the other side just never sees progress. */
  closedBy?: string[];
  datePlan?: DatePlan;
  /** + Stage-2 "say hi" chat between the two students. */
  chat?: ChatLine[];
  createdAt?: string;
}

export interface DateOption {
  day: string; // Weekday
  start: string; // "HH:MM"
  place: string; // place name
  area: string;
  estCostPerPerson: string;
  why: string;
  /** + Stable id from data/places.json. */
  placeId?: string;
  /** + Calendar date (YYYY-MM-DD) the weekday resolves to in the next 7 days. */
  date?: string;
}

export interface DatePlan {
  negotiation: AgentMessage[];
  options: DateOption[];
  picks: Record<string, number | null>;
  final?: DateOption;
  /** + "agreed" when the agents reached accept, "need_human" if stuck after 4 rounds each. */
  outcome?: "agreed" | "need_human";
  source?: "live" | "mock" | "replay";
}

// ---- Places (§6.3) ----

export interface Place {
  id: string;
  name: string;
  area: string;
  category: string;
  costBand: BudgetBand;
  typicalCost: string;
  tags: string[];
  /** Food needs this place can serve. Places with no food (walks, hikes) set servesFood=false and fit any diet. */
  servesFood: boolean;
  foodOk: string[];
  open: string; // "HH:MM"
  close: string; // "HH:MM"
  days?: Weekday[]; // limited-day events
  public: true;
}

// ---- Matcher output (§7.1) ----

export interface PairResult {
  a: string;
  b: string;
  passed: boolean;
  reasons: string[]; // why the hard filters blocked it
  score: number; // 0–1 tag score (0 when blocked)
  sharedTags: string[];
}

export interface Report {
  id: string;
  matchId: string;
  by: string;
  reason: string;
  at: string;
}

export interface HubLogEntry {
  messageId: string;
  predateId?: string;
  from: string;
  reason: string;
  original: string;
  at: string;
}
