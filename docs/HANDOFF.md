# Handoff: start here

The fastest way for a new person or AI agent to pick up this project. Read this, then [`CLAUDE.md`](../CLAUDE.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md).

_Last updated: 2026-11-11, after adding the journal._

## Where things stand
All ten planned steps are built and merged to `main`, which Vercel deploys to production. See [`ROADMAP.md`](ROADMAP.md).

| Area | Status |
|---|---|
| Login, profile, calorie target (BMR/TDEE + goal) | Done, used in production |
| Weight log + trend chart | Done |
| Food log, saved foods, photo estimate, USDA search, barcode scan | Done |
| Exercise log (lifting sets, cardio miles, templates), lift progress | Done |
| Mood tracker + insights | Done |
| Journal (Mood tab → Journal) with dictation; coach can read it | Done, deployed 2026-11-11 (migration `0005` applied) |
| Dashboard (Trends) incl. adaptive TDEE | Done |
| Offline mode + push reminders | Done |
| AI coach (chat over your data, approval-gated suggestions) | Done |
| CSV / JSON export | Done |

## What's verified, and what still needs a real-world check
Everything has unit tests (`npm test`) and was exercised in a headless iPhone-sized browser with sample data. These parts could **not** be tested from the build environment and need a first real use:

- [ ] **Photo estimator** against the real Claude API (needs `ANTHROPIC_API_KEY`).
- [x] **AI coach** with real answers. Works in production (first run failed with a 400 until the Anthropic account had credits).
- [ ] **USDA search / Open Food Facts barcode lookup**. Parsers were written against the documented formats; the build sandbox had no network access to them.
- [ ] **Push reminders on the iPhone**, end to end with the `pg_cron` schedule.
- [ ] **Barcode camera on the iPhone**. Tested in Chromium with a simulated camera and a decoded test image.
- [ ] **Exports** against real Supabase data.
- [x] **Journal dictation on the iPhone**, both in Safari and from the home-screen app. It uses the browser's speech recognition; Chromium was tested with a simulated recognizer. If the button says dictation isn't allowed, the keyboard mic still works. Confirmed working on the owner's iPhone 2026-11-11.

When one of these misbehaves, the useful evidence is a screenshot plus, for server issues, Vercel → Deployments → Functions logs. Claude API failures show Anthropic's reason in the app and log the status, request id and error body. For reminders, run the SQL checks in [`supabase/reminders-schedule.sql`](../supabase/reminders-schedule.sql).

## Production setup checklist (owner's account)
Tick as done. The full steps are in the [README](../README.md#setup-from-scratch).

- [ ] Supabase migrations run in order: `0001` · `0002` · `0003` · `0004` · `0005`
- [ ] User created after `0001`; public sign-ups disabled
- [ ] Vercel env: Supabase URL + publishable key
- [x] Vercel env: `ANTHROPIC_API_KEY` (and the Anthropic account has credits; with none, every Claude call fails with a 400)
- [ ] Vercel env: `USDA_API_KEY` (optional; otherwise DEMO_KEY rate limits)
- [ ] Reminders: VAPID keys + `CRON_SECRET` in Vercel; `pg_cron` + `pg_net` enabled; schedule SQL run
- [ ] Profile → Activity level set to "outside logged workouts" (avoids double-counting exercise)

## How we've been working
- **One roadmap step at a time.** Each step is discussed, built, verified, then summarized for the owner.
- **Branches:** the work branch is pushed first. The owner then says "push to main", which is a fast-forward of `main` to the branch, and Vercel deploys it. Don't push to `main` without that go-ahead.
- **Database changes** are new numbered files in `supabase/migrations/`, never edits to old ones. The owner pastes them into the Supabase SQL Editor, so give them the SQL (or a link) in the summary.
- **Verification before claiming done:** `npm run check`, `npm run build`, migrations applied to a local Postgres, and screens rendered in Playwright with sample data. See [`DEVELOPMENT.md`](DEVELOPMENT.md).
- **Owner context:** iPhone user, imperial units (lb, ft/in, miles). Activities: weightlifting, swimming, walking/running, jiu-jitsu. Prefers clear step-by-step setup instructions with copyable SQL.

## Ideas for next time
Nothing is in progress. Candidates, in no particular order:
- Weekly coach review: an auto-generated summary each Sunday (could reuse the reminders schedule plus a coach run).
- Progress photos (private storage, side-by-side compare).
- Apple Health import if the owner gets a tracker. That needs a native shell (Expo) or a manual export import.
- Coach: per-message cost display, a "regenerate" button, and letting it log food from a description.
- Copy yesterday's meals; meal templates; water tracking.
- Units setting (kg) if ever needed. Storage is lb/in today.

## Starter prompt for a new AI session
Paste this into a new Claude Code (or other agent) session opened on this repo:

> This is my personal health-tracking app. Read `docs/HANDOFF.md`, then `CLAUDE.md` and `docs/ARCHITECTURE.md`, and summarize where things stand in a few lines. Then I'll tell you what I want next. Work on a branch, run `npm run check` and `npm run build` before you say something is done, and ask me before pushing to `main`. If you add a database change, make it a new migration file and give me the SQL to paste into Supabase.
