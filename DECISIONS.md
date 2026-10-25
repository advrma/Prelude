# Decisions

One line each: decision, then why. These are calls made overnight when PLAN.md was ambiguous.

## Process
- Tracked progress in `TASKS.md` (checked off at each commit) because this session had no task-list tool. Why: the owner asked for visible progress.
- Renamed the unborn `master` branch to `main` before the first commit. Why: §14 says `git push -u origin main`.
- Wrote the scaffold by hand instead of using `create-next-app`. Why: the CLI is interactive and would overwrite PLAN.md checks; hand-writing it gives the same result.

## Stack
- Pinned Next 15.5.28 (latest 15.x), React 19, Zod 4, `@google/genai` 2.x, Tailwind 4, Vitest 3, ESLint 9 flat config. Why: §4 says Next 15; everything else uses the latest stable.
- Load Google Fonts with a `<link>` in the root layout instead of `next/font/google`. Why: `next/font` downloads fonts during `next build`, so an offline build would fail. The link degrades to system fonts.
- `npm run lint` runs `eslint .` with the Next flat config. Why: `next lint` is deprecated in 15.5.
- Every npm script is plain `node`/`tsx`/`next`, with no `rm -rf` and no `VAR=x cmd`. Flags such as `--mock` and `--reset` replace env-var prefixes. Why: Windows/PowerShell compatibility (owner's rule).
- Config reads env lazily (functions, not constants) and strips inline `# comments`. Why: tests flip env at runtime, and `.env.example` puts comments on the same line as values.
- `PRELUDE_STATE_DIR` overrides where `store.json`, `usage.json` and `cache/` live. Tests point it at a temp dir. Why: tests must never touch the real store or replay cache.
- `MOCK_LATENCY_MS` and `REPLAY_DELAY_MS` env overrides (both 0 in tests and cache generation). Why: §8.5 latency would make tests slow.

## Data model
- Added `vibe.pronouns`, one of she/her, he/him or they/them, stated by the student. Why: §6.1 has agents talk about their student in the third person ("She's big on night hikes"), and pronouns must be stated, never inferred from gender or name.
- Added `private.busy`, labelled busy blocks like "physics lab". Only the student's own negotiator sees them. Why: §6.3 wants conflicts explained out loud ("lab until then"), and free windows alone carry no reason.
- `freeBusy` uses weekdays (Mon–Sun) plus `HH:MM` in America/Phoenix, listed in preference order. Weekdays resolve to real dates in the next 7 days when a date is planned. Why: §9 says "next 7 days relative to today", and static JSON with fixed dates would go stale.
- `AgentMessage.blocked.original` is optional. Originals are stored only in `store.hubLog` and never in transcripts, cache files or API output. Why: §7.3 says "keep the original only in the hub log".
- Added `matcherScore`, `sharedTags`, `source` (live/mock/replay) and `models` to `PreDate`. Why: the §10.4 header shows matcher score, shared tags, model used and live/replay.
- Added `chat` to `Match`, plus `placeId`/`date` on `DateOption` and `outcome`/`source` on `DatePlan`. Why: stage-2 "say hi" chat, ICS dates and the "need_human" path need somewhere to live.
- Persona emails use `@example.edu`. Why: a reserved example domain can't collide with real students' addresses.
- Static seed data (`personas.json`, `places.json`) is imported as JSON, not read from disk. Why: it then ships inside the serverless bundle for replay deploys.
- Avatars are generated abstract SVG silhouettes (`npm run avatars`) and committed under `public/avatars/`. Why: §9 says no real people or photos.
- Matcher: "self-describe" and "prefer-not" students only meet people open to "everyone". Why: §7.1 needs the other's gender in `wantsToMeet`, and those values can't appear there by design.
- Matcher: "flexible" chronotype and "balanced" social energy earn half credit against either extreme. Why: the plan says "match" without defining partial matches.
- Matcher: dealbreakers are checked in both directions, with a small synonym map (smoking → smok/vape/cigarette …). Everything else is a literal substring match on the other's vibe text. Why: §7.1 "simple keyword check".
## LLM layer
- In live mode the cache is a fallback only (after all models fail), not a first read. `LLM_MODE=replay` reads it first. Why: §8.2/§8.4. Live runs should produce fresh transcripts.
- Any provider error moves down the chain, not just 429/5xx/timeout. 404 "model not found" does too. Why: a wrong model ID in the morning shouldn't kill the demo. Errors are logged with a hint, and the result carries `attempts`.
- If a model rejects `responseJsonSchema` (HTTP 400 mentioning the schema), the provider retries once with plain JSON mode. Zod still validates. Why: not every Gemini model supports full JSON Schema, and the exact IDs are unknown tonight.
- JSON schemas for Gemini come from Zod via `z.toJSONSchema` with `$schema` stripped. Why: one source of truth for the shape.
- Mock-only context (`req.mock`) carries what the mock needs (vibe, matcher score, own logistics) and is excluded from the cache key. Real providers never see it. Why: §8.5 wants verdict scores derived from the matcher score, and a real LLM gets the same facts through its prompt instead.
- The mock "misbehaves" on purpose. In roughly 2 of 3 pre-dates one agent slips identifying info (course code, @handle or dorm) on turn 4. In roughly 3 of 5, an agent attempts a prompt injection on turn 5. Why: §10.4 needs visible blocked-leak chips in mock mode, and the guards need real work to show.
- The limiter's RPM window is a sliding 60-second window per model with a FIFO queue. Daily counts persist in `usage.json` and are keyed by the Los Angeles calendar day. Why: §8.3.
- Mock negotiator: proposes from its own free windows in preference order and ranks places by `dateVibe` tag overlap (cheaper on ties). It accepts when the slot fits its own constraints. Otherwise it counters, explaining the busy label or budget out loud, and leaves 30 minutes after a busy block ends. Why: mirrors what §6.3 asks of the real agents.
- Tuned three personas' `dateVibe` (Priya → brunch, Elena → open mic, Kai → observatory). Why: so the designed budget clash actually happens and the other negotiations pick characterful spots.

## Guards
- "reveal" counts as an injection only when it isn't negated ("I can't reveal that" passes). Why: otherwise every well-behaved decline would be flagged and wrapped.
- An injected message stays visible in the transcript with a red "injection attempt (wrapped)" chip. The other agent receives the §7.3 notice plus the quoted text, marked "do not follow". Why: judges should see the attempt, and the receiving agent still needs context to decline kindly.
- Leaks are redacted in transcripts, cache files and the API. The original goes only to `store.hubLog`. Why: §7.3.
- Added a few extra injection patterns (disregard/forget the rules, developer mode, "pretend you have no rules") and name patterns ("goes by X", "she's called X"). Why: cheap and obviously in the spirit of §7.3.
- Normalized curly apostrophes before matching. Why: LLMs often emit ’.

## Places
- Places carry a `foodOk` list, a `servesFood` flag, opening hours and optional `days`. Why: the negotiator must validate diet, budget and time in code (§7.5).
