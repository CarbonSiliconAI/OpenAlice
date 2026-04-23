import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { createSignalTools, signalReportSchema, expandHome } from './signal.js'

function validReport() {
  return {
    date: '2026-04-23',
    generator: {
      name: 'simple-ma-crossover',
      version: '1.0.0',
      params: { short_window: 10, long_window: 50 },
      trained_on: null,
      ic: null,
      rank_ic: null,
    },
    universe: ['AAPL', 'MSFT', 'NVDA'],
    signals: [{
      symbol: 'NVDA',
      action_hint: 'BUY',
      trigger: 'golden_cross',
      conviction: 'medium',
      score: null,
      rank: null,
      tier: 1,
      short_ma: 200.15,
      long_ma: 198.50,
      close: 205.20,
      date_of_signal: '2026-04-23',
      reasoning: 'golden cross detected',
    }],
    no_signal: ['AAPL', 'MSFT'],
    insufficient_data: [],
    portfolio_suggestion: {
      mode: 'react_to_crossover',
      top_n: null,
      position_size_per_signal_usd: 5000,
      max_position_pct: 15.0,
      rebalance: null,
    },
    generated_at: '2026-04-23T19:42:37+00:00',
  }
}

function invokeReadSignal(tool: ReturnType<typeof createSignalTools>['readSignal'], args: { date?: string }) {
  // `tool` is an ai-package Tool. Extract its execute and call directly.
  const exec = (tool as unknown as { execute: (a: { date?: string }) => Promise<unknown> }).execute
  return exec(args)
}

