"use client";

import { useRef, useState, useTransition } from "react";
import { WeightForm, type WeightDraft } from "@/components/weight-form";
import { WeightChart } from "@/components/weight-chart";
import { card } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import type { TrendPoint } from "@/lib/trend";
import type { WeightEntry } from "@/lib/types";
import { deleteWeight } from "./actions";

export function WeightView({
  today,
  entries,
  points,
  goalLb,
}: {
  today: string;
  entries: WeightEntry[];
  points: TrendPoint[];
  goalLb: number | null;
}) {
  const [draft, setDraft] = useState<WeightDraft | null>(null);
  const [formKey, setFormKey] = useState(0); // bump to reset the form
  const formRef = useRef<HTMLElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const trendByDay = new Map(points.map((p) => [p.day, p.trend]));

  return (
    <>
      <section ref={formRef} className={`${card} scroll-mt-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{draft ? `Edit ${formatDay(draft.day)}` : "Log a weigh-in"}</h2>
          {draft && (
            <button type="button" className="text-sm text-muted" onClick={() => setDraft(null)}>
              Cancel
            </button>
          )}
        </div>
        <WeightForm
          key={`${formKey}-${draft?.day ?? "new"}`}
          today={today}
          draft={draft}
          onSaved={() => {
            setDraft(null);
            setFormKey((k) => k + 1);
          }}
        />
        <p className="text-xs text-muted">One weigh-in per day; saving a date again replaces it.</p>
      </section>

      <section className={card}>
        <WeightChart points={points} goalLb={goalLb} />
      </section>

      <section className={card}>
        <h2 className="mb-2 font-semibold">History</h2>
        {error && <p className="mb-2 text-sm text-danger">{error}</p>}
        {entries.length === 0 ? (
          <p className="text-sm text-muted">No weigh-ins yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 font-normal">Date</th>
                <th className="py-1 text-right font-normal">Weight</th>
                <th className="py-1 text-right font-normal">Trend</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="py-2">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => {
                        setDraft({ day: e.measured_on, weight: String(e.weight_lb), note: e.note ?? "" });
                        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      {formatDay(e.measured_on)}
                      {e.note && <span className="block text-xs text-muted">{e.note}</span>}
                    </button>
                  </td>
                  <td className="py-2 text-right font-medium">{Number(e.weight_lb).toFixed(1)}</td>
                  <td className="py-2 text-right text-muted">{trendByDay.get(e.measured_on)?.toFixed(1)}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      className="text-xs text-muted disabled:opacity-50"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Delete the ${formatDay(e.measured_on)} weigh-in?`)) return;
                        startTransition(async () => {
                          const r = await deleteWeight(e.id);
                          setError(r.error ?? null);
                        });
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {entries.length > 0 && <p className="mt-2 text-xs text-muted">Tap a date to edit it.</p>}
      </section>
    </>
  );
}
