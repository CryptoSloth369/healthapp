"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PENDING_LINK_KEY, runLink } from "@/components/plaid-link";

/** Back from a bank's own sign-in page (OAuth): reopen Plaid Link where it left off. */
export function ResumeLink() {
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState("Finishing the connection…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let pending: { token: string } | null = null;
    try {
      pending = JSON.parse(localStorage.getItem(PENDING_LINK_KEY) ?? "null");
    } catch {}
    if (!pending?.token) {
      // Runs after mount, outside render; the lint rule's concern (render loops) doesn't apply.
      queueMicrotask(() => setMessage("This connection was started in another browser or app. Start again from Money → Accounts."));
      return;
    }
    runLink(pending as Parameters<typeof runLink>[0], window.location.href).then((r) => {
      if (r.done) router.replace("/money/accounts");
      else setMessage(r.error ?? "Connection cancelled.");
    });
  }, [router]);

  return (
    <div className="space-y-2 py-10 text-center">
      <p>{message}</p>
      <Link href="/money/accounts" className="text-sm text-accent">
        Back to accounts
      </Link>
    </div>
  );
}
