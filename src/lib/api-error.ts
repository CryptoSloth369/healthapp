/**
 * Pulls the human-readable reason out of an Anthropic API error body
 * (`{ type: "error", error: { type, message } }`). Returns null when the body
 * doesn't have one.
 */
export function apiErrorReason(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const inner = (body as { error?: unknown }).error;
  const message = inner && typeof inner === "object" ? (inner as { message?: unknown }).message : undefined;
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  if (!trimmed) return null;
  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed;
}
