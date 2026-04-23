/**
 * Signal tool — reads daily signal files produced by the external
 * signal-pipeline project.
 *
 * Schema mirrors signal-pipeline's schemas/signal.py SignalReport.
 * Pydantic's Optional[...] fields serialize as explicit JSON null,
 * so we use .nullable().optional() to accept both shapes.
 */

import { tool, type Tool } from 'ai'
import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

// ==================== Schemas (mirror signal-pipeline/schemas/signal.py) ====================

const actionHintSchema = z.enum(['BUY', 'SELL', 'HOLD', 'CLOSE'])
const triggerSchema = z.enum(['golden_cross', 'death_cross', 'qlib_top_rank', 'qlib_bottom_rank', 'none'])
const convictionSchema = z.enum(['low', 'medium', 'high'])
const pairActionSchema = z.enum(['OPEN', 'CLOSE', 'REBALANCE', 'HOLD'])

/** Weight-sum tolerance for basket legs — mirrors Python's BASKET_WEIGHT_TOLERANCE. */
const BASKET_WEIGHT_TOLERANCE = 1e-3
const paramsSchema = z.record(z.string(), z.union([z.string(), z.number()])).default({})
const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')

const generatorMetaSchema = z.object({
  name: z.string(),
  version: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  trained_on: z.string().nullable().optional(),
  ic: z.number().nullable().optional(),
  rank_ic: z.number().nullable().optional(),
})

const signalEntrySchema = z.object({
  symbol: z.string(),
  action_hint: actionHintSchema,
  trigger: triggerSchema,
  conviction: convictionSchema.default('medium'),
  score: z.number().nullable().optional(),
  rank: z.number().int().nullable().optional(),
  // Widened from Literal[1,2] to any int — Phase 2+ strategies may use different tiers.
  tier: z.number().int().nullable().optional(),
  strategy_source: z.string().nullable().optional(),
  short_ma: z.number().nullable().optional(),
  long_ma: z.number().nullable().optional(),
  close: z.number().nullable().optional(),
  date_of_signal: z.string().nullable().optional(),
  reasoning: z.string().nullable().optional(),
})

// ==================== Pair / basket schemas (Phase 2 extension) ====================

const basketLegSchema = z.object({
  symbol: z.string(),
  weight: z.number().min(0).max(1),
  tier: z.number().int().nullable().optional(),
  conviction: convictionSchema.nullable().optional(),
  reasoning: z.string().nullable().optional(),
})

const pairTradeEntrySchema = z.object({
  long_symbol: z.string(),
  short_symbol: z.string(),
  hedge_ratio: z.number().default(1.0),
  action: pairActionSchema,
  conviction: convictionSchema.default('medium'),
  tier: z.number().int().nullable().optional(),
  strategy_source: z.string(),
  reasoning: z.string(),
  date_of_signal: ymdSchema,
  generator_params: paramsSchema,
})

/** Sum-to-1 check for basket legs. Empty leg list is allowed (long-only / short-only). */
const weightsSumToOne = (legs: z.infer<typeof basketLegSchema>[]): boolean => {
  if (legs.length === 0) return true
  const total = legs.reduce((s, l) => s + l.weight, 0)
  return Math.abs(total - 1.0) <= BASKET_WEIGHT_TOLERANCE
}

const longShortBasketSchema = z.object({
  long_legs: z.array(basketLegSchema).default([])
    .refine(weightsSumToOne, { message: `basket long_legs must sum to 1.0 within ±${BASKET_WEIGHT_TOLERANCE}` }),
  short_legs: z.array(basketLegSchema).default([])
    .refine(weightsSumToOne, { message: `basket short_legs must sum to 1.0 within ±${BASKET_WEIGHT_TOLERANCE}` }),
  long_dollar_allocation: z.number().nullable().optional(),
  short_dollar_allocation: z.number().nullable().optional(),
  hedge_mode: z.enum(['dollar_neutral', 'beta_neutral', 'custom']),
  action: pairActionSchema,
  strategy_source: z.string(),
  reasoning: z.string(),
  date_of_signal: ymdSchema,
  generator_params: paramsSchema,
})

const portfolioSuggestionSchema = z.object({
  mode: z.enum(['equal_weight_top_N', 'react_to_crossover', 'manual']),
  top_n: z.number().int().nullable().optional(),
  position_size_per_signal_usd: z.number().nullable().optional(),
  max_position_pct: z.number().default(15.0),
  rebalance: z.string().nullable().optional(),
})

export const signalReportSchema = z.object({
  date: ymdSchema,
  generator: generatorMetaSchema,
  universe: z.array(z.string()).min(1),
  signals: z.array(signalEntrySchema).default([]),
  pair_trades: z.array(pairTradeEntrySchema).default([]),
  long_short_baskets: z.array(longShortBasketSchema).default([]),
  no_signal: z.array(z.string()).default([]),
  insufficient_data: z.array(z.string()).default([]),
  stale_data: z.array(z.string()).default([]),
  portfolio_suggestion: portfolioSuggestionSchema,
  generated_at: z.string(),
})

export type SignalReport = z.infer<typeof signalReportSchema>

// ==================== Helpers ====================

/** Expand leading ~/ to homedir. fs.readFile does not do this natively. */
export function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return p === '~' ? homedir() : join(homedir(), p.slice(2))
  }
  return p
}

