import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { config } from "../config";
import type { LlmRequest } from "./types";

// Response cache (§8.4). Key = hash(task + model-agnostic prompt + messages). Files in data/cache/llm/.

export interface CacheEntry {
  task: string;
  model: string;
  text: string;
  json?: unknown;
  at: string;
}

export function cacheKey(req: Pick<LlmRequest, "task" | "system" | "messages">): string {
  return createHash("sha256")
    .update(`${req.task}\n${req.system}\n${JSON.stringify(req.messages)}`)
    .digest("hex")
    .slice(0, 40);
}

export interface LlmCache {
  get(key: string): CacheEntry | undefined;
  set(key: string, entry: CacheEntry): void;
}

/** File-backed cache with an in-memory layer; falls back to memory only on a read-only disk. */
export function createCache(dir: () => string = () => path.join(config.stateDir(), "cache", "llm")): LlmCache {
  const memory = new Map<string, CacheEntry>();
  let readOnly = false;
  return {
    get(key) {
      const hit = memory.get(key);
      if (hit) return hit;
      try {
        const entry = JSON.parse(fs.readFileSync(path.join(dir(), `${key}.json`), "utf8")) as CacheEntry;
        memory.set(key, entry);
        return entry;
      } catch {
        return undefined;
      }
    },
    set(key, entry) {
      memory.set(key, entry);
      if (readOnly) return;
      try {
        fs.mkdirSync(dir(), { recursive: true });
        fs.writeFileSync(path.join(dir(), `${key}.json`), JSON.stringify(entry, null, 2), "utf8");
      } catch {
        readOnly = true;
      }
    },
  };
}
