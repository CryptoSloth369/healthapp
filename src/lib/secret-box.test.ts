import { describe, expect, it } from "vitest";
import { inviteHash, newInviteToken, open, seal } from "./secret-box";

const k = Buffer.alloc(32, 7).toString("base64");
const other = Buffer.alloc(32, 8).toString("base64");

describe("seal / open", () => {
  it("round-trips and uses a fresh IV every time", () => {
    const a = seal("access-sandbox-123", k);
    expect(a).toMatch(/^v1\./);
    expect(a).not.toContain("access-sandbox");
    expect(seal("access-sandbox-123", k)).not.toBe(a);
    expect(open(a, k)).toBe("access-sandbox-123");
  });

  it("refuses a wrong key or tampered value", () => {
    const a = seal("secret", k);
    expect(() => open(a, other)).toThrow();
    const parts = a.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => open(parts.join("."), k)).toThrow();
  });

  it("explains a missing or malformed key without revealing it", () => {
    expect(() => seal("x", "")).toThrow(/FINANCE_TOKEN_KEY is not set/);
    expect(() => seal("x", "c2hvcnQ=")).toThrow(/the one set is 8 characters and decodes to 5 bytes/);
    expect(() => seal("x", "not a key!")).toThrow(/isn't base64/);
    expect(() => seal("x", "c2hvcnQ=")).not.toThrow(/c2hvcnQ/);
  });

  it("ignores spaces, line breaks and quotes from copy-paste", () => {
    const a = seal("secret", k);
    expect(open(a, `  "${k}"\n`)).toBe("secret");
    expect(open(a, `'${k}'`)).toBe("secret");
  });
});

describe("invite tokens", () => {
  it("are long and URL-safe, and hash like Postgres sha256()", () => {
    const t = newInviteToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // select encode(sha256(convert_to('TOKEN-B', 'UTF8')), 'hex')
    expect(inviteHash("TOKEN-B")).toBe("2489f73a3f883739de690d24423f32b4b3d820c8244a9f826aa74e13e82d477a");
  });
});
