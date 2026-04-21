import type Decimal from 'decimal.js'
import type { Operation } from '../git/types.js'
import type { Position, AccountInfo } from '../brokers/types.js'

/** Read-only context assembled by the pipeline, consumed by guards. */
export interface GuardContext {
  readonly operation: Operation
  readonly positions: readonly Position[]
  readonly account: Readonly<AccountInfo>
  /**
   * Best-effort price estimate supplied by the pipeline for placeOrder ops.
   * Populated from the broker's last-trade or ask, whichever is usable.
   * Undefined if the quote fetch failed, timed out, or was skipped (e.g.
   * non-placeOrder ops). Guards MUST handle undefined — falling back to
   * their previous allow-by-default behavior is the expected contract.
   */
  readonly estimatedPrice?: Decimal
  /** Which broker price field produced `estimatedPrice`. Useful for audit. */
  readonly priceSource?: 'last' | 'ask'
}

/** A guard that can reject operations. Returns null to allow, or a rejection reason string. */
export interface OperationGuard {
  readonly name: string
  check(ctx: GuardContext): Promise<string | null> | string | null
}

/** Registry entry: type identifier + factory function. */
export interface GuardRegistryEntry {
  type: string
  create(options: Record<string, unknown>): OperationGuard
}
