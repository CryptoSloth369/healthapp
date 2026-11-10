-- Health app: push notification reminders (step 8).
-- Run once in the Supabase SQL Editor, after 0002. The schedule that calls
-- the app is set up separately (see supabase/reminders-schedule.sql) because
-- it contains your app URL and secret.

-- One row per device that allowed notifications.
create table push_subscription (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- Reminder times are local to the user's time zone. Null time = reminder off.
create table reminder_pref (
  user_id      uuid primary key default auth.uid() references auth.users on delete cascade,
  enabled      boolean not null default true,
  timezone     text not null default 'UTC',
  weigh_in_at  time,
  food_at      time,
  mood_at      time,
  last_sent    jsonb not null default '{}',   -- {"weigh_in": "2026-11-10", ...}
  updated_at   timestamptz not null default now()
);

alter table push_subscription enable row level security;
alter table reminder_pref     enable row level security;

create policy "own rows" on push_subscription for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on reminder_pref for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

/*
  Which reminders are due right now, across all users. Called by the
  scheduled job (as the database owner), never by the app's users.

  A reminder is due when its local time has passed within the last 2 hours,
  it hasn't been handled today, and the thing it reminds about isn't logged
  yet today:
    weigh_in → no weigh-in today
    food     → nothing logged for dinner today
    mood     → no mood check-in today
  Each reminder is marked handled for the day whether or not it was sent.
  Returns a JSON array of {kind, endpoint, p256dh, auth}.
*/
create function public.due_reminders() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r          record;
  k          text;
  t          time;
  local_ts   timestamp;
  local_day  date;
  done       boolean;
  items      jsonb := '[]'::jsonb;
begin
  for r in select * from public.reminder_pref where enabled loop
    local_ts  := now() at time zone r.timezone;
    local_day := local_ts::date;

    foreach k in array array['weigh_in', 'food', 'mood'] loop
      t := case k when 'weigh_in' then r.weigh_in_at when 'food' then r.food_at else r.mood_at end;
      continue when t is null;
      continue when local_ts::time < t or local_ts::time > t + interval '2 hours';
      continue when (r.last_sent ->> k) is not null and (r.last_sent ->> k)::date >= local_day;

      done := case k
        when 'weigh_in' then exists (select 1 from public.weight_entry w where w.user_id = r.user_id and w.measured_on = local_day)
        when 'food'     then exists (select 1 from public.food_entry f where f.user_id = r.user_id and f.eaten_on = local_day and f.meal = 'dinner')
        else                 exists (select 1 from public.mood_entry m where m.user_id = r.user_id and m.logged_on = local_day)
      end;

      update public.reminder_pref
        set last_sent = last_sent || jsonb_build_object(k, local_day)
        where user_id = r.user_id;

      continue when done;

      items := items || coalesce((
        select jsonb_agg(jsonb_build_object('kind', k, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
        from public.push_subscription s where s.user_id = r.user_id
      ), '[]'::jsonb);
    end loop;
  end loop;
  return items;
end $$;

-- Only the database owner (the scheduler) may run it.
revoke all on function public.due_reminders() from public;
revoke all on function public.due_reminders() from anon, authenticated;
