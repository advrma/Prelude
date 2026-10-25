import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { cacheKey, createCache } from "@/lib/llm/cache";
import { Limiter } from "@/lib/llm/limiter";
import { createRouter, extractJson } from "@/lib/llm/router";
import type { LlmMode } from "@/lib/config";
import type { LlmRequest, Provider, ProviderArgs } from "@/lib/llm/types";

function tmpCache() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prelude-cache-"));
  return { dir, cache: createCache(() => dir) };
}

function fakeProvider(behaviour: Record<string, (args: ProviderArgs) => string | Error>) {
  const calls: string[] = [];
  const provider: Provider = {
    name: "fake",
    async generate(args) {
      calls.push(args.model);
      const out = behaviour[args.model]?.(args) ?? new Error("no behaviour");
      if (out instanceof Error) throw out;
      return out;
    },
  };
  return { provider, calls };
}

const quota = () => Object.assign(new Error("429 RESOURCE_EXHAUSTED"), { status: 429 });

function setup(mode: LlmMode, behaviour: Record<string, (args: ProviderArgs) => string | Error>, limiter?: Limiter) {
  const { provider, calls } = fakeProvider(behaviour);
  const { cache, dir } = tmpCache();
  const llm = createRouter({
    provider,
    limiter: limiter ?? new Limiter({ rpmCap: () => 100, rpdStop: () => 100, file: () => null }),
    cache,
    mode: () => mode,
    chain: () => ["fast", "smart"],
    mock: async () => ({ text: "mocked", json: { score: 1 } }),
    log: () => {},
  });
  return { llm, calls, cache, dir };
}

const req: LlmRequest = { task: "predate_turn", system: "sys", messages: [{ role: "user", content: "hi" }] };
const Schema = z.object({ score: z.number() });

describe("router fallback order", () => {
  it("uses the first model when it works", async () => {
    const { llm, calls } = setup("live", { fast: () => "hello" });
    const r = await llm(req);
    expect(r).toMatchObject({ text: "hello", model: "fast", cached: false });
    expect(r.fallback).toBeUndefined();
    expect(calls).toEqual(["fast"]);
  });

  it("moves down the chain on 429 / 5xx / timeout", async () => {
    const { llm, calls } = setup("live", { fast: quota, smart: () => "from smart" });
    const r = await llm(req);
    expect(r.model).toBe("smart");
    expect(calls).toEqual(["fast", "smart"]);
    expect(r.attempts?.[0].error).toMatch(/rate limited/);
  });

  it("falls back to cache, then mock, and marks it", async () => {
    const { llm, cache } = setup("live", { fast: quota, smart: quota });
    const miss = await llm(req);
    expect(miss).toMatchObject({ text: "mocked", model: "mock", fallback: "mock" });

    cache.set(cacheKey(req), { task: req.task, model: "smart", text: "cached text", at: "" });
    const hit = await llm(req);
    expect(hit).toMatchObject({ text: "cached text", cached: true, fallback: "cache" });
  });

  it("retries invalid JSON once on the same model, then moves on", async () => {
    let n = 0;
    const { llm, calls } = setup("live", {
      fast: () => (n++ === 0 ? "not json" : "{ also bad"),
      smart: () => '```json\n{"score": 8}\n```',
    });
    const r = await llm({ ...req, task: "verdict", schema: Schema });
    expect(calls).toEqual(["fast", "fast", "smart"]);
    expect(r.json).toEqual({ score: 8 });
  });

  it("accepts valid JSON on the retry", async () => {
    let n = 0;
    const { llm, calls } = setup("live", { fast: () => (n++ === 0 ? '{"score":"eight"}' : '{"score":8}') });
    const r = await llm({ ...req, task: "verdict", schema: Schema });
    expect(calls).toEqual(["fast", "fast"]);
    expect(r.json).toEqual({ score: 8 });
  });

  it("skips a model that hit RPD_STOP", async () => {
    const limiter = new Limiter({ rpmCap: () => 100, rpdStop: () => 1, file: () => null });
    await limiter.acquire("fast");
    const { llm, calls } = setup("live", { fast: () => "x", smart: () => "y" }, limiter);
    const r = await llm(req);
    expect(calls).toEqual(["smart"]);
    expect(r.model).toBe("smart");
  });

  it("never calls the provider in mock mode", async () => {
    const { llm, calls } = setup("mock", { fast: () => "x" });
    const r = await llm(req);
    expect(calls).toEqual([]);
    expect(r.model).toBe("mock");
    expect(r.fallback).toBeUndefined();
  });

  it("replay mode reads only the cache, mock on a miss", async () => {
    const { llm, calls, cache } = setup("replay", { fast: () => "x" });
    expect((await llm(req)).fallback).toBe("mock");
    cache.set(cacheKey(req), { task: req.task, model: "fast", text: "replayed", at: "" });
    expect(await llm(req)).toMatchObject({ text: "replayed", cached: true });
    expect(calls).toEqual([]);
  });
});

describe("cache", () => {
  it("writes successful live responses to disk, keyed model-agnostically", async () => {
    const { llm, dir } = setup("live", { fast: () => "saved" });
    await llm(req);
    const file = path.join(dir, `${cacheKey(req)}.json`);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toMatchObject({ text: "saved", model: "fast" });
  });

  it("key depends on task, system and messages only", () => {
    const k = cacheKey(req);
    expect(cacheKey({ ...req })).toBe(k);
    expect(cacheKey({ ...req, system: "other" })).not.toBe(k);
    expect(cacheKey({ ...req, task: "verdict" })).not.toBe(k);
    expect(cacheKey({ ...req, messages: [{ role: "user", content: "yo" }] })).not.toBe(k);
  });

  it("survives a fresh cache instance (reads from disk)", () => {
    const { dir, cache } = tmpCache();
    cache.set("abc", { task: "t", model: "m", text: "persisted", at: "" });
    expect(createCache(() => dir).get("abc")?.text).toBe("persisted");
  });
});

describe("extractJson", () => {
  it("handles fences and leading prose", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":2}')).toEqual({ a: 2 });
  });
});
