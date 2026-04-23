import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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

  it('expandHome resolves ~/ prefix to absolute path', () => {
    const expanded = expandHome('~/Projects/signal-pipeline/signals')
    expect(expanded.startsWith('/')).toBe(true)
    expect(expanded).not.toContain('~')
    expect(expandHome('/already/absolute')).toBe('/already/absolute')
    expect(expandHome('relative/path')).toBe('relative/path')
  })
})
