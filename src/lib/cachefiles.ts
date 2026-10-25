import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import type { DatePlan, PreDate } from "./types";

// Finished pre-dates and negotiations saved for demo replay (§7.2, §12): data/cache/{predates,negotiations}/.

function dir(kind: "predates" | "negotiations") {
  return path.join(config.stateDir(), "cache", kind);
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function writeJson(file: string, value: unknown): boolean {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
    return true;
  } catch {
    return false; // read-only deploy: replay still works from what's committed
  }
}

export function readCachedPredate(id: string): PreDate | undefined {
  const pd = readJson<PreDate>(path.join(dir("predates"), `${id}.json`));
  return pd?.status === "done" ? pd : undefined;
}

export function writeCachedPredate(pd: PreDate): boolean {
  return writeJson(path.join(dir("predates"), `${pd.id}.json`), pd);
}

export function listCachedPredates(): string[] {
  try {
    return fs
      .readdirSync(dir("predates"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

export interface CachedNegotiation {
  matchId: string;
  a: string;
  b: string;
  plan: DatePlan;
}

export function readCachedNegotiation(matchId: string): CachedNegotiation | undefined {
  return readJson<CachedNegotiation>(path.join(dir("negotiations"), `${matchId}.json`));
}

export function writeCachedNegotiation(n: CachedNegotiation): boolean {
  return writeJson(path.join(dir("negotiations"), `${n.matchId}.json`), n);
}

export function listCachedNegotiations(): string[] {
  try {
    return fs
      .readdirSync(dir("negotiations"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}
