# Handoff: start here

The fastest way for a new person or AI agent to pick up this project. Read this, then [`CLAUDE.md`](../CLAUDE.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md).

_Last updated: 2026-11-19, after Money went live with a real bank (Plaid production)._

## Bigger picture
_Added 2026-11-15._ This health app is the **first part of a larger personal "life app"**. The owner's goal is one app that helps them optimize their life by automating between the physical world and their digital life, and that lets them control as much of their digital life as possible from one place. Which areas come next (and when) isn't decided yet; record them here once it is.

What this means for design decisions now:
- **Keep areas separate.** A new area (like the journal) is its own section with its own tables, loaders and coach tools, not mixed into the health screens. The assistant reaches each area through tools, which is how it would later cover other parts of life.
- **Keep the approval pattern.** The assistant suggests and the owner approves (`propose_*` tools and Apply cards). This matters more once the app acts on outside services (sending messages, paying, changing settings) and not just logging.
- **Keep data private and per-user.** Every table has row-level security, and there's no service-role key. Outside data coming in should use the secure design in [`ROADMAP.md`](ROADMAP.md#long-term-device-data-apple-health-wearables) (a `security definer` function with a per-user token).
- **Likely future building blocks** (not built): connections to outside services with securely stored keys, incoming events from those services, a history of every action taken on the owner's behalf (with undo where possible), and owner-defined "when X happens, do Y" rules with approval for anything risky.

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
| Dashboard (Trends) | Done |
| Back-calculated intake + deficit/surplus chart (logged vs. estimated kept separate) | Done, deployed 2026-11-15 (no migration) |
| Coach access to back-calculated intake (`get_intake_estimates`) | Done, deployed 2026-11-15 (no migration) |
| Energy model (step 12): one stored algorithm, personal burn, partial days, confidence, running total, Recalculate button + auto rerun | Done, deployed 2026-11-15 (migration `0006` applied) |
| Dream journal (Mood → Dreams): own `kind` on journal entries, dream tags, coach can filter by kind and sees tags, export includes both | Deployed; migrations `0008` and `0009` applied 2026-11-17 |
| Money step 13: Health / Money switch, families + invite-only sign-up, Plaid connect, manual accounts, net worth | Deployed 2026-11-16 (migration `0007` applied); Plaid **production** live 2026-11-18 (free trial, 20 connections; first real bank connected); sign-up hook not yet enabled (README → Setup step 5) |
| Money step 14: card transactions, categories + rules, spending donut | Deployed 2026-11-18 (migration `0010` applied) |
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

- [x] **Plaid end to end**: sandbox (2026-11-18) and a real bank in production (2026-11-18). Still to see in real use: an OAuth bank (Chase etc., via `/money/oauth`), an investments connection and a loans connection (the free trial may not include Investments/Liabilities; "Get full access" in the Plaid dashboard if Link says a product isn't enabled). The build sandbox can't reach Plaid.
- [ ] **Invite sign-up** end to end, including the confirmation email if "Confirm email" stays on.

## Production setup checklist (owner's account)
Tick as done. The full steps are in the [README](../README.md#setup-from-scratch).

- [ ] Supabase migrations run in order: `0001` · `0002` · `0003` · `0004` · `0005` · `0006` · `0007` · `0008` · `0009` · `0010`
- [ ] User created after `0001`
- [ ] Before User Created hook → `hook_require_invite` enabled, then sign-ups allowed (invite-only from then on)
- [ ] Vercel env: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `FINANCE_TOKEN_KEY` (+ `PLAID_REDIRECT_URI` for production)
- [ ] Vercel → Environment Variables: Supabase URL + key also ticked for **Preview** (otherwise branch preview builds fail)
- [ ] Vercel env: Supabase URL + publishable key
- [x] Vercel env: `ANTHROPIC_API_KEY` (and the Anthropic account has credits; with none, every Claude call fails with a 400)
- [ ] Vercel env: `USDA_API_KEY` (optional; otherwise DEMO_KEY rate limits)
- [ ] Reminders: VAPID keys + `CRON_SECRET` in Vercel; `pg_cron` + `pg_net` enabled; schedule SQL run
- [ ] Profile → Activity level set to "outside logged workouts" (avoids double-counting exercise)

## How we've been working
- **Session logs** in [`sessions/`](sessions/): one file per chat with what was done, decisions, owner actions and open items, so nothing is lost when a chat is deleted. Write or update yours after each deployed step.
- **One roadmap step at a time.** Each step is discussed, built, verified, then summarized for the owner.
- **Branches:** the work branch is pushed first. The owner then says "push to main", which is a fast-forward of `main` to the branch, and Vercel deploys it. Don't push to `main` without that go-ahead.
- **Database changes** are new numbered files in `supabase/migrations/`, never edits to old ones. The owner pastes them into the Supabase SQL Editor, so give them the SQL (or a link) in the summary.
- **Verification before claiming done:** `npm run check`, `npm run build`, migrations applied to a local Postgres, and screens rendered in Playwright with sample data. See [`DEVELOPMENT.md`](DEVELOPMENT.md).
- **Owner context:** iPhone user, imperial units (lb, ft/in, miles). Activities: weightlifting, swimming, walking/running, jiu-jitsu. Prefers clear step-by-step setup instructions with copyable SQL.

## Next up
**Money step 15: coach access to money** (see [`ROADMAP.md`](ROADMAP.md), "Next: Money"). Read-only coach tools for accounts and balances, net worth (with history), spending by category/merchant/month, and category rules; register them in `assistant/tools.ts`, `agent.ts` (TOOL_LABELS + a system-prompt line: money is per family and only what the person can see) and `assistant/display.ts`; test through `runTool` with mocked loaders like `tools-intake.test.ts`. No migration. Then **step 16: YNAB-style budget** (migration `0011`).

Working notes for the money area:
- Plaid env vars in Vercel: `PLAID_CLIENT_ID`, `PLAID_SECRET` (production), `PLAID_ENV=production`, `PLAID_REDIRECT_URI`, `FINANCE_TOKEN_KEY` (never change it; connected banks would need reconnecting).
- Plaid connections are limited (20 on the free trial); don't create test connections in production.
- Another session may also be working on `main` (the dream journal landed in parallel and took migrations `0008`/`0009`). Fetch and rebase before pushing, and check the next free migration number.
- Pushes to `main` only when the owner says so, including docs-only commits.

## Ideas for later
Candidates, in no particular order:
- Weekly coach review: an auto-generated summary each Sunday (could reuse the reminders schedule plus a coach run).
- Progress photos (private storage, side-by-side compare).
- Apple Health / wearable import and selling the app: researched and written up in [`ROADMAP.md`](ROADMAP.md) (long-term sections); not planned soon.
- Coach: per-message cost display, a "regenerate" button, and letting it log food from a description.
- Copy yesterday's meals; meal templates; water tracking.
- Units setting (kg) if ever needed. Storage is lb/in today.

## Starter prompt for a new AI session
Paste this into a new Claude Code (or other agent) session opened on this repo:

> This is my personal health + money app. Read `docs/HANDOFF.md`, then `CLAUDE.md`, `docs/ARCHITECTURE.md` and the latest file in `docs/sessions/`, and summarize where things stand in a few lines. Then I'll tell you what I want next. Work on a branch, run `npm run check` and `npm run build` before you say something is done, and ask me before pushing to `main`. If you add a database change, make it a new migration file (check the next free number on `main` first) and give me the SQL to paste into Supabase. Keep a session log in `docs/sessions/` as you go.
