import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Every test file gets its own throwaway state dir so it never touches data/store.json or the replay cache.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prelude-test-"));
process.env.PRELUDE_STATE_DIR = dir;
process.env.MOCK_LATENCY_MS = "0";
process.env.REPLAY_DELAY_MS = "0";
delete process.env.GEMINI_API_KEY;
delete process.env.LLM_MODE;
