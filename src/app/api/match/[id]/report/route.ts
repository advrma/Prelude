import { parseBody } from "@/lib/api";
import { sayNo } from "@/lib/hub/reveal";
import { mutateMatch } from "@/lib/matchroute";
import { ReportBodySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** Body: { as, reason } — logs a report to the store and closes the match for the reporter. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(req, ReportBodySchema);
  if (!body.ok) return body.res;
  const { as, reason } = body.data;
  return mutateMatch(id, as, (m, state) => {
    state.reports.push({ id: `r_${Date.now().toString(36)}`, matchId: m.id, by: as, reason: reason || "(no reason given)", at: new Date().toISOString() });
    return sayNo(m, as);
  });
}
