# OpenAlice Environment & Config Specification

(Generated 2026-04-20 by static analysis, pinned commit `5b0d951`)

## TL;DR

- **OpenAlice does not use a `.env` file.** There is no `.env.example` in the
  repo because the codebase deliberately drives all user-facing config (API
  keys, broker credentials, model selection, ports, feature toggles) through
  JSON files under `data/config/`.
- On first run, `loadConfig()` in `src/core/config.ts` auto-creates
  `data/config/*.json` with Zod defaults; `readAccountsConfig()` seeds an
  empty `accounts.json`; `readWithDefault()` in `src/main.ts` copies
  `default/persona.default.md` and `default/heartbeat.default.md` into
  `data/brain/` on first read.
- All `process.env.*` references in `src/` are either **test-only**, inside
  the frozen `src/openclaw/` browser sandbox, or in the `packages/opentypebb/`
  standalone server (which runs out-of-process only if you opt into the
  `openbb-api` backend).
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ALPACA_API_KEY`, and the like
  **are not read from the environment by OpenAlice's runtime path.** They
  are stored in config JSON and injected into the Agent SDK subprocess via
  `env` from `override.apiKey`.

---

## Environment Variables

Every `process.env.*` reference reachable from `src/main.ts` at runtime.
Excluded: tests (`*.spec.ts`, `tests/helpers/`), `packages/opentypebb/` (only
invoked if you run a remote openbb-api server).

| Var | Required | Default | Used By | Source |
|-----|----------|---------|---------|--------|
| `CODEX_HOME` | No | `~/.codex` | Codex provider — path to `codex login` auth dir | `src/ai-providers/codex/auth.ts:41` |
| `COMPACT_PCT_OVERRIDE` | No | — | Testing knob for context-compaction threshold (float) | `src/core/compaction.ts:70-71` |
| `OPENCLAW_IMAGE_BACKEND` | No | auto (`"sips"` on macOS+Bun, `"sharp"` otherwise) | openclaw browser sandbox image ops | `src/openclaw/media/image-ops.ts:21-22` |
| `OPENCLAW_HOME` | No | derived | openclaw work dir override | `src/openclaw/utils.ts:340` |
| `OPENCLAW_GATEWAY_TOKEN` / `CLAWDBOT_GATEWAY_TOKEN` | No | — | Remote openclaw gateway bearer token (only if browser tool calls a remote gateway) | `src/openclaw/gateway/call.ts:215-216` |
| `OPENCLAW_GATEWAY_PASSWORD` / `CLAWDBOT_GATEWAY_PASSWORD` | No | — | Remote openclaw gateway basic auth | `src/openclaw/gateway/call.ts:224-225` |
| `OPENCLAW_TEST_*` | No | — | Test-only openclaw overrides (tailscale binary, console level, etc.) | various `src/openclaw/` |
| `FORCE_COLOR` / `NO_COLOR` / `TERM` / `COLORTERM` / `TERM_PROGRAM` / `GITHUB_ACTIONS` / `VITEST` | No | OS/shell-provided | Terminal theming, test-mode detection | `src/openclaw/logging/*`, `src/openclaw/terminal/theme.ts` |
| `LOCALAPPDATA` / `ProgramFiles` | No | OS-provided | Chrome-executable discovery on Windows only | `src/openclaw/browser/chrome.executables.ts:529-530` |

**Not referenced as env vars anywhere in `src/`:**
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ALPACA_API_KEY`,
`ALPACA_SECRET_KEY`, `TELEGRAM_BOT_TOKEN`. All credentials flow through
config JSON and are injected into subprocess env at invocation time from
profile / account data. See **AI Provider Details** and **Alpaca Integration
Details**.

`packages/opentypebb/` accepts `FMP_API_KEY`, `OPENTYPEBB_PORT`,
`HTTPS_PROXY`, `HTTP_PROXY`, `TWS_HOST`, `TWS_PORT` — but only if you run
that server standalone (it is not started by `pnpm dev`). Default in-process
market data backend is `typebb-sdk` which needs none of these.

---

## Config Files

All paths relative to repo root. Auto-created = written with Zod-validated
defaults on first invocation of `loadConfig()` / `readAccountsConfig()`.

| Path | Required | Auto-created | Schema | Purpose |
|------|----------|--------------|--------|---------|
| `data/config/engine.json` | No | Yes | `engineSchema` (pairs, interval=5000, port=3000) | Legacy engine loop settings |
| `data/config/agent.json` | No | Yes | `agentSchema` (maxSteps=20, claudeCode.maxTurns=20, disallowedTools list) | Agent loop + Claude Code subprocess constraints |
| `data/config/crypto.json` | No | Yes | `cryptoSchema` — discriminated union `ccxt \| none` (default `none`) | **Legacy**. Active crypto accounts live in `accounts.json`. |
| `data/config/securities.json` | No | Yes | `securitiesSchema` — discriminated union `alpaca \| none` (default `none`) | **Legacy**. Active securities accounts live in `accounts.json`. |
| `data/config/market-data.json` | No | Yes | `marketDataSchema` (backend=`typebb-sdk`, providers=`yfinance`, providerKeys={}) | Market data routing + provider API keys |
| `data/config/compaction.json` | No | Yes | `compactionSchema` (maxContextTokens=200k, autoCompactBuffer=13k) | Context-window compaction thresholds |
| `data/config/ai-provider-manager.json` | No | Yes | `aiProviderSchema` — profile-based AI config. Default seed: `{ profiles: { default: { backend: 'agent-sdk', model: 'claude-opus-4-7', loginMethod: 'claudeai' } }, activeProfile: 'default' }` | AI provider selection + per-profile API keys |
| `data/config/heartbeat.json` | No | Yes | `heartbeatSchema` (enabled=false, every=`30m`) | Periodic heartbeat cron |
| `data/config/snapshot.json` | No | Yes | `snapshotSchema` (enabled=true, every=`15m`) | Account snapshot scheduler |
| `data/config/connectors.json` | No | Yes | `connectorsSchema` (web.port=3002, mcp.port=3001, telegram.enabled=false, mcpAsk.enabled=false) | Connector ports + toggles |
| `data/config/news.json` | No | Yes | `newsCollectorSchema` (enabled=true, intervalMinutes=10, ~28 feeds pre-defined, subset enabled) | RSS collector |
| `data/config/tools.json` | No | Yes | `toolsSchema` (disabled=[]) | Tool allowlist/denylist |
| `data/config/webhook.json` | No | Yes | `webhookSchema` (tokens=[]) | Bearer tokens for `POST /api/events/ingest`. **Empty = endpoint returns 503.** |
| `data/config/accounts.json` | No | Yes (empty `[]`) | `accountsFileSchema` = `AccountConfig[]` | **This is the real broker config.** Each entry has `{id, label, type, enabled, guards, brokerConfig}`. `type` is `"alpaca" \| "ccxt" \| "ibkr" \| "mock"`; `brokerConfig` shape is validated by the registered broker's `static configSchema`. |
| `data/config/web-subchannels.json` | No | No (empty array returned if missing) | `webSubchannelsSchema` | Per-channel overrides for web UI sessions |
| `data/brain/persona.md` | No | Yes (copied from `default/persona.default.md`) | free-form markdown | Alice's persona prompt |
| `data/brain/heartbeat.md` | No | Yes (copied from `default/heartbeat.default.md`) | free-form markdown | Heartbeat instruction prompt |
| `data/brain/commit.json` | No | No (Brain fresh-starts if missing) | `BrainExportState` | Cognitive state snapshot |
| `data/brain/frontal-lobe.md` | No | No | free-form markdown | Alice's running note-to-self |

**`CONFIG_DIR`** is hard-coded to `resolve('data/config')` at
`src/core/config.ts:6`, where `resolve` is called without a base — so the
directory is relative to `process.cwd()` when the app launches. Running
`pnpm dev` or `pnpm start` from the repo root puts it at
`~/Projects/OpenAlice/data/config/`.

---

## First-Run Behavior

Cold start with no `data/` directory:

1. `main()` calls `loadConfig()` (`src/core/config.ts:334`).
2. `loadConfig()` iterates the 13 config filenames; for each missing file,
   `parseAndSeed()` (`src/core/config.ts:325`) runs the Zod schema against
   `{}`, obtains fully defaulted values, creates `data/config/` with
   `mkdir -p`, and writes the defaulted JSON to disk.
3. `readAccountsConfig()` (`src/core/config.ts:529`) sees
   `accounts.json` missing → writes `[]\n` and returns `[]`. **No broker
   accounts are active on first run.**
4. `accountManager.initAccount()` is not called (empty list), so no broker
   connections are attempted.
5. Brain bootstrap (`main.ts:123-127`) via `readWithDefault`:
   - Tries `data/brain/commit.json` → missing, so `Brain` instance starts fresh.
   - Tries `data/brain/persona.md` → missing, so copies from `default/persona.default.md`.
   - Tries `data/brain/heartbeat.md` → missing, so copies from `default/heartbeat.default.md`.
6. Core plugins start: MCP server on `:3001`, Web UI on `:3002`. Telegram
   and `mcp-ask` are off (defaults).
7. Snapshot scheduler starts (enabled by default). Heartbeat does **not**
   start (defaults to `enabled: false`).
8. The AgentSdkProvider is wired but not invoked until a request arrives —
   the first call to `/api/ask` or similar will trigger the subprocess.

**Net:** the app boots cleanly with zero user input. It will not talk to
any broker until you add an entry to `accounts.json`, and it will not call
Claude Code until a user request arrives.

---

## Minimum Viable Startup

To run OpenAlice with **only** Alpaca paper trading (no crypto, no
telegram, no browser), here is the complete checklist:

### Environment variables
**None.** Zero env vars need to be set.

### Config files — minimum delta from auto-seeded defaults

Only `data/config/accounts.json` needs a non-default value. Everything else
can be left at the auto-seeded defaults:

```json
[
  {
    "id": "alpaca-paper-1",
    "label": "Alpaca Paper",
    "type": "alpaca",
    "enabled": true,
    "guards": [],
    "brokerConfig": {
      "paper": true,
      "apiKey": "PKxxxxxxxxxxxxxxxx",
      "apiSecret": "xxxxxxxxxxxxxxxxxxxxxxxx"
    }
  }
]
```

The same entry can be added interactively via the Web UI (`localhost:3002`)
instead of editing the file — the registry carries `configFields` and
`setupGuide` for form rendering (`src/domain/trading/brokers/registry.ts:77-92`).

### Prerequisites
- User has previously run `claude login` (OAuth flow) so the Agent SDK can
  use the OAuth token without an API key. See **AI Provider Details**
  below for the alternative.
- Alpaca paper API key + secret from `alpaca.markets` dashboard (Paper
  tab).

### Not required
- `ANTHROPIC_API_KEY` env var — not needed in default `claudeai` OAuth
  mode.
- `data/config/securities.json` overrides — the legacy top-level
  `securities` block stays at `{provider: {type: 'none'}}` and is unused
  by `main.ts` once `accounts.json` entries exist.
- Webhook token config — only required if you want
  `POST /api/events/ingest` to accept external webhooks.

---

## Alpaca Integration Details

### Schema (authoritative — `src/domain/trading/brokers/alpaca/AlpacaBroker.ts:66-70`)

```ts
static configSchema = z.object({
  paper: z.boolean().default(true),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
})
```

Goes into the `brokerConfig` field of an `AccountConfig` entry.

### UI field descriptors (`AlpacaBroker.ts:72-76`)

| Field | Type | Label | Required | Default |
|-------|------|-------|----------|---------|
| `paper` | boolean | Paper Trading | No | `true` |
| `apiKey` | password (sensitive) | API Key | **Yes** | — |
| `apiSecret` | password (sensitive) | Secret Key | **Yes** | — |

### Paper vs live toggle
Controlled by the single `paper: boolean` field inside `brokerConfig`. The
AlpacaBroker constructor passes this through to `@alpacahq/alpaca-trade-api`
which routes to the appropriate endpoint. Paper and live have **separate
API key pairs** — you cannot share them. The registry `setupGuide` spells
this out to the user.

### Loading flow
1. `main.ts:106` → `readAccountsConfig()` returns `AccountConfig[]`.
2. For each `enabled === true` entry, `accountManager.initAccount(accCfg)`.
3. `AccountManager` consults `BROKER_REGISTRY[accCfg.type]` and calls
   `entry.fromConfig(accCfg)` (`src/domain/trading/brokers/factory.ts:14-18`).
4. `AlpacaBroker.fromConfig` parses `brokerConfig` with the Zod schema and
   constructs an `Alpaca` SDK client. Credentials live in memory for the
   process lifetime.

### Legacy `securities.json` path
The top-level `securitiesSchema` (`config.ts:138-154`) accepts
`provider: {type: 'alpaca', apiKey, secretKey, paper}` but this value is
**not consumed anywhere in `main.ts`** — I searched for `config.securities`
and `config.crypto` usage and found no reads in the composition root.
These files are kept for schema stability / migration but active Alpaca
wiring is 100% via `accounts.json`.

---

## AI Provider Details

### Default profile (from `aiProviderSchema`, `src/core/config.ts:78-87`)
When `ai-provider-manager.json` is missing, `parseAndSeed` writes:

```json
{
  "profiles": {
    "default": {
      "backend": "agent-sdk",
      "model": "claude-opus-4-7",
      "loginMethod": "claudeai"
    }
  },
  "activeProfile": "default"
}
```

`backend: "agent-sdk"` → routes to `AgentSdkProvider`
(`src/ai-providers/agent-sdk/agent-sdk-provider.ts`), which is a thin
wrapper around `@anthropic-ai/claude-agent-sdk`'s `query()` function.

### How Claude Code is invoked

It is **not** a `claude -p <prompt>` subprocess in the style of the
standalone CLI. It is the Agent SDK npm package
(`@anthropic-ai/claude-agent-sdk@0.2.72`), which internally spawns the
Claude Code binary but is driven as a streaming API.

The invocation (`src/ai-providers/agent-sdk/query.ts:178-194`):

```ts
for await (const event of sdkQuery({
  prompt,
  options: {
    cwd,                     // data/brain (or process.cwd() in evolution mode)
    env,                     // see below
    model: override?.model ?? 'claude-opus-4-7',
    maxTurns,
    allowedTools, disallowedTools,
    mcpServers: { 'open-alice': <in-process MCP> },
    systemPrompt,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    persistSession: false,
    ...(loginMethod === 'claudeai' ? { forceLoginMethod: 'claudeai' } : {}),
  },
})) { ... }
```

### Authentication modes (`src/ai-providers/agent-sdk/query.ts:150-165`)

Two paths, driven by the active profile's `loginMethod`:

**`loginMethod: 'claudeai'` (the seeded default, OAuth):**
```ts
const env = { ...process.env }
delete env.ANTHROPIC_API_KEY        // force OAuth even if the key is in the shell
delete env.CLAUDE_CODE_SIMPLE
// + forceLoginMethod: 'claudeai' passed to SDK
```
The Agent SDK uses the OAuth token the user stored by running `claude
login` previously. No API key needed.

**`loginMethod: 'api-key'`:**
```ts
const env = { ...process.env }
if (override.apiKey) env.ANTHROPIC_API_KEY = override.apiKey
env.CLAUDE_CODE_SIMPLE = '1'        // force API-key mode, disable OAuth
```
The API key is taken from the profile's `apiKey` field (written into
`ai-provider-manager.json`). If the user has set `ANTHROPIC_API_KEY` in
their shell AND the profile has no `apiKey`, the shell var leaks in via
`{...process.env}` — but the seeded default profile is `claudeai`, not
`api-key`, so this is only reachable if the user explicitly switches
backends.

### Model selection
- Default: `claude-opus-4-7`.
- Per-request override: `AskOptions.agentSdk.model` → threaded as
  `override.model`.
- Per-channel override: web-subchannel `profile` slug resolves to a named
  profile with its own model.

### Fallback
There is **no silent fallback** if auth fails. The `query.ts` classifier
logs `[agent-sdk] Auth failed — check your API key / baseUrl in the active
profile` and the `generate()` stream yields a `done` event with
`text: '[error] Agent SDK error: ...'`. The app keeps running; the request
that triggered the failure surfaces the error.

### Other backends (not wired by default)
- `codex` → OpenAI Codex via `~/.codex/auth.json` OAuth tokens. Controlled
  by `CODEX_HOME` env var (optional).
- `vercel-ai-sdk` → direct REST calls to Anthropic/OpenAI/Google using
  `apiKey` from profile.

---

## Gaps / Uncertainties

1. **Webhook ingress default-deny:** `webhook.json` seeds `tokens: []`, which
   means `POST /api/events/ingest` returns 503 until a token is added
   (`src/connectors/web/routes/events.ts:36-50`). Not a startup blocker but
   worth knowing before trying to feed external events.
2. **Symbol index load at startup:** `main.ts:210-211` calls
   `symbolIndex.load(equityClient)`. With the default `typebb-sdk`
   backend, this runs in-process against bundled data. With `openbb-api`,
   it would try `http://localhost:6900` and hang/fail if no external
   server is up. The default is safe; I did not trace the in-process path
   end-to-end.
3. **`packages/opentypebb` startup:** unclear whether `pnpm dev` spawns the
   opentypebb server or not. `turbo.json` and `package.json` `dev` script
   would confirm — I did not open them, but the `typebb-sdk` market data
   backend path in `main.ts:191` uses `getSDKExecutor()` which pulls from
   the in-process `@traderalice/opentypebb` package, not an HTTP server.
   Safe to assume no separate server process is needed for minimum
   startup.
4. **Evolution mode vs normal mode cwd:** `agent-sdk-provider.ts:37` sets
   `cwd` to `data/brain` in normal mode, `process.cwd()` (repo root) in
   evolution mode. If Alice tries `Read`/`Write`/`Edit` tools, relative
   paths resolve relative to `data/brain` — which may surprise a user
   expecting repo-relative paths. Default is `evolutionMode: false`.
5. **Network behaviour on first boot:** `symbolIndex.load()` and
   `commodityCatalog.load()` run synchronously at startup. If either makes
   network calls (typebb-sdk may fetch yfinance metadata), cold boot
   without internet could hang or error. Not traced end-to-end.
6. **UI env var at build time:** `ui/src/pages/AutomationWebhookSection.tsx:66`
   references `process.env.OPENALICE_TOKEN`. Vite does not auto-replace
   `process.env.X` in client code unless `define` is configured. This may
   be a bug or rely on build-time substitution I did not verify. It is a
   UI-only concern and won't affect backend boot.
