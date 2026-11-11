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
    login/                    sign-in page; actions: signIn, signOut, changePassword
    (app)/                    signed-in area with the bottom tab bar
      layout.tsx              TimezoneSync + tab bar
      page.tsx                Today: weigh-in, calories, exercise, mood
      food/                   day view, add (quick picks, DB search, barcode, manual), edit, photo/
      exercise/               session list, new/[id] workout form, templates/
      weight/                 log, chart, history
      mood/                   check-in form, heatmap, history; journal/ (entries, dictation)
      dashboard/              Trends (page.tsx loads data; dashboard-view.tsx renders)
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
    analytics.ts              daily totals, adherence, adaptive TDEE, weekly rows
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
supabase/migrations/          0001…0005, applied in order
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
| `journal_entry` | journal | written_on (local day), written_at, updated_at, body (1–20,000 chars); several per day allowed |
| `push_subscription` | devices for push | endpoint unique |
| `reminder_pref` | reminder times | local times + timezone + `last_sent` per kind |
| `assistant_conversation`, `assistant_message` | coach history | messages store API content blocks verbatim (`seq` order) |

Storage: private bucket `meal-photos`, path `<user_id>/<day>/<uuid>.jpg`, shown via signed URLs.
DB function: `public.due_reminders()` (security definer; only the DB owner can execute it).

## Key flows

**Auth.** Email and password through Supabase. `proxy.ts` refreshes the session cookie on every request and redirects to `/login` unless the path is in `PUBLIC_PATHS` (`/login`, `/api/reminders`). Server code checks `getUserId()` (`getClaims`) again.

**"Today".** `TimezoneSync` writes the phone's IANA zone to a `tz` cookie. `todayLocal()` formats now() in that zone. All per-day queries use it.

**Calorie target** (`tdee.ts`). Mifflin–St Jeor BMR × activity multiplier = TDEE. Goal pace = (goal − current) / weeks, capped at 1% of body weight per week for loss and 0.5% for gain. The adjustment is about 3,500 kcal per lb, with a floor of 1,500 kcal (male) or 1,200 (female). Macros: protein 0.8 g/lb of goal weight, fat 25%, carbs the rest. The manual override replaces the kcal (macros rescaled). **Daily budget = target + logged exercise kcal.** The estimated deficit is maintenance (formula TDEE) + exercise − eaten.

**Weight trend** (`trend.ts`). EWMA at 10% per day, gap-aware. The weekly rate is a least-squares slope of the trend over 14 days.

**Adaptive TDEE** (`analytics.ts`). Over the last 28 complete days: average intake − (trend change × 3,500 / days). It needs 70% of days logged and weigh-ins near both ends. The dashboard can apply a suggested target from it.

**Exercise calories** (`exercise.ts`). The entered value wins. Otherwise MET × kg × hours, using the latest weigh-in on or before the workout date. Walking and running use the ACSM speed equations when miles are given.

**Photo estimator.** The phone resizes to 1280 px JPEG, then a server action calls Claude (`beta.messages.parse` with a Zod schema), normalizes the result, and shows an editable review. On save, the photo is uploaded to Storage and the entries get `source=photo`.

**Food search / barcode.** Server actions call USDA (`USDA_API_KEY` or DEMO_KEY) and Open Food Facts. `food-db.ts` parses responses into one shape. The client scanner uses ZXing (`@zxing/browser`) with photo and typed-number fallbacks.

**AI coach** (`lib/assistant`). `/api/assistant` → `runAgent()`:
1. Load the conversation and append the user message.
2. Stream a Claude request with tools, adaptive thinking (`display: "updates"` → status lines), explicit effort, prompt caching, and `fallbacks: "default"`.
3. Store the assistant content (fallback-sanitized), run the tools (Zod-validated, scoped to the user via RLS), store the `tool_result`s, and loop (max 10 rounds).
4. Events stream to the client as NDJSON: `conversation`, `status`, `text`, `proposal`, `error`, `done`.
5. `propose_*` tools only render cards. The writes happen in `coach/actions.ts` when the user taps.

**Journal dictation.** `DictationButton` uses the browser's speech recognition (`SpeechRecognition` / `webkitSpeechRecognition`, on-device or Apple's servers; no API key). Results are written live into the textarea after the existing text; `joinSegments` de-duplicates iOS's repeated segments, and recognition restarts after Safari's pause timeout until Stop is tapped. Typing stops it. Without speech recognition the form shows the keyboard-mic tip. Unsaved new entries are kept in `localStorage` (`journal-draft`). The coach reads entries with `get_journal` (max 60 days, entries over 4,000 chars shortened).

**Reminders.** pg_cron runs every 15 minutes. `due_reminders()` returns the due, not-yet-logged reminders (each at most once per day, within 2 h of its time) and marks them handled. `net.http_post` sends them to `/api/reminders` (Bearer `CRON_SECRET`), which sends web pushes with VAPID keys. The service worker shows the notification and opens the matching screen when tapped.

**Offline.** `next.config` `experimental.useOffline` retries pending navigations and server actions on reconnect, and the banner shows while offline. `sw.js` caches hashed assets (cache-first) and visited pages (network-first, `/login` excluded), falling back to `offline.html`. Sign-out clears the page cache.

## Security notes
- Only the Supabase publishable key reaches the browser. All data access is RLS-scoped to the user's session. There is no service-role key anywhere.
- Secrets (Anthropic, USDA, VAPID private key, cron secret) are server-only env vars.
- `/api/reminders` is public but requires the cron secret (timing-safe compare) and only sends to `https://` endpoints the DB returned.
- CSV export prefixes formula-like cells. The coach's tool date ranges are capped.
- Security headers come from `next.config.ts`. The service worker is served with no-cache headers.
