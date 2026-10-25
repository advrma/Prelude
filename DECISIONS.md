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
