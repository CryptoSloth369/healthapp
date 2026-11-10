"use client";

import { useEffect, useRef, useState } from "react";
import type { Proposal, Turn } from "@/lib/assistant/display";
import { Markdown } from "@/components/markdown";
import { ProposalCard } from "./proposal-card";

type LiveTurn = Turn & { status?: string; error?: string; streaming?: boolean };

const SUGGESTIONS = [
  "How did my last week go?",
  "Why has my weight trend stalled (or not)?",
  "Am I eating enough protein on lifting days?",
  "Plan next week's workouts based on what I usually do",
  "What patterns do you see between my sleep, mood and training?",
  "Is my calorie target still right for my goal?",
];

export function Chat({ conversationId: initialId, initial }: { conversationId: number | null; initial: Turn[] }) {
  const [id, setId] = useState(initialId);
  const [turns, setTurns] = useState<LiveTurn[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  function patchLast(f: (t: Extract<LiveTurn, { role: "assistant" }>) => Partial<LiveTurn>) {
    setTurns((ts) => {
      const last = ts[ts.length - 1];
      if (!last || last.role !== "assistant") return ts;
      return [...ts.slice(0, -1), { ...last, ...f(last as Extract<LiveTurn, { role: "assistant" }>) } as LiveTurn];
    });
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setTurns((ts) => [
      ...ts,
      { role: "user", text: message },
      { role: "assistant", text: "", looked: [], proposals: [], status: "Thinking…", streaming: true },
    ]);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, message }),
      });
      if (!res.ok || !res.body) throw new Error(res.status === 401 ? "You're signed out." : `Request failed (${res.status}).`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "conversation") {
            if (ev.id !== id) {
              setId(ev.id);
              window.history.replaceState(null, "", `/coach/${ev.id}`);
            }
          } else if (ev.type === "text") {
            patchLast((t) => ({ text: t.text + ev.delta, status: undefined }));
          } else if (ev.type === "status") {
            patchLast(() => ({ status: ev.text }));
          } else if (ev.type === "proposal") {
            const p: Proposal = { id: ev.id, name: ev.name, input: ev.input };
            patchLast((t) => ({ proposals: [...t.proposals, p] }));
          } else if (ev.type === "error") {
            patchLast(() => ({ error: ev.message }));
          }
        }
      }
    } catch (e) {
      patchLast(() => ({ error: (e as Error).message || "Connection lost. Try again." }));
    } finally {
      patchLast(() => ({ streaming: false, status: undefined }));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {turns.length === 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            Ask about your food, weight, workouts, lifts, mood or sleep. The coach looks up your actual logs before answering.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-3 py-1.5 text-left text-sm">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {turns.map((t, i) =>
        t.role === "user" ? (
          <div key={i} className="ml-10 self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent/20 px-3.5 py-2.5 text-[15px]">
            {t.text}
          </div>
        ) : (
          <div key={i} className="space-y-2 rounded-2xl rounded-bl-md border border-border bg-surface px-3.5 py-3">
            {t.looked.length > 0 && <p className="text-xs text-muted">Looked at: {t.looked.join(", ")}</p>}
            {t.text && <Markdown text={t.text} />}
            {t.streaming && t.status && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
                {t.status}
              </p>
            )}
            {t.proposals.map((p) => (
              <ProposalCard key={p.id} p={p} />
            ))}
            {t.error && <p className="text-sm text-danger">{t.error}</p>}
          </div>
        ),
      )}
      <div ref={endRef} />

      <form
        className="sticky bottom-24 flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 outline-none"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={busy ? "Working on it…" : "Ask your coach"}
          aria-label="Message"
          maxLength={4000}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-accent px-4 py-2 font-semibold text-accent-fg disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
