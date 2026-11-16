"use client";

import { useState, useTransition } from "react";
import { acceptInvite } from "./actions";
import { button } from "@/components/ui";

export function JoinButton({ token, familyName }: { token: string; familyName: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        className={`${button} w-full`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await acceptInvite(token);
            if (r?.error) setError(r.error);
          })
        }
      >
        {pending ? "Joining…" : `Join ${familyName}`}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
