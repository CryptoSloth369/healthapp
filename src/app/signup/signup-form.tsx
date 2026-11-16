"use client";

import { useActionState } from "react";
import { signUp, type SignupState } from "./actions";
import { button, card, input, label } from "@/components/ui";

export function SignupForm({ invite, familyName, invitedBy }: { invite: string; familyName: string; invitedBy: string }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signUp, {});

  if (state.checkEmail)
    return (
      <div className={`${card} w-full max-w-sm space-y-2`}>
        <h1 className="text-xl font-bold">Check your email</h1>
        <p className="text-sm text-muted">
          We sent a link to <span className="text-foreground">{state.checkEmail}</span>. Open it on this phone to finish signing up.
        </p>
      </div>
    );

  return (
    <form action={action} className={`${card} w-full max-w-sm space-y-4`}>
      <input type="hidden" name="invite" value={invite} />
      <div>
        <h1 className="text-2xl font-bold">Join {familyName}</h1>
        <p className="text-sm text-muted">{invitedBy} invited you. Create your own login; you&apos;ll share money with the family, and your health data stays private.</p>
      </div>
      <div>
        <label className={label} htmlFor="name">First name</label>
        <input className={input} id="name" name="name" autoComplete="given-name" maxLength={60} required />
      </div>
      <div>
        <label className={label} htmlFor="email">Email</label>
        <input className={input} id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className={label} htmlFor="password">Password</label>
        <input className={input} id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label className={label} htmlFor="confirm">Password again</label>
        <input className={input} id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className={`${button} w-full`} disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
