/**
 * Encryption for secrets stored in the database (Plaid access tokens), and
 * invite tokens. Node crypto only; used from server code.
 *
 * Format: "v1.<iv>.<tag>.<ciphertext>", base64url parts, AES-256-GCM.
 * The key is 32 bytes, base64-encoded, in FINANCE_TOKEN_KEY.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(raw = process.env.FINANCE_TOKEN_KEY): Buffer {
  if (!raw) throw new Error("FINANCE_TOKEN_KEY is not set. Generate one with: openssl rand -base64 32");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("FINANCE_TOKEN_KEY must be 32 bytes, base64-encoded.");
  return k;
}

export function seal(plain: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function open(sealed: string, rawKey?: string): string {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("Unrecognized sealed value.");
  const d = createDecipheriv("aes-256-gcm", key(rawKey), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}

/** A new invite token (URL-safe, 256 bits). */
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Same hash as the database's invite_hash(): hex SHA-256 of the UTF-8 token. */
export function inviteHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
