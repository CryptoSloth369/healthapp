import { getUserId } from "@/lib/supabase/server";
import { todayLocal, userTimeZone } from "@/lib/today";
import { runAgent } from "@/lib/assistant/agent";

// A coach answer can take a minute or more with several data lookups.
export const maxDuration = 300;

/** Streams newline-delimited JSON events (see AgentEvent). */
export async function POST(request: Request) {
  if (!(await getUserId())) return Response.json({ error: "signed out" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { conversationId?: unknown; message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 4000) : "";
  const conversationId = typeof body?.conversationId === "number" ? body.conversationId : null;
  if (!message) return Response.json({ error: "empty message" }, { status: 400 });

  const [today, timezone] = await Promise.all([todayLocal(), userTimeZone()]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runAgent({ conversationId, userText: message, today, timezone })) {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        }
      } catch (err) {
        console.error("assistant failed", err);
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: "Something went wrong." }) + "\n"));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
