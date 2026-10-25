import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startNegotiation } from "@/lib/agents/negotiator";
import { config, getMode } from "@/lib/config";
import { runMatching } from "@/lib/hub/pool";
import { getState, resetStore, updateState } from "@/lib/store";

// §12: data/cache/ (committed) must hold ≥6 finished pre-dates and ≥2 negotiations so LLM_MODE=replay works immediately.

const repoCache = path.join(process.cwd(), "data", "cache");

beforeAll(() => {
  fs.cpSync(repoCache, path.join(config.stateDir(), "cache"), { recursive: true });
  process.env.LLM_MODE = "replay";
});
afterAll(() => {
  delete process.env.LLM_MODE;
});

describe("committed replay cache", () => {
  it("has at least 6 finished pre-dates and 2 negotiations", () => {
    const pds = fs.readdirSync(path.join(repoCache, "predates")).filter((f) => f.endsWith(".json"));
    const negs = fs.readdirSync(path.join(repoCache, "negotiations")).filter((f) => f.endsWith(".json"));
    expect(pds.length).toBeGreaterThanOrEqual(6);
    expect(negs.length).toBeGreaterThanOrEqual(2);
    for (const f of pds) {
      const pd = JSON.parse(fs.readFileSync(path.join(repoCache, "predates", f), "utf8"));
      expect(pd.status).toBe("done");
      expect(pd.transcript.length).toBeGreaterThan(0);
      expect(JSON.stringify(pd)).not.toContain('"original"'); // hub-log originals never leave the store
    }
  });

  it("replay mode runs the whole matching night from cache with zero LLM calls", async () => {
    expect(getMode()).toBe("replay");
    await resetStore();
    const summary = await updateState((s) => runMatching(s));
    expect(summary.fromCache).toBe(summary.created);
    expect(summary.queued).toEqual([]);
    expect(summary.matches).toBeGreaterThanOrEqual(4);
    const s = await getState();
    expect(s.predates.every((p) => p.source === "replay")).toBe(true);
  });

  it("replays a cached negotiation, re-dated to the coming week", async () => {
    const s = await getState();
    const m = s.matches.find((x) => fs.existsSync(path.join(repoCache, "negotiations", `${x.id}.json`)))!;
    await updateState((st) => {
      const mm = st.matches.find((x) => x.id === m.id)!;
      mm.stage = 3;
    });
    const plan = await startNegotiation(m.id);
    expect(plan.source).toBe("replay");
    expect(plan.options).toHaveLength(3);
    const today = new Date().toISOString().slice(0, 10);
    for (const o of plan.options) expect(o.date! > today).toBe(true);
    expect(Object.values(plan.picks).every((p) => p === null)).toBe(true);
  });
});
