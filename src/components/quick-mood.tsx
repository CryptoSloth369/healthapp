"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { quickMood } from "@/app/(app)/mood/actions";
import { MOOD_LABELS } from "@/lib/mood";
import { card } from "./ui";

/** Today-screen card: one tap to log mood; links to the full check-in. */
export function QuickMood({ today, latest }: { today: string; latest: { mood: number; at: string } | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className={`${card} space-y-3`}>
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">How are you feeling?</p>
        <Link href="/mood" className="text-sm text-accent">
          Full check-in →
        </Link>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await quickMood(v, today);
                setError(r.error ?? null);
              })
            }
            className="flex flex-col items-center rounded-xl border border-border px-1 py-2 text-muted disabled:opacity-50"
          >
            <span className="text-lg font-semibold text-foreground">{v}</span>
            <span className="text-[11px]">{MOOD_LABELS[v]}</span>
          </button>
        ))}
      </div>
      {latest && (
        <p className="text-sm text-muted">
          Last today: <span className="text-foreground">{MOOD_LABELS[latest.mood]}</span> at{" "}
          {/* Time is formatted in the phone's zone; the server render may differ. */}
          <span suppressHydrationWarning>
            {new Date(latest.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
