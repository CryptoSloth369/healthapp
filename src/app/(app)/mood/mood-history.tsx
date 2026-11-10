"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deleteMood } from "./actions";
import { ENERGY_LABELS, MOOD_LABELS, STRESS_LABELS } from "@/lib/mood";
import { formatDay } from "@/lib/dates";
import type { MoodEntry } from "@/lib/types";

export function MoodHistory({ entries }: { entries: MoodEntry[] }) {
  const [pending, start] = useTransition();
  if (entries.length === 0) return <p className="text-sm text-muted">No check-ins yet.</p>;

  return (
    <ul className="divide-y divide-border">
      {entries.map((e) => (
        <li key={e.id} className="flex gap-3 py-2.5">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
            style={{ background: `var(--mood-${e.mood})`, color: `var(--mood-${e.mood}-fg)` }}
            aria-hidden
          >
            {e.mood}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">{MOOD_LABELS[e.mood]}</span>
              <span className="text-muted">
                {" · "}
                {formatDay(e.logged_on)}
                {", "}
                <span suppressHydrationWarning>
                  {new Date(e.logged_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              </span>
            </p>
            <p className="text-xs text-muted">
              {[
                e.energy && `Energy: ${ENERGY_LABELS[e.energy].toLowerCase()}`,
                e.stress && `Stress: ${STRESS_LABELS[e.stress].toLowerCase()}`,
                e.sleep_hours != null && `Slept ${e.sleep_hours}h`,
                e.tags.length > 0 && e.tags.join(", "),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {e.note && <p className="mt-0.5 text-sm">{e.note}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
            <Link href={`/mood?edit=${e.id}`} className="text-muted" onClick={() => window.scrollTo({ top: 0 })}>
              Edit
            </Link>
            <button
              type="button"
              disabled={pending}
              className="text-muted disabled:opacity-50"
              onClick={() => {
                if (confirm("Delete this check-in?")) start(() => deleteMood(e.id));
              }}
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
