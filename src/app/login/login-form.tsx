"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";
import { button, card, input, label } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form action={action} className={`${card} w-full max-w-sm space-y-4`}>
        <input type="hidden" name="next" value={next} />
        <div>
          <h1 className="text-2xl font-bold">Health</h1>
          <p className="text-sm text-muted">Sign in to continue.</p>
        </div>
        <div>
          <label className={label} htmlFor="email">Email</label>
          <input className={input} id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className={label} htmlFor="password">Password</label>
          <input className={input} id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        <button className={`${button} w-full`} disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
