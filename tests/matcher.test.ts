import { describe, expect, it } from "vitest";
import { loadPersonas } from "@/lib/data";
import { evaluatePair, hardFilterReasons, jaccard, matchPool, tagScore } from "@/lib/hub/matcher";
import type { Gender, Student } from "@/lib/types";

function student(id: string, over: Partial<Student["filters"]> = {}, vibe: Partial<Student["vibe"]> = {}): Student {
  const base = loadPersonas()[0];
  return {
    ...base,
    id,
    filters: { ...base.filters, dealbreakers: [], wantsToMeet: "everyone", ageMin: 18, ageMax: 30, age: 21, ...over },
    vibe: { ...base.vibe, ...vibe },
  };
}

describe("orientation matrix (mutual fit only)", () => {
  const genders: Gender[] = ["woman", "man", "nonbinary"];
  const prefs: (Gender[] | "everyone")[] = [["woman"], ["man"], ["nonbinary"], ["woman", "man"], "everyone"];

  for (const ga of genders)
    for (const pa of prefs)
      for (const gb of genders)
        for (const pb of prefs) {
          const aWantsB = pa === "everyone" || pa.includes(gb);
          const bWantsA = pb === "everyone" || pb.includes(ga);
          const expected = aWantsB && bWantsA;
          it(`${ga}→${JSON.stringify(pa)} × ${gb}→${JSON.stringify(pb)} = ${expected ? "pass" : "block"}`, () => {
            const a = student("x1", { gender: ga, wantsToMeet: pa });
            const b = student("x2", { gender: gb, wantsToMeet: pb });
            const reasons = hardFilterReasons(a, b);
            expect(reasons.includes("orientation mismatch")).toBe(!expected);
            // symmetric
            expect(hardFilterReasons(b, a).includes("orientation mismatch")).toBe(!expected);
          });
        }

  it("self-describe / prefer-not only meet people open to everyone", () => {
    const sd = student("x1", { gender: "self-describe", genderSelfDescribe: "genderfluid", wantsToMeet: "everyone" });
    expect(hardFilterReasons(sd, student("x2", { gender: "woman", wantsToMeet: ["woman", "man"] }))).toContain(
      "orientation mismatch",
    );
    expect(hardFilterReasons(sd, student("x3", { gender: "woman", wantsToMeet: "everyone" }))).toEqual([]);
  });
});

describe("age filters", () => {
  it("both ages must sit inside the other's range", () => {
    const a = student("x1", { age: 19, ageMin: 19, ageMax: 22 });
    const b = student("x2", { age: 23, ageMin: 19, ageMax: 25 });
    expect(hardFilterReasons(a, b)).toContain("age range");
    expect(hardFilterReasons(b, a)).toContain("age range");
  });

  it("blocks anyone under 18 even if ranges allow it", () => {
    const a = student("x1", { age: 17, ageMin: 17 });
    const b = student("x2", { ageMin: 16 });
    expect(hardFilterReasons(a, b)).toContain("under 18");
  });

  it("passes when ranges overlap both ways", () => {
    expect(hardFilterReasons(student("x1", { age: 20 }), student("x2", { age: 24 }))).toEqual([]);
  });
});

describe("dealbreakers and campus", () => {
  it("blocks on a dealbreaker keyword in the other's vibe (either direction)", () => {
    const a = student("x1", { dealbreakers: ["smoking"] });
    const b = student("x2", {}, { bio: "Social smoker trying to quit." });
    expect(hardFilterReasons(a, b)).toContain("dealbreaker: smoking");
    expect(hardFilterReasons(b, a)).toContain("dealbreaker: smoking");
  });

  it("matches arbitrary dealbreakers literally", () => {
    const a = student("x1", { dealbreakers: ["cats"] });
    const b = student("x2", {}, { interests: ["cats", "coffee"] });
    expect(hardFilterReasons(a, b)).toContain("dealbreaker: cats");
  });

  it("blocks different campuses", () => {
    const a = student("x1", { campus: "ASU Tempe" });
    const b = student("x2", { campus: "ASU Downtown Phoenix" });
    expect(hardFilterReasons(a, b)).toContain("different campus");
  });
});

describe("scoring", () => {
  it("jaccard", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(0);
    expect(jaccard(["A"], ["a"])).toBe(1);
  });

  it("weights interests 0.5, values 0.3, rhythm 0.2", () => {
    const a = student("x1", {}, { interests: ["x"], values: ["v"], chronotype: "night-owl", socialEnergy: "homebody" });
    const b = student("x2", {}, { interests: ["x"], values: ["w"], chronotype: "early-bird", socialEnergy: "out-every-night" });
    expect(tagScore(a, b)).toBeCloseTo(0.5);
  });
});

describe("seeded pool (§9 requirements)", () => {
  const personas = loadPersonas();
  const { pairs, selected } = matchPool(personas, 5);
  const key = (a: string, b: string) => [a, b].sort().join("-");
  const sel = new Set(selected.map((p) => key(p.a, p.b)));

  it("produces at least 4 mutual-compatible pairs including the designed ones", () => {
    for (const [a, b] of [
      ["s01", "s02"], // Maya–Jordan: serious vs see-where-it-goes, lab-until-7 conflict
      ["s03", "s04"], // Priya–Marcus: budget mismatch
      ["s05", "s06"], // Elena–Sofia
      ["s07", "s09"], // Theo–Rafael
      ["s08", "s10"], // Kai–Noor
    ])
      expect(sel.has(key(a, b))).toBe(true);
  });

  it("includes a low-vibe pair that passes filters (Maya–Marcus)", () => {
    const p = pairs.find((x) => key(x.a, x.b) === key("s01", "s04"))!;
    expect(p.passed).toBe(true);
    expect(p.score).toBeLessThan(0.2);
  });

  it("blocks near-misses with readable reasons", () => {
    const reason = (a: string, b: string) => pairs.find((x) => key(x.a, x.b) === key(a, b))!.reasons;
    expect(reason("s03", "s02")).toContain("dealbreaker: smoking"); // Priya–Jordan
    expect(reason("s10", "s04")).toContain("age range"); // Noor–Marcus
    expect(reason("s08", "s06")).toContain("orientation mismatch"); // Kai–Sofia (one-way)
  });

  it("evaluates every unordered pair once and never selects a blocked pair", () => {
    expect(pairs).toHaveLength((10 * 9) / 2);
    expect(selected.every((p) => p.passed)).toBe(true);
    expect(new Set(selected.map((p) => key(p.a, p.b))).size).toBe(selected.length);
  });

  it("respects PREDATES_PER_STUDENT", () => {
    const capped = matchPool(personas, 1).selected;
    const count = new Map<string, number>();
    for (const p of capped) for (const id of [p.a, p.b]) count.set(id, (count.get(id) ?? 0) + 1);
    expect(Math.max(...count.values())).toBe(1);
  });

  it("orders pair ids and computes shared tags", () => {
    const p = evaluatePair(personas[1], personas[0]);
    expect([p.a, p.b]).toEqual(["s01", "s02"]);
    expect(p.sharedTags).toEqual(expect.arrayContaining(["astronomy", "night hikes"]));
  });
});
