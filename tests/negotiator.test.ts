import { beforeAll, describe, expect, it } from "vitest";
import { buildOptions, negotiate, pickOption, sideOf, validateOption } from "@/lib/agents/negotiator";
import { loadPersonas } from "@/lib/data";
import { buildIcs, startUtc } from "@/lib/hub/ics";
import { resolveDate } from "@/lib/hub/schedule";
import { getState, resetStore, updateState } from "@/lib/store";
import type { DatePlan, Student } from "@/lib/types";
import { POST as negotiatePOST } from "@/app/api/match/[id]/negotiate/route";
import { POST as pickPOST } from "@/app/api/match/[id]/pick/route";
import { GET as icsGET } from "@/app/api/match/[id]/ics/route";

const P = loadPersonas();
const by = (n: string) => P.find((s) => s.private.firstName === n)! as Student;
const maya = sideOf(by("Maya"));
const jordan = sideOf(by("Jordan"));
const priya = sideOf(by("Priya"));
const marcus = sideOf(by("Marcus"));
// Wednesday 2026-10-28 noon in Tempe
const NOW = new Date("2026-10-28T19:00:00Z");

describe("option validation (code, not the LLM)", () => {
  it("accepts a slot that fits both schedules, both budgets and both diets", () => {
    expect(validateOption({ day: "Thu", start: "19:30", place: "Tempe Town Lake sunset walk" }, maya, jordan)).toEqual([]);
  });

  it("drops a slot during Jordan's lab", () => {
    expect(validateOption({ day: "Thu", start: "17:00", place: "Tempe Town Lake sunset walk" }, maya, jordan)).toContain("side B not free Thu 17:00");
  });

  it("drops a place over the lower budget", () => {
    expect(validateOption({ day: "Sat", start: "09:00", place: "Sunrise Brunch Co." }, priya, marcus)).toContain("over budget");
  });

  it("drops a place that doesn't fit a diet", () => {
    expect(validateOption({ day: "Sat", start: "19:00", place: "Kiku Sushi Bar" }, maya, jordan)).toEqual(
      expect.arrayContaining(["doesn't fit food needs"]),
    );
  });

  it("drops closed places, wrong-day events, unknown places and garbage", () => {
    expect(validateOption({ day: "Thu", start: "22:30", place: "Mill Avenue Coffee House" }, maya, jordan)).toContain("place closed then");
    expect(validateOption({ day: "Thu", start: "20:00", place: "Food Truck Friday" }, maya, jordan)).toContain("place closed then");
    expect(validateOption({ day: "Thu", start: "20:00", place: "My dorm room" }, maya, jordan)).toContain("unknown place");
    expect(validateOption({ day: "Someday", start: "8pm", place: "Tempe Town Lake sunset walk" }, maya, jordan)).toEqual(
      expect.arrayContaining(["bad day", "bad time"]),
    );
  });

  it("drops invalid LLM options and fills to exactly 3 valid ones deterministically", () => {
    const opts = buildOptions(
      [
        { day: "Thu", start: "17:00", place: "Tempe Town Lake sunset walk" }, // lab conflict
        { day: "Sat", start: "19:00", place: "Lakeview Bistro" }, // over Maya's budget
        { day: "Thu", start: "20:00", place: "Somebody's apartment" }, // not a public place
      ],
      maya,
      jordan,
      NOW,
    );
    expect(opts).toHaveLength(3);
    for (const o of opts) expect(validateOption(o, maya, jordan)).toEqual([]);
    expect(buildOptions([], maya, jordan, NOW)).toEqual(buildOptions([], maya, jordan, NOW));
    expect(new Set(opts.map((o) => `${o.day}${o.start}${o.place}`)).size).toBe(3);
  });

  it("puts the agreed option first and labels it", () => {
    const opts = buildOptions([{ day: "Thu", start: "19:30", place: "Tempe Town Lake sunset walk" }], maya, jordan, NOW);
    expect(opts[0]).toMatchObject({ day: "Thu", start: "19:30", date: "2026-10-29" });
    expect(opts[0].why).toMatch(/agreed/);
  });
});

describe("mock negotiation end to end", () => {
  it("resolves Jordan's lab-until-7 conflict out loud", async () => {
    const { plan, turns } = await negotiate("m_s01_s02", by("Maya"), by("Jordan"), NOW);
    expect(turns.map((t) => t.type)).toEqual(["propose", "counter", "accept"]);
    expect(plan.negotiation[1].content).toMatch(/physics lab until 7pm/);
    expect(plan.outcome).toBe("agreed");
    expect(plan.options).toHaveLength(3);
    expect(plan.options[0]).toMatchObject({ day: "Thu", start: "19:30" });
    expect(plan.negotiation.every((m) => m.level === 3)).toBe(true);
  });

  it("resolves the under_10 vs under_50 budget mismatch", async () => {
    const { plan } = await negotiate("m_s03_s04", by("Priya"), by("Marcus"), NOW);
    expect(plan.negotiation[1].type).toBe("counter");
    expect(plan.negotiation[1].content).toMatch(/under \$10/);
    expect(plan.outcome).toBe("agreed");
    for (const o of plan.options) expect(validateOption(o, priya, marcus)).toEqual([]);
  });
});

