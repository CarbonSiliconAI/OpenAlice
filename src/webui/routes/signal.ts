/**
 * Signal-pipeline read-only bridge.
 *
 * Exposes the daily signals produced by the external signal-pipeline
 * project (a separate Python process) over HTTP, so the UI can read them
 * without going through the agent/MCP path. The source is configured via
 * SIGNAL_PIPELINE_PATH — a local directory or an http(s):// base URL;
 * scheme detection + expansion happens inside fetchRawSignal at request
 * time. This is a host-local read, not a broker operation, so it lives
 * here rather than in the UTA service.
 *
 * GET /api/signal           → today's signal (UTC)
 * GET /api/signal/:date     → signal for YYYY-MM-DD
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fetchRawSignal, signalReportSchema, todayUtcYmd } from '../../tool/signal.js'

export function createSignalRoutes() {
  const app = new Hono()

  // Raw basePath — may be a local directory or an http(s):// URL.
  const signalBasePath =
    process.env.SIGNAL_PIPELINE_PATH?.trim() || join(homedir(), 'Projects/signal-pipeline/signals')

  const readSignalFile = async (c: Context, date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: 'date must be YYYY-MM-DD' }, 400)
    }
    const fetched = await fetchRawSignal(signalBasePath, date)
    if (fetched.kind === 'not_found') {
      return c.json({ found: false, path: fetched.path, error: fetched.message }, 404)
    }
    if (fetched.kind === 'network_error') {
      return c.json({ found: false, path: fetched.path, error: fetched.message }, 502)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(fetched.raw)
    } catch (err) {
      return c.json(
        { found: true, path: fetched.path, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` },
        422,
      )
    }
    const validation = signalReportSchema.safeParse(parsed)
    if (!validation.success) {
      return c.json(
        { found: true, path: fetched.path, error: 'Schema validation failed', details: validation.error.message },
        422,
      )
    }
    return c.json({ found: true, path: fetched.path, signal: validation.data })
  }

  app.get('/:date', (c) => readSignalFile(c, c.req.param('date')))
  app.get('/', (c) => readSignalFile(c, todayUtcYmd()))

  return app
}
