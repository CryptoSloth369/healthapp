"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, getUserId } from "@/lib/supabase/server";

/** Signed-in person accepts an invite link and joins that family. */
export async function acceptInvite(token: string): Promise<{ error?: string }> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { token });
  if (error) return { error: error.message };
  revalidatePath("/money", "layout");
  redirect("/money/family?joined=1");
}
