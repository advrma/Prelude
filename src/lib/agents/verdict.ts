import { llm } from "../llm/router";
import { mockVerdict } from "../llm/mock";
import { VerdictOutputSchema } from "../schemas";
import type { AgentMessage, PreDate, Student, Verdict } from "../types";
import { verdictSystem } from "./prompts";

// Verdict (§6.2): each agent privately scores the pre-date for its own student.

export function transcriptFor(meId: string, transcript: AgentMessage[]): string {
  return transcript
    .filter((m) => m.from.startsWith("agent:"))
    .map((m) => `${m.from === `agent:${meId}` ? "Your agent" : "Their agent"}: ${m.content}`)
    .join("\n");
}

export async function runVerdict(pd: PreDate, me: Student, other: Student, transcript: AgentMessage[]) {
  const mockCtx = {
    kind: "verdict" as const,
    seed: `${pd.id}:${me.id}`,
    me: me.vibe,
    other: other.vibe,
    matcherScore: pd.matcherScore,
    sharedTags: pd.sharedTags,
    myIntent: me.filters.intent,
    theirIntent: other.filters.intent,
  };
  const res = await llm({
    task: "verdict",
    system: verdictSystem(me.vibe, me.filters.intent, me.filters.dealbreakers, other.filters.intent),
    messages: [{ role: "user", content: `Pre-date transcript:\n${transcriptFor(me.id, transcript)}\n\nWrite your verdict as JSON.` }],
    schema: VerdictOutputSchema,
    mock: mockCtx,
  });
  const parsed = VerdictOutputSchema.safeParse(res.json);
  const out = parsed.success ? parsed.data : mockVerdict(mockCtx);
  const verdict: Verdict = {
    studentId: me.id,
    score: Math.max(0, Math.min(10, Math.round(out.score))),
    highlights: out.highlights.slice(0, 3),
    flags: out.flags.slice(0, 2),
    summaryForStudent: out.summaryForStudent,
  };
  return { verdict, model: parsed.success ? res.model : "mock", fallback: parsed.success ? res.fallback : ("mock" as const) };
}
