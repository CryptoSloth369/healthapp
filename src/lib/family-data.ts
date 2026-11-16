import "server-only";
import { createClient } from "@/lib/supabase/server";

export type InviteInfo = { household_name: string; invited_by: string; expires_at: string };
export type Member = { user_id: string; display_name: string | null; role: "owner" | "member"; joined_at: string; is_me: boolean };
export type OpenInvite = { id: string; created_at: string; expires_at: string; reserved_at: string | null };
export type Family = { id: string; name: string; members: Member[]; invites: OpenInvite[]; iAmOwner: boolean };

/** Who sent an invite and for which family; null if it's invalid, used or expired. Works signed out. */
export async function getInviteInfo(token: string | undefined): Promise<InviteInfo | null> {
  if (!token || token.length > 100) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("invite_info", { token }).maybeSingle<InviteInfo>();
  return data ?? null;
}

/** The signed-in person's family id, creating a family on first use. */
export async function ensureHouseholdId(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_household");
  if (error) throw new Error(`Couldn't load your family: ${error.message}`);
  return data as string;
}

export async function getFamily(): Promise<Family> {
  const id = await ensureHouseholdId();
  const supabase = await createClient();
  const [{ data: household }, { data: members }, { data: invites }] = await Promise.all([
    supabase.from("household").select("id, name").eq("id", id).single<{ id: string; name: string }>(),
    supabase.rpc("household_members"),
    supabase
      .from("household_invite")
      .select("id, created_at, expires_at, reserved_at")
      .eq("household_id", id)
      .is("used_by", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .overrideTypes<OpenInvite[], { merge: false }>(),
  ]);
  // Untyped client: rpc results aren't typed, so name the row shape here.
  const list = (members ?? []) as Member[];
  return {
    id,
    name: household?.name ?? "Family",
    members: list,
    invites: invites ?? [],
    iAmOwner: list.some((m) => m.is_me && m.role === "owner"),
  };
}
