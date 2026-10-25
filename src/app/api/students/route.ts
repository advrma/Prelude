import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Demo persona switcher list. Only what a "View as" menu needs; no filters, schedules or budgets. */
export async function GET() {
  const state = await getState();
  return Response.json(
    state.students.map((s) => ({
      id: s.id,
      firstName: s.private.firstName,
      pronouns: s.vibe.pronouns,
      avatar: s.private.photos[0] ?? "/avatars/locked.svg",
      tagline: s.vibe.interests.slice(0, 3).join(" · "),
    })),
  );
}
