import { z } from "zod";
import { startNegotiation } from "@/lib/agents/negotiator";
import { jsonError, parseBody } from "@/lib/api";
import { viewMatch } from "@/lib/hub/reveal";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ as: z.string().min(1), fresh: z.boolean().optional() });

/** Body: { as, fresh? } — runs the two-agent negotiation for a stage-3 match and returns the caller's view. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const { as, fresh } = body.data;
  const before = await getState();
  const m = before.matches.find((x) => x.id === id);
  if (!m || !viewMatch(m, before, as)) return jsonError(404, "Match not found");
  if (m.stage < 3) return jsonError(409, "Both students must say yes to a real date first");
  if (fresh && m.datePlan?.final) return jsonError(409, "This date is already booked");
  try {
    await startNegotiation(id, { fresh });
  } catch (err) {
    return jsonError(500, String((err as Error)?.message ?? err));
  }
  const after = await getState();
  return Response.json({ ok: true, match: viewMatch(after.matches.find((x) => x.id === id)!, after, as) });
}
