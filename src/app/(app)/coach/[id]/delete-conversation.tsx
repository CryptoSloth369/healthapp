"use client";

import { useTransition } from "react";
import { deleteConversation } from "../actions";

export function DeleteConversation({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="shrink-0 text-sm text-muted"
      onClick={() => {
        if (confirm("Delete this conversation?")) start(() => deleteConversation(id));
      }}
    >
      Delete
    </button>
  );
}
