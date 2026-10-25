import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Limiter, laDay } from "@/lib/llm/limiter";

afterEach(() => {
  vi.useRealTimers();
});

describe("limiter: RPM token bucket", () => {
  it("queues requests over the cap instead of failing, FIFO", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    const lim = new Limiter({ rpmCap: () => 2, rpdStop: () => 100, file: () => null });
    const order: number[] = [];
    const p = [1, 2, 3, 4].map((n) => lim.acquire("m").then(() => order.push(n)));
    await vi.advanceTimersByTimeAsync(10);
    expect(order).toEqual([1, 2]); // 3 and 4 wait

    await vi.advanceTimersByTimeAsync(30_000);
    expect(order).toEqual([1, 2]); // still inside the minute

    await vi.advanceTimersByTimeAsync(31_000);
    await Promise.all(p);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("limits each model independently", async () => {
    vi.useFakeTimers();
    const lim = new Limiter({ rpmCap: () => 1, rpdStop: () => 100, file: () => null });
    const done: string[] = [];
    lim.acquire("fast").then(() => done.push("fast1"));
    lim.acquire("smart").then(() => done.push("smart1"));
    lim.acquire("fast").then(() => done.push("fast2"));
    await vi.advanceTimersByTimeAsync(10);
    expect(done).toEqual(["fast1", "smart1"]);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(done).toContain("fast2");
  });
});

describe("limiter: RPD stop + LA midnight reset", () => {
  it("stops a model at RPD_STOP", async () => {
    const lim = new Limiter({ rpmCap: () => 100, rpdStop: () => 3, file: () => null });
    for (let i = 0; i < 3; i++) await lim.acquire("m");
    expect(lim.canUse("m")).toBe(false);
    expect(lim.canUse("other")).toBe(true);
    expect(lim.snapshot(["m"]).models.m).toMatchObject({ today: 3, stopped: true });
  });

  it("resets at midnight America/Los_Angeles, not UTC", async () => {
    vi.useFakeTimers();
    // 23:30 PDT on Oct 25 = 06:30 UTC Oct 26
    vi.setSystemTime(new Date("2026-10-26T06:30:00Z"));
    expect(laDay()).toBe("2026-10-25");
    const lim = new Limiter({ rpmCap: () => 100, rpdStop: () => 2, file: () => null });
    await lim.acquire("m");
    await lim.acquire("m");
    expect(lim.canUse("m")).toBe(false);

    // UTC midnight already passed above; still the same LA day 20 minutes later.
    vi.setSystemTime(new Date("2026-10-26T06:50:00Z"));
    expect(lim.canUse("m")).toBe(false);

    // 00:01 PDT Oct 26 = 07:01 UTC
    vi.setSystemTime(new Date("2026-10-26T07:01:00Z"));
    expect(laDay()).toBe("2026-10-26");
    expect(lim.canUse("m")).toBe(true);
    expect(lim.today("m")).toBe(0);
  });

  it("handles the PST switch (UTC-8 after DST ends)", () => {
    // Nov 2 2026 08:30 UTC = 00:30 PST
    expect(laDay(Date.parse("2026-11-02T08:30:00Z"))).toBe("2026-11-02");
    expect(laDay(Date.parse("2026-11-02T07:30:00Z"))).toBe("2026-11-01");
  });

  it("persists daily counts to usage.json and reloads them", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "prelude-usage-")), "usage.json");
    const a = new Limiter({ rpmCap: () => 100, rpdStop: () => 100, file: () => file });
    await a.acquire("m");
    await a.acquire("m");
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(saved.counts.m).toBe(2);
    const b = new Limiter({ rpmCap: () => 100, rpdStop: () => 100, file: () => file });
    expect(b.today("m")).toBe(2);
  });
});
