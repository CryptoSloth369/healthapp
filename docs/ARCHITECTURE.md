# Architecture

How the app works today. For *why*, see [`DECISIONS.md`](DECISIONS.md).

## System overview
```
 iPhone (home-screen PWA) / browser
   │  Next.js pages (server components) + client components
   │  service worker public/sw.js: offline page copies, push notifications
   ▼
 Vercel: Next.js 16 app
   ├─ src/proxy.ts ............ refresh Supabase session, redirect signed-out → /login
   ├─ server components ....... read data via Supabase (user session → RLS)
   ├─ server actions .......... all writes (validated, then revalidatePath)
   ├─ /api/assistant .......... AI coach, streams NDJSON
   ├─ /api/reminders .......... called by pg_cron, sends web push
   └─ /api/export/[dataset] ... CSV / JSON downloads
   │
   ├──► Supabase: Postgres (RLS on every table), Auth (email+password),
   │              Storage bucket meal-photos, pg_cron + pg_net (reminders)
   ├──► Claude API: photo estimator (structured output), coach (tool loop)
   ├──► USDA FoodData Central: food search, barcode fallback
   └──► Open Food Facts: barcode lookup
```

## Code map
```
src/
  proxy.ts                    session refresh + auth gate (Next 16 "proxy" = middleware)
  app/
    layout.tsx                root: metadata/viewport, offline banner, service worker registration
    manifest.ts               PWA manifest
    login/                    sign-in page (returns to ?next=); actions: signIn, signOut, changePassword
    signup/, join/            invite-only sign-up; accept an invite when already signed in
    auth/callback/            finishes email confirmation (code or token_hash)
    (app)/                    signed-in area: Health / Money switch on top, per-area bottom tabs
      layout.tsx              TimezoneSync + area switch + tab bar
      page.tsx                Today: weigh-in, calories, exercise, mood
      food/                   day view, add (quick picks, DB search, barcode, manual), edit, photo/
      exercise/               session list, new/[id] workout form, templates/
      weight/                 log, chart, history
      mood/                   check-in form, heatmap, history; journal/ (entries, dictation; `journal-screen.tsx` is shared with dreams/)
      dashboard/              Trends (page.tsx loads data; dashboard-view.tsx renders)
      money/                  Money area: overview (net worth), accounts/, family/, oauth/ (Plaid OAuth return); actions.ts
      coach/                  chat UI, proposal cards, actions (apply/save/delete)
      profile/                stats/goal form, reminders, export, password, sign out
    api/assistant/route.ts    coach endpoint (NDJSON stream)
    api/reminders/route.ts    push delivery for the cron job (Bearer CRON_SECRET)
    api/export/[dataset]/     CSV per dataset, "all" = JSON backup
  components/                 shared UI: charts, forms, cards, scanner, markdown, meter
  lib/
    supabase/                 browser/server/proxy clients; env (URL reduced to origin)
    today.ts, dates.ts        local-day handling
    tdee.ts                   BMR, TDEE, goal-based target, macros
    trend.ts                  weight EWMA trend, weekly rate
    analytics.ts              daily totals, adherence, weekly rows
    energy-balance.ts         the energy model: personal burn, partial days, gap filling, confidence, running total
    energy-store.ts           energy model rows ↔ days, changed-row diff, per-run summary
    energy-data.ts            runs the model and stores it; staleness check; after-save rerun
    finance.ts                account kinds, totals, net worth series, money formatting
    finance-sync.ts           Plaid account → row, sync due check
    plaid.ts                  Plaid API client (fetch + Zod), link tokens, accounts, item removal
    money-data.ts             money loaders, sync, connect/disconnect (server-only)
    family-data.ts            family, members, invites (server-only)
    secret-box.ts             AES-256-GCM sealing of Plaid tokens; invite tokens and hashes
    supabase/read-all.ts      paged reads past Supabase's 1,000-row cap; descriptive DB errors
    nutrition.ts              meals, totals, per-serving scaling
    exercise.ts               activities/MET, calorie estimate, volume, e1RM, lift history
    mood.ts                   daily mood, sleep/calorie/exercise splits, tag stats
    journal.ts                text cleanup, dictation joining, paging by day
    food-db.ts                USDA/Open Food Facts parsing, barcodes, form drafts
    csv.ts                    CSV writer (formula-injection safe)
    photo-estimate*.ts        Claude vision call + Zod schema
    assistant/                coach tools, agent loop, display mapping, history
    push.ts, reminders.ts     web push (VAPID) and reminder prefs
    profile.ts, food.ts, weight.ts, exercise-data.ts, mood-data.ts, journal-data.ts   data loaders
public/sw.js, offline.html    service worker and offline fallback
supabase/migrations/          0001…0007, applied in order
supabase/reminders-schedule.sql   pg_cron template (fill in URL + secret, don't commit)
```

