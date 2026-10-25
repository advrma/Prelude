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

## Pre-dates
- The rolling summary is deterministic (the first sentence of each older turn), not an LLM call. Why: §7.2 keeps tokens small, and an extra summarization call per turn would roughly double free-tier usage.
- Each agent's context goes in one user message: summary + last 3 messages from that agent's point of view. The other side's text is exactly what the guard let through. Why: simple, provider-agnostic, and it guarantees the wrapped injection is what the agent sees.
- Intent goes to the verdict agent as a "hub note" (the other student's stated intent). It's never shown to the other agent during the pre-date. Why: §6.2's example flag ("they're 'see where it goes', you said 'serious'") needs it, and Filters must stay out of the conversation.
- Pre-date IDs are deterministic (`pd_<a>_<b>`, sorted), and matches are `m_<a>_<b>`. Why: cached pre-dates are then found again for the same pair after a reset.
- "Run tonight's matching" reuses a finished pre-date from `data/cache/predates/` when one exists (marked `source: "replay"`) and queues the rest for a background run. "Run again live" on the watch screen (`?fresh=1`) re-runs one on demand. Why: the demo works instantly and doesn't burn quota, and live runs remain one click away.
- The SSE stream replays finished pre-dates with pacing (`REPLAY_DELAY_MS`, default 900 ms) and "typing…" events. Queued or running ones are followed live through an in-process event bus. Why: both paths look and behave the same in the UI.
- With `?as=<studentId>`, the pre-date API and stream return only that student's verdict and show the other side as "Their agent". Without it, they return the judge/hub view with both verdicts. Why: verdicts are private (§1), and the demo still needs a god view for judges.
- Process-wide singletons (store, limiter, router, run registry, event bus) live on `globalThis`. Why: Next dev bundles each route separately and hot-reloads modules, and they must share one state.

## Reveal
- `sayYes(match, student, level)` takes the level being unlocked, which must be `stage + 1`. Stage advances when both `yes` values are at least that level. Why: makes "YES at the current level" unambiguous and blocks skipping.
- A NO (or unmatch/report) closes the match only for the student who said it (`closedBy`). The other student keeps seeing an unchanged "waiting for their yes", byte-for-byte the same as "hasn't answered yet". Why: if the match vanished for both, its disappearance would itself be a visible rejection (§1 "Fail quietly", §7.4).
- "Not now" closes permanently (with a confirm dialog explaining it's quiet). Why: §7.4 says `sayNo` closes the match. There's no snooze state in the plan.
- Report logs `{matchId, by, reason}` to `store.reports` and also closes the match for the reporter. Why: someone reporting shouldn't have to keep seeing the match.
- At stage 0 the inbox card shows only the student's own verdict, shared tags and the other's pronouns (already used by the agents at level 0). Major, year and photos come at 1, first name and chat at 2, the date plan at 3. Contact, filters, schedules and budgets are never sent. Enforced in `viewMatch` and covered by tests on the real route handlers.
- The stage-2 chat is a short human say-hi chat: 280 characters per line and 40 lines per match. Why: §7.4 "short in-app say hi chat".

## Negotiator
- Agent A proposes first. Turns alternate for at most 4 rounds each, stopping at `accept` or `need_human`. Each agent sees only its own student's logistics plus the typed turns so far. Why: §6.3 and §7.5.
- The 3 options come from code, not from a single LLM. Every proposal and counter is a candidate (the accepted one first), each is validated against both students' real free windows, budgets, diets and place hours, and any shortfall is filled deterministically from the overlapping windows and the best-ranked places. Why: no single agent ever sees both sides' raw data, and §7.5 says not to trust the LLM.
- Dates last 60 minutes for availability checks, and the calendar invite blocks 90 minutes. Why: conservative availability, realistic invite.
- The `.ics` uses UTC computed from America/Phoenix (UTC-7 all year), includes a 1-hour reminder, and folds lines at 75 octets. Why: Tempe has no DST, so the conversion is exact.
- Negotiations are cached in `data/cache/negotiations/<matchId>.json`. A cached plan is re-dated to the coming week and has its picks reset when reused. Why: replay mode, and a cached date must never be in the past.
- Negotiation messages go through the guard too (no speaker name/major, since names are unlocked at stage 3). Why: contact info and links still shouldn't be passed by agents.
- `POST /negotiate` runs to completion and returns the plan. The planner page then reveals the turns one by one. Why: §11 allows "SSE or poll", and mock and live negotiations both take only a few seconds.

## UI
- Design: ink-navy night background with amber/coral glow. Young Serif (display), Instrument Sans (body) and JetBrains Mono (chips/labels). Tokens are CSS variables with a light "warm paper" theme (system preference plus a toggle). Why: §10's "late-night campus" brief.
- Agent A's bubbles are amber on the left and agent B's are coral on the right. Redactions render as a dashed red "hidden until a later level" span, and guard hits as solid red chips. Why: §10.4 asks that blocked items read at a glance.
- The watch page works in two views. Without `?as=` it's a judge view showing both names and both verdicts. With `?as=<id>` (linked from a student's inbox), the other side is "Their agent" and their verdict panel says it stays private. Why: verdicts are private to each student (§1, §6.2).
- The hub's "who can meet whom" view is a 10×10 matrix: ♥ matched, a vibe % for passed pairs, × for blocked with the reason in the tooltip. Below it are near-misses (blocked by something other than orientation) and one-way orientation examples. Why: §10.6 asks for "grid/graph" plus block reasons, and a matrix reads instantly for judges and fits at 375px.
- The hub API exposes filters (gender, who they want to meet, age range, intent) because it's the hub's own god view for judges. It never exposes schedules, budgets, contact info or hub-log originals. Why: §10.6, and data minimization.
- The landing page's `.edu` gate is a client-side regex (`@….edu`) that forwards to `/onboard?email=…`, and the API re-validates on save. Why: §10.1 says to describe .edu SSO as "coming soon".
- The persona switcher lives in the header on every page (plus a grid on the landing page). It stores the choice in localStorage (try/catch), and `?as=` in a URL wins. Why: demo flow "YES as two personas".
- Added `GET /api/hub` and `GET /api/students` (not in §11). Why: the hub view and the persona switcher need them, and neither exposes private fields.
- Added `scripts/screenshots.ts` (`npm run shots`) driving the locally installed Edge/Chrome through `playwright-core` (no browser download). It flags horizontal overflow and console errors at 375px and 1280px. Why: this is how the §12 mobile check was verified overnight.

## Places
- Places carry a `foodOk` list, a `servesFood` flag, opening hours and optional `days`. Why: the negotiator must validate diet, budget and time in code (§7.5).
