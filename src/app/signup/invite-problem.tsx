import Link from "next/link";
import { card } from "@/components/ui";

export function InviteProblem() {
  return (
    <div className={`${card} w-full max-w-sm space-y-2`}>
      <h1 className="text-xl font-bold">Invite needed</h1>
      <p className="text-sm text-muted">
        This app is invite-only, and this link is invalid, already used or expired. Ask a family member for a new invite link
        (Money → Family).
      </p>
      <Link href="/login" className="text-sm text-accent">
        Already have an account? Sign in →
      </Link>
    </div>
  );
}
