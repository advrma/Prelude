import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { StudentSchema } from "@/lib/schemas";
import { loadPersonas, loadPlaces } from "@/lib/data";
import { _forgetStore, _setMemoryOnly, getState, resetStore, storePath, updateState } from "@/lib/store";

beforeEach(() => {
  _forgetStore();
  if (fs.existsSync(storePath())) fs.rmSync(storePath());
});

describe("seed data", () => {
  it("has 10 valid, adult, fictional personas", () => {
    const personas = loadPersonas();
    expect(personas).toHaveLength(10);
    for (const p of personas) {
      expect(() => StudentSchema.parse(p)).not.toThrow();
      expect(p.filters.age).toBeGreaterThanOrEqual(19);
      expect(p.filters.age).toBeLessThanOrEqual(24);
      expect(p.email.endsWith("@example.edu")).toBe(true);
    }
    expect(new Set(personas.map((p) => p.id)).size).toBe(10);
  });

  it("has ~15+ public places with hours and costs", () => {
    const places = loadPlaces();
    expect(places.length).toBeGreaterThanOrEqual(15);
    for (const p of places) expect(p.public).toBe(true);
  });
});

describe("store", () => {
  it("creates store.json seeded with personas on first read", async () => {
    const state = await getState();
    expect(state.students).toHaveLength(10);
    expect(fs.existsSync(storePath())).toBe(true);
  });

  it("serializes concurrent writes without losing any", async () => {
    await getState();
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        updateState((s) => {
          s.reports.push({ id: `r${i}`, matchId: "m", by: "s01", reason: "", at: "" });
        }),
      ),
    );
    _forgetStore();
    const state = await getState();
    expect(state.reports).toHaveLength(25);
  });

  it("reset wipes runtime state and reseeds", async () => {
    await updateState((s) => {
      s.matches.push({ id: "m1", a: "s01", b: "s02", predateId: "p", stage: 0, yes: {}, closed: false });
    });
    const state = await resetStore();
    expect(state.matches).toHaveLength(0);
    expect(state.students).toHaveLength(10);
  });

  it("falls back to in-memory state when the disk is read-only", async () => {
    _setMemoryOnly(true);
    await updateState((s) => {
      s.reports.push({ id: "mem", matchId: "m", by: "s01", reason: "", at: "" });
    });
    const state = await getState();
    expect(state.reports.map((r) => r.id)).toContain("mem");
    expect(fs.existsSync(storePath())).toBe(false);
  });
});
