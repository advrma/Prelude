import path from "node:path";

export type LlmMode = "mock" | "live" | "replay";
export type Task = "predate_turn" | "verdict" | "negotiate" | "onboarding";

/** Read an env var, tolerating inline `# comments` copied from .env.example. */
function env(name: string): string {
  const raw = process.env[name] ?? "";
  return raw.replace(/\s+#.*$/, "").trim();
}

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(env(name), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const DEFAULT_MODEL_FAST = "gemini-3.1-flash-lite";
export const DEFAULT_MODEL_SMART = "gemini-3.5-flash-lite";

/** All config is read lazily so tests (and scripts) can change process.env at runtime. */
export const config = {
  apiKey: () => env("GEMINI_API_KEY"),
  keyPresent: () => env("GEMINI_API_KEY").length > 0,
  modelFast: () => env("GEMINI_MODEL_FAST") || DEFAULT_MODEL_FAST,
  modelSmart: () => env("GEMINI_MODEL_SMART") || DEFAULT_MODEL_SMART,
  rpmCap: () => envInt("RPM_CAP", 13),
  rpdStop: () => envInt("RPD_STOP", 480),
  predateTurns: () => Math.max(2, envInt("PREDATE_TURNS", 8)),
  predatesPerStudent: () => envInt("PREDATES_PER_STUDENT", 5),
  matchThreshold: () => envInt("MATCH_THRESHOLD", 7),
  /** Mock provider latency range in ms; tests and cache generation set MOCK_LATENCY_MS=0. */
  mockLatency: (): [number, number] => {
    const v = env("MOCK_LATENCY_MS");
    if (v !== "") {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n)) return [n, n];
    }
    return [300, 800];
  },
  /** Delay between replayed messages on the SSE stream (ms). */
  replayDelay: () => envInt("REPLAY_DELAY_MS", 900),
  llmTimeoutMs: () => envInt("LLM_TIMEOUT_MS", 30000),
  /** Where runtime state lives: store.json, usage.json and cache/. Defaults to ./data. */
  stateDir: () => {
    const dir = env("PRELUDE_STATE_DIR");
    return dir ? path.resolve(dir) : path.join(process.cwd(), "data");
  },
};

/**
 * mock   — no key, or LLM_MODE=mock: deterministic mock provider.
 * replay — LLM_MODE=replay: cache only, mock on a miss. For demos and deploys.
 * live   — key present and LLM_MODE=auto (default): real Gemini calls.
 */
export function getMode(): LlmMode {
  const mode = env("LLM_MODE").toLowerCase();
  if (mode === "replay") return "replay";
  if (mode === "mock") return "mock";
  return config.keyPresent() ? "live" : "mock";
}

/** Model fallback chain per task (§8.2). */
export function modelChain(task: Task): string[] {
  const fast = config.modelFast();
  const smart = config.modelSmart();
  const chain = task === "predate_turn" ? [fast, smart] : [smart, fast];
  return [...new Set(chain)];
}
