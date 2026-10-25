import type { StoreState } from "../store";
import type { AgentMessage, ChatLine, DateOption, Level, Match, Verdict } from "../types";

// Reveal state machine (§7.4).
//   0 = pre-date highlights + your agent's verdict
//   1 = major, year, photos
//   2 = first name + short "say hi" chat
//   3 = both agreed to a real date → negotiator starts
// A stage advances only when BOTH students said YES to the next level. A NO closes the match
// for the student who said it; the other side simply never sees progress (no rejection anywhere).

export const STAGE_UNLOCKS: Record<Level, string> = {
  0: "Pre-date highlights + your agent's verdict",
  1: "Major, year and photos",
  2: "First name + a short say-hi chat",
  3: "A real date: the agents negotiate time, place and budget",
};

export type RevealResult = { ok: true; advanced: boolean; stage: Level } | { ok: false; error: string; status: number };

function isParticipant(m: Match, studentId: string) {
  return m.a === studentId || m.b === studentId;
}

export function otherSide(m: Match, studentId: string): string {
  return m.a === studentId ? m.b : m.a;
}

export function isClosedFor(m: Match, studentId: string): boolean {
  return !!m.closedBy?.includes(studentId);
}

/** Student says YES to unlocking `level` (must be the next level). Both YES → stage++. */
export function sayYes(m: Match, studentId: string, level: number): RevealResult {
  if (!isParticipant(m, studentId)) return { ok: false, error: "Not your match", status: 403 };
  if (isClosedFor(m, studentId)) return { ok: false, error: "Match not found", status: 404 };
  if (m.stage >= 3) return { ok: false, error: "Already at the final stage", status: 409 };
  const next = (m.stage + 1) as Level;
  if (level !== next) return { ok: false, error: `You can only say yes to level ${next} next`, status: 409 };
  m.yes[studentId] = Math.max(m.yes[studentId] ?? 0, next) as Level;
  const other = otherSide(m, studentId);
  // A closed match never advances; the side that's still in it just keeps waiting.
  const bothYes = !m.closed && (m.yes[other] ?? 0) >= next && (m.yes[studentId] ?? 0) >= next;
  if (bothYes) m.stage = next;
  return { ok: true, advanced: bothYes, stage: m.stage };
}

/** Student says NO (or unmatches). Closes silently. */
export function sayNo(m: Match, studentId: string): RevealResult {
  if (!isParticipant(m, studentId)) return { ok: false, error: "Not your match", status: 403 };
  m.closed = true;
  m.closedBy = [...new Set([...(m.closedBy ?? []), studentId])];
  return { ok: true, advanced: false, stage: m.stage };
}

// ---- What each side may see (enforced in the API layer) ----

export interface PublicDatePlan {
  negotiation: AgentMessage[];
  options: DateOption[];
  myPick: number | null;
  theirPick: number | null;
  final?: DateOption;
  outcome?: "agreed" | "need_human";
  source?: string;
}

export interface MatchView {
  id: string;
  predateId: string;
  stage: Level;
  nextLevel: Level | null;
  /** I still need to answer the next level. */
  waitingOnMe: boolean;
  /** I said yes; the other side hasn't (or never will; we don't say which). */
  waitingOnThem: boolean;
  myVerdict?: Verdict;
  sharedTags: string[];
  matcherScore: number;
  other: {
    pronouns: string;
    avatar: string;
    major?: string;
    year?: string;
    photos?: string[];
    firstName?: string;
  };
  chat?: ChatLine[];
  datePlan?: PublicDatePlan;
  me: { id: string; firstName: string };
}

/** The view of a match for one student, containing only data for levels ≤ stage. Null if they may not see it. */
export function viewMatch(m: Match, state: StoreState, as: string): MatchView | null {
  if (!isParticipant(m, as) || isClosedFor(m, as)) return null;
  const otherId = otherSide(m, as);
  const other = state.students.find((s) => s.id === otherId);
  const me = state.students.find((s) => s.id === as);
  const pd = state.predates.find((p) => p.id === m.predateId);
  if (!other || !me) return null;

  const next = m.stage < 3 ? ((m.stage + 1) as Level) : null;
  const myYes = m.yes[as] ?? 0;
  const view: MatchView = {
    id: m.id,
    predateId: m.predateId,
    stage: m.stage,
    nextLevel: next,
    waitingOnMe: next !== null && myYes < next,
    waitingOnThem: next !== null && myYes >= next,
    myVerdict: pd?.verdicts[as],
    sharedTags: pd?.sharedTags ?? [],
    matcherScore: pd?.matcherScore ?? 0,
    other: { pronouns: other.vibe.pronouns, avatar: "/avatars/locked.svg" },
    me: { id: me.id, firstName: me.private.firstName },
  };
  if (m.stage >= 1) {
    view.other.major = other.private.major;
    view.other.year = other.private.year;
    view.other.photos = other.private.photos;
    view.other.avatar = other.private.photos[0] ?? view.other.avatar;
  }
  if (m.stage >= 2) {
    view.other.firstName = other.private.firstName;
    view.chat = m.chat ?? [];
  }
  if (m.stage >= 3 && m.datePlan) {
    view.datePlan = {
      negotiation: m.datePlan.negotiation.map(({ blocked, ...msg }) => (blocked ? { ...msg, blocked: { reason: blocked.reason } } : msg)),
      options: m.datePlan.options,
      myPick: m.datePlan.picks[as] ?? null,
      theirPick: m.datePlan.picks[otherId] ?? null,
      final: m.datePlan.final,
      outcome: m.datePlan.outcome,
      source: m.datePlan.source,
    };
  }
  return view;
}

export function matchesFor(state: StoreState, as: string): MatchView[] {
  return state.matches
    .map((m) => viewMatch(m, state, as))
    .filter((v): v is MatchView => v !== null)
    .sort((x, y) => y.stage - x.stage || y.matcherScore - x.matcherScore);
}
