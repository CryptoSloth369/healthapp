# 2026-11-15 to 2026-11-19: Back-calculated intake, energy model, Money (steps 13–14)

**Asked for:** estimate what was eaten on unlogged days from weight changes (logged vs estimated always distinguishable), give the coach that data, make the calculation one stored algorithm that reruns itself, then start the Money area: connected bank/investment/loan accounts, net worth, credit card spending by category, family sharing with separate logins, coach access and a YNAB-style budget.

## Done
- **Back-calculated intake** and a Deficit & surplus card on Trends: unlogged days estimated from the weight trend; solid = logged, hatched = estimated, `≈` marks estimates (`d9c0b5d`).
- **Coach** tool `get_intake_estimates` (`a3d5350`).
- **Energy model (step 12):** one algorithm that calibrates personal burn from well-logged weeks (replaced adaptive TDEE), flags partial days (< 40% of burn), rates each estimate's confidence, handles 3–6 day histories, keeps a running total since the first weigh-in. Results stored (`energy_day`, `energy_run`, `energy_state`); reruns after saves, on read when stale, and from a Recalculate button (`e933025`). Migration `0006`.
- Dashboard no longer fails when the model can't run; it shows the reason (`788e02d`, `b17bc9b`).
- **Money step 13:** Health / Money switch; families with invite-only sign-up (Supabase "Before User Created" hook); Plaid connect by type (bank/card, investments, loans); manual accounts; per-account sharing; net worth with daily snapshots (`8c9cf82`). Migration `0007`.
- **Money step 14:** card transactions via Transactions Sync, categories (Plaid → ours, family rules, per-transaction override), Spending tab with a donut and ranked list (`57045f5`). Migration `0010`.
- FINANCE_TOKEN_KEY checked before Plaid opens; tolerant of stray spaces/quotes; clearer error (`676b79c`, `4efda67`).
- Session-log protocol (this folder).

## Decisions
- Estimates are computed and stored, never mixed with logged numbers; past estimates update on each run and the previous run's summary is kept (DECISIONS #19).
- No nightly job: pg_cron has no user session and the app has no service-role key, so reruns happen after saves and on read.
- Plaid (only option covering student loans and investment holdings); one Plaid product per connection type to keep fees down (#21).
- Invite-only sign-up, enforced inside Supabase (#22); money shared per account, health never shared (#23); no Plaid webhooks (#24).
- Health / Money top switch instead of a seventh tab (#20).

## Owner actions
- Ran migrations `0006`, `0007`, `0010` in Supabase (plus `0008`/`0009` from the parallel dream-journal session).
- Re-ran `0006` after a first attempt hadn't applied; used `notify pgrst, 'reload schema'` checks.
- Created a Plaid account; set `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `FINANCE_TOKEN_KEY` (generated locally), `PLAID_REDIRECT_URI` in Vercel. Verified sandbox, then switched to production on Plaid's free trial (20 connections) and connected a real bank.

## Problems and fixes
- Dashboard 500 after deploying the energy model: migration `0006` hadn't actually been applied (tables missing from Supabase's schema cache, PGRST205). Fixed by running it; the page now degrades gracefully and names the failing step.
- Spending migration collided with the dream journal's `0008`; renumbered to `0010` and rebased.
- `FINANCE_TOKEN_KEY` was first saved with an invalid value (copy/paste); key parsing made tolerant and the error made specific. A failed connect could leave an orphaned Plaid connection; the key is now checked first.
- Preview builds on Vercel fail because Supabase env vars aren't enabled for the Preview environment (not a code issue; tick "Preview" in Vercel).

## Open / next
- **Step 15:** coach access to money (see HANDOFF → Next up). **Step 16:** YNAB budget, migration `0011`.
- Enable the sign-up hook before allowing sign-ups and inviting family.
- Verify in real use: an OAuth bank (Chase etc.), an investments connection, a loans connection (the Plaid free trial may not include those products).
