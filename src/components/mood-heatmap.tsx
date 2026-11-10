"use client";

import { useState } from "react";
import type { DayMood } from "@/lib/mood";
import { MOOD_LABELS } from "@/lib/mood";
import { addDays, formatDay } from "@/lib/dates";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Calendar heatmap: one column per week (Mon–Sun), color = that day's average mood. */
export function MoodHeatmap({ days, today, weeks = 12 }: { days: DayMood[]; today: string; weeks?: number }) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const dow = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7;
  const firstMonday = addDays(today, -dow - (weeks - 1) * 7);
  const [picked, setPicked] = useState<string | null>(null);
  const p = picked ? byDay.get(picked) : null;

  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(firstMonday, w * 7 + d)));

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <div className="grid grid-rows-7 gap-1 pr-0.5 text-[10px] leading-none text-muted">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="flex h-full items-center">
              {i % 2 === 0 ? w : ""}
            </span>
          ))}
        </div>
        {cols.map((col, ci) => (
          <div key={ci} className="grid max-w-7 flex-1 grid-rows-7 gap-1">
            {col.map((day) => {
              const d = byDay.get(day);
              const future = day > today;
              const level = d ? Math.min(5, Math.max(1, Math.round(d.mood))) : null;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={future}
                  onClick={() => setPicked(day === picked ? null : day)}
                  aria-label={`${formatDay(day)}: ${d ? `mood ${d.mood}` : "no check-in"}`}
                  className={`aspect-square w-full rounded-[3px] ${future ? "opacity-0" : ""} ${
                    day === picked ? "ring-2 ring-foreground ring-offset-1 ring-offset-surface" : ""
                  } ${level == null && !future ? "border border-border" : ""}`}
                  style={level ? { background: `var(--mood-${level})` } : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>{formatDay(firstMonday, { month: "short", day: "numeric" })} – today</span>
        <span className="flex items-center gap-1" aria-label="Legend: mood 1 (awful) to 5 (great)">
          Awful
          {[1, 2, 3, 4, 5].map((l) => (
            <span key={l} className="inline-block h-3 w-3 rounded-[2px]" style={{ background: `var(--mood-${l})` }} />
          ))}
          Great
        </span>
      </div>

      {picked && (
        <p className="rounded-lg bg-background px-3 py-2 text-sm">
          <span className="text-muted">{formatDay(picked)}: </span>
          {p ? (
            <>
              <strong>{p.mood}</strong> {MOOD_LABELS[Math.round(p.mood)]}
              {p.sleep != null && <span className="text-muted"> · slept {p.sleep}h</span>}
              {p.tags.length > 0 && <span className="text-muted"> · {p.tags.join(", ")}</span>}
              {p.count > 1 && <span className="text-muted"> · {p.count} check-ins</span>}
            </>
          ) : (
            <span className="text-muted">No check-in</span>
          )}
        </p>
      )}
    </div>
  );
}
