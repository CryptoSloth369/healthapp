-- Health app: AI coach conversations (step 9).
-- Run once in the Supabase SQL Editor, after 0003.
--
-- Messages are stored exactly as sent to / received from the Claude API
-- (content blocks as JSON) so a conversation can be replayed unchanged.

create table assistant_conversation (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  title       text not null default 'New conversation',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index assistant_conversation_user on assistant_conversation (user_id, updated_at desc);

create table assistant_message (
  id               bigint generated always as identity primary key,
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  conversation_id  bigint not null references assistant_conversation on delete cascade,
  seq              int not null,                        -- order within the conversation
  role             text not null check (role in ('user', 'assistant')),
  content          jsonb not null,                      -- API content (string or block array)
  created_at       timestamptz not null default now(),
  unique (conversation_id, seq)
);

alter table assistant_conversation enable row level security;
alter table assistant_message      enable row level security;

create policy "own rows" on assistant_conversation for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on assistant_message for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
