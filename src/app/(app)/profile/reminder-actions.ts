"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUserId } from "@/lib/supabase/server";
import { pushConfigured, sendPush } from "@/lib/push";

type BrowserSub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function saveSubscription(sub: BrowserSub, userAgent: string): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "You are signed out." };
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "Invalid subscription." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscription")
    .upsert(
      { user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent.slice(0, 200) },
      { onConflict: "endpoint" },
    );
  if (error) return { error: error.message };
  revalidatePath("/profile");
  return {};
}

export async function removeSubscription(endpoint: string): Promise<void> {
  if (!(await getUserId())) return;
  const supabase = await createClient();
  await supabase.from("push_subscription").delete().eq("endpoint", endpoint);
  revalidatePath("/profile");
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveReminderPrefs(input: {
  timezone: string;
  weigh_in_at: string | null;
  food_at: string | null;
  mood_at: string | null;
}): Promise<{ error?: string; saved?: boolean }> {
  const userId = await getUserId();
  if (!userId) return { error: "You are signed out." };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
  } catch {
    return { error: "Unknown time zone." };
  }
  for (const t of [input.weigh_in_at, input.food_at, input.mood_at]) if (t != null && !TIME.test(t)) return { error: "Times must be HH:MM." };
  const supabase = await createClient();
  const { error } = await supabase.from("reminder_pref").upsert(
    { user_id: userId, enabled: true, timezone: input.timezone, weigh_in_at: input.weigh_in_at, food_at: input.food_at, mood_at: input.mood_at, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) return { error: error.message };
  revalidatePath("/profile");
  return { saved: true };
}

/** Send a test notification to every device you've enabled. */
export async function sendTestPush(): Promise<{ error?: string; sent?: number }> {
  if (!(await getUserId())) return { error: "You are signed out." };
  if (!pushConfigured()) return { error: "Push keys are missing or invalid in Vercel." };
  const supabase = await createClient();
  const { data } = await supabase
    .from("push_subscription")
    .select("endpoint, p256dh, auth")
    .overrideTypes<{ endpoint: string; p256dh: string; auth: string }[], { merge: false }>();
  const subs = data ?? [];
  if (subs.length === 0) return { error: "No devices are set up for notifications." };
  const results = await Promise.all(subs.map((s) => sendPush(s, "test")));
  const gone = subs.filter((_, i) => results[i] === "gone").map((s) => s.endpoint);
  if (gone.length) await supabase.from("push_subscription").delete().in("endpoint", gone);
  const sent = results.filter((r) => r === "ok").length;
  return sent ? { sent } : { error: "Sending failed. Check the VAPID keys in Vercel." };
}
