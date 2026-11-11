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
| 11 | **Journal:** free-form entries under Mood → Journal, dictation via the browser's speech recognition, day's mood shown with entries, coach `get_journal` tool, CSV export | `0005` |

## Backlog (ideas, not commitments)
- Weekly coach review: an automatic Sunday summary, delivered via push.
- Progress photos with side-by-side compare.
- Apple Health / wearable import. Researched; see [Long-term: device data](#long-term-device-data-apple-health-wearables).
- Selling it as a product. Researched; see [Long-term: selling it](#long-term-selling-it).
- Copy yesterday's meals; meal templates; water tracking.
- Coach: show the cost per answer, regenerate, log food from a text description.
- Display units setting (kg).
- Body measurements (waist, etc.) alongside weight.

## Long-term: device data (Apple Health, wearables)
_Notes from 2026-11-11. Not planned soon; check that the APIs and vendors below haven't changed before starting._

**Apple Health / Apple Watch.** Apple Health has no web or cloud API; it lives on the iPhone, and only an installed native app can read it after the user approves. A website (even added to the home screen) can't. Options:
1. **Small native "sync" app** (Capacitor, Expo or Swift): sign in, "Connect Apple Health", background sync of workouts, steps, sleep and weight into the same Supabase account. The website stays the main product. Needs the Apple Developer Program ($99/yr) and App Store review (or TestFlight for personal use).
2. **iOS Shortcuts** ("Find Health Samples" → send to a web address) on a daily automation. No native app, good enough for the owner, too fiddly for customers. Health data is locked while the phone is locked, so a run can be missed.
3. **Health Auto Export** (existing App Store app) sending Apple Health data to a web address on a schedule. Same idea with less setup; personal use only.

**Cloud wearables** (Garmin, Fitbit, Oura, Whoop, Withings, Polar, Strava). These keep the data in their own cloud with OAuth APIs: the user taps "Connect Garmin", approves, and the vendor sends new data to the app automatically. Works for a website-first product.
- *Direct integrations:* cheap, but each vendor has its own approval (Garmin requires a business application), format and changes. Fitbit's API is moving as Google folds it into its own platform.
- *Aggregator* (Terra, Junction (formerly Vital), ROOK, Spike): one integration for many devices, priced per connected user. Their Apple Health support still has to run inside a native app.
- Android is like Apple: Google Fit's cloud API is being shut down, and Health Connect is on-device only (needs a native Android app).

**What would change in this app.**
- Imported data maps to existing tables: workouts → `exercise_entry`, sleep → mood `sleep_hours` (or its own table), smart-scale weigh-ins → `weight_entry`, steps / heart rate / HRV → new tables for the coach. Each row needs a `source` and an external ID so the same item is never imported twice.
- **Double-counting calories:** if steps and Watch calories come in automatically, the budget can't also add the activity-level multiplier plus logged workouts. Decide the rule first.
- **Security:** incoming data arrives without a user session, and the project rule is no service-role key. Use a `security definer` database function that checks a hashed per-user token before writing, so each user stays limited to their own rows.

**Suggested order:** for the owner, start with Shortcuts or Health Auto Export into an import endpoint. For a product, an aggregator for the cloud brands, plus the native sync app for Apple Health.

## Long-term: selling it
_Notes from 2026-11-11. Not planned soon._

**Chosen direction if this happens:** keep it a website people add to their home screen (as today), with sign-up and payment on the website, not the App Store.
- *Pros:* no Apple review and no 15–30% cut (Stripe instead); instant updates; one codebase for iPhone, Android and desktop.
- *Cons:* no App Store search, so people find it only through your own marketing; installing is manual on iPhone (Share → Add to Home Screen, so an install-instructions page is needed, and push reminders only work after installing); no Apple Health without a native app (see above); Apple controls home-screen web app rules (it briefly tried to remove them in the EU in 2024).
- A native App Store app can be added later on the same website and accounts. Since 2025, US App Store apps may link to web checkout.

**Work needed before strangers can sign up and pay:**
- Accounts: public sign-up with email confirmation, password reset, in-app account and data deletion, first-run setup flow, public landing and install pages (add them to `PUBLIC_PATHS`), and your own email-sending service (Supabase's built-in email is for testing only).
- Payments: Stripe Checkout and a billing page where people manage or cancel their plan, a webhook, and a record of who has paid that gates paid features.
- AI costs: per-user limits on coach messages and photo estimates; price above the Claude cost per user.
- Hosting: Vercel Pro (the free Hobby plan doesn't allow commercial use); Supabase Pro for backups and limits.
- Legal and privacy: privacy policy, terms of service, a clear "not medical advice" statement. In the US this isn't covered by HIPAA, but the FTC Health Breach Notification Rule and state laws (such as Washington's My Health My Data Act, which needs explicit consent) apply; GDPR applies if EU users are allowed. Check Anthropic's commercial terms and usage policy for consumer apps that give health advice. A short consultation with a privacy lawyer before charging anyone is worth it.
- Already in place: every table is per-user with row-level security. Audit the code for any remaining single-user assumptions before opening sign-ups.

**Suggested order:** keep using it personally while building accounts → invite a few friends free as testers → add Stripe and AI limits once the cost per user is known → native App Store app only if Apple Health or discoverability proves worth it.

## Original design notes
The first plan (stack choice, PWA vs native, photo flow) is preserved in git history: `git show 1f17bad:docs/PLAN.md`.
