import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { contextFor, publicPredate, runQueued, startPredate } from "@/lib/agents/predate";
import { config } from "@/lib/config";
import { readCachedPredate } from "@/lib/cachefiles";
import { HIDDEN } from "@/lib/hub/guard";
import { predateIdFor, runMatching } from "@/lib/hub/pool";
import { getState, resetStore, updateState } from "@/lib/store";
import { GET as streamGET } from "@/app/api/predate/[id]/stream/route";
import { GET as recordGET } from "@/app/api/predate/[id]/route";

beforeAll(async () => {
  await resetStore();
  await updateState((s) => runMatching(s));
  await runQueued();
});

async function readSse(res: Response) {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((c) => c.startsWith("data: "))
    .map((c) => JSON.parse(c.slice(6)));
}

describe("pre-date runner (mock mode)", () => {
  it("runs every selected pair to done", async () => {
    const s = await getState();
    expect(s.predates.length).toBe(9);
    expect(s.predates.every((p) => p.status === "done")).toBe(true);
  });

  it("alternates A, B, A, B… for PREDATE_TURNS, agent A opens", async () => {
    const pd = (await getState()).predates.find((p) => p.id === predateIdFor("s01", "s02"))!;
    expect(pd.transcript).toHaveLength(config.predateTurns());
    pd.transcript.forEach((m, i) => expect(m.from).toBe(`agent:${i % 2 === 0 ? pd.a : pd.b}`));
    expect(pd.transcript.every((m) => m.level === 0 && m.type === "chat")).toBe(true);
  });

  it("produces the designed outcomes: 5 matches, low-vibe pairs don't match", async () => {
    const s = await getState();
    const matched = s.predates.filter((p) => p.matched).map((p) => p.id).sort();
    expect(matched).toEqual(
      [
        predateIdFor("s01", "s02"),
        predateIdFor("s03", "s04"),
        predateIdFor("s05", "s06"),
        predateIdFor("s07", "s09"),
        predateIdFor("s08", "s10"),
      ].sort(),
    );
    const mayaMarcus = s.predates.find((p) => p.id === predateIdFor("s01", "s04"))!;
    expect(mayaMarcus.matched).toBe(false);
    expect(Object.values(mayaMarcus.verdicts).every((v) => v!.score < 7)).toBe(true);
    expect(s.matches).toHaveLength(5);
  });

  it("shows the serious vs see-where-it-goes flag in Maya's verdict", async () => {
    const pd = (await getState()).predates.find((p) => p.id === predateIdFor("s01", "s02"))!;
    expect(pd.verdicts.s01!.flags.join(" ")).toMatch(/see where it goes/);
  });

  it("guards fire somewhere in the pool, originals go to the hub log only", async () => {
    const s = await getState();
    const blocked = s.predates.flatMap((p) => p.transcript.filter((m) => m.blocked));
    expect(blocked.some((m) => m.blocked!.reason.startsWith("leak blocked"))).toBe(true);
    expect(blocked.some((m) => m.blocked!.reason.includes("injection"))).toBe(true);
    for (const m of blocked) expect(m.blocked!.original).toBeUndefined();
    const leaks = blocked.filter((m) => m.blocked!.reason.startsWith("leak"));
    for (const m of leaks) expect(m.content).toContain(HIDDEN);
    expect(s.hubLog.length).toBe(blocked.length);
    expect(s.hubLog.every((h) => h.original.length > 0)).toBe(true);
  });

  it("the agent that receives an injection declines kindly", async () => {
    const s = await getState();
    for (const pd of s.predates) {
      const i = pd.transcript.findIndex((m) => m.blocked?.reason.includes("injection"));
      if (i >= 0 && i + 1 < pd.transcript.length) expect(pd.transcript[i + 1].content).toMatch(/nice try|unlock later/i);
    }
  });

  it("saves finished pre-dates to the cache, without originals", async () => {
    const id = predateIdFor("s01", "s02");
    const cached = readCachedPredate(id)!;
    expect(cached.status).toBe("done");
    const raw = fs.readFileSync(path.join(config.stateDir(), "cache", "predates", `${id}.json`), "utf8");
    expect(raw).not.toContain('"original"');
  });

  it("re-running matching reuses the cache instead of re-running", async () => {
    await resetStore();
    const summary = await updateState((s) => runMatching(s));
    expect(summary.fromCache).toBe(9);
    expect(summary.queued).toEqual([]);
    expect(summary.matches).toBe(5);
  });

  it("concurrent starts share one run", async () => {
    await updateState((s) => {
      const pd = s.predates[0];
      pd.status = "queued";
    });
    const id = (await getState()).predates[0].id;
    const [x, y] = await Promise.all([startPredate(id), startPredate(id)]);
    expect(x).toBe(y);
  });
});

