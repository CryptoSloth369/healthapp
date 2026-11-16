"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CATEGORIES } from "@/lib/spending";
import { deleteRule, setTransactionCategory } from "./actions";
import { buttonGhost } from "@/components/ui";

/** Which accounts to include; changes the URL so the page reloads its data. */
export function AccountFilter({ value, options, month }: { value: string; options: { value: string; label: string }[]; month: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="Accounts"
      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
      value={value}
      onChange={(e) => router.push(`/money/spending?month=${month}&acct=${encodeURIComponent(e.target.value)}`)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Change one transaction's category, optionally for every purchase at that merchant. */
export function CategoryEditor({ id, current, auto, merchant }: { id: string; current: string; auto: boolean; merchant: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="space-y-2 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await setTransactionCategory(id, String(f.get("category")), f.get("always") === "on");
          setError(r.error ?? null);
          setSaved(!r.error);
        });
      }}
    >
      <select name="category" defaultValue={auto ? "" : current} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" aria-label="Category">
        <option value="">Automatic</option>
        {CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="always" className="h-4 w-4 accent-[var(--accent)]" /> Always for &ldquo;{merchant}&rdquo;
      </label>
      <button className={`${buttonGhost} w-full py-1.5 text-sm`} disabled={pending}>
        {pending ? "Saving…" : saved ? "Saved" : "Save category"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

export function DeleteRule({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="text-sm text-danger disabled:opacity-50" disabled={pending} onClick={() => start(async () => void (await deleteRule(id)))}>
      {pending ? "…" : "Remove"}
    </button>
  );
}
