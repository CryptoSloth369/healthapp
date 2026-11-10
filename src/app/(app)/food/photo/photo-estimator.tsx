"use client";

import { useRef, useState, useTransition } from "react";
import { estimatePhotoAction, savePhotoItems, type ReviewedItem } from "./actions";
import { MEALS, MEAL_LABELS, mealForHour, type Meal } from "@/lib/nutrition";
import type { PhotoEstimate } from "@/lib/photo-estimate-schema";
import { button, buttonGhost, card, input, label } from "@/components/ui";

const MAX_SIDE = 1280;

/** Downscale to ≤1280px JPEG so uploads are small and fast. */
async function resizeImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Row = ReviewedItem & { include: boolean; key: number };
const AMOUNTS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

export function PhotoEstimator({ day, meal: mealParam }: { day: string; meal: Meal | null }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [meal, setMeal] = useState<Meal>(() => mealParam ?? mealForHour(new Date().getHours()));
  const [estimating, startEstimate] = useTransition();
  const [saving, startSave] = useTransition();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setRows(null);
    try {
      setImage(await resizeImage(file));
    } catch {
      setError("That photo couldn't be opened. Try another one.");
    }
  }

  function estimate() {
    if (!image) return;
    setError(null);
    startEstimate(async () => {
      const r = await estimatePhotoAction(image, hint);
      if ("error" in r) return setError(r.error);
      applyEstimate(r.estimate);
    });
  }

  function applyEstimate(est: PhotoEstimate) {
    if (!est.is_food || est.items.length === 0) {
      setError("No food found in that photo. Try a clearer shot, or add a note describing it.");
      return;
    }
    setNotes(est.notes);
    setRows(
      est.items.map((i, key) => ({
        key,
        include: true,
        name: i.name,
        portion: i.portion,
        servings: 1,
        kcal: i.kcal,
        protein_g: i.protein_g,
        carbs_g: i.carbs_g,
        fat_g: i.fat_g,
        confidence: i.confidence,
      })),
    );
  }

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function save() {
    if (!rows) return;
    setError(null);
    startSave(async () => {
      const r = await savePhotoItems({ day, meal, items: rows.filter((x) => x.include), imageDataUrl: image });
      if (r?.error) setError(r.error);
    });
  }

  const included = rows?.filter((r) => r.include) ?? [];
  const total = Math.round(included.reduce((a, r) => a + r.kcal * r.servings, 0));

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      <section className={`${card} space-y-3`}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
          <img src={image} alt="Meal photo" className="max-h-72 w-full rounded-xl object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted"
          >
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path d="M3 8a2 2 0 012-2h2l1.5-2h7L17 6h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Take or choose a photo
          </button>
        )}

        {image && !rows && (
          <>
            <label className="block">
              <span className={label}>Note (optional, improves accuracy)</span>
              <input
                className={input}
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="e.g. ate about half, cooked in butter, large bowl"
                maxLength={500}
              />
            </label>
            <div className="flex gap-2">
              <button type="button" className={`${buttonGhost} flex-1`} onClick={() => fileRef.current?.click()} disabled={estimating}>
                Retake
              </button>
              <button type="button" className={`${button} flex-[2]`} onClick={estimate} disabled={estimating}>
                {estimating ? "Estimating… (~20s)" : "Estimate calories"}
              </button>
            </div>
          </>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </section>

      {rows && (
        <section className={`${card} space-y-3`}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Review the estimate</h2>
            <span className="text-sm">
              <span className="font-semibold">{total.toLocaleString()}</span> <span className="text-muted">kcal</span>
            </span>
          </div>
          <p className="text-xs text-muted">
            Photo estimates are often off by 20–30%. Fix anything that looks wrong; the amount scales all values.
          </p>
          {notes && <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted">{notes}</p>}

          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.key} className={`space-y-2 rounded-xl border border-border p-3 ${r.include ? "" : "opacity-50"}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => update(r.key, { include: e.target.checked })}
                    className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                    aria-label={`Include ${r.name}`}
                  />
                  <input
                    className={`${input} py-1.5`}
                    value={r.name}
                    onChange={(e) => update(r.key, { name: e.target.value })}
                    aria-label="Food name"
                  />
                  {r.confidence === "low" && (
                    <span className="shrink-0 rounded-md border border-warn px-1.5 py-0.5 text-[11px] text-warn">unsure</span>
                  )}
                </div>
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <input
                    className={`${input} py-1.5 text-sm`}
                    value={r.portion}
                    onChange={(e) => update(r.key, { portion: e.target.value })}
                    aria-label="Portion"
                  />
                  <select
                    className={`${input} py-1.5`}
                    value={r.servings}
                    onChange={(e) => update(r.key, { servings: Number(e.target.value) })}
                    aria-label="Amount eaten"
                  >
                    {AMOUNTS.map((a) => (
                      <option key={a} value={a}>
                        ×{a}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <NumField label="kcal" value={r.kcal} onChange={(v) => update(r.key, { kcal: v ?? 0 })} />
                  <NumField label="Protein" value={r.protein_g} onChange={(v) => update(r.key, { protein_g: v })} />
                  <NumField label="Carbs" value={r.carbs_g} onChange={(v) => update(r.key, { carbs_g: v })} />
                  <NumField label="Fat" value={r.fat_g} onChange={(v) => update(r.key, { fat_g: v })} />
                </div>
                {r.servings !== 1 && (
                  <p className="text-xs text-muted">
                    Logs {Math.round(r.kcal * r.servings).toLocaleString()} kcal (×{r.servings})
                  </p>
                )}
              </li>
            ))}
          </ul>

          <label className="block">
            <span className={label}>Meal</span>
            <select className={input} value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
              {MEALS.map((m) => (
                <option key={m} value={m}>
                  {MEAL_LABELS[m]}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              className={`${buttonGhost} flex-1`}
              disabled={saving}
              onClick={() => {
                setRows(null);
                setNotes("");
              }}
            >
              Back
            </button>
            <button type="button" className={`${button} flex-[2]`} disabled={saving || included.length === 0} onClick={save}>
              {saving ? "Saving…" : `Add ${included.length} item${included.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function NumField({ label: text, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [raw, setRaw] = useState(value == null ? "" : String(value));
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] text-muted">{text}</span>
      <input
        className={`${input} px-2 py-1.5 text-sm`}
        inputMode="decimal"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          const n = Number(e.target.value);
          onChange(e.target.value.trim() === "" ? null : Number.isFinite(n) && n >= 0 ? n : value);
        }}
      />
    </label>
  );
}
