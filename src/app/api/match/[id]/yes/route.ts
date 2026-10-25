import { parseBody } from "@/lib/api";
import { sayYes } from "@/lib/hub/reveal";
import { mutateMatch } from "@/lib/matchroute";
import { YesBodySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** Body: { as, level } — YES to unlocking the next level. Both YES → stage advances. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(req, YesBodySchema);
  if (!body.ok) return body.res;
  return mutateMatch(id, body.data.as, (m) => sayYes(m, body.data.as, body.data.level));
}
