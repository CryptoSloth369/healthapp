import { redirect } from "next/navigation";
import { getProfileSummary } from "@/lib/profile";
import { TargetCard } from "@/components/target-card";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";
import { RemindersCard } from "./reminders-card";
import { SignOutButton } from "./sign-out-button";
import { getReminderPrefs } from "@/lib/reminders";

export default async function ProfilePage() {
  const [summary, reminders] = await Promise.all([getProfileSummary(), getReminderPrefs()]);
  if (!summary) redirect("/login");
  const { profile, latestWeight, target } = summary;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Profile & goal</h1>
      {target && <TargetCard target={target} override={profile.kcal_target_override} />}
      <ProfileForm profile={profile} currentWeight={latestWeight ? Number(latestWeight.weight_lb) : null} />
      <RemindersCard prefs={reminders.prefs} devices={reminders.devices} />
      <PasswordForm />
      <SignOutButton />
    </div>
  );
}
