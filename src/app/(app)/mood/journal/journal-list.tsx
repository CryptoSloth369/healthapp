"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteJournal } from "./actions";
import { JOURNAL_KINDS, excerpt, groupByDay } from "@/lib/journal";
import { MOOD_LABELS } from "@/lib/mood";
import { formatDay } from "@/lib/dates";
import type { JournalListItem } from "@/lib/types";

function Entry({ e }: { e: JournalListItem }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const short = excerpt(e.body);
  const info = JOURNAL_KINDS[e.kind];

  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
        <span suppressHydrationWarning>
          {new Date(e.written_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          {e.updated_at && " · edited"}
          {e.checkin && ` · Check-in (${MOOD_LABELS[e.checkin.mood]})`}
        </span>
        {e.checkin ? (
          <Link href={`/mood?edit=${e.checkin.id}`} onClick={() => window.scrollTo({ top: 0 })}>
            Edit check-in
          </Link>
        ) : (
          <span className="flex gap-3">
            <Link href={`${info.path}?edit=${e.id}`} onClick={() => window.scrollTo({ top: 0 })}>
              Edit
            </Link>
            <button
              type="button"
              disabled={pending}
              className="disabled:opacity-50"
              onClick={() => {
                if (confirm(`Delete this ${info.noun}?`)) start(() => deleteJournal(e.id, e.kind));
              }}
            >
              Delete
            </button>
          </span>
        )}
      </div>
      {e.tags.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Tags">
          {e.tags.map((t) => (
            <li key={t} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
              {t}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{open ? e.body : short.text}</p>
      {short.cut && (
        <button type="button" className="mt-1 text-xs font-medium text-accent" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </li>
  );
}

export function JournalList({
  entries,
  moodByDay,
  empty,
}: {
  entries: JournalListItem[];
  moodByDay: Record<string, number>;
  empty: string;
}) {
  if (entries.length === 0) return <p className="text-sm text-muted">{empty}</p>;

  return (
    <div className="space-y-4">
      {groupByDay(entries).map((g) => {
        const mood = moodByDay[g.day];
        const level = mood == null ? null : Math.round(mood);
        return (
          <section key={g.day}>
            <h3 className="flex items-center justify-between border-b border-border pb-1.5 text-sm font-semibold">
              {formatDay(g.day)}
              {level != null && (
                <span
                  className="rounded-md px-2 py-0.5 text-xs font-medium"
                  style={{ background: `var(--mood-${level})`, color: `var(--mood-${level}-fg)` }}
                  title={`Average mood ${mood}`}
                >
                  Mood: {MOOD_LABELS[level]}
                </span>
              )}
            </h3>
            <ul className="divide-y divide-border">
              {g.entries.map((e) => (
                <Entry key={e.checkin ? `c${e.id}` : e.id} e={e} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
