import { publicPredate } from "@/lib/agents/predate";
import { asParam, jsonError } from "@/lib/api";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Pre-date record (transcript + verdicts). With ?as=<studentId>, only that student's verdict. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getState();
  const pd = state.predates.find((p) => p.id === id);
  if (!pd) return jsonError(404, "Pre-date not found");
  return Response.json(publicPredate(pd, state.students, asParam(req)));
}
