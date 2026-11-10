-- Health app: exercise details (step 7).
-- Run once in the Supabase dashboard (SQL Editor → paste → Run), after 0001.
--
-- Adds distance and an "estimated calories" flag to exercise_entry, per-set
-- lifting data, and reusable workout templates. All new tables use the same
-- row-level security as before: each user only sees their own rows.

-- ───────────────────────── sessions ─────────────────────────
alter table exercise_entry
  add column distance_mi    numeric(5,2) check (distance_mi >= 0 and distance_mi <= 200),
  add column kcal_estimated boolean not null default false,
  add column template_id    bigint;

-- ───────────────────────── lifting sets ─────────────────────────
create table exercise_set (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  entry_id    bigint not null references exercise_entry on delete cascade,
  position    smallint not null default 0,      -- order within the workout
  exercise    text not null,                    -- "Bench press"
  weight_lb   numeric(6,1) check (weight_lb >= 0 and weight_lb <= 2000), -- null = bodyweight
  reps        smallint not null check (reps between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index exercise_set_entry on exercise_set (entry_id);
create index exercise_set_user_exercise on exercise_set (user_id, exercise);

-- ───────────────────────── templates ─────────────────────────
create table workout_template (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  name          text not null check (length(name) between 1 and 80),
  activity      text not null,
  duration_min  int check (duration_min between 0 and 1440),
  distance_mi   numeric(5,2) check (distance_mi >= 0 and distance_mi <= 200),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table template_exercise (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  template_id  bigint not null references workout_template on delete cascade,
  position     smallint not null default 0,
  exercise     text not null,
  sets         smallint not null default 3 check (sets between 1 and 50),
  reps         smallint check (reps between 1 and 1000),
  weight_lb    numeric(6,1) check (weight_lb >= 0 and weight_lb <= 2000)
);
create index template_exercise_template on template_exercise (template_id);

alter table exercise_entry
  add constraint exercise_entry_template_fk
  foreign key (template_id) references workout_template on delete set null;

-- ───────────────────────── row-level security ─────────────────────────
alter table exercise_set      enable row level security;
alter table workout_template  enable row level security;
alter table template_exercise enable row level security;

do $$
declare t text;
begin
  foreach t in array array['exercise_set','workout_template','template_exercise'] loop
    execute format(
      'create policy "own rows" on %I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

create trigger workout_template_touch before update on workout_template
  for each row execute function public.touch_updated_at();
