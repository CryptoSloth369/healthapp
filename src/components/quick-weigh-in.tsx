"use client";

import { useState } from "react";
import Link from "next/link";
import { WeightForm } from "./weight-form";
import { card } from "./ui";

/** Today-screen card: log today's weight in one tap, or show it if logged. */
export function QuickWeighIn({
  today,
  todayWeight,
  trend,
  rate,
}: {
  today: string;
  todayWeight: number | null;
  trend: number | null;
  rate: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const showForm = todayWeight == null || editing;

  return (
    <section className={`${card} space-y-3`}>
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">Weigh-in</p>
        <Link href="/weight" className="text-sm text-accent">
          History →
        </Link>
      </div>

      {showForm ? (
        <WeightForm
          key={formKey}
          compact
          today={today}
          draft={todayWeight == null ? null : { day: today, weight: String(todayWeight), note: "" }}
          onSaved={() => {
            setEditing(false);
            setFormKey((k) => k + 1);
          }}
        />
      ) : (
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-semibold">
              {todayWeight!.toFixed(1)} <span className="text-base font-normal text-muted">lb today</span>
            </p>
          </div>
          <button type="button" className="text-sm text-muted" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      )}

      {trend != null && (
        <p className="text-sm text-muted">
          Trend <span className="text-foreground">{trend.toFixed(1)} lb</span>
          {rate != null && (
            <>
              {" · "}
              <span className="text-foreground">
                {rate > 0 ? "+" : ""}
                {rate.toFixed(1)} lb/week
              </span>
            </>
          )}
        </p>
      )}
    </section>
  );
}
