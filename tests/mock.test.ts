import { describe, expect, it } from "vitest";
import { loadPersonas } from "@/lib/data";
import { bestProposal, mockNegotiateTurn, mockPredateTurn, mockRespond, mockVerdict } from "@/lib/llm/mock";
import { VerdictOutputSchema, NegotiateTurnSchema } from "@/lib/schemas";
import type { NegotiationSide } from "@/lib/llm/types";
import type { Student } from "@/lib/types";

const P = loadPersonas();
const byName = (n: string) => P.find((s) => s.private.firstName === n)!;
const side = (s: Student): NegotiationSide => ({
  id: s.id,
  pronouns: s.vibe.pronouns,
  freeBusy: s.private.freeBusy,
  busy: s.private.busy,
  budgetBand: s.private.budgetBand,
  food: s.private.food,
  dateVibe: s.private.dateVibe,
});

describe("mock provider", () => {
  it("is deterministic", () => {
    const ctx = { kind: "predate_turn" as const, seed: "pd_x", turn: 1, totalTurns: 8, me: byName("Maya").vibe, lastOther: "He loves astronomy" };
    expect(mockPredateTurn(ctx)).toBe(mockPredateTurn(ctx));
  });

  it("writes third-person text from vibe tags with the stated pronouns", () => {
    const t = mockPredateTurn({ kind: "predate_turn", seed: "s", turn: 0, totalTurns: 8, me: byName("Kai").vibe });
    expect(t).toMatch(/They light up talking about anime/);
    const m = mockPredateTurn({ kind: "predate_turn", seed: "s", turn: 0, totalTurns: 8, me: byName("Maya").vibe });
    expect(m).toMatch(/She lights up talking about astronomy/);
  });

  it("produces valid verdict JSON whose score tracks the matcher score", () => {
    const base = { kind: "verdict" as const, seed: "v", me: byName("Maya").vibe, other: byName("Jordan").vibe, sharedTags: ["astronomy"], myIntent: "serious" as const };
    const good = mockVerdict({ ...base, matcherScore: 0.63, theirIntent: "serious" });
    const bad = mockVerdict({ ...base, matcherScore: 0.1, theirIntent: "serious" });
    expect(() => VerdictOutputSchema.parse(good)).not.toThrow();
    expect(good.score).toBeGreaterThanOrEqual(7);
    expect(bad.score).toBeLessThan(7);
  });

  it("flags serious vs see-where-it-goes honestly", () => {
    const v = mockVerdict({
      kind: "verdict",
      seed: "v",
      me: byName("Maya").vibe,
      other: byName("Jordan").vibe,
      matcherScore: 0.63,
      sharedTags: ["astronomy"],
      myIntent: "serious",
      theirIntent: "see-where-it-goes",
    });
    expect(v.flags[0]).toMatch(/see where it goes.*serious/);
  });

  it("returns schema-valid JSON for schema tasks even without context", () => {
    expect(() => VerdictOutputSchema.parse(mockRespond({ task: "verdict", system: "", messages: [] }).json)).not.toThrow();
    expect(() => NegotiateTurnSchema.parse(mockRespond({ task: "negotiate", system: "", messages: [] }).json)).not.toThrow();
  });
});

describe("mock negotiator", () => {
  it("explains a lab conflict and counters after it (Maya → Jordan)", () => {
    const open = mockNegotiateTurn({ kind: "negotiate", seed: "n", side: side(byName("Maya")), round: 1, maxRounds: 4 });
    expect(open).toMatchObject({ type: "propose", data: { day: "Thu", start: "17:00" } });
    const counter = mockNegotiateTurn({ kind: "negotiate", seed: "n", side: side(byName("Jordan")), lastOther: open, round: 1, maxRounds: 4 });
    expect(counter.type).toBe("counter");
    expect(counter.content).toMatch(/physics lab until 7pm/);
    expect(counter.data).toMatchObject({ day: "Thu", start: "19:30" });
    const accept = mockNegotiateTurn({ kind: "negotiate", seed: "n", side: side(byName("Maya")), lastOther: counter, round: 2, maxRounds: 4 });
    expect(accept.type).toBe("accept");
  });

  it("resolves a budget mismatch (Priya under_50 → Marcus under_10)", () => {
    const open = mockNegotiateTurn({ kind: "negotiate", seed: "n", side: side(byName("Priya")), round: 1, maxRounds: 4 });
    expect(open.data.place).toBe("Sunrise Brunch Co.");
    const counter = mockNegotiateTurn({ kind: "negotiate", seed: "n", side: side(byName("Marcus")), lastOther: open, round: 1, maxRounds: 4 });
    expect(counter.type).toBe("counter");
    expect(counter.content).toMatch(/under \$10/);
    const accept = mockNegotiateTurn({ kind: "negotiate", seed: "n", side: side(byName("Priya")), lastOther: counter, round: 2, maxRounds: 4 });
    expect(accept.type).toBe("accept");
  });

  it("gives up with need_human after max rounds", () => {
    const open = { type: "propose" as const, content: "x", data: { day: "Mon" as const, start: "08:00", place: "Kiku Sushi Bar" } };
    const t = mockNegotiateTurn({ kind: "negotiate", seed: "n", side: side(byName("Maya")), lastOther: open, round: 5, maxRounds: 4 });
    expect(t.type).toBe("need_human");
  });

  it("bestProposal respects budget and diet", () => {
    const best = bestProposal(side(byName("Noor")))!;
    expect(best.place.costBand).toBe("under_10");
  });
});
