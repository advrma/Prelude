import { jsonError } from "./api";
import { viewMatch } from "./hub/reveal";
import { updateState, type StoreState } from "./store";
import type { Match } from "./types";

/**
 * Shared body for POST /api/match/[id]/* routes: find the match, apply `fn` inside the write queue,
 * and answer with the caller's (stage-filtered) view of the match.
 */
export async function mutateMatch(
  id: string,
  as: string,
  fn: (m: Match, state: StoreState) => { ok: true } | { ok: false; error: string; status: number },
): Promise<Response> {
  const out = await updateState((state) => {
    const m = state.matches.find((x) => x.id === id);
    if (!m || (m.a !== as && m.b !== as)) return { res: jsonError(404, "Match not found") };
    const r = fn(m, state);
    if (!r.ok) return { res: jsonError(r.status, r.error) };
    return { view: viewMatch(m, state, as) };
  });
  if ("res" in out) return out.res!;
  // After a NO the match no longer exists for this student.
  return Response.json({ ok: true, match: out.view });
}
