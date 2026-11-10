import "server-only";
import { sendNotification, setVapidDetails } from "web-push";

export type Sub = { endpoint: string; p256dh: string; auth: string };
export type ReminderKind = "weigh_in" | "food" | "mood" | "test";

export const REMINDER_MESSAGES: Record<ReminderKind, { title: string; body: string; url: string }> = {
  weigh_in: { title: "Morning weigh-in", body: "Step on the scale and log today's weight.", url: "/" },
  food: { title: "Logged dinner yet?", body: "Add tonight's meal so today's calories are complete.", url: "/food/add?meal=dinner" },
  mood: { title: "How was today?", body: "Take 10 seconds to log your mood.", url: "/mood" },
  test: { title: "Reminders are on", body: "This is what a reminder from Health looks like.", url: "/profile" },
};

let configured = false;

/** True when valid VAPID keys are set (malformed keys count as not configured). */
export function pushConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  try {
    // Push services require a contact URL for the sender; Vercel provides the app's address.
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    setVapidDetails(host ? `https://${host}` : "https://example.com", pub, priv);
    configured = true;
  } catch (err) {
    console.error("Invalid VAPID keys:", (err as Error).message);
  }
  return configured;
}

/** Send one notification; returns "ok", "gone" (subscription expired) or "error". */
export async function sendPush(sub: Sub, kind: ReminderKind): Promise<"ok" | "gone" | "error"> {
  if (!pushConfigured()) return "error";
  try {
    await sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ ...REMINDER_MESSAGES[kind], kind }),
      { TTL: 60 * 60 * 2, urgency: "normal" },
    );
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("push failed", status, (err as Error).message);
    return "error";
  }
}
