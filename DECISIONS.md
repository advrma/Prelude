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
- Places carry a `foodOk` list, a `servesFood` flag, opening hours and optional `days`. Why: the negotiator must validate diet, budget and time in code (§7.5).
