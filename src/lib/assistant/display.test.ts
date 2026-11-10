import { describe, expect, it } from "vitest";
import { toDisplay } from "./display";

describe("toDisplay", () => {
  it("merges tool rounds into one assistant turn", () => {
    const turns = toDisplay([
      { role: "user", content: "How was my week?" },
      { role: "assistant", content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Let me check." }, { type: "tool_use", id: "t1", name: "get_daily_summary", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "[]" }] },
      { role: "assistant", content: [{ type: "text", text: "Solid week." }, { type: "tool_use", id: "t2", name: "propose_calorie_target", input: { kcal: 2100, reason: "x" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "shown" }] },
      { role: "assistant", content: [{ type: "text", text: "Tap Apply if you agree." }] },
      { role: "user", content: "Thanks" },
    ]);
    expect(turns).toHaveLength(3);
    expect(turns[1]).toMatchObject({
      role: "assistant",
      text: "Let me check.\n\nSolid week.\n\nTap Apply if you agree.",
      looked: ["daily totals"],
      proposals: [{ id: "t2", name: "propose_calorie_target", input: { kcal: 2100 } }],
    });
    expect(turns[2]).toEqual({ role: "user", text: "Thanks" });
  });
});
