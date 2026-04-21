/**
 * Guard Pipeline
 *
 * The only place that touches the account: assembles a GuardContext,
 * then passes it through the guard chain. Guards themselves never
 * see the account.
 */

import Decimal from 'decimal.js'
import type { Operation } from '../git/types.js'
import type { IBroker, Quote } from '../brokers/types.js'
import type { OperationGuard, GuardContext } from './types.js'

const QUOTE_TIMEOUT_MS = 2000

/** Race a promise against a timeout. Rejects with Error on timeout. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    p.then((v) => { clearTimeout(timer); resolve(v) },
           (e) => { clearTimeout(timer); reject(e) })
  })
}

/** Extract a usable price from a Quote. Prefers last trade, falls back to ask. */
function pickPrice(q: Quote): { estimatedPrice: Decimal; priceSource: 'last' | 'ask' } | undefined {
  if (q.last > 0) return { estimatedPrice: new Decimal(q.last), priceSource: 'last' }
  if (q.ask > 0)  return { estimatedPrice: new Decimal(q.ask),  priceSource: 'ask' }
  return undefined
}

export function createGuardPipeline(
  dispatcher: (op: Operation) => Promise<unknown>,
  account: IBroker,
  guards: OperationGuard[],
): (op: Operation) => Promise<unknown> {
  if (guards.length === 0) return dispatcher

  return async (op: Operation): Promise<unknown> => {
    // Quote only matters for placeOrder — other ops don't price-check a new exposure.
    const wantsQuote = op.action === 'placeOrder'
    const quotePromise: Promise<Quote | undefined> = wantsQuote
      ? withTimeout(account.getQuote(op.contract), QUOTE_TIMEOUT_MS, 'getQuote')
          .catch((err: unknown) => {
            const symbol = op.contract?.symbol ?? '<unknown>'
            const reason = err instanceof Error ? err.message : String(err)
            console.warn(`[guard-pipeline] getQuote failed for ${symbol}: ${reason}`)
            return undefined
          })
      : Promise.resolve(undefined)

    const [positions, accountInfo, quote] = await Promise.all([
      account.getPositions(),
      account.getAccount(),
      quotePromise,
    ])

    const picked = quote ? pickPrice(quote) : undefined

    const ctx: GuardContext = {
      operation: op,
      positions,
      account: accountInfo,
      estimatedPrice: picked?.estimatedPrice,
      priceSource: picked?.priceSource,
    }

    for (const guard of guards) {
      const rejection = await guard.check(ctx)
      if (rejection != null) {
        return { success: false, error: `[guard:${guard.name}] ${rejection}` }
      }
    }

    return dispatcher(op)
  }
}
