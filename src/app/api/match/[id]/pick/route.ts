import { pickOption } from "@/lib/agents/negotiator";
import { parseBody } from "@/lib/api";
import { mutateMatch } from "@/lib/matchroute";
import { PickBodySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** Body: { as, option } — pick one of the 3 options. Both pick the same → it's final. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(req, PickBodySchema);
  if (!body.ok) return body.res;
  const { as, option } = body.data;
  return mutateMatch(id, as, (m) => {
    if (m.stage < 3 || !m.datePlan) return { ok: false, error: "No date options yet", status: 409 };
    return pickOption(m.datePlan, as, option);
  });
}
