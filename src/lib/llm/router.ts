import { config, getMode, modelChain, type LlmMode, type Task } from "../config";
import { toGeminiJsonSchema } from "../schemas";
import { cacheKey, createCache, type LlmCache } from "./cache";
import { createGeminiProvider, hintFor } from "./gemini";
import { getLimiter, type Limiter } from "./limiter";
import { mockGenerate } from "./mock";
import type { LlmRequest, LlmResult, Provider } from "./types";

// llm({ task, system, messages, schema? }) with model fallback (§8.1–8.2).
// live:   chain of models → cache → mock (marked fallback, never silent)
// replay: cache → mock
// mock:   mock

export interface RouterDeps {
  provider: Provider;
  limiter: Limiter;
  cache: LlmCache;
  mode?: () => LlmMode;
  chain?: (task: Task) => string[];
  mock?: (req: LlmRequest) => Promise<{ text: string; json?: unknown }>;
  timeoutMs?: () => number;
  log?: (msg: string) => void;
}

/** Strip ```json fences some models add even in JSON mode. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/[[{]/);
  return JSON.parse(start > 0 ? body.slice(start) : body);
}

export function createRouter(deps: RouterDeps) {
  const mode = deps.mode ?? getMode;
  const chain = deps.chain ?? modelChain;
  const mock = deps.mock ?? mockGenerate;
  const timeoutMs = deps.timeoutMs ?? config.llmTimeoutMs;
  const log = deps.log ?? ((m: string) => console.warn(`[llm] ${m}`));

  async function fromMock(req: LlmRequest, fallback?: "mock"): Promise<LlmResult> {
    const out = await mock(req);
    return { text: out.text, json: out.json, model: "mock", cached: false, ...(fallback ? { fallback } : {}) };
  }

  return async function llm(req: LlmRequest): Promise<LlmResult> {
    const m = mode();
    if (m === "mock") return fromMock(req);

    const key = cacheKey(req);
    if (m === "replay") {
      const hit = deps.cache.get(key);
      if (hit) return { text: hit.text, json: hit.json, model: hit.model, cached: true };
      return fromMock(req, "mock");
    }

    const jsonSchema = req.schema ? toGeminiJsonSchema(req.schema) : undefined;
    const attempts: { model: string; error: string }[] = [];

    for (const model of chain(req.task)) {
      if (!deps.limiter.canUse(model)) {
        attempts.push({ model, error: "daily cap reached (RPD_STOP)" });
        continue;
      }
      // One retry on the same model for invalid JSON; any provider error moves down the chain.
      for (let attempt = 1; attempt <= 2; attempt++) {
        await deps.limiter.acquire(model);
        let text: string;
        try {
          text = await deps.provider.generate({ model, system: req.system, messages: req.messages, jsonSchema, timeoutMs: timeoutMs() });
        } catch (err) {
          const error = `${String((err as Error)?.message ?? err)} (${hintFor(err)})`;
          attempts.push({ model, error });
          log(`${req.task} on ${model} failed: ${error}`);
          break;
        }
        if (!req.schema) {
          deps.cache.set(key, { task: req.task, model, text, at: new Date().toISOString() });
          return { text, model, cached: false, attempts };
        }
        try {
          const json = req.schema.parse(extractJson(text));
          deps.cache.set(key, { task: req.task, model, text, json, at: new Date().toISOString() });
          return { text, json, model, cached: false, attempts };
        } catch (err) {
          const error = `invalid JSON (attempt ${attempt}): ${String((err as Error)?.message ?? err).slice(0, 200)}`;
          attempts.push({ model, error });
          log(`${req.task} on ${model}: ${error}`);
        }
      }
    }

    const hit = deps.cache.get(key);
    if (hit) {
      log(`${req.task}: all models failed, serving cached response`);
      return { text: hit.text, json: hit.json, model: hit.model, cached: true, fallback: "cache", attempts };
    }
    log(`${req.task}: all models failed and no cache, falling back to mock`);
    return { ...(await fromMock(req, "mock")), attempts };
  };
}

const g = globalThis as unknown as { __preludeRouter?: ReturnType<typeof createRouter> };

/** The app-wide router: Gemini when GEMINI_API_KEY is set, mock otherwise. */
export function llm(req: LlmRequest): Promise<LlmResult> {
  g.__preludeRouter ??= createRouter({
    provider: createGeminiProvider(config.apiKey),
    limiter: getLimiter(),
    cache: createCache(),
  });
  return g.__preludeRouter(req);
}
