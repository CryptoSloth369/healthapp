"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { finishLink, getLinkToken, syncNow } from "@/app/(app)/money/actions";
import type { ConnectionType } from "@/lib/plaid";

/** Plaid's Link script, loaded on first use (https://plaid.com/docs/link/web/). */
const SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

type LinkMeta = { institution: { institution_id: string; name: string } | null };
type Handler = { open: () => void; destroy: () => void };
declare global {
  interface Window {
    Plaid?: {
      create(opts: {
        token: string;
        onSuccess: (publicToken: string, meta: LinkMeta) => void;
        onExit?: (err: { display_message?: string | null; error_message?: string } | null) => void;
        receivedRedirectUri?: string;
      }): Handler;
    };
  }
}

function loadPlaid(): Promise<NonNullable<Window["Plaid"]>> {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.Plaid ? resolve(window.Plaid) : reject(new Error("Plaid didn't load.")));
    s.onerror = () => reject(new Error("Couldn't load Plaid. Check your connection."));
    document.head.appendChild(s);
  });
}

/** Saved before opening Link so the OAuth return page (/money/oauth) can resume. */
export const PENDING_LINK_KEY = "plaid-pending-link";
type Pending = { token: string; type?: ConnectionType; itemId?: string };

/** Open Link for a token and finish (save a new connection, or resync after a reconnect). */
export async function runLink(pending: Pending, receivedRedirectUri?: string): Promise<{ error?: string; done?: boolean }> {
  const Plaid = await loadPlaid();
  return new Promise((resolve) => {
    const handler = Plaid.create({
      token: pending.token,
      receivedRedirectUri,
      onSuccess: async (publicToken, meta) => {
        try {
          localStorage.removeItem(PENDING_LINK_KEY);
        } catch {}
        const r = pending.itemId
          ? await syncNow()
          : await finishLink({
              publicToken,
              institutionId: meta.institution?.institution_id ?? null,
              institutionName: meta.institution?.name ?? null,
              type: pending.type ?? "bank",
            });
        handler.destroy();
        resolve(r.error ? { error: r.error } : { done: true });
      },
      onExit: (err) => {
        handler.destroy();
        resolve(err ? { error: err.display_message || err.error_message || "Plaid closed with an error." } : {});
      },
    });
    handler.open();
  });
}

function useLink() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = (input: { type?: ConnectionType; itemId?: string }) =>
    start(async () => {
      setError(null);
      const t = await getLinkToken(input);
      if (!t.token) return setError(t.error ?? "Couldn't start Plaid.");
      const p: Pending = { token: t.token, ...input };
      try {
        localStorage.setItem(PENDING_LINK_KEY, JSON.stringify(p));
      } catch {}
      const r = await runLink(p);
      if (r.error) setError(r.error);
      if (r.done) router.refresh();
    });
  return { go, pending, error };
}

const TYPES: { type: ConnectionType; label: string; hint: string }[] = [
  { type: "bank", label: "Bank or credit card", hint: "Checking, savings, cards" },
  { type: "investments", label: "Investments", hint: "Brokerage, 401(k), IRA, HSA" },
  { type: "loans", label: "Loans", hint: "Student loans, mortgage" },
];

export function ConnectButtons() {
  const { go, pending, error } = useLink();
  return (
    <div className="space-y-2">
      <div className="grid gap-2">
        {TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            disabled={pending}
            onClick={() => go({ type: t.type })}
            className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5 text-left disabled:opacity-50"
          >
            <span>
              <span className="block font-medium">{t.label}</span>
              <span className="block text-xs text-muted">{t.hint}</span>
            </span>
            <span className="text-accent">+</span>
          </button>
        ))}
      </div>
      {pending && <p className="text-xs text-muted">Opening Plaid…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function ReconnectButton({ itemId }: { itemId: string }) {
  const { go, pending, error } = useLink();
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" disabled={pending} onClick={() => go({ itemId })} className="text-sm text-accent disabled:opacity-50">
        {pending ? "Opening…" : "Reconnect"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
