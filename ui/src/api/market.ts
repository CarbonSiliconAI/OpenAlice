import { fetchJson } from './client'

export type AssetClass = 'equity' | 'crypto' | 'currency' | 'commodity'

export interface SearchResult {
  /** Equity / crypto / currency have `symbol`. Commodity uses `id` (canonical). */
  symbol?: string
  id?: string
  name?: string | null
  assetClass: AssetClass
  // upstream fields pass through (cik, source, currency, exchange, exchange_name, category, …)
  [key: string]: unknown
}

export interface SearchResponse {
  results: SearchResult[]
  count: number
}

export interface HistoricalBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export interface HistoricalResponse {
  results: HistoricalBar[] | null
  provider: string
  error?: string
}

export const marketApi = {
  /** Adrian's aggregated heuristic search across all asset classes. */
  async search(query: string, limit = 20): Promise<SearchResponse> {
    const qs = new URLSearchParams({ query, limit: String(limit) })
    return fetchJson(`/api/market/search?${qs}`)
  },

  /**
   * Historical OHLCV candles. Provider comes from the server-side default
   * (config.marketData.providers[assetClass]) — UI doesn't pick provider.
   * `assetClass` only decides the URL prefix; `interval` defaults to `1d`.
   */
  async historical(
    assetClass: AssetClass,
    symbol: string,
    opts: { interval?: string; startDate?: string; endDate?: string } = {},
  ): Promise<HistoricalResponse> {
    if (assetClass === 'commodity') {
      throw new Error('commodity historical not supported yet')
    }
    const qs = new URLSearchParams({ symbol })
    qs.set('interval', opts.interval ?? '1d')
    if (opts.startDate) qs.set('start_date', opts.startDate)
    if (opts.endDate) qs.set('end_date', opts.endDate)
    return fetchJson(`/api/market-data-v1/${assetClass}/price/historical?${qs}`)
  },
}
