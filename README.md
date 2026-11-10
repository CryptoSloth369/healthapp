# Health

A personal health tracker for one person. Log food, weight, workouts and mood, see trends, and ask an AI coach about your own data. It runs in any browser and installs on an iPhone home screen as an app (PWA).

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind 4) · Supabase (Postgres, Auth, Storage, pg_cron) · Vercel · Claude API (photo estimates, coach) · USDA FoodData Central and Open Food Facts (food data).

## Documentation

| Doc | Read it when |
|---|---|
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | **Start here.** You're picking up work (human or AI): current status, what's verified, open items. |
| [`CLAUDE.md`](CLAUDE.md) | You're an AI agent working in this repo: rules, commands, gotchas. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | You need to know how something works: data model, flows, file map. |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | You're changing code: workflow, testing techniques, migrations, deploying. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | You wonder *why* something is the way it is. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | You want what's done and what could come next. |

## Features
- **Today:** quick weigh-in and mood, calories eaten vs budget (target + exercise) with estimated deficit, today's workouts.
- **Food:** log by meal with macros; saved and recent foods; **photo estimate** (Claude vision); **USDA search**; **barcode scan**.
- **Exercise:** weightlifting sets (weight × reps, volume), swimming, walking/running (miles, pace), jiu-jitsu; calories entered or estimated; reusable templates.
- **Weight:** daily weigh-ins, smoothed trend, weekly rate, goal line.
- **Mood:** 1–5 mood with energy, stress, sleep, tags and notes; heatmap.
- **Trends:** dashboard with calories vs target, adherence, weight trend, macros, adaptive TDEE (measured burn), lift progress, mood insights.
- **Coach:** AI chat that reads your logs, cites numbers, and proposes target or template changes you approve.
- **Phone:** installable, offline viewing and saving, push reminders. **Export:** CSV and full JSON backup.

## Setup from scratch

Accounts: Supabase, Vercel, GitHub; optional Anthropic (photo and coach) and a free USDA key.

### 1. Supabase: database and login
1. Create a project at <https://supabase.com/dashboard>.
2. **SQL Editor → New query:** paste and **Run** each migration **in order**, once each:
   [`0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql) →
   [`0002_exercise.sql`](supabase/migrations/0002_exercise.sql) →
   [`0003_reminders.sql`](supabase/migrations/0003_reminders.sql) →
   [`0004_assistant.sql`](supabase/migrations/0004_assistant.sql).
   Paste the file *contents*, not the path. Each should report "Success".
3. **Authentication → Users → Add user → Create new user:** your email and password, tick **Auto Confirm User**.
   Do this *after* `0001`, which creates your profile row automatically.
4. **Authentication → Sign In / Providers:** turn off **Allow new users to sign up**.
5. Note the **Project URL** (Settings → Data API; just `https://xxx.supabase.co`, no `/rest/v1`) and the **Publishable key** (Settings → API Keys).

### 2. Vercel: hosting
1. Import the GitHub repo at <https://vercel.com/new>. `vercel.json` pins the Next.js preset.
2. Add environment variables (all environments). See [`.env.example`](.env.example) for the full list:

| Variable | Type | Needed for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Config | everything |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Config | everything |
| `ANTHROPIC_API_KEY` | Secret | photo estimator, coach (<https://platform.claude.com/settings/keys>) |
| `USDA_API_KEY` | Secret | reliable food search (free: <https://fdc.nal.usda.gov/api-key-signup>) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Config | reminders (generate in app, step 4) |
| `VAPID_PRIVATE_KEY` | Secret | reminders |
| `CRON_SECRET` | Secret | reminders |

   `NEXT_PUBLIC_*` values can't be Secret in Vercel, and they're built into the app, so **redeploy after changing them**.
3. Deploy. Production deploys come from the `main` branch.

### 3. iPhone
Open the Vercel URL in **Safari → Share → Add to Home Screen**, then open it from the icon and sign in.
In **Profile**, fill in your stats and goal, and set **Activity level** to how active you are *outside* logged workouts (usually Sedentary or Light), since logged exercise is added on top.

### 4. Reminders (optional)
1. In the app: **Profile → Reminders → Generate keys**. Add the three values to Vercel and redeploy.
2. Supabase **Database → Extensions:** enable `pg_cron` and `pg_net`.
3. Fill your app URL and `CRON_SECRET` into a copy of [`supabase/reminders-schedule.sql`](supabase/reminders-schedule.sql) and run it. **Don't commit the filled-in copy.**
4. On the iPhone, from the home-screen app: **Profile → Reminders → Turn on notifications → Send a test**.

## Run locally
```bash
cp .env.example .env.local   # fill in at least the two Supabase values
npm install
npm run dev                  # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run check` | Typecheck + lint + unit tests (run before every commit) |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | Generate route types, then `tsc` |
| `npm run icons` | Regenerate app icons from `scripts/make-icons.mjs` |

## Costs (one user)
Supabase and Vercel free tiers are enough. Claude: roughly 2–5¢ per photo estimate and 2–10¢ per coach question. USDA and Open Food Facts are free.
