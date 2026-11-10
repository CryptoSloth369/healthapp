import { describe, expect, it } from "vitest";
import { apiErrorReason } from "./api-error";

describe("apiErrorReason", () => {
  it("reads the message from an API error body", () => {
    const body = { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } };
    expect(apiErrorReason(body)).toBe("Your credit balance is too low to access the Anthropic API.");
  });
  it("returns null for bodies without a message", () => {
    expect(apiErrorReason(undefined)).toBeNull();
    expect(apiErrorReason("oops")).toBeNull();
    expect(apiErrorReason({ error: {} })).toBeNull();
    expect(apiErrorReason({ error: { message: "  " } })).toBeNull();
  });
  it("shortens very long messages", () => {
    const r = apiErrorReason({ error: { message: "x".repeat(500) } });
    expect(r).toHaveLength(301);
  });
});
