"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUserId } from "@/lib/supabase/server";
import { ensureHouseholdId } from "@/lib/family-data";
import { inviteHash, newInviteToken } from "@/lib/secret-box";
import { siteOrigin } from "@/lib/origin";

type Result = { error?: string };
const done = (): Result => {
  revalidatePath("/money", "layout");
  return {};
};

/** A new one-time invite link (valid 7 days). Only its hash is stored, so the link is shown once. */
export async function createInvite(): Promise<{ error?: string; url?: string }> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const householdId = await ensureHouseholdId();
  const token = newInviteToken();
  const supabase = await createClient();
  const { error } = await supabase.from("household_invite").insert({ household_id: householdId, token_hash: inviteHash(token) });
  if (error) return { error: error.message };
  revalidatePath("/money/family");
  return { url: `${await siteOrigin()}/join?invite=${token}` };
}

export async function revokeInvite(id: string): Promise<Result> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const supabase = await createClient();
  const { error } = await supabase.from("household_invite").delete().eq("id", id);
  return error ? { error: error.message } : done();
}

export async function renameFamily(_prev: Result, form: FormData): Promise<Result> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 60) return { error: "Use 1–60 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("household").update({ name }).eq("id", await ensureHouseholdId());
  return error ? { error: error.message } : done();
}

export async function leaveFamily(): Promise<Result> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_household");
  return error ? { error: error.message } : done();
}

export async function removeMember(userId: string): Promise<Result> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_household_member", { member: userId });
  return error ? { error: error.message } : done();
}
