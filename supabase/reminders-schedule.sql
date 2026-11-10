-- Health app: run the reminder check every 15 minutes.
--
-- Before running this:
--   1. Database → Extensions: enable "pg_cron" and "pg_net".
--   2. Replace YOUR-APP-URL with your Vercel address (e.g. healthapp-cyan.vercel.app)
--      and YOUR-CRON-SECRET with the CRON_SECRET you set in Vercel.
-- Do not commit the filled-in version: it contains your secret.

select cron.schedule(
  'health-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-APP-URL/api/reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR-CRON-SECRET"}'::jsonb,
    body    := jsonb_build_object('items', d.items)
  )
  from (select public.due_reminders() as items) d
  where jsonb_array_length(d.items) > 0;
  $$
);

-- To check it's running:   select * from cron.job_run_details order by start_time desc limit 5;
-- To see the app's replies: select status_code, content from net._http_response order by created desc limit 5;
-- To stop it:              select cron.unschedule('health-reminders');
