"use client";

import { useCallback, useState, useTransition } from "react";
import { lookupBarcode, searchFoodDb } from "./actions";
import { toDraft, type DbFood } from "@/lib/food-db";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { card, input } from "@/components/ui";
import type { EntryDraft } from "../entry-form";

/** Search USDA / scan a barcode, pick a portion, and hand a draft to the entry form. */
export function FoodDbSearch({ initialQuery, onPick }: { initialQuery: string; onPick: (d: EntryDraft) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<DbFood[] | null>(null);
  const [picked, setPicked] = useState<DbFood | null>(null);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function search(q = query) {
    setMsg(null);
    setPicked(null);
    start(async () => {
      const r = await searchFoodDb(q);
      if ("error" in r) return setMsg(r.error);
      setResults(r.foods);
      if (r.foods.length === 0) setMsg("No matches. Try fewer or different words.");
    });
  }

  const onCode = useCallback((code: string) => {
    setScanning(false);
    setMsg(`Looking up ${code}…`);
    setResults(null);
    start(async () => {
      const r = await lookupBarcode(code);
      if ("error" in r) return setMsg(r.error);
      if ("notFound" in r) return setMsg(`Barcode ${r.barcode} isn't in the databases. Enter it manually below (tick "Save to My foods" so next time is one tap).`);
      setMsg(null);
      choose(r.food);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(f: DbFood) {
    if (f.serving && f.per100g) setPicked(f); // let the user choose serving vs 100 g
    else onPick(toDraft(f, f.serving ? "serving" : "100g"));
  }

  const label = (f: DbFood) =>
    f.serving ? `${f.serving.nutr.kcal} kcal · ${f.serving.label}` : f.per100g ? `${f.per100g.kcal} kcal · 100 g` : "";

  return (
    <section className={`${card} space-y-2`}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Food database</h2>
        <button type="button" className="text-sm font-medium text-accent" onClick={() => setScanning(true)}>
          Scan barcode
        </button>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input className={input} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. chicken breast, greek yogurt" aria-label="Search food database" />
        <button type="submit" className="shrink-0 rounded-xl border border-border px-3 text-sm" disabled={pending || query.trim().length < 2}>
          {pending ? "…" : "Search"}
        </button>
      </form>

      {picked && (
        <div className="space-y-2 rounded-xl border border-accent/50 p-3">
          <p className="font-medium">
            {picked.name}
            {picked.brand && <span className="text-sm text-muted"> · {picked.brand}</span>}
          </p>
          <p className="text-xs text-muted">Log by:</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="rounded-xl border border-border px-2 py-2 text-sm" onClick={() => onPick(toDraft(picked, "serving"))}>
              Serving
              <span className="block text-xs text-muted">
                {picked.serving!.label} · {picked.serving!.nutr.kcal} kcal
              </span>
            </button>
            <button type="button" className="rounded-xl border border-border px-2 py-2 text-sm" onClick={() => onPick(toDraft(picked, "100g"))}>
              Weight
              <span className="block text-xs text-muted">per 100 g · {picked.per100g!.kcal} kcal</span>
            </button>
          </div>
        </div>
      )}

      {results && results.length > 0 && !picked && (
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {results.map((f) => (
            <li key={f.key}>
              <button type="button" onClick={() => choose(f)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
                <span className="min-w-0">
                  <span className="block truncate">{f.name}</span>
                  <span className="block truncate text-xs text-muted">{f.brand ?? "Generic (USDA)"}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{label(f)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="text-sm text-muted">{msg}</p>}
      <p className="text-[11px] text-muted">Data: USDA FoodData Central and Open Food Facts. Check labels for exact values.</p>
      {scanning && <BarcodeScanner onCode={onCode} onClose={() => setScanning(false)} />}
    </section>
  );
}
