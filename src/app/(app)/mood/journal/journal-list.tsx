"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteJournal } from "./actions";
import { excerpt, groupByDay } from "@/lib/journal";
import { MOOD_LABELS } from "@/lib/mood";
import { formatDay } from "@/lib/dates";
import type { JournalEntry } from "@/lib/types";

function Entry({ e }: { e: JournalEntry }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const short = excerpt(e.body);

  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
        <span suppressHydrationWarning>
          {new Date(e.written_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          {e.updated_at && " · edited"}
        </span>
        <span className="flex gap-3">
          <Link href={`/mood/journal?edit=${e.id}`} onClick={() => window.scrollTo({ top: 0 })}>
            Edit
          </Link>
          <button
            type="button"
            disabled={pending}
            className="disabled:opacity-50"
            onClick={() => {
              if (confirm("Delete this journal entry?")) start(() => deleteJournal(e.id));
            }}
          >
            Delete
          </button>
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{open ? e.body : short.text}</p>
      {short.cut && (
        <button type="button" className="mt-1 text-xs font-medium text-accent" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </li>
  );
}

export function JournalList({ entries, moodByDay }: { entries: JournalEntry[]; moodByDay: Record<string, number> }) {
  if (entries.length === 0) return <p className="text-sm text-muted">No entries yet. Your first one can be a single sentence.</p>;

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
                <Entry key={e.id} e={e} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