describe("picks", () => {
  const plan = (): DatePlan => ({ negotiation: [], options: buildOptions([], maya, jordan, NOW), picks: { s01: null, s02: null } });

  it("same pick on both sides → final", () => {
    const p = plan();
    pickOption(p, "s01", 1);
    expect(p.final).toBeUndefined();
    pickOption(p, "s02", 1);
    expect(p.final).toEqual(p.options[1]);
  });

  it("different picks stay open until one accepts the other's", () => {
    const p = plan();
    pickOption(p, "s01", 0);
    pickOption(p, "s02", 2);
    expect(p.final).toBeUndefined();
    pickOption(p, "s01", 2);
    expect(p.final).toEqual(p.options[2]);
    expect(pickOption(p, "s01", 0)).toMatchObject({ ok: false, status: 409 });
  });

  it("rejects outsiders and bad indexes", () => {
    expect(pickOption(plan(), "s05", 0)).toMatchObject({ ok: false });
    expect(pickOption(plan(), "s01", 7)).toMatchObject({ ok: false });
  });
});

describe(".ics", () => {
  const option = { day: "Thu", start: "19:30", place: "Tempe Town Lake sunset walk", area: "Tempe Beach Park", estCostPerPerson: "Free", why: "Both free, fits, cozy; nice", date: "2026-10-29" };

  it("converts Tempe time to UTC (UTC-7, no DST)", () => {
    expect(startUtc(option).toISOString()).toBe("2026-10-30T02:30:00.000Z");
    expect(startUtc({ ...option, date: "2026-07-02" }).toISOString()).toBe("2026-07-03T02:30:00.000Z");
  });

  it("is a valid VCALENDAR with the Prelude title, place and time", () => {
    const ics = buildIcs(option, { uid: "m1", now: NOW });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("SUMMARY:Prelude date ☕");
    expect(ics).toContain("DTSTART:20261030T023000Z");
    expect(ics).toContain("DTEND:20261030T040000Z");
    expect(ics).toContain("LOCATION:Tempe Town Lake sunset walk\\, Tempe Beach Park\\, Tempe\\, AZ");
    expect(ics).toContain("UID:m1@prelude.local");
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  });

  it("resolves weekdays to the next 7 days in Tempe", () => {
    expect(resolveDate("Thu", NOW)).toBe("2026-10-29");
    expect(resolveDate("Wed", NOW)).toBe("2026-11-04"); // tomorrow onwards, never today
  });
});

describe("API: stage 3 → negotiate → pick → .ics", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
  const id = "m_s01_s02";

  beforeAll(async () => {
    await resetStore();
    await updateState((s) => {
      s.matches.push({ id, a: "s01", b: "s02", predateId: "pd_s01_s02", stage: 3, yes: { s01: 3, s02: 3 }, closed: false, chat: [] });
    });
  });

  it("refuses before stage 3", async () => {
    await updateState((s) => {
      s.matches.push({ id: "m_s03_s04", a: "s03", b: "s04", predateId: "x", stage: 2, yes: { s03: 2, s04: 2 }, closed: false });
    });
    expect((await negotiatePOST(post({ as: "s03" }), params("m_s03_s04"))).status).toBe(409);
  });

  it("negotiates, both pick, then serves the calendar file", async () => {
    const neg = await (await negotiatePOST(post({ as: "s01" }), params(id))).json();
    expect(neg.match.datePlan.options).toHaveLength(3);
    expect(JSON.stringify(neg)).not.toContain("freeBusy");

    expect((await icsGET(new Request("http://x?as=s01"), params(id))).status).toBe(409);
    await pickPOST(post({ as: "s01", option: 1 }), params(id));
    const r = await (await pickPOST(post({ as: "s02", option: 1 }), params(id))).json();
    expect(r.match.datePlan.final).toEqual(neg.match.datePlan.options[1]);

    const ics = await icsGET(new Request("http://x?as=s02"), params(id));
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    expect(ics.headers.get("content-disposition")).toContain(".ics");
    expect(await ics.text()).toContain("SUMMARY:Prelude date ☕");
    expect((await icsGET(new Request("http://x?as=s05"), params(id))).status).toBe(404);
    const s = await getState();
    expect(s.matches.find((m) => m.id === id)!.datePlan!.final).toBeDefined();
  });
});
