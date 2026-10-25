import { beforeEach, describe, expect, it } from "vitest";
import { sayNo, sayYes, viewMatch } from "@/lib/hub/reveal";
import { seedState, resetStore, updateState, getState, type StoreState } from "@/lib/store";
import type { Match } from "@/lib/types";
import { GET as matchesGET } from "@/app/api/matches/route";
import { GET as matchGET } from "@/app/api/match/[id]/route";
import { POST as yesPOST } from "@/app/api/match/[id]/yes/route";
import { POST as noPOST } from "@/app/api/match/[id]/no/route";
import { POST as chatPOST } from "@/app/api/match/[id]/chat/route";
import { POST as reportPOST } from "@/app/api/match/[id]/report/route";

function freshMatch(): Match {
  return { id: "m_s01_s02", a: "s01", b: "s02", predateId: "pd_s01_s02", stage: 0, yes: { s01: null, s02: null }, closed: false, chat: [] };
}

function stateWith(m: Match): StoreState {
  const s = seedState();
  s.matches.push(m);
  s.predates.push({
    id: "pd_s01_s02",
    a: "s01",
    b: "s02",
    status: "done",
    transcript: [],
    verdicts: {
      s01: { studentId: "s01", score: 8, highlights: ["h"], flags: [], summaryForStudent: "for maya" },
      s02: { studentId: "s02", score: 9, highlights: ["h"], flags: [], summaryForStudent: "for jordan" },
    },
    matched: true,
    matcherScore: 0.6,
    sharedTags: ["astronomy"],
  });
  return s;
}

describe("both-YES rule", () => {
  it("advances only when both students say yes to the next level", () => {
    const m = freshMatch();
    expect(sayYes(m, "s01", 1)).toMatchObject({ ok: true, advanced: false, stage: 0 });
    expect(m.stage).toBe(0);
    expect(sayYes(m, "s02", 1)).toMatchObject({ ok: true, advanced: true, stage: 1 });
    expect(m.stage).toBe(1);
  });

  it("walks all the way to stage 3, one level at a time", () => {
    const m = freshMatch();
    for (const level of [1, 2, 3]) {
      sayYes(m, "s02", level);
      expect(m.stage).toBe(level - 1);
      sayYes(m, "s01", level);
      expect(m.stage).toBe(level);
    }
    expect(sayYes(m, "s01", 4)).toMatchObject({ ok: false });
  });

  it("rejects skipping levels and non-participants", () => {
    const m = freshMatch();
    expect(sayYes(m, "s01", 2)).toMatchObject({ ok: false, status: 409 });
    expect(sayYes(m, "s03", 1)).toMatchObject({ ok: false, status: 403 });
    expect(m.yes.s01).toBeNull();
  });

  it("a repeated yes from one side never advances alone", () => {
    const m = freshMatch();
    sayYes(m, "s01", 1);
    sayYes(m, "s01", 1);
    expect(m.stage).toBe(0);
  });
});

describe("NO closes silently", () => {
  it("disappears for the student who said no", () => {
    const m = freshMatch();
    const s = stateWith(m);
    sayNo(m, "s02");
    expect(m.closed).toBe(true);
    expect(viewMatch(m, s, "s02")).toBeNull();
  });

  it("the other side just sees it never progress: no rejection signal anywhere", () => {
    const m = freshMatch();
    const s = stateWith(m);
    sayYes(m, "s01", 1);
    const before = viewMatch(m, s, "s01")!;
    sayNo(m, "s02");
    const after = viewMatch(m, s, "s01")!;
    expect(after).toEqual(before); // byte-for-byte identical to "they haven't answered yet"
    expect(JSON.stringify(after)).not.toMatch(/closed|reject|declin|no\b/i);
    // and it can never advance now
    sayYes(m, "s02", 1);
    expect(m.stage).toBe(0);
  });

  it("closing after a stage keeps the other side frozen at that stage", () => {
    const m = freshMatch();
    const s = stateWith(m);
    sayYes(m, "s01", 1);
    sayYes(m, "s02", 1);
    sayNo(m, "s01");
    expect(viewMatch(m, s, "s01")).toBeNull();
    expect(viewMatch(m, s, "s02")!.stage).toBe(1);
  });
});

