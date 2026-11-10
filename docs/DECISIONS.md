# Decisions

Why things are the way they are. Add new entries at the bottom: what was decided, why, and what would change it.

| # | Decision | Why | Revisit if |
|---|---|---|---|
| 1 | **PWA, not a native app** | One codebase for iPhone and desktop, no App Store. Camera, offline and push all work in an installed PWA on iOS 16.4+. | Apple Health / HealthKit sync is needed. Then add an Expo shell over the same Supabase backend. |
| 2 | **Next.js + Supabase + Vercel** | Free tiers fit one user. Supabase gives Postgres, Auth, Storage and pg_cron in one. RLS keeps data private without a custom API. | Multi-user or heavy background jobs. |
| 3 | **Single user, email + password, sign-ups disabled** | Personal app. Magic links open Safari instead of the installed PWA on iOS, so passwords are simpler. | Sharing with others. |
| 4 | **Imperial units stored directly** (`weight_lb`, `height_in`, `distance_mi`) | The owner uses lb/ft/mi, and storing them avoids rounding drift. | A kg user. Add a display-unit setting and convert at the edges. |
| 5 | **Local calendar days** stored as `date` from the phone's time zone (`tz` cookie) | "Today" must match the user's day, not UTC on the server. | — |
| 6 | **Calorie target = Mifflin–St Jeor × activity + goal pace**, capped at 1%/0.5% body weight per week, with 1,500/1,200 kcal floors | Standard, transparent and safe. A manual override exists. | — |
| 7 | **Adaptive TDEE** from intake vs trend (28 days, 70% logged) as an optional "use this target" | Measured burn beats formulas once there's data. | — |
| 8 | **EWMA trend at 10% per day** for weight | Hides 1–4 lb water swings; the classic "Hacker's Diet" approach. | — |
| 9 | **Exercise calories are added to the daily budget**; Activity level means activity *outside* logged workouts | The owner wanted net deficit/surplus with workouts counted. The activity setting prevents double counting. | — |
| 10 | **Blank exercise calories are estimated** with MET × weight × time (ACSM equations for walk/run with miles) | Most workouts lack watch data. Estimates are flagged "est.". | A wearable is connected. |
| 11 | **Photo estimates are always reviewed** before saving, and items can be edited or scaled | Photo estimates are ±20–30%. | — |
| 12 | **Claude API: current Opus model, explicit effort, server-side refusal fallback** | Best accuracy for one user's low volume. Fallback avoids dead ends. | Cost becomes an issue. Try lower effort before a smaller model. |
| 13 | **Coach can only propose changes**; the user taps Apply/Save | No silent writes to health data or targets. | — |
| 14 | **Coach history stored verbatim** (API content blocks) | The API requires append-only replay of assistant turns (thinking blocks). | — |
| 15 | **Hand-written SVG charts**, not a chart library | Full control of touch tooltips, theming and size. Colors are validated for color-blind safety. | Many more chart types are needed. |
| 16 | **Reminders scheduled in Postgres** (pg_cron → `due_reminders()` → `/api/reminders`) | The DB knows what's logged, so it can skip reminders. No service-role key in the app. Vercel Hobby cron is once a day. | — |
| 17 | **Food data from USDA (search) + Open Food Facts (barcodes)** | Both free. USDA covers generic foods; OFF covers packaged barcodes. | — |
| 18 | **`cacheComponents` off; `useOffline` on** | All pages are per-user, so there's nothing to prerender. Offline retry protects entries made with bad signal. | — |
