# Development guide

## Daily workflow
1. Branch from `main`. `main` is production; Vercel deploys every push to it.
2. Make the change, keeping logic in `src/lib` with tests (see the conventions in [`CLAUDE.md`](../CLAUDE.md)).
3. `npm run check` (typecheck + lint + tests) and `npm run build`.
4. For UI, preview the screen (below). For SQL, test the migration locally (below).
5. Commit with a descriptive message, push the branch, and ask the owner before fast-forwarding `main`:
   ```bash
   git fetch origin main && git merge-base --is-ancestor origin/main HEAD && git push origin HEAD:main
   ```

## Environment
`.env.local` needs at least the two Supabase values ([`.env.example`](../.env.example) lists everything). Without real values the app builds and the login screen renders, but anything behind login needs a real Supabase project.

## Previewing screens without a login
Most screens need a signed-in Supabase session, which build sandboxes don't have. The pattern used throughout development:
1. Create a temporary `src/app/dev-preview/page.tsx` that renders the *real* components with sample data. For example, `DashboardView` takes all its data as props for exactly this reason.
2. Temporarily add `"/dev-preview"` to `PUBLIC_PATHS` in `src/lib/supabase/proxy.ts`.
3. Run `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x npx next dev -p 3124`.
4. Drive it with Playwright (Chromium is preinstalled in the cloud workspace) using `devices['iPhone 15']`, `colorScheme` dark and light, and take screenshots. Stub network calls with `page.route(...)`. The coach chat was tested this way with a canned NDJSON reply.
5. **Delete `dev-preview/` and revert `PUBLIC_PATHS` before committing.**

Useful Playwright tricks:
- Tooltips: use `page.touchscreen.tap`, after `scrollIntoViewIfNeeded()`.
- Camera: launch with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
- Offline: build and `next start`, then `context.setOffline(true)` to exercise `sw.js`.

## Testing migrations locally
Supabase's `auth`/`storage` schemas are stubbed so the SQL can run on plain Postgres 16:
```sql
create role authenticated; create role anon;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public bool);
create table storage.objects (id serial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
grant usage on schema auth, storage, public to authenticated;
```
Apply the stub, then every migration in order. To test RLS, run `set role authenticated; set request.jwt.claim.sub = '<uuid>';` and check that another user's rows are invisible and that inserts for another user fail. `pg_cron`/`pg_net` aren't available locally; test `due_reminders()` directly.

## Testing Claude API code without a key
- Pure parts (schemas, display mapping, fallback sanitizing) have unit tests.
- `src/lib/assistant/agent-loop.test.ts` starts a local HTTP server that streams canned SSE events and points the real SDK at it (`ANTHROPIC_BASE_URL`), with an in-memory Supabase stand-in. It asserts the events the UI receives, the request bodies (model, betas, tools, replayed history) and the stored rows. Extend it when changing the loop.
- The photo estimator can be previewed by temporarily short-circuiting `estimateFromPhoto` with a canned result (restore before committing).

## Database changes
- Add `supabase/migrations/NNNN_description.sql`, never editing old files. Include RLS for new tables.
- Test it locally (above), then give the owner the SQL to run in **Supabase → SQL Editor**, and mention it in [`HANDOFF.md`](HANDOFF.md)'s checklist and the README setup list.
- After adding tables, update `src/lib/types.ts` and [`ARCHITECTURE.md`](ARCHITECTURE.md#data-model).

## Deploying and debugging production
- Vercel deploys `main` automatically. Environment variable changes need a **redeploy**, especially `NEXT_PUBLIC_*`, which are built into the bundle.
- Server errors: Vercel → Project → Deployments → (deployment) → Functions / Logs.
- Reminders: the SQL checks at the bottom of `supabase/reminders-schedule.sql` (`cron.job_run_details`, `net._http_response`).
- Service worker: bump `VERSION` in `public/sw.js` if caching behavior changes, so old caches are dropped.

## Dependencies worth knowing
`@supabase/ssr` + `@supabase/supabase-js` · `@anthropic-ai/sdk` (beta namespace for parse/stream with fallbacks) · `zod` v4 (`z.toJSONSchema` for tool schemas) · `web-push` v4 (named exports only, ESM) · `@zxing/browser` · `react-markdown` + `remark-gfm` · `vitest` · `sharp` (dev, icons).
