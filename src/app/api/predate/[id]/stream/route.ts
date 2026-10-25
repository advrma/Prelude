import { publicPredate, resetPredate, startPredate, type PredateEvent } from "@/lib/agents/predate";
import { bus, predateChannel } from "@/lib/bus";
import { config } from "@/lib/config";
import { jsonError } from "@/lib/api";
import { getState } from "@/lib/store";
import type { PreDate, Student } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * SSE: runs (or replays) a pre-date and streams each message, then the verdicts.
 * ?as=<studentId> limits verdicts to that student. ?fresh=1 re-runs a finished pre-date. ?speed=fast skips replay pacing.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const as = url.searchParams.get("as") ?? undefined;
  const fresh = url.searchParams.get("fresh") === "1";
  const delay = url.searchParams.get("speed") === "fast" ? 0 : config.replayDelay();

  let state = await getState();
  let pd = state.predates.find((p) => p.id === id);
  if (!pd) return jsonError(404, "Pre-date not found");
  if (fresh && (pd.status === "done" || pd.status === "failed")) {
    await resetPredate(id);
    state = await getState();
    pd = state.predates.find((p) => p.id === id)!;
  }
  const snapshot: PreDate = structuredClone(pd);
  const students: Student[] = state.students;
  const filterEvent = (ev: PredateEvent): PredateEvent | null => {
    if (ev.type === "verdict" && as && (as === snapshot.a || as === snapshot.b) && ev.verdict.studentId !== as) return null;
    if (ev.type === "done") return { type: "done", predate: publicPredate(ev.predate, students, as) };
    return ev;
  };

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (ev: PredateEvent) => {
        if (closed) return;
        const out = filterEvent(ev);
        if (out) controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        controller.close();
      };
      req.signal.addEventListener("abort", close);

      // Finished: replay from the record with realistic pacing.
      if (snapshot.status === "done") {
        const pub = publicPredate(snapshot, students, as);
        send({ type: "meta", predate: { ...pub, transcript: [], verdicts: {} }, replay: true });
        for (const m of pub.transcript) {
          if (closed) return;
          send({ type: "typing", from: m.from });
          await sleep(delay * (0.6 + Math.min(m.content.length, 240) / 400));
          send({ type: "message", message: m });
        }
        send({ type: "typing", from: "hub" });
        await sleep(delay);
        for (const v of Object.values(snapshot.verdicts)) if (v) send({ type: "verdict", verdict: v });
        send({ type: "done", predate: snapshot as never });
        close();
        return;
      }

      // Queued or running: follow the live run on the bus.
      const seen = new Set<string>();
      let doneSent = false;
      const handler = (ev: PredateEvent) => {
        if (ev.type === "message") {
          if (seen.has(ev.message.id)) return;
          seen.add(ev.message.id);
        }
        if (ev.type === "done" || ev.type === "error") {
          if (doneSent) return;
          doneSent = true;
          send(ev);
          close();
          return;
        }
        send(ev);
      };
      const channel = predateChannel(id);
      bus.on(channel, handler);
      cleanup = () => bus.off(channel, handler);

      send({ type: "meta", predate: { ...publicPredate(snapshot, students, as), verdicts: {} }, replay: false });
      for (const m of publicPredate(snapshot, students, as).transcript) {
        seen.add(m.id);
        send({ type: "message", message: m });
      }
      startPredate(id)
        .then((final) => handler({ type: "done", predate: final as never }))
        .catch((err) => handler({ type: "error", error: String((err as Error)?.message ?? err) }));
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