/** Today's date in UTC as YYYY-MM-DD. */
function todayUtcYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

// ==================== Factory ====================

export function createSignalTools(signalDir: string): Record<string, Tool> {
  const baseDir = resolve(expandHome(signalDir))

  return {
    readSignal: tool({
      description: `Read the daily signal file generated by the external signal-pipeline project.
These signals are HINTS, not commands — they indicate suggested BUY/SELL entries based on strategies like MA crossover (Phase 1) or ML factor ranking (Phase 2).
Signals apply to the whole configured universe, not any specific account.

To use a signal, first call listAccounts and getPortfolio to know what you can trade, then intersect the signal.universe with each account's whitelist. Only stage orders for symbols that are in all three sets (signal, whitelist, Adrian's capital available).

insufficient_data contains symbols where the generator did not have enough bars to evaluate (e.g. recently-listed tickers). stale_data contains symbols whose latest bar is older than 5 business days. The generator rejected them as too stale to evaluate. Treat these as data quality issues — they should NOT be considered for staging. If a symbol you expected to trade appears in stale_data, investigate the data source before manually overriding.

pair_trades contains hedged long-short pair positions. Each has a long_symbol and short_symbol that must BOTH be staged together. Check that both symbols are in the account whitelist AND Alpaca supports shorting the short_symbol (check via getQuote and Alpaca's stock_borrow_available — if shorting is not available, flag to user, do NOT stage one leg only).

long_short_baskets are multi-leg hedged strategies. Each basket has long_legs and short_legs with individual weights (summing to 1.0 per side). Size each leg proportionally to the dollar_allocation for that side.

pair_trades and long_short_baskets use an action field (OPEN/CLOSE/REBALANCE/HOLD). OPEN = new position, execute both legs. CLOSE = flatten existing pair/basket. REBALANCE = adjust existing without full close. HOLD = status report, no execution needed — just acknowledge to user.

strategy_source on each entry identifies which upstream generator produced it (e.g., 'simple-ma-crossover', 'kk-ai-displacement-pair'). When reporting to user, group by strategy_source so user can evaluate each generator's contribution independently.

The tool returns the full SignalReport plus a compact summary. If no signal file exists for the date, it returns {found: false, error: ...} so you know there is nothing to act on.`,
      inputSchema: z.object({
        date: z.string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
          .optional()
          .describe('Target signal date YYYY-MM-DD. Defaults to today (UTC).'),
      }),
      execute: async ({ date }) => {
        const targetDate = date ?? todayUtcYmd()
        const signalPath = join(baseDir, `${targetDate}.json`)
        let raw: string
        try {
          raw = await readFile(signalPath, 'utf-8')
        } catch (err: unknown) {
          if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
            return {
              found: false,
              path: signalPath,
              error: `No signal file for ${targetDate}. The signal-pipeline may not have run yet for this date — try a different --date, or run the generator in the signal-pipeline project first.`,
            }
          }
          throw err
        }

        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch (err) {
          return {
            found: true,
            path: signalPath,
            error: `Signal file exists but contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
          }
        }

        const validation = signalReportSchema.safeParse(parsed)
        if (!validation.success) {
          return {
            found: true,
            path: signalPath,
            error: `Signal file failed schema validation. The signal-pipeline may have emitted a malformed payload. Details: ${validation.error.message}`,
          }
        }

        const signal = validation.data
        const buyCount = signal.signals.filter((s) => s.action_hint === 'BUY').length
        const sellCount = signal.signals.filter((s) => s.action_hint === 'SELL').length

        return {
          found: true,
          path: signalPath,
          signal,
          summary: {
            date: signal.date,
            generator: `${signal.generator.name}@${signal.generator.version}`,
            universe_size: signal.universe.length,
            signals_count: signal.signals.length,
            buy_count: buyCount,
            sell_count: sellCount,
            no_signal_count: signal.no_signal.length,
            insufficient_data_count: signal.insufficient_data.length,
            stale_data_count: signal.stale_data.length,
            stale_tickers: signal.stale_data,
            pair_trades_count: signal.pair_trades.length,
            baskets_count: signal.long_short_baskets.length,
            top_signals: signal.signals.slice(0, 5).map((s) => ({
              symbol: s.symbol,
              action: s.action_hint,
              tier: s.tier ?? null,
              trigger: s.trigger,
              conviction: s.conviction,
              close: s.close ?? null,
              strategy_source: s.strategy_source ?? null,
            })),
            top_pair_trades: signal.pair_trades.slice(0, 5).map((p) => ({
              long: p.long_symbol,
              short: p.short_symbol,
              action: p.action,
              conviction: p.conviction,
              hedge_ratio: p.hedge_ratio,
              strategy_source: p.strategy_source,
            })),
            top_baskets: signal.long_short_baskets.slice(0, 5).map((b) => ({
              long_syms: b.long_legs.map((l) => l.symbol),
              short_syms: b.short_legs.map((l) => l.symbol),
              hedge_mode: b.hedge_mode,
              action: b.action,
              long_dollar_allocation: b.long_dollar_allocation ?? null,
              short_dollar_allocation: b.short_dollar_allocation ?? null,
              strategy_source: b.strategy_source,
            })),
          },
        }
      },
    }),
  }
}
