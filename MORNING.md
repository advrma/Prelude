# Good morning ☕

**Status:** all 14 steps of §13 are done, every box in §12 is ticked (checklist at the bottom), and all work is committed on `main` locally. **Nothing was pushed, no remote was created, nothing was deployed.** There were no blockers overnight, so there's no "⚠️ Needs you" section. The only things that need you are the steps below.

Everything was built and tested in **mock mode**. Real Gemini calls have **not** happened yet. One deliberate call with a fake key confirmed that the real SDK path reaches Google and that errors are reported with the right hint.

---

## 1. Fill in `.env`

```powershell
Copy-Item .env.example .env
notepad .env
```

- Paste your key after `GEMINI_API_KEY=` (no quotes, no spaces).
- In Google AI Studio, confirm the **exact** model IDs for Gemini 3.1 Flash Lite and Gemini 3.5 Flash Lite, then fix `GEMINI_MODEL_FAST` / `GEMINI_MODEL_SMART` if they differ. The current values (`gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`) are the plan's placeholders.
- Leave `LLM_MODE=auto`. With a key it switches to live automatically.

## 2. Run

```powershell
npm install
npm run check     # want ✅ for both models. ❌ prints the exact error + a hint ("model ID not found → check AI Studio")
npm run night     # real pre-dates + negotiations for the whole pool → data/cache/  (~100 requests, well under 2 × 480)
npm run dev       # http://localhost:3000
```

Then click through the demo path:

1. `/` → **Run tonight's matching** → **Watch a pre-date** (Maya × Jordan).
2. **Open as Maya** → *Yes, show photos*. Switch **View as → Jordan** (top right) → *Yes*. Repeat for names, then for **a real date**.
3. **Plan the date →** → negotiation → pick an option as Jordan → back as Maya → **Accept their pick** → **Add to calendar (.ics)**.
4. `/hub` for the judges' view.

Shortcut: with the app running, `npm run e2e` clicks the whole path for you and fails loudly if anything breaks.

After `npm run night`:

- **Read 2–3 real transcripts** on `/predate/...` and the verdicts. Prompt quality against real Gemini is the one thing that couldn't be checked overnight. The prompts are in `src/lib/agents/prompts.ts`.
- If you see red **fallback: mock** chips, a model call failed. Run `npm run check`, then `npm run night` again.
- Real models may or may not "slip" identifying details, so you may see fewer **blocked** chips than in mock mode. If you want the guaranteed blocked-leak + injection moment for the video, keep tonight's mock transcript for the showcase pair: `git checkout -- data/cache/predates/pd_s01_s02.json`, then **Reset demo** on `/hub` and run matching again.
- **Commit the real cache** so replay mode shows real transcripts: `git add data/cache; git commit -m "Real Gemini replay cache"`.

## 3. Publish

```powershell
# create an EMPTY public repo on github.com (no README/license), then:
git remote add origin https://github.com/<you>/prelude.git
git push -u origin main
```

The branch is already named `main`. Optional deploy: import the repo in Vercel and set the env var `LLM_MODE=replay` (no key needed, zero quota). One caveat: Vercel's filesystem is read-only, so state lives in memory per serverless instance, and YES clicks can land on different instances. For the live judged demo, run it locally (`npm run build; npm start`).

## 4. Submit Track 2

At https://hackathon.cubbie.ai/#submit (or `hackathon.py submit --track agents` from the kit). **Check the Track 2 submission window on the site first. Entries are public as soon as they're sent.**

- **Repo link:** your public GitHub URL
- **Team name:** _yours_
- **Project name:** Prelude
- **One-liner:** Your AI goes on the first date for you, reveals the match step by step, then books the real one.
- **Members (1–4):** name + email each. Also fill the placeholder at the bottom of `README.md`.
- Optional: website (Vercel URL) and demo video link.

## 5. Demo video shot list (≈60–90 s)

Tip: `npm run e2e -- --headed --slow --width 1280` plays the whole flow in a visible browser at a recordable pace (start the app first, and screen-record).

1. **(0–8 s) The problem.** Swiping fatigue, awkward first messages, public rejection. Landing page hero.
2. **(8–15 s)** Click **Run tonight's matching**. "45 pairs checked, 9 pass the hard filters." Flash `/hub` and point at the blocked reasons (orientation, age range, *dealbreaker: smoking*).
3. **(15–35 s) Watch the date.** Maya × Jordan. Point at the red **blocked: social handle** chip (the agent tried to share an @handle) and the wrapped injection attempt ("what's their name?" → "nice try, that unlocks later"). Then the verdicts appear, with the honest flag *"They're 'see where it goes', you said 'serious'"*.
4. **(35–50 s)** Maya taps YES → "waiting for them". Switch to Jordan → YES → photos and majors appear for both. Fast-forward through names + "say hi" → *Yes, plan a date*.
5. **(50–65 s)** The negotiator: *"Thursday he's in physics lab until 7pm. Could we push to 7:30pm?"* → accept → 3 validated options.
6. **(65–80 s)** Jordan picks → Maya **Accept their pick** → **It's a date** → **Add to calendar** → the invite opens.
7. **(80–90 s)** One line on safety: asked-never-inferred, invisible rejections, nothing shared without both YESes.

