import { timingSafeEqual } from "node:crypto";
import { pushConfigured, sendPush, type ReminderKind } from "@/lib/push";

/**
 * Called by the Supabase schedule (pg_cron + pg_net) with the reminders that
 * are due. The database decides who gets what; this route only delivers.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) return Response.json({ error: "VAPID keys missing or invalid" }, { status: 500 });

  const body = (await request.json().catch(() => null)) as { items?: unknown } | null;
  const items = Array.isArray(body?.items) ? body.items : [];
  const kinds = new Set(["weigh_in", "food", "mood"]);
  const valid = items.filter(
    (i): i is { kind: ReminderKind; endpoint: string; p256dh: string; auth: string } =>
      !!i && typeof i === "object" && kinds.has((i as { kind: string }).kind) &&
      typeof (i as { endpoint: unknown }).endpoint === "string" && (i as { endpoint: string }).endpoint.startsWith("https://"),
  );
  const results = await Promise.all(valid.slice(0, 100).map((i) => sendPush(i, i.kind)));
  return Response.json({ sent: results.filter((r) => r === "ok").length, gone: results.filter((r) => r === "gone").length });
}
