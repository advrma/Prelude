import { resetStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Reset the demo: wipe runtime state and reload the personas. */
export async function POST() {
  const state = await resetStore();
  return Response.json({ ok: true, students: state.students.length, predates: state.predates.length, matches: state.matches.length });
}
