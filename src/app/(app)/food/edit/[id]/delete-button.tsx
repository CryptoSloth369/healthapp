"use client";

import { buttonGhost } from "@/components/ui";

export function DeleteEntryButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this entry?")) e.preventDefault();
      }}
    >
      <button className={`${buttonGhost} w-full text-danger`}>Delete entry</button>
    </form>
  );
}
