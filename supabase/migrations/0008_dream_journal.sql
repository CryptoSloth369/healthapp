-- Health app: dream journal. Journal entries get a kind, so dreams are kept
-- apart from regular entries (and can be analyzed on their own later).
-- Existing entries stay regular journal entries. Run once, after 0005.

alter table journal_entry
  add column kind text not null default 'journal' check (kind in ('journal', 'dream'));

create index journal_entry_user_kind_day on journal_entry (user_id, kind, written_on desc, written_at desc);
