import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({}));
vi.mock("./tools", () => ({ apiTools: () => [], PROPOSAL_TOOLS: new Set(), runTool: vi.fn() }));
import { sanitizeAfterFallback } from "./agent";

describe("sanitizeAfterFallback", () => {
  it("drops thinking and tool_use before the last fallback marker, keeps text and the marker", () => {
    const content = [
      { type: "thinking", thinking: "a", signature: "s" },
      { type: "text", text: "partial" },
      { type: "tool_use", id: "x", name: "n", input: {} },
      { type: "fallback", from: { model: "a" }, to: { model: "b" } },
      { type: "thinking", thinking: "b", signature: "s2" },
      { type: "text", text: "rest" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeAfterFallback(content as any).map((b) => b.type)).toEqual(["text", "fallback", "thinking", "text"]);
  });
  it("leaves normal responses untouched", () => {
    const content = [{ type: "text", text: "hi" }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeAfterFallback(content as any)).toBe(content);
  });
});
