# 2026-11-19: Coach access to money (Money step 15)

**Asked for:** Money step 15 from the handoff: let the coach read the money data (accounts, net worth with history, spending, category rules), read-only, no migration.

## Done
- Five read-only coach tools in `assistant/tools.ts` (`99a2916`): `get_money_accounts`, `get_net_worth`, `get_spending`, `get_transactions`, `get_category_rules`. Registered in `agent.ts` (status labels and system-prompt rules: money is per family and only what the person can see; spending excludes transfers, card payments and income; credit cards by default; read-only; not a financial advisor) and `assistant/display.ts` ("Looked at" labels).
- Pure helpers with tests: `spendingByMonth`, `spendingByMerchant`, `notSpendingTotals`, `categoryWithSource`, `spendableAccounts`/`chooseAccounts` (moved from the page loader so the Spending tab and coach choose accounts the same way) in `spending.ts`; `thinSeries` in `finance.ts`.
- `spending-data.ts`: `getTransactions(accountIds, from, to)` and `getCategoryRules()`, reused by the Spending tab; transaction paging now has a stable order.
- Tool tests through `runTool` with mocked loaders (`tools-money.test.ts`): totals skip hidden accounts, family-shared accounts show their owner, card payments aren't spending, rules apply, ranges are capped, a bad account filter explains the choices.
- Coach button on the Money overview (shared `CoachLink`, smaller to match Sync); two money suggestions and updated intro on the coach screen.
- Fix: the net-worth chart drew two date labels on top of each other when there were exactly two days of history.
- Checked: `npm run check` (156 tests), `npm run build`, Money header and coach start screen at iPhone size in light and dark.

## Decisions
- Tools read stored data only, never Plaid, so a coach question costs no Plaid calls; answers say balances are as of the last sync.
- `get_spending` defaults to credit cards like the Spending tab; `"all"` adds checking (card payments from checking are transfers, so nothing is counted twice).
- Budget read/proposal tools moved to step 16, since there's no budget yet.
- `get_net_worth` lists accounts first seen in the range, so the coach doesn't call a newly connected account a gain.

## Owner actions
- None needed (no migration). Say "push to main" to deploy.

## Problems and fixes
- None.

## Open / next
- Verify in real use: compare the coach's spending and net-worth numbers with the Spending tab and Money overview.
- Step 16: YNAB-style budget (migration `0011`), including coach budget tools.
