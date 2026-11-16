-- Money, part 2 (roadmap step 14): transactions and category rules.
-- Run once in the Supabase SQL Editor, after 0009.

-- Transactions from Plaid's Transactions Sync. amount follows Plaid:
-- positive = money out (a purchase), negative = money in (refund, payment).
create table fin_transaction (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null references fin_account on delete cascade,
  plaid_transaction_id  text not null unique,
  day                   date not null,            -- the date Plaid reports (posted, or authorized while pending)
  amount                numeric(14, 2) not null,
  name                  text not null,
  merchant_name         text,
  pending               boolean not null default false,
  pfc_primary           text,                     -- Plaid personal_finance_category
  pfc_detailed          text,
  category_override     text,                     -- set by a person; wins over rules and Plaid
  created_at            timestamptz not null default now()
);
create index fin_transaction_account_day on fin_transaction (account_id, day);

alter table fin_transaction enable row level security;
-- Visible and editable exactly when its account is (fin_account's policies apply inside).
create policy "via account" on fin_transaction for all to authenticated
  using (exists (select 1 from public.fin_account a where a.id = account_id))
  with check (exists (select 1 from public.fin_account a where a.id = account_id));

-- "Always put <merchant> in <category>", shared by the family.
create table fin_category_rule (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household on delete cascade,
  match         text not null check (char_length(match) between 2 and 80),   -- lowercase text found in the merchant or name
  category      text not null check (char_length(category) between 1 and 40),
  created_by    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at    timestamptz not null default now(),
  unique (household_id, match)
);

alter table fin_category_rule enable row level security;
create policy "family" on fin_category_rule for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

notify pgrst, 'reload schema';
