import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { createLinkToken, exchangePublicToken, getAccounts, PlaidError, removeItem, syncTransactions } = await import("./plaid");

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
let calls: Call[] = [];
let reply: { status: number; json: unknown } = { status: 200, json: {} };
/** When set, each call takes the next reply from this list. */
let replies: { status: number; json: unknown }[] | null = null;

beforeEach(() => {
  calls = [];
  vi.stubEnv("PLAID_CLIENT_ID", "client-123");
  vi.stubEnv("PLAID_SECRET", "secret-456");
  vi.stubEnv("PLAID_ENV", "sandbox");
  vi.stubEnv("PLAID_REDIRECT_URI", "");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const r = replies ? replies.shift()! : reply;
    return new Response(JSON.stringify(r.json), { status: r.status });
  });
});
afterEach(() => {
  replies = null;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Plaid client", () => {
  it("creates a bank link token with credentials in headers and 2 years of history", async () => {
    reply = { status: 200, json: { link_token: "link-sandbox-1", expiration: "x", request_id: "r" } };
    expect(await createLinkToken({ userId: "u1", type: "bank" })).toBe("link-sandbox-1");
    const c = calls[0];
    expect(c.url).toBe("https://sandbox.plaid.com/link/token/create");
    expect(c.headers).toMatchObject({ "PLAID-CLIENT-ID": "client-123", "PLAID-SECRET": "secret-456" });
    expect(c.body).toMatchObject({ products: ["transactions"], transactions: { days_requested: 730 }, user: { client_user_id: "u1" }, country_codes: ["US"] });
    expect(c.body).not.toHaveProperty("client_id");
    expect(c.body).not.toHaveProperty("redirect_uri");
  });

  it("asks only for the products a connection type needs, and supports reconnecting", async () => {
    reply = { status: 200, json: { link_token: "t" } };
    vi.stubEnv("PLAID_REDIRECT_URI", "https://example.app/money/oauth");
    await createLinkToken({ userId: "u1", type: "loans" });
    expect(calls[0].body).toMatchObject({ products: ["liabilities"], redirect_uri: "https://example.app/money/oauth" });
    expect(calls[0].body).not.toHaveProperty("transactions");
    await createLinkToken({ userId: "u1", accessToken: "access-1" });
    expect(calls[1].body).toMatchObject({ access_token: "access-1" });
    expect(calls[1].body).not.toHaveProperty("products");
  });

  it("uses production when configured", async () => {
    vi.stubEnv("PLAID_ENV", "production");
    reply = { status: 200, json: { access_token: "access-1", item_id: "item-1", request_id: "r" } };
    expect(await exchangePublicToken("public-1")).toEqual({ access_token: "access-1", item_id: "item-1" });
    expect(calls[0].url).toBe("https://production.plaid.com/item/public_token/exchange");
  });

  it("parses accounts the way Plaid returns them", async () => {
    reply = {
      status: 200,
      json: {
        accounts: [
          {
            account_id: "a1",
            balances: { available: 100, current: 110, iso_currency_code: "USD", limit: null, unofficial_currency_code: null },
            mask: "0000",
            name: "Plaid Checking",
            official_name: "Plaid Gold Standard 0% Interest Checking",
            subtype: "checking",
            type: "depository",
          },
        ],
        item: { item_id: "item-1", institution_id: "ins_109508", webhook: "", error: null, available_products: [], billed_products: ["transactions"] },
        request_id: "r",
      },
    };
    const r = await getAccounts("access-1");
    expect(r.accounts[0]).toMatchObject({ account_id: "a1", type: "depository", balances: { current: 110 } });
    expect(r.item.institution_id).toBe("ins_109508");
  });

  it("turns Plaid errors into PlaidError and flags expired logins", async () => {
    reply = {
      status: 400,
      json: { error_code: "ITEM_LOGIN_REQUIRED", error_type: "ITEM_ERROR", error_message: "the login details of this item have changed", display_message: null, request_id: "req-9" },
    };
    const err = await getAccounts("access-1").catch((e) => e);
    expect(err).toBeInstanceOf(PlaidError);
    expect(err).toMatchObject({ code: "ITEM_LOGIN_REQUIRED", requestId: "req-9", loginRequired: true });
    reply = { status: 500, json: "not json at all" };
    await expect(removeItem("access-1")).rejects.toThrow(/HTTP 500/);
  });

  it("explains a missing client id", async () => {
    vi.stubEnv("PLAID_CLIENT_ID", "");
    await expect(createLinkToken({ userId: "u", type: "bank" })).rejects.toThrow(/PLAID_CLIENT_ID/);
  });
});

describe("syncTransactions", () => {
  const page = (added: string[], next: string, more: boolean, removed: string[] = []) => ({
    status: 200,
    json: {
      added: added.map((id) => ({ transaction_id: id, account_id: "a", amount: 5, date: "2026-11-01", name: id })),
      modified: [],
      removed: removed.map((transaction_id) => ({ transaction_id, account_id: "a" })),
      next_cursor: next,
      has_more: more,
      request_id: "r",
    },
  });

  it("pages until has_more is false, passing the cursor along", async () => {
    replies = [page(["t1", "t2"], "c1", true), page(["t3"], "c2", false, ["old"])];
    const r = await syncTransactions("access-1", null);
    expect(r.added.map((t) => t.transaction_id)).toEqual(["t1", "t2", "t3"]);
    expect(r.removed).toEqual(["old"]);
    expect(r.cursor).toBe("c2");
    expect(calls[0].body).not.toHaveProperty("cursor");
    expect(calls[1].body).toMatchObject({ cursor: "c1", count: 500 });
  });

  it("restarts from the original cursor when data changes mid-paging", async () => {
    const mutation = {
      status: 400,
      json: { error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION", error_type: "TRANSACTIONS_ERROR", error_message: "retry", request_id: "r" },
    };
    replies = [page(["t1"], "c1", true), mutation, page(["t1", "t2"], "c9", false)];
    const r = await syncTransactions("access-1", "c0");
    expect(r.added.map((t) => t.transaction_id)).toEqual(["t1", "t2"]);
    expect(r.cursor).toBe("c9");
    expect(calls.map((c) => c.body.cursor)).toEqual(["c0", "c1", "c0"]);
  });
});
