/**
 * Runs the real agent loop + real Anthropic SDK against a local fake API that
 * streams canned SSE responses, with an in-memory stand-in for Supabase.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("server-only", () => ({}));

// ── in-memory Supabase ──
const db: Record<string, Record<string, unknown>[]> = { assistant_conversation: [], assistant_message: [] };
function table(name: string) {
  const rows = (db[name] ??= []);
  const q = {
    filters: [] as [string, unknown][],
    select() { return q; },
    eq(c: string, v: unknown) { q.filters.push([c, v]); return q; },
    order() { return q; },
    get data() { return rows.filter((r) => q.filters.every(([c, v]) => r[c] === v)); },
    overrideTypes() { return Promise.resolve({ data: q.data, error: null }); },
    insert(row: Record<string, unknown>) {
      const r = { id: rows.length + 1, ...row };
      rows.push(r);
      const res = { data: r, error: null };
      return Object.assign(Promise.resolve(res), { select: () => ({ single: () => Promise.resolve(res) }) });
    },
    update() { return { eq: () => Promise.resolve({ error: null }) }; },
  };
  return q;
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: table }) }));

// Tools: keep the real definitions (schemas) but fake the data lookups.
const toolCalls: { name: string; input: unknown }[] = [];
vi.mock("./tools", async (orig) => {
  const real = await orig<typeof import("./tools")>();
  return {
    ...real,
    runTool: async (name: string, input: unknown) => {
      toolCalls.push({ name, input });
      return { ok: true, content: JSON.stringify({ daily_calorie_target: 2200, latest_weight: { lb: 195 } }) };
    },
  };
});
vi.mock("@/lib/profile", () => ({}));
vi.mock("@/lib/weight", () => ({}));
vi.mock("@/lib/food", () => ({}));
vi.mock("@/lib/exercise-data", () => ({}));
vi.mock("@/lib/mood-data", () => ({}));

// ── fake Anthropic API ──
const requests: Record<string, unknown>[] = [];
function sse(blocks: Record<string, unknown>[], stop: string) {
  const ev = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  let out = ev("message_start", { message: { id: "msg_" + requests.length, type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  blocks.forEach((b, index) => {
    if (b.type === "text") {
      out += ev("content_block_start", { index, content_block: { type: "text", text: "" } });
      for (const part of String(b.text).match(/[\s\S]{1,8}/g) ?? []) out += ev("content_block_delta", { index, delta: { type: "text_delta", text: part } });
    } else if (b.type === "thinking") {
      out += ev("content_block_start", { index, content_block: { type: "thinking", thinking: "", signature: "" } });
      out += ev("content_block_delta", { index, delta: { type: "thinking_delta", thinking: b.thinking } });
      out += ev("content_block_delta", { index, delta: { type: "signature_delta", signature: "sig" + index } });
    } else if (b.type === "tool_use") {
      out += ev("content_block_start", { index, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } });
      out += ev("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
    }
    out += ev("content_block_stop", { index });
  });
  out += ev("message_delta", { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 50 } });
  out += ev("message_stop", {});
  return out;
}
const script: (string | { status: number; body: unknown })[] = [
  sse([{ type: "thinking", thinking: "Checking your profile first." }, { type: "tool_use", id: "tu_1", name: "get_profile_and_goals", input: {} }], "tool_use"),
  sse([{ type: "text", text: "Your target is **2,200 kcal**. I'd lower it slightly." }, { type: "tool_use", id: "tu_2", name: "propose_calorie_target", input: { kcal: 2100, reason: "Trend is flat." } }], "tool_use"),
  sse([{ type: "text", text: "Tap Apply if you agree." }], "end_turn"),
];
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ ...JSON.parse(body), _beta: req.headers["anthropic-beta"] });
      const reply = script[requests.length - 1];
      if (typeof reply === "string") {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end(reply);
      } else {
        res.writeHead(reply.status, { "content-type": "application/json", "request-id": "req_test" });
        res.end(JSON.stringify(reply.body));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterAll(() => server.close());

describe("runAgent", () => {
  it("streams, runs tools, emits proposals and stores a replayable conversation", async () => {
    const { runAgent } = await import("./agent");
    const events = [];
    for await (const e of runAgent({ conversationId: null, userText: "Is my target right?", today: "2026-11-10", timezone: "America/New_York" })) events.push(e);

    // What the app saw
    expect(events[0]).toEqual({ type: "conversation", id: 1 });
    expect(events).toContainEqual({ type: "status", text: "Checking your profile first." });
    expect(events).toContainEqual({ type: "status", text: "Looking at your profile and goals…" });
    expect(events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("")).toBe(
      "Your target is **2,200 kcal**. I'd lower it slightly.Tap Apply if you agree.",
    );
    expect(events).toContainEqual({ type: "proposal", id: "tu_2", name: "propose_calorie_target", input: { kcal: 2100, reason: "Trend is flat." } });
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(toolCalls.map((t) => t.name)).toEqual(["get_profile_and_goals", "propose_calorie_target"]);

    // What was sent to the API
    expect(requests).toHaveLength(3);
    const first = requests[0] as Record<string, unknown>;
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.fallbacks).toBe("default");
    expect(first.thinking).toEqual({ type: "adaptive", display: "updates" });
    expect(String(first._beta)).toContain("server-side-fallback-2026-07-01");
    expect(String(first._beta)).toContain("thinking-display-updates-2026-08-18");
    const tools = first.tools as { name: string; input_schema: Record<string, unknown> }[];
    expect(tools.length).toBeGreaterThanOrEqual(10);
    expect(tools.every((t) => !("$schema" in t.input_schema))).toBe(true);
    // Third request replays history append-only, thinking block (with signature) intact.
    const msgs = (requests[2] as { messages: { role: string; content: unknown }[] }).messages;
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    expect(msgs[1].content).toEqual([
      { type: "thinking", thinking: "Checking your profile first.", signature: "sig0" },
      { type: "tool_use", id: "tu_1", name: "get_profile_and_goals", input: {} },
    ]);
    expect((msgs[4].content as { tool_use_id: string }[])[0].tool_use_id).toBe("tu_2");

    // What was stored
    const stored = db.assistant_message.map((m) => m.role);
    expect(stored).toEqual(["user", "assistant", "user", "assistant", "user", "assistant"]);
    expect(db.assistant_message.map((m) => m.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(db.assistant_conversation[0].title).toBe("Is my target right?");
  });

  it("shows the API's reason when a request is rejected", async () => {
    script.push({ status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } } });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runAgent } = await import("./agent");
    const events = [];
    for await (const e of runAgent({ conversationId: null, userText: "Hi", today: "2026-11-10", timezone: "America/New_York" })) events.push(e);
    expect(events.at(-1)).toEqual({
      type: "error",
      message: "The coach is unavailable (error 400): Your credit balance is too low to access the Anthropic API.",
    });
    expect(errors).toHaveBeenCalledWith("coach API error", 400, "req_test", expect.stringContaining("credit balance"));
    errors.mockRestore();
  });
});
