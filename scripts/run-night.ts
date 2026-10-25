// npm run night        — run tonight's matching for the whole pool with real Gemini calls (needs GEMINI_API_KEY),
//                        respecting RPM/RPD limits, and save every pre-date + negotiation to data/cache/ for replay.
// npm run night:mock   — same pipeline with the mock provider and no latency (regenerates the committed replay cache).
// Flags: --mock  --no-negotiate
import { hasFlag, loadEnv } from "./_env";

async function main() {
  const mock = hasFlag("mock");
  loadEnv({ mock });
  if (mock) process.env.MOCK_LATENCY_MS = "0";

  const { config, getMode } = await import("../src/lib/config");
  const { getLimiter } = await import("../src/lib/llm/limiter");
  const { resetStore, updateState, getState } = await import("../src/lib/store");
  const { runMatching } = await import("../src/lib/hub/pool");
  const { startPredate } = await import("../src/lib/agents/predate");
  const { negotiate } = await import("../src/lib/agents/negotiator");
  const { writeCachedNegotiation } = await import("../src/lib/cachefiles");

  const mode = getMode();
  const models = [...new Set([config.modelFast(), config.modelSmart()])];
  const limiter = getLimiter();
  const before = limiter.snapshot(models);

  console.log(`\n🌙 Prelude night run · mode: ${mode}${mode === "live" ? ` · models: ${models.join(", ")}` : ""}`);
  if (mode === "replay") {
    console.log("LLM_MODE=replay only reads the cache. Unset it (or use --mock) to generate pre-dates.");
    process.exit(1);
  }
  if (mode === "mock" && !mock) console.log("(No GEMINI_API_KEY found, so this is a mock run. Add your key to .env for real transcripts.)");
  console.log(`Limits: ${config.rpmCap()}/min and ${config.rpdStop()}/day per model. Used so far today: ${models.map((m) => `${m} ${before.models[m].today}`).join(", ")}\n`);

  await resetStore();
  const summary = await updateState((s) => runMatching(s, { useCache: false }));
  const turns = config.predateTurns();
  const estimate = summary.queued.length * (turns + 2) + 5 * 4;
  console.log(`Hub: ${summary.evaluated} pairs checked, ${summary.passed} passed hard filters, ${summary.blocked} blocked → ${summary.queued.length} pre-dates.`);
  if (mode === "live") {
    const left = models.reduce((n, m) => n + Math.max(0, config.rpdStop() - before.models[m].today), 0);
    console.log(`Estimated requests: ~${estimate} (quota left today across models: ${left}).`);
    if (estimate > left) console.log("⚠️  Probably not enough quota left today; later turns may fall back to mock (marked in the UI).");
  }
  console.log("");

  const state0 = await getState();
  const name = (id: string) => state0.students.find((s) => s.id === id)?.private.firstName ?? id;
  let fallbacks = 0;
  let i = 0;
  for (const id of summary.queued) {
    i++;
    const t0 = Date.now();
    try {
      const pd = await startPredate(id);
      const blocks = pd.transcript.filter((m) => m.blocked).length;
      const fb = pd.transcript.filter((m) => (m.data as { fallback?: string } | undefined)?.fallback).length;
      fallbacks += fb;
      const scores = [pd.verdicts[pd.a]?.score, pd.verdicts[pd.b]?.score].join("/");
      console.log(
        `  [${i}/${summary.queued.length}] ${name(pd.a)} × ${name(pd.b)}: verdicts ${scores} ${pd.matched ? "♥ match" : "· quiet pass"}` +
          `${blocks ? ` · ${blocks} guard block(s)` : ""}${fb ? ` · ⚠️ ${fb} fallback turn(s)` : ""} · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
    } catch (err) {
      console.log(`  [${i}/${summary.queued.length}] ${id}: ❌ ${(err as Error).message}`);
    }
  }

  let negotiations = 0;
  const state = await getState();
  if (!hasFlag("no-negotiate")) {
    console.log("\nNegotiating dates for every match (cached for replay; students still have to say yes in the app):");
    for (const m of state.matches) {
      const A = state.students.find((s) => s.id === m.a)!;
      const B = state.students.find((s) => s.id === m.b)!;
      try {
        const { plan } = await negotiate(m.id, A, B);
        writeCachedNegotiation({ matchId: m.id, a: m.a, b: m.b, plan });
        negotiations++;
        const conflict = plan.negotiation.find((x) => x.type === "counter")?.content;
        console.log(`  ☕ ${name(m.a)} × ${name(m.b)}: ${plan.outcome} in ${plan.negotiation.length} turns, ${plan.options.length} options${conflict ? `\n     ↳ "${conflict}"` : ""}`);
      } catch (err) {
        console.log(`  ☕ ${name(m.a)} × ${name(m.b)}: ❌ ${(err as Error).message}`);
      }
    }
  }

  const after = limiter.snapshot(models);
  const done = state.predates.filter((p) => p.status === "done").length;
  console.log("\n──────── Summary ────────");
  console.log(`Pre-dates run:     ${done}/${summary.queued.length}`);
  console.log(`Matches:           ${state.matches.length}`);
  console.log(`Guard blocks:      ${state.hubLog.length}`);
  console.log(`Negotiations:      ${negotiations}`);
  if (mode === "live") {
    console.log(`Requests used:     ${models.map((m) => `${m} +${after.models[m].today - before.models[m].today} (today ${after.models[m].today}/${config.rpdStop()})`).join(", ")}`);
    console.log(`Fallback turns:    ${fallbacks}${fallbacks ? "  ⚠️ some turns used cache/mock; run npm run check" : ""}`);
  } else console.log("Requests used:     0 (mock)");
  console.log(`Saved to:          data/cache/predates/ and data/cache/negotiations/ (LLM_MODE=replay serves these)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
