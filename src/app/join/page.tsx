import Link from "next/link";
import { getUserId } from "@/lib/supabase/server";
import { getInviteInfo } from "@/lib/family-data";
import { buttonGhost, card } from "@/components/ui";
import { InviteProblem } from "../signup/invite-problem";
import { JoinButton } from "./join-button";

/** Invite link landing page: join as a signed-in person, or sign up / sign in first. */
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const [info, userId] = await Promise.all([getInviteInfo(invite), getUserId()]);
  if (!info || !invite) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <InviteProblem />
      </main>
    );
  }
  const here = `/join?invite=${encodeURIComponent(invite)}`;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className={`${card} w-full max-w-sm space-y-4`}>
        <div>
          <h1 className="text-2xl font-bold">Join {info.household_name}</h1>
          <p className="text-sm text-muted">
            {info.invited_by} invited you to share money with them: accounts you each mark as shared, budgets and goals. Health data
            stays private.
          </p>
        </div>
        {userId ? (
          <>
            <JoinButton token={invite} familyName={info.household_name} />
            <p className="text-xs text-muted">
              If you&apos;re already in a family with other people, leave it first (Money → Family). Your own accounts come with you.
            </p>
          </>
        ) : (
          <div className="space-y-2">
            <Link href={`/signup?invite=${encodeURIComponent(invite)}`} className={`${buttonGhost} block text-center`}>
              Create an account
            </Link>
            <Link href={`/login?next=${encodeURIComponent(here)}`} className="block text-center text-sm text-accent">
              I already have an account
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
