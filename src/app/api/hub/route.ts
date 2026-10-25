import { config, getMode } from "@/lib/config";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The judges' god view (§10.6): the pool, every pair's hard-filter result with reasons, pre-date
 * status and matches. Never includes schedules, budgets, contact info or hub-log originals.
 */
export async function GET() {
  const s = await getState();
  return Response.json({
    mode: getMode(),
    threshold: config.matchThreshold(),
    lastRunAt: s.lastRunAt ?? null,
    students: s.students.map((st) => ({
      id: st.id,
      firstName: st.private.firstName,
      avatar: st.private.photos[0] ?? "/avatars/locked.svg",
      pronouns: st.vibe.pronouns,
      gender: st.filters.gender === "self-describe" ? st.filters.genderSelfDescribe ?? "self-described" : st.filters.gender,
      wantsToMeet: st.filters.wantsToMeet,
      age: st.filters.age,
      ageRange: [st.filters.ageMin, st.filters.ageMax],
      intent: st.filters.intent,
      campus: st.filters.campus,
      interests: st.vibe.interests.slice(0, 4),
    })),
    pairs: s.pairs,
    predates: s.predates.map((p) => ({
      id: p.id,
      a: p.a,
      b: p.b,
      status: p.status,
      matched: p.matched,
      matcherScore: p.matcherScore,
      scores: Object.fromEntries(Object.entries(p.verdicts).map(([k, v]) => [k, v?.score ?? null])),
      guardBlocks: p.transcript.filter((m) => m.blocked).length,
      source: p.source ?? null,
    })),
    matches: s.matches.map((m) => ({ id: m.id, a: m.a, b: m.b, stage: m.stage, booked: !!m.datePlan?.final })),
    guard: { blocked: s.hubLog.length },
    reports: s.reports.length,
  });
}