describe("data visibility per stage", () => {
  const leaks = (view: unknown) => JSON.stringify(view);

  it("stage 0: only my verdict + shared tags; nothing private about them", () => {
    const m = freshMatch();
    const v = viewMatch(m, stateWith(m), "s01")!;
    expect(v.myVerdict?.summaryForStudent).toBe("for maya");
    expect(leaks(v)).not.toContain("for jordan"); // their verdict is private
    expect(v.other).toEqual({ pronouns: "he/him", avatar: "/avatars/locked.svg" });
    for (const secret of ["Jordan", "Physics", "Senior", "s02-1.svg", "under_30", "physics lab", "jordan.demo"]) expect(leaks(v)).not.toContain(secret);
  });

  it("stage 1: + major, year, photos (still no name)", () => {
    const m = { ...freshMatch(), stage: 1 as const };
    const v = viewMatch(m, stateWith(m), "s01")!;
    expect(v.other).toMatchObject({ major: "Physics", year: "Senior", photos: ["/avatars/s02-1.svg", "/avatars/s02-2.svg"] });
    expect(v.other.firstName).toBeUndefined();
    expect(v.chat).toBeUndefined();
    expect(leaks(v)).not.toContain("Jordan");
  });

  it("stage 2: + first name and chat; never schedule, budget, filters or contact", () => {
    const m = { ...freshMatch(), stage: 2 as const };
    const v = viewMatch(m, stateWith(m), "s01")!;
    expect(v.other.firstName).toBe("Jordan");
    expect(v.chat).toEqual([]);
    for (const secret of ["under_30", "physics lab", "jordan.demo", "see-where-it-goes", "freeBusy", "contact"]) expect(leaks(v)).not.toContain(secret);
  });

  it("stage 3: + the date plan, still without raw schedules", () => {
    const m: Match = {
      ...freshMatch(),
      stage: 3,
      datePlan: { negotiation: [], options: [], picks: { s01: 1, s02: null }, outcome: "agreed" },
    };
    const v = viewMatch(m, stateWith(m), "s01")!;
    expect(v.datePlan).toMatchObject({ myPick: 1, theirPick: null });
    expect(leaks(v)).not.toContain("freeBusy");
  });

  it("non-participants see nothing", () => {
    const m = freshMatch();
    expect(viewMatch(m, stateWith(m), "s03")).toBeNull();
  });
});

describe("API layer enforces it", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const post = (url: string, body: unknown) => new Request(url, { method: "POST", body: JSON.stringify(body) });

  beforeEach(async () => {
    await resetStore();
    await updateState((s) => {
      const fresh = stateWith(freshMatch());
      s.matches = fresh.matches;
      s.predates = fresh.predates;
    });
  });

  it("GET /api/matches?as= returns only that side's filtered view", async () => {
    const res = await matchesGET(new Request("http://x/api/matches?as=s01"));
    const body = await res.json();
    expect(body.matches).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("Jordan");
    expect(JSON.stringify(body)).not.toContain("for jordan");
    expect((await matchesGET(new Request("http://x/api/matches"))).status).toBe(400);
  });

  it("YES from both via the API unlocks level 1 for both", async () => {
    const id = "m_s01_s02";
    let r = await (await yesPOST(post(`http://x`, { as: "s01", level: 1 }), params(id))).json();
    expect(r.match.stage).toBe(0);
    expect(r.match.waitingOnThem).toBe(true);
    r = await (await yesPOST(post(`http://x`, { as: "s02", level: 1 }), params(id))).json();
    expect(r.match.stage).toBe(1);
    expect(r.match.other.major).toBe("Astrophysics"); // Jordan now sees Maya's major
    expect(r.match.other.firstName).toBeUndefined();
  });

  it("chat is locked before level 2", async () => {
    const res = await chatPOST(post("http://x", { as: "s01", text: "hi!" }), params("m_s01_s02"));
    expect(res.status).toBe(409);
  });

  it("NO hides the match for the sayer; the other side still sees it waiting", async () => {
    await yesPOST(post("http://x", { as: "s01", level: 1 }), params("m_s01_s02"));
    const r = await noPOST(post("http://x", { as: "s02" }), params("m_s01_s02"));
    expect((await r.json()).match).toBeNull();
    expect((await matchGET(new Request("http://x?as=s02"), params("m_s01_s02"))).status).toBe(404);
    const forMaya = await (await matchGET(new Request("http://x?as=s01"), params("m_s01_s02"))).json();
    expect(forMaya.waitingOnThem).toBe(true);
  });

  it("report logs to the store and closes for the reporter", async () => {
    await reportPOST(post("http://x", { as: "s01", reason: "rude" }), params("m_s01_s02"));
    const s = await getState();
    expect(s.reports).toHaveLength(1);
    expect(s.reports[0]).toMatchObject({ by: "s01", reason: "rude", matchId: "m_s01_s02" });
    expect((await matchGET(new Request("http://x?as=s01"), params("m_s01_s02"))).status).toBe(404);
  });

  it("rejects bad bodies and outsiders", async () => {
    expect((await yesPOST(post("http://x", { as: "s01", level: 9 }), params("m_s01_s02"))).status).toBe(400);
    expect((await yesPOST(post("http://x", { as: "s05", level: 1 }), params("m_s01_s02"))).status).toBe(404);
    expect((await matchGET(new Request("http://x?as=s05"), params("m_s01_s02"))).status).toBe(404);
  });
});