describe("context building", () => {
  it("uses a rolling summary + the last 3 messages, from the speaker's view", () => {
    const views = Array.from({ length: 6 }, (_, i) => ({
      from: i % 2 === 0 ? "a" : "b",
      content: `msg ${i}. more text`,
      forOther: i === 5 ? "WRAPPED" : `msg ${i}. more text`,
    }));
    const [m] = contextFor("a", views, 6, 8);
    expect(m.content).toContain("Summary of earlier turns");
    expect(m.content).toContain("- You: msg 0.");
    expect(m.content).toContain("Other agent: WRAPPED");
    expect(m.content.match(/^(You|Other agent): /gm)).toHaveLength(3);
  });
});

describe("API", () => {
  it("SSE replays a finished pre-date: meta → typing/messages → verdicts → done", async () => {
    const id = predateIdFor("s03", "s04");
    const res = await streamGET(new Request(`http://x/api/predate/${id}/stream?speed=fast`), { params: Promise.resolve({ id }) });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = await readSse(res);
    expect(events[0]).toMatchObject({ type: "meta", replay: true });
    expect(events.filter((e) => e.type === "message")).toHaveLength(8);
    expect(events.filter((e) => e.type === "verdict")).toHaveLength(2);
    expect(events.at(-1).type).toBe("done");
  });

  it("SSE streams a live run for a queued pre-date", async () => {
    const id = predateIdFor("s05", "s06");
    const res = await streamGET(new Request(`http://x/api/predate/${id}/stream?fresh=1`), { params: Promise.resolve({ id }) });
    const events = await readSse(res);
    expect(events[0]).toMatchObject({ type: "meta", replay: false });
    expect(events.filter((e) => e.type === "message")).toHaveLength(8);
    expect(events.some((e) => e.type === "typing")).toBe(true);
    expect(events.at(-1).type).toBe("done");
  });

  it("?as= shows only that student's own verdict and hides the other side", async () => {
    const id = predateIdFor("s01", "s02");
    const res = await recordGET(new Request(`http://x/api/predate/${id}?as=s01`), { params: Promise.resolve({ id }) });
    const body = await res.json();
    expect(Object.keys(body.verdicts)).toEqual(["s01"]);
    expect(body.participants.b.label).toBe("Their agent");
    expect(JSON.stringify(body)).not.toContain("Jordan");

    const sse = await readSse(
      await streamGET(new Request(`http://x/api/predate/${id}/stream?speed=fast&as=s02`), { params: Promise.resolve({ id }) }),
    );
    const verdicts = sse.filter((e) => e.type === "verdict");
    expect(verdicts.map((e) => e.verdict.studentId)).toEqual(["s02"]);
    expect(Object.keys(sse.at(-1).predate.verdicts)).toEqual(["s02"]);
  });

  it("publicPredate never exposes hub-log originals", async () => {
    const s = await getState();
    const pd = structuredClone(s.predates[0]);
    pd.transcript[0].blocked = { reason: "leak blocked: email", original: "secret@example.edu" };
    expect(JSON.stringify(publicPredate(pd, s.students))).not.toContain("secret@example.edu");
  });

  it("404s unknown pre-dates", async () => {
    const res = await recordGET(new Request("http://x/api/predate/nope"), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});
