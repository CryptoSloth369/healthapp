import { getInviteInfo } from "@/lib/family-data";
import { SignupForm } from "./signup-form";
import { InviteProblem } from "./invite-problem";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const info = await getInviteInfo(invite);
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      {info && invite ? (
        <SignupForm invite={invite} familyName={info.household_name} invitedBy={info.invited_by} />
      ) : (
        <InviteProblem />
      )}
    </main>
  );
}