## Data model
Every user table has `user_id uuid default auth.uid()` and RLS `user_id = auth.uid()`. Days are stored as local `date` columns (`*_on`) next to `timestamptz` (`*_at`).

| Table | Purpose | Notes |
|---|---|---|
| `profile` | one row per user | sex, birth_date, height_in, activity_level, goal_weight_lb, goal_date, kcal_target_override. Created by trigger on signup. |
| `weight_entry` | weigh-ins | unique (user, measured_on): one per day, upserted |
| `food_entry` | food log | totals already × servings; `source` manual/saved/photo/barcode/search; `photo_path`, `ai_confidence` |
| `saved_food` | "My foods" | per-serving values; `use_count`/`last_used_at` order the quick picks |
| `exercise_entry` | workouts | activity, duration_min, distance_mi, kcal_burned, kcal_estimated, template_id |
| `exercise_set` | lifting sets | entry_id (cascade), position, exercise, weight_lb (null = bodyweight), reps |
| `workout_template`, `template_exercise` | templates | exercises with sets/reps/weight |
| `mood_entry` | check-ins | mood/energy/stress 1–5, sleep_hours, tags[], note; several per day allowed |
| `journal_entry` | journal | kind (`journal` or `dream`, from `0008`), written_on (local day; for dreams, the morning you woke), written_at, updated_at, body (1–20,000 chars); several per day allowed |
| `energy_day` | energy model output | one row per day: intake, logged kcal, source (logged/partial/estimated), confidence, burn, balance, running total, trend, window. Rewritten by each run (changed rows only) |
| `energy_run` | energy model runs | ran_at, trigger (manual/auto/stale), model_version, `result` jsonb (calibration, burn now, running total, all-time and 28-day summaries). Last 30 kept |
| `energy_state` | "needs rerun" flag | one row per user; set by triggers on food/weight/exercise/profile body-stat changes |
| `household`, `household_member` | families | one family per person (`user_id` unique); role owner/member. Joining/leaving/removing go through security-definer functions that move a person's own accounts with them |
| `household_invite` | invite links | SHA-256 `token_hash` only; 7-day expiry; `reserved_for` set by the sign-up hook, `used_by` by the after-insert trigger |
| `fin_item` | Plaid connections | `access_token_enc` (AES-GCM, app-side key), products, status (ok/login_required/error), `txn_cursor` for step 14. Family members can read/sync; owner adds/removes |
| `fin_account` | accounts | Plaid or manual; `kind` cash/investment/retirement/credit/loan/other_asset/other_liability; balance positive for both assets and debts; `shared` (family can see), `hidden` (left out of totals). Visible to owner, or to family when shared |
| `fin_balance` | daily balances | (account_id, day) → balance; visibility follows the account |
| `push_subscription` | devices for push | endpoint unique |
| `reminder_pref` | reminder times | local times + timezone + `last_sent` per kind |
| `assistant_conversation`, `assistant_message` | coach history | messages store API content blocks verbatim (`seq` order) |

Storage: private bucket `meal-photos`, path `<user_id>/<day>/<uuid>.jpg`, shown via signed URLs.
DB functions: `public.due_reminders()` (security definer; only the DB owner can execute it); `food_kcal_by_day()` and `exercise_kcal_by_day()` (invoker, RLS applies) give daily totals to the energy model; `mark_energy_dirty()` is the trigger behind `energy_state`.

## Key flows

**Auth.** Email and password through Supabase. `proxy.ts` refreshes the session cookie on every request and redirects to `/login` unless the path is in `PUBLIC_PATHS` (`/login`, `/api/reminders`). Server code checks `getUserId()` (`getClaims`) again.

