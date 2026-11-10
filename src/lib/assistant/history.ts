import "server-only";
import { createClient } from "@/lib/supabase/server";
import { toDisplay, type StoredRow } from "./display";

export async function listConversations() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assistant_conversation")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50)
    .overrideTypes<{ id: number; title: string; updated_at: string }[], { merge: false }>();
  return data ?? [];
}

export async function getConversation(id: number) {
  const supabase = await createClient();
  const [{ data: conv }, { data: rows }] = await Promise.all([
    supabase.from("assistant_conversation").select("id, title").eq("id", id).maybeSingle<{ id: number; title: string }>(),
    supabase.from("assistant_message").select("role, content").eq("conversation_id", id).order("seq").overrideTypes<StoredRow[], { merge: false }>(),
  ]);
  if (!conv) return null;
  return { ...conv, turns: toDisplay(rows ?? []) };
}
