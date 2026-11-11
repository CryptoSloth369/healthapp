import { describe, expect, it } from "vitest";
import { appendDictation, excerpt, groupByDay, joinSegments, normalizeBody, pageByDay, wordCount } from "./journal";

describe("normalizeBody", () => {
  it("trims, fixes line endings and blank lines", () => {
    expect(normalizeBody("  Hi there  \r\n\r\n\r\n\r\nSecond   \n")).toBe("Hi there\n\nSecond");
  });
  it("caps the length", () => {
    expect(normalizeBody("a".repeat(30000))).toHaveLength(20000);
  });
});

describe("wordCount", () => {
  it("counts words", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("  one two\nthree ")).toBe(3);
  });
});

describe("joinSegments", () => {
  it("joins separate segments", () => {
    expect(joinSegments(["Today was good", " I lifted"])).toBe("Today was good I lifted");
  });
  it("replaces a segment that repeats and extends the earlier text (iOS)", () => {
    expect(joinSegments(["Today was", "Today was good", "today was good I lifted"])).toBe("today was good I lifted");
  });
  it("skips a repeated tail", () => {
    expect(joinSegments(["Today was good", "good"])).toBe("Today was good");
  });
  it("ignores empty segments", () => {
    expect(joinSegments(["", "  ", "hello"])).toBe("hello");
  });
});

describe("appendDictation", () => {
  it("capitalizes the start of an empty entry", () => {
    expect(appendDictation("", "feeling tired")).toBe("Feeling tired");
  });
  it("adds a space and keeps case mid-sentence", () => {
    expect(appendDictation("I felt", "really tired")).toBe("I felt really tired");
  });
  it("capitalizes after a full stop or new line", () => {
    expect(appendDictation("Long day.", "slept badly")).toBe("Long day. Slept badly");
    expect(appendDictation("Long day\n", "slept badly")).toBe("Long day\nSlept badly");
  });
  it("leaves the text alone when nothing was said", () => {
    expect(appendDictation("Same", "  ")).toBe("Same");
  });
});

describe("excerpt", () => {
  it("keeps short text", () => {
    expect(excerpt("short", 10)).toEqual({ text: "short", cut: false });
  });
  it("cuts at a word boundary", () => {
    expect(excerpt("one two three four five", 16)).toEqual({ text: "one two three…", cut: true });
  });
});

describe("pageByDay", () => {
  const e = (written_on: string, id: number) => ({ written_on, id });
  it("returns everything when it fits", () => {
    expect(pageByDay([e("2026-11-10", 1)], 2)).toEqual({ items: [e("2026-11-10", 1)], olderFrom: null });
  });
  it("doesn't split a day across pages", () => {
    const rows = [e("2026-11-10", 1), e("2026-11-09", 2), e("2026-11-09", 3)];
    expect(pageByDay(rows, 2)).toEqual({ items: [e("2026-11-10", 1)], olderFrom: "2026-11-09" });
  });
  it("moves past a day with more entries than a page", () => {
    const rows = [e("2026-11-01", 1), e("2026-11-01", 2), e("2026-11-01", 3)];
    expect(pageByDay(rows, 2)).toEqual({ items: rows.slice(0, 2), olderFrom: "2026-10-31" });
  });
});

describe("groupByDay", () => {
  it("groups consecutive entries of the same day", () => {
    const rows = [{ written_on: "2026-11-10" }, { written_on: "2026-11-10" }, { written_on: "2026-11-09" }];
    expect(groupByDay(rows).map((g) => [g.day, g.entries.length])).toEqual([
      ["2026-11-10", 2],
      ["2026-11-09", 1],
    ]);
  });
});
