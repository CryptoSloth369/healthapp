-- Health app: tags on journal entries (used for dreams: lucid, nightmare, recurring…).
-- Same format as mood_entry.tags. Run once, after 0008.

alter table journal_entry
  add column tags text[] not null default '{}';
