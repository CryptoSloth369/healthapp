"use client";

import { useState } from "react";
import { normalizeTags } from "@/lib/mood";
import { input } from "./ui";

/** Toggleable tag chips plus a box to add your own. Emits hidden `tags` inputs. */
export function TagPicker({ suggestions, initial }: { suggestions: string[]; initial: string[] }) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [extra, setExtra] = useState<string[]>(initial.filter((t) => !suggestions.includes(t)));
  const [draft, setDraft] = useState("");
  const all = [...suggestions, ...extra];

  function add() {
    const [t] = normalizeTags([draft]);
    setDraft("");
    if (!t) return;
    if (!all.includes(t)) setExtra((e) => [...e, t]);
    if (!selected.includes(t)) setSelected((s) => [...s, t]);
  }

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm text-muted">
        Tags <span className="text-xs">(optional)</span>
      </legend>
      {selected.map((t) => (
        <input key={t} type="hidden" name="tags" value={t} />
      ))}
      <div className="flex flex-wrap gap-1.5">
        {all.map((t) => {
          const on = selected.includes(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => setSelected((s) => (on ? s.filter((x) => x !== t) : [...s, t]))}
              className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted"}`}
            >
              {t}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          className={`${input} py-1.5 text-sm`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add your own tag"
          maxLength={24}
          aria-label="New tag"
        />
        <button type="button" onClick={add} className="rounded-xl border border-border px-3 text-sm">
          Add
        </button>
      </div>
    </fieldset>
  );
}
