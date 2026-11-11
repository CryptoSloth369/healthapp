-- Health app: journal (free-form entries next to mood check-ins).
-- Run once in the Supabase SQL Editor, after 0004.

create table journal_entry (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  written_on  date not null,                          -- local day the entry belongs to
  written_at  timestamptz not null default now(),
  updated_at  timestamptz,
  body        text not null check (char_length(body) between 1 and 20000)
);
create index journal_entry_user_day on journal_entry (user_id, written_on desc, written_at desc);

alter table journal_entry enable row level security;

create policy "own rows" on journal_entry for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
