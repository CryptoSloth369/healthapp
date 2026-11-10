# Roadmap

## Done
Built one step at a time; each step is one commit on `main` (`git log --oneline`).

| Step | Delivered | Migration |
|---|---|---|
| 0 | Scaffold: Next.js 16 + TS + Tailwind, Supabase auth, PWA manifest/icons, profile + calorie target | — |
| 1 | Schema + row-level security (profile, weight, food, saved foods, mood, exercise, meal-photos bucket) | `0001` |
| 2 | **Weight log:** quick weigh-in on Today, history with edit/delete, trend chart with goal line, weekly rate; time-zone-aware days; change password | — |
| 3 | **Calorie logging:** entries by meal with macros and servings, daily totals vs target, saved and recent foods, edit/delete | — |
| 4 | **Dashboard (Trends):** 4W/12W/6M, intake/adherence/trend/streak tiles, calories chart, weight trend, macros, adaptive TDEE with one-tap target, weekly table | — |
| 5 | **Photo estimator:** resized photo + note → Claude structured output → editable review; photo stored privately | — |
| 6 | **Mood tracker:** mood/energy/stress/sleep/tags/note, quick mood on Today, heatmap, dashboard insights (sleep, calories, exercise, tags) | — |
| 7 | **Exercise:** lifting sets and volume, swim, walk/run miles and pace, jiu-jitsu; entered or estimated calories added to the daily budget; templates; lift progress charts and bests | `0002` |
| 8 | **Phone polish:** service worker (offline pages and fallback), offline banner + retry, push reminders via pg_cron | `0003` |
| 9 | **AI coach:** chat with tools over all logs, streaming with progress, saved conversations, approval-gated target/template suggestions | `0004` |
| 10 | **Extras:** USDA food search, barcode scanning (camera/photo/typed), CSV export and JSON backup | — |

## Backlog (ideas, not commitments)
- Weekly coach review: an automatic Sunday summary, delivered via push.
- Progress photos with side-by-side compare.
- Apple Health / wearable import (needs a native shell or export-file import).
- Copy yesterday's meals; meal templates; water tracking.
- Coach: show the cost per answer, regenerate, log food from a text description.
- Display units setting (kg).
- Body measurements (waist, etc.) alongside weight.

## Original design notes
The first plan (stack choice, PWA vs native, photo flow) is preserved in git history: `git show 1f17bad:docs/PLAN.md`.
