import { asParam, jsonError } from "@/lib/api";
import { matchesFor } from "@/lib/hub/reveal";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Matches for one persona, filtered to what that side may see at each match's stage. */
export async function GET(req: Request) {
  const as = asParam(req);
  if (!as) return jsonError(400, "Pass ?as=<studentId>");
  const state = await getState();
  const me = state.students.find((s) => s.id === as);
  if (!me) return jsonError(404, "Unknown student");
  const mine = state.predates.filter((p) => p.a === as || p.b === as);
  return Response.json({
    as,
    firstName: me.private.firstName,
    predates: {
      total: mine.length,
      done: mine.filter((p) => p.status === "done").length,
      inProgress: mine.filter((p) => p.status === "queued" || p.status === "running").map((p) => p.id),
    },
    matches: matchesFor(state, as),
  });
}
