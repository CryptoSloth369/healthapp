"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { QuickPick } from "@/lib/food";
import { mealForHour, type Meal } from "@/lib/nutrition";
import { card, input } from "@/components/ui";
import { EntryForm, type EntryDraft } from "../entry-form";
import { deleteSavedFood } from "../actions";

export function AddFood({ day, meal, picks }: { day: string; meal: Meal | null; picks: QuickPick[] }) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLElement>(null);
  const [defaultMeal] = useState<Meal>(() => meal ?? mealForHour(new Date().getHours()));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return picks
      .filter((p) => !(p.savedFoodId && removed.has(p.savedFoodId)))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .slice(0, q ? 50 : 15);
  }, [picks, query, removed]);

  function choose(p: QuickPick) {
    setDraft({
      name: p.name,
      serving: p.serving,
      servings: 1,
      kcal: p.kcal,
      protein_g: p.protein_g,
      carbs_g: p.carbs_g,
      fat_g: p.fat_g,
      savedFoodId: p.savedFoodId,
    });
    setFormKey((k) => k + 1);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <>
      {picks.length > 0 && (
        <section className={`${card} space-y-2`}>
          <input
            className={input}
            type="search"
            placeholder="Search my foods & recent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search foods"
          />
          {visible.length === 0 ? (
            <p className="py-2 text-sm text-muted">No matches. Enter it below.</p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((p) => (
                <li key={p.key} className="flex items-center gap-2">
                  <button type="button" onClick={() => choose(p)} className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 text-left">
                    <span className="min-w-0">
                      <span className="block truncate">
                        {p.name}
                        {p.saved && <span className="ml-1.5 text-xs text-accent">★</span>}
                      </span>
                      {p.serving && <span className="block truncate text-xs text-muted">{p.serving}</span>}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">{p.kcal} kcal</span>
                  </button>
                  {p.savedFoodId && (
                    <button
                      type="button"
                      className="px-1 text-muted"
                      aria-label={`Remove ${p.name} from My foods`}
                      onClick={() => {
                        if (!confirm(`Remove "${p.name}" from My foods? Past entries are kept.`)) return;
                        const sid = p.savedFoodId!;
                        setRemoved((r) => new Set(r).add(sid));
                        startTransition(async () => {
                          await deleteSavedFood(sid);
                        });
                      }}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">★ = saved in My foods. Tap a food to log it.</p>
        </section>
      )}

      <section ref={formRef} className={`${card} scroll-mt-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{draft ? draft.name : "Enter manually"}</h2>
          {draft && (
            <button
              type="button"
              className="text-sm text-muted"
              onClick={() => {
                setDraft(null);
                setFormKey((k) => k + 1);
              }}
            >
              Clear
            </button>
          )}
        </div>
        <EntryForm key={formKey} day={day} meal={defaultMeal} draft={draft} submitLabel="Add to log" />
      </section>
    </>
  );
}
