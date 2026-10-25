import { runQueued } from "@/lib/agents/predate";
import { runMatching } from "@/lib/hub/pool";
import { updateState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Run the matcher, create pre-dates (replayed from cache when available) and start the rest in the background. */
export async function POST() {
  const summary = await updateState((s) => runMatching(s));
  if (summary.queued.length) void runQueued();
  return Response.json(summary);
}
