# Trading E2E Tests

End-to-end tests that run against real broker APIs (Alpaca paper, Bybit demo) and MockBroker.

## Running

```bash
pnpm test:e2e
```

Tests run sequentially (`fileParallelism: false`) because broker APIs are shared resources.

## File Naming

| Pattern | Level | Example |
|---------|-------|---------|
| `{broker}.e2e.spec.ts` | Broker API | `alpaca-paper` — calls `broker.placeOrder()` directly |
| `uta-{broker}.e2e.spec.ts` | UTA (Trading-as-Git) | `uta-alpaca` — uses `stagePlaceOrder → commit → push` |
| `uta-lifecycle.e2e.spec.ts` | UTA + MockBroker | Pure in-memory, no external deps |

## Precondition Pattern

Use `beforeEach(({ skip }) => ...)` for preconditions — **never** `if (!x) return` inside test bodies.

```typescript
// ✅ Correct — shows as "skipped" in report
beforeEach(({ skip }) => {
  if (!broker) skip('no account configured')
  if (!marketOpen) skip('market closed')
})

it('fetches account', async () => {
  const account = await broker!.getAccount()  // broker guaranteed non-null
})

// ❌ Wrong — shows as "passed" even though nothing ran
it('fetches account', async () => {
  if (!broker) return  // silent pass, misleading
})
```

For runtime data dependencies inside a test (e.g., contract search fails), use `skip()` from the test context:

```typescript
it('places order', async ({ skip }) => {
  const matches = await broker!.searchContracts('ETH')
  const perp = matches.find(...)
  if (!perp) skip('ETH perp not found')
})
```

## Market Hours

- **Crypto (CCXT)**: 24/7, no market hours check needed
- **Equities (Alpaca)**: Split into two `describe` groups:
  - **Connectivity** — runs any time (getAccount, getPositions, searchContracts, getMarketClock)
  - **Trading** — requires market open (getQuote, placeOrder, closePosition)

Check `broker.getMarketClock().isOpen` in `beforeAll`, skip trading group via `beforeEach`.

## Setup

`setup.ts` provides a lazy singleton `getTestAccounts()` that:
1. Reads `accounts.json`
2. Filters for safe accounts only (Alpaca `paper: true`, CCXT `sandbox` or `demoTrading`)
3. Skips accounts without API keys
4. Calls `broker.init()` — if init fails, account is skipped with a warning

Brokers are shared across test files via module-level caching.
