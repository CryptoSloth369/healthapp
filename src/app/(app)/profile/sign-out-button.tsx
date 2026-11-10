"use client";

import { signOut } from "@/app/login/actions";
import { buttonGhost } from "@/components/ui";

/** Clears pages saved for offline use, then signs out. */
export function SignOutButton() {
  return (
    <form
      action={signOut}
      onSubmit={() => {
        navigator.serviceWorker?.controller?.postMessage("clear-pages");
      }}
    >
      <button className={`${buttonGhost} w-full`}>Sign out</button>
    </form>
  );
}
