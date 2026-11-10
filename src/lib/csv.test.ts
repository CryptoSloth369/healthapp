import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes and escapes", () => {
    expect(csvCell('Burrito, "large"')).toBe('"Burrito, ""large"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(["a", "b"])).toBe("a; b");
  });
  it("neutralizes formulas but keeps negative numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-0.6")).toBe("-0.6");
    expect(csvCell(-12)).toBe("-12");
  });
  it("writes a header and rows", () => {
    expect(toCsv([{ a: 1, b: "x" }, { a: 2, b: null }], ["a", "b"])).toBe("a,b\r\n1,x\r\n2,\r\n");
  });
});