**"Today".** `TimezoneSync` writes the phone's IANA zone to a `tz` cookie. `todayLocal()` formats now() in that zone. All per-day queries use it.

**Calorie target** (`tdee.ts`). Mifflin–St Jeor BMR × activity multiplier = TDEE. Goal pace = (goal − current) / weeks, capped at 1% of body weight per week for loss and 0.5% for gain. The adjustment is about 3,500 kcal per lb, with a floor of 1,500 kcal (male) or 1,200 (female). Macros: protein 0.8 g/lb of goal weight, fat 25%, carbs the rest. The manual override replaces the kcal (macros rescaled). **Daily budget = target + logged exercise kcal.** The estimated deficit is maintenance (formula TDEE) + exercise − eaten.

**Weight trend** (`trend.ts`). EWMA at 10% per day, gap-aware. The weekly rate is a least-squares slope of the trend over 14 days.


**Energy model** (`energy-balance.ts` → `runEnergyModel`). One algorithm for intake, burn and balance, run over all history and stored.
1. Burn per day = formula maintenance at that day's trend weight (interpolated between weigh-ins) + logged exercise.
2. A logged day under 40% of that burn is `partial`: the logged kcal is kept as a minimum and the rest estimated.
3. *Personal burn:* weigh-in windows (≥ 7 days; a weigh-in on day D covers food through D − 1) with ≥ 70% fully logged days measure the formula's error (avg logged intake × days − trend change × 3,500 − formula burn). The day-weighted average over the last 90 days, needing ≥ 14 such days and capped at ±1,000, is added to every day's burn. This replaced the separate adaptive TDEE.
4. *Gaps:* per window, food eaten = Σ burn + trend change × 3,500. Logged days keep their kcal; the rest is spread evenly over unlogged and partial days (never below a partial day's logged kcal, never below 0). Confidence: high (≤ 14 days, ≥ 4 weigh-ins), medium, low (> 28 days, or a 3–6 day history, which gets one short window instead of nothing).
5. Running total of the balance from the first weigh-in, compared with the actual trend change.

**Running it** (`energy-data.ts`). `recalculateEnergy()` loads weights (paged), daily food/exercise totals (SQL functions), and the stored rows; runs the model; upserts only changed `energy_day` rows; inserts an `energy_run` (pruned to 30); clears `energy_state.dirty` only if it didn't change mid-run. It runs (a) from the dashboard's **Recalculate** button, (b) after every food/weight/workout/profile save via `after()` (skipped when already fresh), and (c) from `ensureFreshEnergy()` before the dashboard or coach reads, when dirty, a new day has finished, or `MODEL_VERSION` went up. No nightly job: pg_cron has no user session, and the app has no service-role key. Screens read `energy_day`; in charts logged kcal are solid and estimated kcal hatched, and `≈` marks text values that include estimates. The coach reads the same data with `get_energy_balance` (headline numbers, previous run) and `get_intake_estimates` (days/weeks, max 400 days).

**Money and families.** Health data is per user; money is per family (`household`). Every person gets a family on first use (`ensure_household()`). New people sign up only with an invite link: `/join?invite=…` → `/signup`, which calls `auth.signUp` with the token in user metadata. The Supabase "Before User Created" hook `hook_require_invite` rejects sign-ups without a valid token and reserves the invite; the `on_auth_user_joined_family` trigger then marks it used, adds the person to the family and copies their name into the profile. People who already have an account accept with `accept_invite()` (allowed only if they're alone in their current family). Leaving or being removed creates a new family for that person; their own accounts and connections move with them.

**Plaid** (`plaid.ts`, `money-data.ts`). Connect buttons request one product each, so each connection is billed only for what it needs: bank/card = Transactions (with 730 days of history requested at link time), investments = Investments, loans = Liabilities. Link runs in the browser (`components/plaid-link.tsx`, Plaid's script loaded on demand); the public token is exchanged on the server and the access token stored sealed with `FINANCE_TOKEN_KEY`. OAuth banks return to `/money/oauth`, which resumes Link from the token saved in `localStorage`. Sync = `/accounts/get` (cached balances, no per-call balance fee) → update accounts (keeping your names and settings) → upsert today's `fin_balance`. It runs when the Money overview loads (connections older than 6 hours) and from **Sync**; no webhooks, because the app has no service-role key. Errors are stored on the connection; `ITEM_LOGIN_REQUIRED` shows a **Reconnect** button (Link update mode). Disconnecting checks ownership first, calls `/item/remove` (stops billing), then deletes the connection and its accounts.

**Net worth** (`finance.ts`). Assets (cash, liquid investments, retirement/tax-advantaged, other assets) − debts (cards, loans, other debts), skipping hidden accounts. The chart carries each account's last known balance forward across days.

**Exercise calories** (`exercise.ts`). The entered value wins. Otherwise MET × kg × hours, using the latest weigh-in on or before the workout date. Walking and running use the ACSM speed equations when miles are given.

**Photo estimator.** The phone resizes to 1280 px JPEG, then a server action calls Claude (`beta.messages.parse` with a Zod schema), normalizes the result, and shows an editable review. On save, the photo is uploaded to Storage and the entries get `source=photo`.

**Food search / barcode.** Server actions call USDA (`USDA_API_KEY` or DEMO_KEY) and Open Food Facts. `food-db.ts` parses responses into one shape. The client scanner uses ZXing (`@zxing/browser`) with photo and typed-number fallbacks.

**AI coach** (`lib/assistant`). `/api/assistant` → `runAgent()`:
1. Load the conversation and append the user message.
2. Stream a Claude request with tools, adaptive thinking (`display: "updates"` → status lines), explicit effort, prompt caching, and `fallbacks: "default"`.
3. Store the assistant content (fallback-sanitized), run the tools (Zod-validated, scoped to the user via RLS), store the `tool_result`s, and loop (max 10 rounds).
4. Events stream to the client as NDJSON: `conversation`, `status`, `text`, `proposal`, `error`, `done`.
5. `propose_*` tools only render cards. The writes happen in `coach/actions.ts` when the user taps.

**Journal dictation.** `DictationButton` uses the browser's speech recognition (`SpeechRecognition` / `webkitSpeechRecognition`, on-device or Apple's servers; no API key). Results are written live into the textarea after the existing text; `joinSegments` de-duplicates iOS's repeated segments, and recognition restarts after Safari's pause timeout until Stop is tapped. Typing stops it. Without speech recognition the form shows the keyboard-mic tip. Unsaved new entries are kept in `localStorage` (`journal-draft`, or `dream-draft` for dreams). **Dream journal** (Mood → Dreams, `/mood/dreams`) is the same screen and table with `kind = 'dream'`; per-kind copy and paths are in `JOURNAL_KINDS` (`src/lib/journal.ts`). The coach reads entries with `get_journal` (optional `kind` filter; max 60 days, entries over 4,000 chars shortened); `get_daily_summary` counts `journal_entries` and `dreams` separately. The journal export includes the `kind` column.

**Reminders.** pg_cron runs every 15 minutes. `due_reminders()` returns the due, not-yet-logged reminders (each at most once per day, within 2 h of its time) and marks them handled. `net.http_post` sends them to `/api/reminders` (Bearer `CRON_SECRET`), which sends web pushes with VAPID keys. The service worker shows the notification and opens the matching screen when tapped.

**Offline.** `next.config` `experimental.useOffline` retries pending navigations and server actions on reconnect, and the banner shows while offline. `sw.js` caches hashed assets (cache-first) and visited pages (network-first, `/login` excluded), falling back to `offline.html`. Sign-out clears the page cache.

## Security notes
- Only the Supabase publishable key reaches the browser. All data access is RLS-scoped to the user's session. There is no service-role key anywhere.
- Secrets (Anthropic, USDA, VAPID private key, cron secret, Plaid secret, `FINANCE_TOKEN_KEY`) are server-only env vars.
- Plaid access tokens are stored only sealed (AES-256-GCM) and never sent to the browser; the app has read-only Plaid products and cannot move money.
- Sign-up is invite-only, enforced inside Supabase by the before-user-created hook (direct API sign-ups are rejected too). Invite tokens are 256-bit and stored hashed.
- `/api/reminders` is public but requires the cron secret (timing-safe compare) and only sends to `https://` endpoints the DB returned.
- CSV export prefixes formula-like cells. The coach's tool date ranges are capped.
- Security headers come from `next.config.ts`. The service worker is served with no-cache headers.
