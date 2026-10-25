import { parseBody } from "@/lib/api";
import { mutateMatch } from "@/lib/matchroute";
import { ChatBodySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const MAX_LINES = 40;

/** Body: { as, text } — the stage-2 "say hi" chat. Short messages only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(req, ChatBodySchema);
  if (!body.ok) return body.res;
  const { as, text } = body.data;
  return mutateMatch(id, as, (m) => {
    if (m.stage < 2) return { ok: false, error: "Chat unlocks at level 2", status: 409 };
    m.chat ??= [];
    if (m.chat.length >= MAX_LINES) return { ok: false, error: "This is a short say-hi chat. Plan the date to keep talking!", status: 409 };
    m.chat.push({ from: as, text, at: new Date().toISOString() });
    return { ok: true };
  });
}
