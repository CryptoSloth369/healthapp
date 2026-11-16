-- Money, part 1 (roadmap step 13): families, invites, accounts, balances.
-- Run once in the Supabase SQL Editor, after 0006.
--
-- Money is shared within a family ("household"); health data stays per user.
-- New people can only sign up with a one-time invite link: the
-- hook_require_invite function below is registered as Supabase's
-- "Before User Created" auth hook (Authentication → Hooks).

-- ───────────────────────── families ─────────────────────────
create table household (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Family' check (char_length(name) between 1 and 60),
  created_at  timestamptz not null default now()
);

create table household_member (
  household_id  uuid not null references household on delete cascade,
  user_id       uuid not null unique references auth.users on delete cascade,  -- one family per person
  role          text not null default 'member' check (role in ('owner', 'member')),
  joined_at     timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Membership checks used by the policies. Security definer so they can read
-- household_member without recursing into its own policies.
create function public.is_household_member(hid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_member where household_id = hid and user_id = (select auth.uid()))
$$;

create function public.is_household_owner(hid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_member where household_id = hid and user_id = (select auth.uid()) and role = 'owner')
$$;

alter table household enable row level security;
create policy "members read" on household for select to authenticated using (public.is_household_member(id));
create policy "members rename" on household for update to authenticated
  using (public.is_household_member(id)) with check (public.is_household_member(id));

alter table household_member enable row level security;
create policy "members read" on household_member for select to authenticated using (public.is_household_member(household_id));
-- Joining, leaving and removing go through the functions below.

-- One-time invite links. Only a SHA-256 hash of the token is stored.
create table household_invite (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household on delete cascade,
  created_by    uuid not null default auth.uid() references auth.users on delete cascade,
  token_hash    text not null unique,
  expires_at    timestamptz not null default now() + interval '7 days',
  -- Set by the sign-up hook, before the new user row exists (so no foreign key).
  -- A reservation from a sign-up that then failed lapses after an hour.
  reserved_for  uuid,
  reserved_at   timestamptz,
  used_by       uuid references auth.users on delete set null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

alter table household_invite enable row level security;
create policy "members read" on household_invite for select to authenticated using (public.is_household_member(household_id));
create policy "members create" on household_invite for insert to authenticated
  with check (public.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "members revoke" on household_invite for delete to authenticated
  using (public.is_household_member(household_id) and used_by is null);

-- ───────────────────────── accounts ─────────────────────────
-- A Plaid connection (one bank login). The access token is encrypted by the
-- app (AES-256-GCM, key in a server env var) and never sent to the browser.
create table fin_item (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references household on delete cascade,
  owner_user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  plaid_item_id    text not null unique,
  access_token_enc text not null,
  institution_id   text,
  institution_name text,
  products         text[] not null default '{}',
  status           text not null default 'ok' check (status in ('ok', 'login_required', 'error')),
  error            text,
  txn_cursor       text,                -- Transactions Sync position (step 14)
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now()
);
create index fin_item_household on fin_item (household_id);

alter table fin_item enable row level security;
-- Any family member may sync a connection; only its owner can add or remove it.
create policy "members read" on fin_item for select to authenticated using (public.is_household_member(household_id));
create policy "owner adds" on fin_item for insert to authenticated
  with check (owner_user_id = (select auth.uid()) and public.is_household_member(household_id));
create policy "members sync" on fin_item for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "owner removes" on fin_item for delete to authenticated using (owner_user_id = (select auth.uid()));

-- An account: from Plaid, or entered by hand (home, car, cash…).
-- balance is always positive for what you have AND for what you owe; `kind` says which.
create table fin_account (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references household on delete cascade,
  owner_user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  item_id             uuid references fin_item on delete cascade,
  plaid_account_id    text unique,
  name                text not null check (char_length(name) between 1 and 80),
  display_name        text check (char_length(display_name) between 1 and 80),
  official_name       text,
  mask                text,
  plaid_type          text,
  plaid_subtype       text,
  kind                text not null check (kind in ('cash', 'investment', 'retirement', 'credit', 'loan', 'other_asset', 'other_liability')),
  balance             numeric(14, 2) not null default 0,
  available           numeric(14, 2),
  credit_limit        numeric(14, 2),
  currency            text not null default 'USD',
  is_manual           boolean not null default false,
  shared              boolean not null default true,   -- visible to the family
  hidden              boolean not null default false,  -- left out of totals
  balance_updated_at  timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  check (is_manual = (item_id is null))
);
create index fin_account_household on fin_account (household_id);

alter table fin_account enable row level security;
create policy "owner or shared" on fin_account for select to authenticated
  using (owner_user_id = (select auth.uid()) or (shared and public.is_household_member(household_id)));
create policy "owner adds" on fin_account for insert to authenticated
  with check (owner_user_id = (select auth.uid()) and public.is_household_member(household_id));
-- Family members can refresh balances of shared accounts during a sync.
create policy "owner or shared update" on fin_account for update to authenticated
  using (owner_user_id = (select auth.uid()) or (shared and public.is_household_member(household_id)))
  with check (public.is_household_member(household_id));
create policy "owner removes" on fin_account for delete to authenticated using (owner_user_id = (select auth.uid()));

-- One balance per account per day, for the net-worth chart.
create table fin_balance (
  account_id  uuid not null references fin_account on delete cascade,
  day         date not null,
  balance     numeric(14, 2) not null,
  primary key (account_id, day)
);

alter table fin_balance enable row level security;
-- Visible and writable exactly when the account is (fin_account's policies apply inside).
create policy "via account" on fin_balance for all to authenticated
  using (exists (select 1 from public.fin_account a where a.id = account_id))
  with check (exists (select 1 from public.fin_account a where a.id = account_id));

-- ───────────────────────── family functions ─────────────────────────
-- The caller's family, created on first use.
create function public.ensure_household() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  hid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select household_id into hid from public.household_member where user_id = uid;
  if hid is null then
    insert into public.household default values returning id into hid;
    insert into public.household_member (household_id, user_id, role) values (hid, uid, 'owner');
  end if;
  return hid;
end $$;

-- Move a person (and their accounts and connections) into another family.
-- Their old family is deleted if nobody is left in it.
create function public.move_to_household(uid uuid, target uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  old uuid;
begin
  select household_id into old from public.household_member where user_id = uid;
  if old = target then return; end if;
  delete from public.household_member where user_id = uid;
  insert into public.household_member (household_id, user_id, role) values (target, uid, new_role);
  update public.fin_item set household_id = target where owner_user_id = uid;
  update public.fin_account set household_id = target where owner_user_id = uid;
  if old is not null and not exists (select 1 from public.household_member where household_id = old) then
    delete from public.household where id = old;
  elsif old is not null and not exists (select 1 from public.household_member where household_id = old and role = 'owner') then
    -- Someone has to be able to manage the family that's left.
    update public.household_member set role = 'owner'
    where household_id = old and user_id = (select user_id from public.household_member where household_id = old order by joined_at limit 1);
  end if;
end $$;
revoke execute on function public.move_to_household(uuid, uuid, text) from public, anon, authenticated;

create function public.invite_hash(token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(token, 'UTF8')), 'hex')
$$;

-- Open = not used, not expired, and not reserved by a sign-up in the last hour
-- (unless by `uid`).
create function public.invite_open(i public.household_invite, uid uuid) returns boolean
language sql stable set search_path = '' as $$
  select i.used_by is null and i.expires_at > now()
     and (i.reserved_for is null or i.reserved_for = uid or i.reserved_at < now() - interval '1 hour')
$$;

-- Who invited you and to which family, for the sign-up page. Nothing if the
-- token is unknown, used or expired.
create function public.invite_info(token text)
returns table (household_name text, invited_by text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select h.name, coalesce(p.display_name, 'A family member'), i.expires_at
  from public.household_invite i
  join public.household h on h.id = i.household_id
  left join public.profile p on p.user_id = i.created_by
  where i.token_hash = public.invite_hash(token) and public.invite_open(i, null)
$$;
grant execute on function public.invite_info(text) to anon, authenticated;

-- A signed-in person accepts an invite (for people who already have an account).
create function public.accept_invite(token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  inv public.household_invite;
  old uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into inv from public.household_invite i
  where i.token_hash = public.invite_hash(token) and public.invite_open(i, uid)
  for update;
  if inv.id is null then raise exception 'This invite link is invalid, used or expired.'; end if;
  select household_id into old from public.household_member where user_id = uid;
  if old is not null and old <> inv.household_id
     and exists (select 1 from public.household_member where household_id = old and user_id <> uid) then
    raise exception 'Leave your current family first.';
  end if;
  update public.household_invite set used_by = uid, used_at = now() where id = inv.id;
  perform public.move_to_household(uid, inv.household_id, 'member');
  return inv.household_id;
end $$;
revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

-- Leave your family: you (and your own accounts) move to a new family of your own.
create function public.leave_household() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  hid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.household default values returning id into hid;
  perform public.move_to_household(uid, hid, 'owner');
  return hid;
end $$;
revoke execute on function public.leave_household() from public, anon;
grant execute on function public.leave_household() to authenticated;

-- An owner removes someone; they get a family of their own, with their accounts.
create function public.remove_household_member(member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
  fresh uuid;
begin
  select household_id into hid from public.household_member where user_id = member;
  if hid is null or not public.is_household_owner(hid) then raise exception 'Only an owner of this family can remove people.'; end if;
  if member = (select auth.uid()) then raise exception 'Use Leave instead.'; end if;
  insert into public.household default values returning id into fresh;
  perform public.move_to_household(member, fresh, 'owner');
end $$;
revoke execute on function public.remove_household_member(uuid) from public, anon;
grant execute on function public.remove_household_member(uuid) to authenticated;

-- ───────────────────────── invite-only sign-up ─────────────────────────
-- Register as the "Before User Created" hook. Rejects sign-ups without a
-- valid invite token in user_metadata.invite, and reserves the invite.
create function public.hook_require_invite(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  token text := event->'user'->'user_metadata'->>'invite';
  uid uuid := (event->'user'->>'id')::uuid;
  hit uuid;
begin
  if token is null or token = '' then
    return jsonb_build_object('error', jsonb_build_object('message', 'Sign-up needs an invite link from a family member.', 'http_code', 403));
  end if;
  update public.household_invite i set reserved_for = uid, reserved_at = now()
  where i.token_hash = public.invite_hash(token) and public.invite_open(i, uid)
  returning id into hit;
  if hit is null then
    return jsonb_build_object('error', jsonb_build_object('message', 'This invite link is invalid, used or expired.', 'http_code', 403));
  end if;
  return '{}'::jsonb;
end $$;
grant execute on function public.hook_require_invite(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_require_invite(jsonb) from public, anon, authenticated;

-- After the user row exists: use the invite the hook reserved, join that
-- family, and copy the name they typed into their profile.
create function public.handle_invited_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
begin
  update public.household_invite set used_by = new.id, used_at = now()
  where id = (select id from public.household_invite where reserved_for = new.id and used_by is null order by reserved_at desc limit 1)
  returning household_id into hid;
  if hid is not null then
    insert into public.household_member (household_id, user_id, role) values (hid, new.id, 'member')
    on conflict (user_id) do nothing;
  end if;
  if new.raw_user_meta_data->>'display_name' is not null then
    update public.profile set display_name = left(new.raw_user_meta_data->>'display_name', 60) where user_id = new.id;
  end if;
  return new;
end $$;

-- Runs after on_auth_user_created (alphabetical), so the profile row exists.
create trigger on_auth_user_joined_family
  after insert on auth.users
  for each row execute function public.handle_invited_user();

-- Your family's members with just their display names (profiles stay private).
create function public.household_members()
returns table (user_id uuid, display_name text, role text, joined_at timestamptz, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select m.user_id, p.display_name, m.role, m.joined_at, m.user_id = (select auth.uid())
  from public.household_member m
  left join public.profile p on p.user_id = m.user_id
  where m.household_id = (select household_id from public.household_member where user_id = (select auth.uid()))
  order by m.joined_at
$$;
revoke execute on function public.household_members() from public, anon;
grant execute on function public.household_members() to authenticated;

revoke execute on function public.ensure_household() from public, anon;
grant execute on function public.ensure_household() to authenticated;
