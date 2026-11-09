import { redirect } from "next/navigation";
import { getProfileSummary } from "@/lib/profile";
import { TargetCard } from "@/components/target-card";
import { buttonGhost } from "@/components/ui";
import { signOut } from "@/app/login/actions";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";

export default async function ProfilePage() {
  const summary = await getProfileSummary();
  if (!summary) redirect("/login");
  const { profile, latestWeight, target } = summary;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Profile & goal</h1>
      {target && <TargetCard target={target} override={profile.kcal_target_override} />}
      <ProfileForm profile={profile} currentWeight={latestWeight ? Number(latestWeight.weight_lb) : null} />
      <PasswordForm />
      <form action={signOut}>
        <button className={`${buttonGhost} w-full`}>Sign out</button>
      </form>
    </div>
  );
}
