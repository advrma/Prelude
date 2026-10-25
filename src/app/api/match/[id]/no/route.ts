import { parseBody } from "@/lib/api";
import { sayNo } from "@/lib/hub/reveal";
import { mutateMatch } from "@/lib/matchroute";
import { AsBodySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** Body: { as } — "Not now" / unmatch. Closes silently; the other side is never told. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(req, AsBodySchema);
  if (!body.ok) return body.res;
  return mutateMatch(id, body.data.as, (m) => sayNo(m, body.data.as));
}
