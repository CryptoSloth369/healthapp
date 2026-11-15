-- Health app: energy model results (step 12).
-- Run once in the Supabase SQL Editor, after 0005.
--
-- The app computes intake/burn/balance for every day (src/lib/energy-balance.ts)
-- and stores the result here. Triggers mark it out of date whenever food,
-- weight, workouts or body stats change, so the app knows to rerun it.

-- One row per day, rewritten on each run (only changed rows are written).
create table energy_day (
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  day              date not null,
  intake_kcal      int,                -- logged + estimated; null = unknown
  logged_kcal      int,                -- what was actually logged that day
  source           text check (source in ('logged', 'partial', 'estimated')),
  confidence       text check (confidence in ('high', 'medium', 'low')),
  burn_kcal        int,                -- maintenance (personal when calibrated) + exercise
  exercise_kcal    int not null default 0,
  balance_kcal     int,                -- intake − burn; negative = deficit
  cumulative_kcal  int,                -- running total since the first weigh-in
  trend_lb         numeric(6, 2),
  window_start     date,               -- weigh-in window an estimate was spread over
  window_end       date,
  window_days      int,
  primary key (user_id, day)
);

alter table energy_day enable row level security;
create policy "own rows" on energy_day for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- One row per run: when, why, and the headline numbers (kept so runs can be compared).
create table energy_run (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  ran_at         timestamptz not null default now(),
  trigger        text not null check (trigger in ('manual', 'auto', 'stale')),
  model_version  smallint not null,
  first_day      date,
  last_day       date not null,
  result         jsonb not null        -- calibration, burn now, running total, summaries
);
create index energy_run_user on energy_run (user_id, ran_at desc);

alter table energy_run enable row level security;
create policy "own rows" on energy_run for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- "Needs a rerun" flag, one row per user.
create table energy_state (
  user_id     uuid primary key default auth.uid() references auth.users on delete cascade,
  dirty       boolean not null default true,
  changed_at  timestamptz not null default now()
);

alter table energy_state enable row level security;
create policy "own rows" on energy_state for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Runs as the user who made the change, so row-level security still applies.
create function mark_energy_dirty() returns trigger
language plpgsql set search_path = public as $$
declare
  uid uuid;
begin
  if tg_op = 'DELETE' then uid := old.user_id; else uid := new.user_id; end if;
  insert into energy_state (user_id, dirty, changed_at) values (uid, true, now())
  on conflict (user_id) do update set dirty = true, changed_at = now();
  return null;
end $$;

create trigger energy_dirty after insert or update or delete on food_entry
  for each row execute function mark_energy_dirty();
create trigger energy_dirty after insert or update or delete on weight_entry
  for each row execute function mark_energy_dirty();
create trigger energy_dirty after insert or update or delete on exercise_entry
  for each row execute function mark_energy_dirty();
create trigger energy_dirty after update of sex, birth_date, height_in, activity_level on profile
  for each row execute function mark_energy_dirty();

-- Daily totals for the model, summed in the database instead of sending every entry.
create function food_kcal_by_day() returns table (day date, kcal bigint)
language sql stable set search_path = public as $$
  select eaten_on, sum(kcal) from food_entry
  where user_id = (select auth.uid())
  group by eaten_on order by eaten_on
$$;

create function exercise_kcal_by_day() returns table (day date, kcal bigint)
language sql stable set search_path = public as $$
  select performed_on, sum(coalesce(kcal_burned, 0)) from exercise_entry
  where user_id = (select auth.uid())
  group by performed_on order by performed_on
$$;

revoke execute on function food_kcal_by_day(), exercise_kcal_by_day(), mark_energy_dirty() from public, anon;
grant execute on function food_kcal_by_day(), exercise_kcal_by_day() to authenticated;
