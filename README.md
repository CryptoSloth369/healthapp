# Health

A personal calorie, weight, exercise and mood tracker. It works in the browser and installs on an iPhone home screen as a PWA.

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth, Storage) · Vercel hosting · Claude vision for photo calorie estimates (planned).

See [`docs/PLAN.md`](docs/PLAN.md) for the architecture and roadmap.

## One-time setup

### 1. Supabase (database + login)
1. Create a free project at <https://supabase.com/dashboard>. Save the database password somewhere safe.
2. **Create the tables:** open **SQL Editor → New query**, paste all of
   [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql), and click **Run**.
   Then do the same for each later file in `supabase/migrations/`, in order (`0002_exercise.sql`, …). Run each file once.
3. **Create your login:** go to **Authentication → Users → Add user → Create new user**, enter your
   email and a password, and tick **Auto Confirm User**.
4. **Turn off public sign-ups** so nobody else can make an account: **Authentication → Sign In / Providers**,
   turn off **Allow new users to sign up**.
5. **Copy the keys:** go to **Project Settings → API Keys** (the project URL is under **Data API**) and note the
   **Project URL** and the **Publishable key**.

### 2. Run it locally (optional)
```bash
cp .env.example .env.local   # then paste the URL and publishable key
npm install
npm run dev                  # http://localhost:3000
```

### 3. Deploy to Vercel
1. At <https://vercel.com/new>, import this GitHub repo.
2. Add the environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Click Deploy. You'll get a URL like `https://healthapp-xxx.vercel.app`.

### 4. Photo estimator and AI coach (optional)
1. Create an API key at <https://platform.claude.com/settings/keys> (add billing credit first).
2. In Vercel, add `ANTHROPIC_API_KEY` as a **Secret** environment variable, then redeploy.
Each photo costs roughly 2–5 cents; each coach question roughly 2–10 cents.
3. For the coach, also run [`supabase/migrations/0004_assistant.sql`](supabase/migrations/0004_assistant.sql) in the SQL Editor.

### Food database search (optional but recommended)
Search works out of the box with USDA's shared `DEMO_KEY`, which is heavily rate-limited. Get a free personal key at
<https://fdc.nal.usda.gov/api-key-signup> (instant, email only) and add it in Vercel as `USDA_API_KEY` (Secret), then redeploy.
Barcode lookups use Open Food Facts (no key) and fall back to USDA.

### 5. Reminders (optional)
1. Run [`supabase/migrations/0003_reminders.sql`](supabase/migrations/0003_reminders.sql) in the SQL Editor if you haven't.
2. In the app, open **Profile → Reminders: one-time setup → Generate keys**. Add the three values to Vercel
   (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` as Config; `VAPID_PRIVATE_KEY` and `CRON_SECRET` as Secrets), then redeploy.
3. In Supabase, **Database → Extensions**: enable `pg_cron` and `pg_net`.
4. Copy [`supabase/reminders-schedule.sql`](supabase/reminders-schedule.sql), fill in your app URL and `CRON_SECRET`,
   and run it in the SQL Editor. Don't commit the filled-in copy.
5. On the iPhone, open the app **from the home-screen icon**, go to Profile → Reminders, tap
   **Turn on notifications**, allow them, then **Send a test**.

### 6. Install on iPhone
Open the Vercel URL in **Safari**, tap **Share → Add to Home Screen**, then open it from the home screen.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run icons` | Regenerate the app icons |

## Layout
```
src/
  app/
    (app)/            signed-in pages with the bottom tab bar
      page.tsx        Today
      coach/          AI coach chat and saved conversations
      dashboard/      trends: calories, weight, macros, adaptive TDEE, weekly table
      food/           daily food log, add (search/quick picks/manual), photo estimate, edit
      exercise/       workouts (lifting sets, cardio miles), templates
      mood/           mood check-ins, heatmap, history
      weight/         weigh-ins: log, chart, history
      profile/        body stats, goal, calorie target, change password
    login/            sign-in page + auth server actions
    manifest.ts       PWA manifest
  components/         UI pieces
  lib/
    tdee.ts           BMR / TDEE / goal-based calorie target (+ tests)
    nutrition.ts      meal helpers, totals, per-serving scaling (+ tests)
    food.ts           food log + quick-pick queries
    food-db.ts        USDA / Open Food Facts parsing, barcodes (+ tests)
    csv.ts            CSV writer for exports (+ tests)
    photo-estimate*.ts  Claude vision call + output schema (+ tests)
    analytics.ts      daily totals, adherence, adaptive TDEE, weekly rows (+ tests)
    exercise.ts       activities, calorie estimates, volume, e1RM, lift history (+ tests)
    assistant/        coach: tools over your data, streaming agent loop, display (+ tests)
    push.ts           web push sending (VAPID) for reminders
    mood.ts           daily mood, sleep/calorie/exercise comparisons, tag stats (+ tests)
    trend.ts          smoothed weight trend + weekly rate (+ tests)
    today.ts          "today" in the user's time zone (tz cookie)
    profile.ts        loads profile + latest weight, computes the target
    supabase/         browser, server and proxy clients
  proxy.ts            refreshes the session and redirects signed-out visitors
  app/api/assistant/  streams coach answers (newline-delimited JSON)
  app/api/export/     CSV per dataset and a full JSON backup
  app/api/reminders/  receives due reminders from the Supabase schedule and sends pushes
public/sw.js          service worker: offline page copies, push notifications
supabase/migrations/  database schema (SQL)
```
