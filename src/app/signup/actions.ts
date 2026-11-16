"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";

export type SignupState = { error?: string; checkEmail?: string };

/**
 * Create an account from an invite. Supabase's "Before User Created" hook
 * (hook_require_invite) rejects sign-ups without a valid invite, and a
 * database trigger then adds the new person to the inviter's family.
 */
export async function signUp(_prev: SignupState, form: FormData): Promise<SignupState> {
  const invite = String(form.get("invite") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (!invite) return { error: "Sign-up needs an invite link from a family member." };
  if (!name || name.length > 60) return { error: "Enter your first name." };
  if (!email) return { error: "Enter your email." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { invite, display_name: name },
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=/money/family`,
    },
  });
  if (error) return { error: error.message };
  // With "Confirm email" on, there's no session until they click the link.
  if (!data.session) return { checkEmail: email };
  redirect("/money/family?welcome=1");
}
