// npm run check — verify GEMINI_API_KEY and both model IDs with one tiny call each.
// Prints ✅/❌ per model with the exact error and a hint. Exit code 1 if anything failed.
import { loadEnv } from "./_env";

async function main() {
  loadEnv();
  const { config, getMode } = await import("../src/lib/config");
  const { createGeminiProvider, hintFor } = await import("../src/lib/llm/gemini");
  const { getLimiter } = await import("../src/lib/llm/limiter");

  const models = [...new Set([config.modelFast(), config.modelSmart()])];
  console.log("\nPrelude model check\n");
  console.log(`  GEMINI_MODEL_FAST  = ${config.modelFast()}`);
  console.log(`  GEMINI_MODEL_SMART = ${config.modelSmart()}`);
  console.log(`  LLM_MODE           = ${process.env.LLM_MODE || "auto"} → app runs in "${getMode()}" mode\n`);

  if (!config.keyPresent()) {
    for (const m of models) console.log(`❌ ${m}\n   GEMINI_API_KEY is empty\n   hint: copy .env.example to .env and paste your key from Google AI Studio\n`);
    process.exit(1);
  }

  const provider = createGeminiProvider(config.apiKey);
  const limiter = getLimiter();
  let failed = 0;
  for (const model of models) {
    const t0 = Date.now();
    try {
      await limiter.acquire(model);
      const text = await provider.generate({
        model,
        system: "You are a health check. Reply with JSON only.",
        messages: [{ role: "user", content: 'Reply with {"ok": true}.' }],
        jsonSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
        timeoutMs: 30000,
      });
      const ok = /"ok"\s*:\s*true/.test(text);
      console.log(`✅ ${model}  (${Date.now() - t0} ms, structured JSON ${ok ? "works" : `returned: ${text.slice(0, 80)}`})`);
    } catch (err) {
      failed++;
      const e = err as { message?: string; status?: number };
      console.log(`❌ ${model}`);
      console.log(`   error: ${e.status ? `[${e.status}] ` : ""}${e.message ?? String(err)}`);
      console.log(`   hint: ${hintFor(err)}\n`);
    }
  }
  const usage = limiter.snapshot(models);
  console.log(`\nRequests today (resets at midnight Los Angeles): ${models.map((m) => `${m} ${usage.models[m].today}/${usage.rpdStop}`).join(", ")}`);
  if (failed) {
    console.log(`\n${failed} model(s) failed. The app still works: it falls back down the chain, then to cache, then to mock (marked in the UI).`);
    process.exit(1);
  }
  console.log("\nAll good. Next: npm run night");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
