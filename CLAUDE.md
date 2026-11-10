# Working in this repo

A personal health tracker (Next.js 16 PWA + Supabase + Claude API) for a single user on iPhone. **Start with [`docs/HANDOFF.md`](docs/HANDOFF.md)** for status and open items. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains how things work.

@AGENTS.md

## Ground rules
- **Ask before pushing to `main`.** `main` deploys to production on Vercel. Work on a branch; the owner says when to fast-forward `main`.
- **Never edit an applied migration.** Schema changes go in a new `supabase/migrations/NNNN_name.sql`, which the owner pastes into the Supabase SQL Editor. Hand them the SQL. New tables need `user_id uuid default auth.uid()` plus a row-level-security policy `user_id = (select auth.uid())`, like the existing ones.
- **Never commit secrets.** `.env*` is ignored (except `.env.example`). `supabase/reminders-schedule.sql` is a template; the filled-in copy contains `CRON_SECRET`.
- **Before saying "done":** run `npm run check` (typecheck, lint, tests) and `npm run build`. For UI changes, render the screen with sample data (see `docs/DEVELOPMENT.md` → Previewing screens) and look at it at iPhone size in light and dark mode.
- Keep the owner's conventions: imperial units, local calendar days, dark-first UI tokens in `globals.css`, and short plain-language copy in the UI.

## Commands
`npm run dev` · `npm run build` · `npm run check` · `npm test` · `npm run typecheck` (runs `next typegen` first; `tsc` alone fails on `LayoutProps` without it).

## Next.js 16 gotchas (this is not older Next.js)
- **Read the bundled docs** in `node_modules/next/dist/docs/` before using an unfamiliar API (see AGENTS.md).
- Middleware is called **Proxy**: `src/proxy.ts` plus `src/lib/supabase/proxy.ts`. Public paths are listed in `PUBLIC_PATHS` there; everything else needs a session.
- `params` and `searchParams` are **Promises**: `await` them.
- `cacheComponents` is **off** on purpose (every page is per-user). `experimental.useOffline` is **on** (offline banner and retries).
- Pages may only export page things. Put shared components in sibling files (see `dashboard/dashboard-view.tsx`).

## Code conventions
- **Pure logic lives in `src/lib/*.ts` with Vitest tests next to it**: `tdee`, `trend`, `analytics`, `nutrition`, `exercise`, `mood`, `food-db`, `csv`, `photo-estimate-schema`, `assistant/display`. Put math there, not in components.
- **Server-only modules** start with `import "server-only"`. Data loaders use `createClient()` from `@/lib/supabase/server`, so RLS scopes every query to the signed-in user. Never use a service-role key.
- **Mutations** are server actions (`"use server"`) that re-check `getUserId()`, validate input, then `revalidatePath`.
- **Dates:** a "day" is a local `YYYY-MM-DD` string. Server "today" comes from `todayLocal()` (`src/lib/today.ts`, which reads the `tz` cookie set by `TimezoneSync`). Never use `new Date()` on the server to decide the user's day.
- **Numbers from Postgres** `numeric` columns may arrive as strings. Loaders wrap them in `Number(...)`.
- **Charts** are hand-written SVG (`weight-chart`, `calorie-chart`, `lift-progress`, `mood-heatmap`). Series colors are CSS variables checked for color-blind safety. Tooltips must work on tap: ignore `pointerleave` from touch.
- Forms: uncontrolled inputs, reset by changing the component `key`. Avoid `setState` directly in effects; the lint rule flags it.

## Claude API usage
- Model IDs are constants in `src/lib/photo-estimate.ts` and `src/lib/assistant/agent.ts`. Both set `output_config.effort` explicitly and use server-side refusal fallback (`fallbacks: "default"` + beta header).
- **Photo estimator:** a structured output (Zod schema) via `client.beta.messages.parse`.
- **Coach:** a manual streaming tool loop (`src/lib/assistant/agent.ts`). Assistant turns are **stored and replayed exactly as returned**: the history must stay append-only (don't strip thinking blocks). Content after a mid-answer fallback is cleaned by `sanitizeAfterFallback`. Tools are in `assistant/tools.ts`, validated with Zod. `propose_*` tools never write; the UI shows Apply/Save cards and server actions in `app/(app)/coach/actions.ts` do the writing.
- `agent-loop.test.ts` runs the real loop against a fake SSE server. Update it when changing the loop.
