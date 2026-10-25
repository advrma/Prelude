import { asParam, jsonError } from "@/lib/api";
import { buildIcs } from "@/lib/hub/ics";
import { viewMatch } from "@/lib/hub/reveal";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Calendar file for a booked date. ?as=<studentId> (must be one of the two students). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const as = asParam(req);
  if (!as) return jsonError(400, "Pass ?as=<studentId>");
  const state = await getState();
  const m = state.matches.find((x) => x.id === id);
  const view = m ? viewMatch(m, state, as) : null;
  if (!view) return jsonError(404, "Match not found");
  const final = view.datePlan?.final;
  if (!final) return jsonError(409, "Pick the same option first; then the date is booked");
  const ics = buildIcs(final, { uid: `${id}-${final.date}-${final.start}` });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="prelude-date-${final.date ?? final.day}.ics"`,
    },
  });
}
