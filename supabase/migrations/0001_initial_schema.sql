-- Health app: initial schema.
-- Run once in the Supabase dashboard (SQL Editor → paste → Run),
-- or with `supabase db push` if you use the Supabase CLI.
--
-- Units are imperial (lb, inches). Every row belongs to a user, and
-- row-level security means each user can only ever see their own rows.
-- "*_on" date columns hold the LOCAL calendar day the entry counts toward,
-- set by the app, so daily totals don't shift with time zones.

-- ───────────────────────── enums ─────────────────────────
create type sex as enum ('male', 'female');
create type activity_level as enum ('sedentary', 'light', 'moderate', 'active', 'very_active');
create type meal as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type food_source as enum ('manual', 'saved', 'photo', 'barcode', 'search');

-- ───────────────────────── profile ─────────────────────────
-- One row per user: body stats for the TDEE formula plus the current goal.
create table profile (
  user_id         uuid primary key references auth.users on delete cascade,
  display_name    text,
  sex             sex,
  birth_date      date,
  height_in       numeric(4,1) check (height_in between 36 and 96),
  activity_level  activity_level not null default 'light',
  goal_weight_lb  numeric(5,1) check (goal_weight_lb between 50 and 700),
  goal_date       date,
  -- Manual override; when null the app uses the calculated target.
  kcal_target_override int check (kcal_target_override between 800 and 8000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ───────────────────────── weight ─────────────────────────
-- One weigh-in per day (re-entering the same day overwrites it).
create table weight_entry (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  measured_on  date not null,
  weight_lb    numeric(5,1) not null check (weight_lb between 50 and 700),
  body_fat_pct numeric(4,1) check (body_fat_pct between 2 and 70),
  note         text,
  created_at   timestamptz not null default now(),
  unique (user_id, measured_on)
);

-- ───────────────────────── food ─────────────────────────
create table saved_food (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  serving     text,                     -- e.g. "1 cup", "100 g", "1 bar"
  kcal        int not null check (kcal >= 0),
  protein_g   numeric(6,1),
  carbs_g     numeric(6,1),
  fat_g       numeric(6,1),
  use_count   int not null default 0,   -- powers "frequent" quick-add
  last_used_at timestamptz,
  created_at  timestamptz not null default now()
);

create table food_entry (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  eaten_on      date not null,
  eaten_at      timestamptz not null default now(),
  meal          meal not null,
  name          text not null,
  servings      numeric(6,2) not null default 1 check (servings > 0),
  serving       text,
  -- Totals for this entry (already multiplied by servings).
  kcal          int not null check (kcal >= 0),
  protein_g     numeric(6,1),
  carbs_g       numeric(6,1),
  fat_g         numeric(6,1),
  source        food_source not null default 'manual',
  saved_food_id bigint references saved_food on delete set null,
  photo_path    text,                   -- object path in the meal-photos bucket
  ai_confidence numeric(3,2) check (ai_confidence between 0 and 1),
  note          text,
  created_at    timestamptz not null default now()
);
create index food_entry_user_day on food_entry (user_id, eaten_on);

-- ───────────────────────── mood ─────────────────────────
create table mood_entry (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  logged_on   date not null,
  logged_at   timestamptz not null default now(),
  mood        smallint not null check (mood between 1 and 5),
  energy      smallint check (energy between 1 and 5),
  stress      smallint check (stress between 1 and 5),
  sleep_hours numeric(3,1) check (sleep_hours between 0 and 24),
  tags        text[] not null default '{}',
  note        text,
  created_at  timestamptz not null default now()
);
create index mood_entry_user_day on mood_entry (user_id, logged_on);

-- ───────────────────────── exercise (simple v1) ─────────────────────────
-- Detailed sets/reps tables will come in the exercise step.
create table exercise_entry (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  performed_on  date not null,
  performed_at  timestamptz not null default now(),
  activity      text not null,          -- "Run", "Lifting", "Walk"…
  duration_min  int check (duration_min between 0 and 1440),
  kcal_burned   int check (kcal_burned >= 0),
  note          text,
  created_at    timestamptz not null default now()
);
create index exercise_entry_user_day on exercise_entry (user_id, performed_on);

-- ───────────────────────── row-level security ─────────────────────────
alter table profile        enable row level security;
alter table weight_entry   enable row level security;
alter table saved_food     enable row level security;
alter table food_entry     enable row level security;
alter table mood_entry     enable row level security;
alter table exercise_entry enable row level security;

create policy "own profile" on profile
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['weight_entry','saved_food','food_entry','mood_entry','exercise_entry'] loop
    execute format(
      'create policy "own rows" on %I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ───────────────────────── triggers ─────────────────────────
-- Create an empty profile row when a user is created.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profile (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profile_touch before update on profile
  for each row execute function public.touch_updated_at();

-- ───────────────────────── storage: meal photos ─────────────────────────
-- Private bucket; files live under "<user_id>/…".
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

create policy "own meal photos" on storage.objects
  for all to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
