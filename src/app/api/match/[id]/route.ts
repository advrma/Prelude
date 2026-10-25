import { asParam, jsonError } from "@/lib/api";
import { viewMatch } from "@/lib/hub/reveal";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** One match, as seen by ?as=<studentId>. 404 for non-participants and for a student who closed it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const as = asParam(req);
  if (!as) return jsonError(400, "Pass ?as=<studentId>");
  const state = await getState();
  const m = state.matches.find((x) => x.id === id);
  const view = m ? viewMatch(m, state, as) : null;
  if (!view) return jsonError(404, "Match not found");
  return Response.json(view);
}
