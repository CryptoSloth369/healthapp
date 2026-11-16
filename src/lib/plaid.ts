import "server-only";
import { z } from "zod";

/**
 * Minimal Plaid API client (fetch + Zod). Credentials go in the
 * PLAID-CLIENT-ID / PLAID-SECRET headers, which Plaid accepts in place of
 * client_id / secret in the body.
 *
 * Env: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV (sandbox | production),
 * PLAID_REDIRECT_URI (optional; https URL of /money/oauth, registered in the
 * Plaid dashboard, needed for banks that use OAuth such as Chase).
 */

const HOSTS = { sandbox: "https://sandbox.plaid.com", production: "https://production.plaid.com" } as const;

export function plaidEnv(): keyof typeof HOSTS {
  return process.env.PLAID_ENV === "production" ? "production" : "sandbox";
}

export class PlaidError extends Error {
  constructor(
    readonly code: string,
    readonly type: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
  /** The bank needs the person to sign in again (Link update mode). */
  get loginRequired() {
    return this.code === "ITEM_LOGIN_REQUIRED" || this.code === "PENDING_EXPIRATION" || this.code === "PENDING_DISCONNECT";
  }
}

const ErrorBody = z.object({
  error_code: z.string(),
  error_type: z.string(),
  error_message: z.string(),
  display_message: z.string().nullish(),
  request_id: z.string().optional(),
});

async function call<S extends z.ZodType>(path: string, body: Record<string, unknown>, schema: S): Promise<z.infer<S>> {
  const clientId = process.env.PLAID_CLIENT_ID;
  if (!clientId) throw new Error("PLAID_CLIENT_ID is not set.");
  const headers: Record<string, string> = { "Content-Type": "application/json", "PLAID-CLIENT-ID": clientId };
  if (process.env.PLAID_SECRET) headers["PLAID-SECRET"] = process.env.PLAID_SECRET;
  const res = await fetch(HOSTS[plaidEnv()] + path, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = ErrorBody.safeParse(json);
    if (e.success) {
      const d = e.data;
      console.error("plaid error", path, res.status, d.error_code, d.request_id);
      throw new PlaidError(d.error_code, d.error_type, d.display_message || d.error_message, d.request_id);
    }
    throw new Error(`Plaid ${path} failed with HTTP ${res.status}`);
  }
  return schema.parse(json);
}

/** What a connection is for; decides which Plaid products (and fees) it gets. */
export type ConnectionType = "bank" | "investments" | "loans";
export const CONNECTION_PRODUCTS: Record<ConnectionType, string[]> = {
  bank: ["transactions"],
  investments: ["investments"],
  loans: ["liabilities"],
};

export async function createLinkToken(opts: {
  userId: string;
  /** New connection of this type, or `accessToken` to reconnect (update mode). */
  type?: ConnectionType;
  accessToken?: string;
}): Promise<string> {
  const body: Record<string, unknown> = {
    client_name: "Health & Money",
    language: "en",
    country_codes: ["US"],
    user: { client_user_id: opts.userId },
  };
  if (opts.accessToken) body.access_token = opts.accessToken;
  else {
    body.products = CONNECTION_PRODUCTS[opts.type ?? "bank"];
    // Ask for two years of history up front; it can't be extended later.
    if (opts.type === "bank") body.transactions = { days_requested: 730 };
  }
  if (process.env.PLAID_REDIRECT_URI) body.redirect_uri = process.env.PLAID_REDIRECT_URI;
  const r = await call("/link/token/create", body, z.object({ link_token: z.string() }));
  return r.link_token;
}

export async function exchangePublicToken(publicToken: string) {
  return call("/item/public_token/exchange", { public_token: publicToken }, z.object({ access_token: z.string(), item_id: z.string() }));
}

const Account = z.object({
  account_id: z.string(),
  name: z.string(),
  official_name: z.string().nullish(),
  mask: z.string().nullish(),
  type: z.string(),
  subtype: z.string().nullish(),
  balances: z.object({
    current: z.number().nullish(),
    available: z.number().nullish(),
    limit: z.number().nullish(),
    iso_currency_code: z.string().nullish(),
    unofficial_currency_code: z.string().nullish(),
  }),
});
export type PlaidAccount = z.infer<typeof Account>;

/** Accounts with Plaid's most recently cached balances (no extra balance fee). */
export async function getAccounts(accessToken: string) {
  return call(
    "/accounts/get",
    { access_token: accessToken },
    z.object({
      accounts: z.array(Account),
      item: z.object({ item_id: z.string(), institution_id: z.string().nullish() }).passthrough(),
    }),
  );
}

/** Stops billing for a connection and revokes its access token. */
export async function removeItem(accessToken: string) {
  await call("/item/remove", { access_token: accessToken }, z.object({ request_id: z.string() }).passthrough());
}