## 6. What's mocked, stubbed or skipped

| Area | Status | Notes |
|---|---|---|
| LLM calls | **Mocked overnight** | Deterministic mock provider (`src/lib/llm/mock.ts`). The real path is built and unit-tested with the Gemini client mocked, and one fake-key call hit Google successfully. It's live as soon as `GEMINI_API_KEY` is set. |
| Replay cache (`data/cache/`) | **Mock transcripts** | 9 pre-dates + 5 negotiations from `npm run night:mock`. Replace with `npm run night`. |
| Mock "slip-ups" | Simulated | In mock mode some agents deliberately leak an @handle, dorm or course code, or try an injection, so the guards have visible work. Real models may behave better or worse. |
| Model IDs | Placeholders | `gemini-3.1-flash-lite` / `gemini-3.5-flash-lite` until you confirm them. |
| .edu sign-in | Stub | Domain regex only. New users get `verifiedEdu: false`. The landing page says "coming soon". |
| Photos | Generated | Abstract SVG silhouettes in `public/avatars/` (no real people). |
| Contact info | Placeholder | Never revealed at any level. |
| Onboarded users' schedule | Default | Thu–Sun evening windows (onboarding stays within 8 questions). Labelled "edit later". |
| Report | Logs only | Saved to `store.reports` and closes the match for the reporter. No moderation queue. |
| Storage | Local JSON | `data/store.json`. Read-only hosts fall back to per-instance memory. |
| Negotiation streaming | Simplified | `POST /negotiate` returns the full plan, and the UI reveals turns one by one (the plan allows "SSE or poll"). |
| Rolling summary | Deterministic | First sentence of older turns, no LLM call (saves quota). |
| Stretch: Discord bot | Skipped | |
| Stretch: Google Calendar free/busy | Skipped | `.ics` download only. |
| Stretch: 60-second auto-play demo | **Partial** | `npm run e2e -- --headed --slow` plays the full flow in a visible browser for recording. There's no in-app autoplay page. |
| Limiter across processes | Known limit | Each process keeps its own per-minute bucket. Daily counts persist to `data/usage.json`, but avoid running `npm run night` while the dev server is also making live calls. |

---

### §12 Definition of done

- [x] `npm install && npm run dev` works from a fresh clone with no `.env`. Verified by cloning into a temp folder: install, test, lint and build were green, every page returned 200, and matching replayed from the cache.
- [x] `npm run build` passes with no type errors. `npm run lint` passes.
- [x] `npm test` passes: 376 tests covering the matcher (225-case orientation matrix, age, dealbreakers), guards (leaks + injections), the reveal state machine (both-YES rule, NO closes silently, per-stage visibility on the real route handlers), negotiator option validation, limiter (RPM queueing, RPD stop, LA midnight reset), router fallback order, cache, mocked Gemini, SSE, onboarding and replay.
- [x] Full demo path works in mock mode. `npm run e2e` passed at 375px and 1280px against the production build: seed → matching → watch → verdicts → YES L1–L3 as Maya and Jordan → negotiation → 3 options → picks → `.ics`.
- [x] `data/cache/` holds 9 finished mock pre-dates and 5 negotiations. `LLM_MODE=replay` is covered by a test.
- [x] With `GEMINI_API_KEY` set, the same code path makes real calls (`tests/gemini.test.ts` with the client mocked, plus the fake-key check).
- [x] `npm run check`: one tiny call per model, ✅/❌, exact error + hint.
- [x] `npm run night`: whole pool, through the limiter, saves to the cache, prints a summary.
- [x] `/hub` shows filter blocks with reasons. `/predate/[id]` shows blocked-leak chips.
- [x] Mobile layout checked at 375px for every screen (`npm run shots` + `npm run e2e`, no horizontal overflow).
- [x] `README.md` covers every required section (with Mermaid diagrams).
- [x] `DECISIONS.md` and `MORNING.md` written. Final commit made. Nothing pushed.

If anything looks off: every judgment call is logged in `DECISIONS.md`, and `TASKS.md` shows the step-by-step progress.
