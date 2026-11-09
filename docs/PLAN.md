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
| 0 | Decisions + scaffold: Next.js + TS + Tailwind, Supabase project, auth, deploy to Vercel |
| 1 | Database schema + migrations + generated TypeScript types |
| 2 | **Weight log**: the simplest end-to-end slice (form → DB → list → chart) |
| 3 | **Calorie logging**: manual entry, daily view, saved foods / quick-add |
| 4 | **Dashboard v1**: weight trend, calories vs target, goals |
| 5 | **Photo estimator**: upload, Claude vision, review screen |
| 6 | **Mood tracker** + mood views on the dashboard |
| 7 | **Exercise log**: design the specifics together, then build |
| 8 | PWA polish: installable, offline-tolerant entry, reminders |
| 9 | Extras: barcode scan (Open Food Facts), USDA food search, CSV export, Apple Health / Health Connect import (via an Expo shell if needed) |

## Open decisions
- Phone OS (iOS or Android): affects PWA quirks and any later Health integration.
- Is Apple Health / Google Fit sync a must-have soon? If yes, start with Expo instead.
- Units (lb/kg) and the daily calorie target: set from your stats or entered manually.
- Accounts needed: Supabase, Vercel, Anthropic API key.