describe('readSignal tool', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'signal-spec-'))
  })

  afterEach(() => {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true })
  })

  it('(a) returns {found:false} with helpful error when signal file missing', async () => {
    const tools = createSignalTools(tmp)
    const result = await invokeReadSignal(tools.readSignal, { date: '2099-12-31' }) as Record<string, unknown>
    expect(result.found).toBe(false)
    expect(result.error).toMatch(/No signal file for 2099-12-31/)
    expect(result.path).toContain('2099-12-31.json')
  })

  it('(b) returns parsed signal with summary when file is valid', async () => {
    writeFileSync(join(tmp, '2026-04-23.json'), JSON.stringify(validReport()))
    const tools = createSignalTools(tmp)
    const result = await invokeReadSignal(tools.readSignal, { date: '2026-04-23' }) as Record<string, unknown>
    expect(result.found).toBe(true)
    expect(result.error).toBeUndefined()
    const signal = result.signal as { date: string; signals: unknown[] }
    expect(signal.date).toBe('2026-04-23')
    expect(signal.signals).toHaveLength(1)
    const summary = result.summary as { buy_count: number; sell_count: number; signals_count: number }
    expect(summary.buy_count).toBe(1)
    expect(summary.sell_count).toBe(0)
    expect(summary.signals_count).toBe(1)
  })

  it('(c) rejects malformed JSON with clear error (no throw)', async () => {
    writeFileSync(join(tmp, '2026-04-23.json'), '{ this is not json')
    const tools = createSignalTools(tmp)
    const result = await invokeReadSignal(tools.readSignal, { date: '2026-04-23' }) as Record<string, unknown>
    expect(result.found).toBe(true)
    expect(result.error).toMatch(/invalid JSON/i)
    expect(result.signal).toBeUndefined()
  })

  it('(d) rejects JSON that fails schema validation (missing required field)', async () => {
    const bad = validReport() as Record<string, unknown>
    delete bad.universe  // universe is required + min(1)
    writeFileSync(join(tmp, '2026-04-23.json'), JSON.stringify(bad))
    const tools = createSignalTools(tmp)
    const result = await invokeReadSignal(tools.readSignal, { date: '2026-04-23' }) as Record<string, unknown>
    expect(result.found).toBe(true)
    expect(result.error).toMatch(/schema validation/i)
  })

  it('(e) validates the real signal-pipeline output at ~/Projects/signal-pipeline/signals/2026-04-23.json', async () => {
    const realPath = join(homedir(), 'Projects/signal-pipeline/signals/2026-04-23.json')
    // If the real file isn't present (e.g. CI), skip gracefully
    if (!existsSync(realPath)) return
    const { readFileSync } = await import('node:fs')
    const raw = JSON.parse(readFileSync(realPath, 'utf-8'))
    const parsed = signalReportSchema.safeParse(raw)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.date).toBe('2026-04-23')
      expect(parsed.data.universe.length).toBeGreaterThan(0)
      // The real file has 2 BUY signals (DDOG + S)
      const buys = parsed.data.signals.filter((s) => s.action_hint === 'BUY')
      expect(buys.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('(f) accepts stale_data field and surfaces it in summary', async () => {
    const report = validReport() as Record<string, unknown>
    report.stale_data = ['CFLT', 'OLDSTOCK']
    writeFileSync(join(tmp, '2026-04-23.json'), JSON.stringify(report))
    const tools = createSignalTools(tmp)
    const result = await invokeReadSignal(tools.readSignal, { date: '2026-04-23' }) as Record<string, unknown>
    expect(result.found).toBe(true)
    expect(result.error).toBeUndefined()
    const signal = result.signal as { stale_data: string[] }
    expect(signal.stale_data).toEqual(['CFLT', 'OLDSTOCK'])
    const summary = result.summary as { stale_data_count: number; stale_tickers: string[] }
    expect(summary.stale_data_count).toBe(2)
    expect(summary.stale_tickers).toEqual(['CFLT', 'OLDSTOCK'])
  })

  it('(g) defaults stale_data to [] when field absent (back-compat)', async () => {
    // Pre-staleness-fix signal files wouldn't have this field
    const report = validReport() as Record<string, unknown>
    delete report.stale_data  // not set by older generators
    writeFileSync(join(tmp, '2026-04-23.json'), JSON.stringify(report))
    const tools = createSignalTools(tmp)
    const result = await invokeReadSignal(tools.readSignal, { date: '2026-04-23' }) as Record<string, unknown>
    expect(result.found).toBe(true)
    expect(result.error).toBeUndefined()
    const signal = result.signal as { stale_data: string[] }
    expect(signal.stale_data).toEqual([])
    const summary = result.summary as { stale_data_count: number }
    expect(summary.stale_data_count).toBe(0)
  })

  it('(h) parses KK fixture with pair_trades and long_short_baskets', async () => {
    const fixturePath = join(homedir(), 'Projects/signal-pipeline/tests/fixtures/kk_sample_signal.json')
    if (!existsSync(fixturePath)) return  // skip if fixture missing
    const { readFileSync } = await import('node:fs')
    // Copy fixture into the tmp signals dir under today's date
    writeFileSync(join(tmp, '2026-04-23.json'), readFileSync(fixturePath, 'utf-8'))
    const tools = createSignalTools(tmp)
    const result = await invokeReadSignal(tools.readSignal, { date: '2026-04-23' }) as Record<string, unknown>
    expect(result.found).toBe(true)
    expect(result.error).toBeUndefined()
    const signal = result.signal as { pair_trades: unknown[]; long_short_baskets: unknown[] }
    expect(signal.pair_trades).toHaveLength(1)
    expect(signal.long_short_baskets).toHaveLength(1)
    const summary = result.summary as {
      pair_trades_count: number; baskets_count: number;
      top_pair_trades: Array<{ long: string; short: string; strategy_source: string }>;
      top_baskets: Array<{ hedge_mode: string; strategy_source: string }>;
    }
    expect(summary.pair_trades_count).toBe(1)
    expect(summary.baskets_count).toBe(1)
    expect(summary.top_pair_trades[0].long).toBe('NVDA')
    expect(summary.top_pair_trades[0].short).toBe('CRM')
    expect(summary.top_pair_trades[0].strategy_source).toBe('kk-ai-displacement-pair')
    expect(summary.top_baskets[0].hedge_mode).toBe('dollar_neutral')
    expect(summary.top_baskets[0].strategy_source).toBe('kk-ai-displacement-basket')
  })

  it('(i) preserves strategy_source on SignalEntry', async () => {
    const report = validReport() as Record<string, unknown>
    report.signals = [{
      symbol: 'NVDA',
      action_hint: 'BUY',
      trigger: 'golden_cross',
      conviction: 'medium',
      strategy_source: 'test-gen',
    }]
    writeFileSync(join(tmp, '2026-04-23.json'), JSON.stringify(report))
    const tools = createSignalTools(tmp)
    const result = await invokeReadSignal(tools.readSignal, { date: '2026-04-23' }) as Record<string, unknown>
    expect(result.found).toBe(true)
    const signal = result.signal as { signals: Array<{ symbol: string; strategy_source?: string | null }> }
    expect(signal.signals[0].strategy_source).toBe('test-gen')
    const summary = result.summary as { top_signals: Array<{ strategy_source: string | null }> }
    expect(summary.top_signals[0].strategy_source).toBe('test-gen')
  })

  it('(j) back-compat: old signal without pair_trades/baskets/strategy_source validates', async () => {
    // Use today's real MA signal file shape — has stale_data but no pair_trades/baskets/strategy_source
    const realPath = join(homedir(), 'Projects/signal-pipeline/signals/2026-04-23.json')
    if (!existsSync(realPath)) return  // skip if missing
    const { readFileSync } = await import('node:fs')
    writeFileSync(join(tmp, '2026-04-23.json'), readFileSync(realPath, 'utf-8'))
    const tools = createSignalTools(tmp)
    const result = await invokeReadSignal(tools.readSignal, { date: '2026-04-23' }) as Record<string, unknown>
    expect(result.found).toBe(true)
    expect(result.error).toBeUndefined()
    const signal = result.signal as { pair_trades: unknown[]; long_short_baskets: unknown[]; signals: Array<{ strategy_source?: string | null }> }
    expect(signal.pair_trades).toEqual([])
    expect(signal.long_short_baskets).toEqual([])
    // SignalEntry strategy_source is optional — MA generator may or may not set it
    // (the current generator does set it; older generations would have undefined)
    for (const s of signal.signals) {
      // Either string or undefined/null — both are valid
      expect(['string', 'undefined', 'object'].includes(typeof s.strategy_source)).toBe(true)
    }
    const summary = result.summary as { pair_trades_count: number; baskets_count: number }
    expect(summary.pair_trades_count).toBe(0)
    expect(summary.baskets_count).toBe(0)
  })

  it('(k) HTTP mode: 200 with valid KK fixture → found:true with pair_trades', async () => {
    const fixturePath = join(homedir(), 'Projects/signal-pipeline/tests/fixtures/kk_sample_signal.json')
    if (!existsSync(fixturePath)) return
    const { readFileSync } = await import('node:fs')
    const body = readFileSync(fixturePath, 'utf-8')
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    try {
      const tools = createSignalTools('http://localhost:9999/signals')
      const result = await invokeReadSignal(tools.readSignal, { date: '2026-04-23' }) as Record<string, unknown>
      expect(result.found).toBe(true)
      expect(result.error).toBeUndefined()
      const signal = result.signal as { pair_trades: unknown[] }
      expect(signal.pair_trades).toHaveLength(1)
      // verify the URL requested
      expect(fetchSpy).toHaveBeenCalledOnce()
      const calledUrl = fetchSpy.mock.calls[0][0] as string
      expect(calledUrl).toBe('http://localhost:9999/signals/2026-04-23.json')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('(l) HTTP mode: 404 → found:false with "No signal at..." error', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('not found', { status: 404 })
    )
    try {
      const tools = createSignalTools('https://kk.example.com/signals')
      const result = await invokeReadSignal(tools.readSignal, { date: '2099-12-31' }) as Record<string, unknown>
      expect(result.found).toBe(false)
      expect(result.error).toContain('No signal at https://kk.example.com/signals/2099-12-31.json')
      expect(result.path).toBe('https://kk.example.com/signals/2099-12-31.json')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('(m) HTTP mode: network error → found:false with "Network error" message', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(
      new TypeError('fetch failed: ECONNREFUSED')
    )
    try {
      const tools = createSignalTools('http://localhost:1/signals')
      const result = await invokeReadSignal(tools.readSignal, { date: '2026-04-23' }) as Record<string, unknown>
      expect(result.found).toBe(false)
      expect(result.error).toMatch(/Network error reaching http:\/\/localhost:1\/signals\/2026-04-23\.json/)
      expect(result.error).toContain('ECONNREFUSED')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('(n) HTTP mode: 200 with malformed JSON → found:true with "Invalid JSON" error', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{ this is not valid json', { status: 200 })
    )
    try {
      const tools = createSignalTools('http://localhost:9999')
      const result = await invokeReadSignal(tools.readSignal, { date: '2026-04-23' }) as Record<string, unknown>
      expect(result.found).toBe(true)
      expect(result.error).toMatch(/invalid JSON/i)
      expect(result.signal).toBeUndefined()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('expandHome resolves ~/ prefix to absolute path', () => {
    const expanded = expandHome('~/Projects/signal-pipeline/signals')
    expect(expanded.startsWith('/')).toBe(true)
    expect(expanded).not.toContain('~')
    expect(expandHome('/already/absolute')).toBe('/already/absolute')
    expect(expandHome('relative/path')).toBe('relative/path')
  })
})
