"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { saveJournal, type JournalFormState } from "./actions";
import { JOURNAL_MAX_CHARS } from "@/lib/journal";
import type { JournalEntry } from "@/lib/types";
import { DictationButton } from "@/components/dictation-button";
import { button, input, label } from "@/components/ui";

const DRAFT_KEY = "journal-draft";

function saveDraft(value: string) {
  try {
    if (value.trim()) localStorage.setItem(DRAFT_KEY, value);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function JournalForm({ today, entry }: { today: string; entry: JournalEntry | null }) {
  const [state, action, pending] = useActionState<JournalFormState, FormData>(saveJournal, {});
  const body = useRef<HTMLTextAreaElement>(null);

  // A new entry keeps an unsaved draft on this phone, so dictation isn't lost on navigation.
  useEffect(() => {
    if (entry || !body.current || body.current.value) return;
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) body.current.value = draft;
    } catch {
      /* storage unavailable */
    }
  }, [entry]);

  const remember = entry ? undefined : saveDraft;

  return (
    <form
      className="space-y-3"
      // Submitted by hand so the text stays in the box if saving fails.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (!entry) saveDraft("");
        startTransition(() => action(data));
      }}
    >
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <label className="block">
        <span className="sr-only">Journal entry</span>
        <textarea
          ref={body}
          className={`${input} min-h-48 leading-relaxed`}
          name="body"
          defaultValue={entry?.body ?? ""}
          placeholder="What's on your mind?"
          maxLength={JOURNAL_MAX_CHARS}
          onInput={remember ? (e) => remember(e.currentTarget.value) : undefined}
        />
      </label>
      <DictationButton target={body} onText={remember} />

      <label className="block">
        <span className={label}>Date</span>
        <input className={input} type="date" name="written_on" defaultValue={entry?.written_on ?? today} max={today} required />
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className={`${button} w-full`} disabled={pending}>
        {pending ? "Saving…" : entry ? "Save changes" : "Save entry"}
      </button>
    </form>
  );
}
