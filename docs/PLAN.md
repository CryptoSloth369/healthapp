# Health App — Architecture & Roadmap

A personal health tracker, single user to start, for the web and a phone.

## Features

| Feature | Notes |
|---|---|
| Calorie logging | Manual entry, quick-add, saved/recent foods, meals per day |
| Photo calorie estimator | Take a photo, an AI vision model estimates the items, portions, calories and macros, and you review and edit before saving |
| Weight log | Daily weigh-ins, smoothed trend line |
| Exercise log | Simple version first; details to be designed later |
| Mood tracker | Quick 1–5 rating plus energy, stress, sleep, tags and a note |
| Dashboard | Goal progress, trends, moving averages, correlations |
| Web + phone | One codebase, installable on the phone home screen |

## Recommended stack

```
┌──────────────────────────────────────────────┐
│  Next.js (React + TypeScript) PWA            │  ← one app: browser on desktop,
│  Tailwind + shadcn/ui · Recharts             │    "Add to Home Screen" on phone
└───────────────┬──────────────────────────────┘
                │ supabase-js (auth'd)
┌───────────────▼──────────────────────────────┐
│  Supabase                                    │
│  • Postgres (data, row-level security)       │
│  • Auth (just you)                           │
│  • Storage (meal photos)                     │
└───────────────┬──────────────────────────────┘
                │ server-side route (API key stays secret)
┌───────────────▼──────────────────────────────┐
│  Claude vision API → structured JSON         │
│  {items:[{name, portion, kcal, P, C, F,      │
│   confidence}], total_kcal}                  │
└──────────────────────────────────────────────┘
Hosting: Vercel (frontend + API routes), Supabase (data). Both free tiers fit one user.
```

### Why a PWA first (instead of a native app)
- One codebase for web and phone, with no app store and no dev accounts.
- The camera works through `<input type="file" capture>` or `getUserMedia`.
- It installs to the home screen, runs full screen, and can do push reminders (iOS 16.4+).
- **Main limitation:** it can't read Apple Health or Google Health Connect directly (steps,
  smart-scale weight, workouts). If that becomes important, we add a thin **Expo / React
  Native** shell later and reuse the same Supabase backend and the same TypeScript types.

## Data model (first draft)

```
profile          id, height_cm, birth_date, sex, activity_level, units,
                 target_weight, daily_kcal_target, protein/carb/fat targets
food_entry       id, eaten_at, meal (breakfast|lunch|dinner|snack), name,
                 quantity, unit, kcal, protein_g, carbs_g, fat_g,
                 source (manual|photo|saved|barcode), photo_path, ai_confidence, note
saved_food       id, name, serving, kcal, macros, use_count     ← powers quick-add
weight_entry     id, measured_at, weight, body_fat_pct?, note
mood_entry       id, logged_at, mood 1-5, energy 1-5, stress 1-5,
                 sleep_hours?, tags[], note
exercise_entry   id, performed_at, type, duration_min, kcal_burned?, note
                 (later: exercise_set → exercise, sets, reps, load)
goal             id, metric, target_value, start_date, target_date
```
Every table has `user_id` plus row-level security, so the data is private even on a hosted DB.

## Photo estimator flow
1. Snap or pick a photo. The client resizes it (about 1024px) and uploads it to Storage.
2. A server route sends the image to Claude with a strict JSON schema (items, estimated
   grams, kcal, macros, confidence). An optional text hint like "large plate, 2 eggs" helps.
3. A review screen shows each detected item as an editable row.
4. On confirm, a `food_entry` is saved for each item (source = `photo`) with the photo attached.

Photo estimates are inherently ±20–30%. The review step and an optional typed hint are what
make this useful instead of misleading. Cost is roughly a cent or two per photo.

## Dashboard ideas
- **Weight:** raw points plus a 7-day moving average or exponentially smoothed trend, a goal
  line and a projected goal date.
- **Calories:** daily intake vs target (bars), weekly average and adherence %.
- **Adaptive TDEE:** estimated from your actual intake vs your weight trend over 2–4 weeks.
- **Macros:** daily split vs targets.
- **Mood:** a calendar heatmap, plus overlays with sleep, calories and exercise.
- **Streaks and consistency:** days logged.

## Roadmap (build sequentially)

| Step | Deliverable |
|---|---|
| 0 ✅ | Scaffold: Next.js + TS + Tailwind, Supabase auth, PWA manifest/icons, profile + calorie target |
| 1 ✅ | Database schema + row-level security (`supabase/migrations/0001_initial_schema.sql`) |
| 2 ✅ | **Weight log**: quick weigh-in on Today, history with edit/delete, chart with smoothed trend + goal line, weekly rate |
| 3 ✅ | **Calorie logging**: entries by meal with macros and servings, daily totals vs target, saved + recent foods for one-tap re-logging, edit/delete |
| 4 ✅ | **Dashboard v1**: 4W/12W/6M ranges, intake + adherence + trend + streak tiles, calories chart vs target, weight trend, average macros, adaptive TDEE with one-tap target update, weekly table |
| 5 ✅ | **Photo estimator**: phone photo (resized to 1280px), optional note, Claude vision with schema-checked JSON, editable review with per-item amounts, photo kept privately with the entries |
| 6 ✅ | **Mood tracker**: 1–5 mood with optional energy, stress, sleep, tags and note; one-tap mood on Today; 12-week heatmap; dashboard mood section comparing sleep, calorie adherence, exercise and tags |
| 7 ✅ | **Exercise log**: weightlifting (exercise, weight × reps per set, volume), swimming, walking/running (miles, pace), jiu-jitsu; time and calories (entered or estimated from MET × weight); burned calories added to the daily budget with deficit/surplus; custom templates; lift progress charts (est. 1RM, top weight, volume) and bests on the dashboard |
| 8 ✅ | **Phone polish**: service worker (offline copies of visited pages, offline fallback), offline banner with automatic retry of saves, push reminders (weigh-in, dinner, mood) scheduled by Supabase pg_cron that only fire when not yet logged |
| 9 ✅ | **AI coach**: chat that reads the user's logs through tools (profile/goals, daily summary, food log, workouts, lift progress, mood, energy balance, templates), streams answers with progress updates, saves conversations, and suggests calorie targets or workout templates as cards the user must approve |
| 10 | Extras: barcode scan (Open Food Facts), USDA food search, CSV export, Apple Health / Health Connect import (via an Expo shell if needed) |

## Decisions
- **Phone:** iPhone. The app is installed as a PWA from Safari ("Add to Home Screen").
- **Health sync:** not needed yet (no tracking device). We stay on the PWA and revisit Expo if that changes.
- **Units:** imperial (lb, ft/in). The database stores `weight_lb` and `height_in` directly.
- **Calorie target:** calculated as Mifflin–St Jeor BMR × activity multiplier, then adjusted toward
  the goal (goal weight + date) at ~3,500 kcal/lb. Loss is capped at 1% of body weight per week and gain
  at 0.5%/week, with a floor of 1,500 kcal (male) or 1,200 kcal (female). A manual override is available.
  Macros: protein 0.8 g/lb of goal weight, fat 25% of kcal, carbs the rest. Later, an adaptive TDEE
  from logged intake vs the weight trend will refine this.
- **Auth:** email + password, a single user created in the Supabase dashboard, sign-ups disabled.
- **Accounts:** Supabase, Vercel and an Anthropic API key (the API key is needed at step 5).
