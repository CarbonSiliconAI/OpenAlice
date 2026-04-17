/**
 * Cron Listener — subscribes to `cron.fire` events from the EventLog
 * and routes them through the AgentCenter for processing.
 *
 * Flow:
 *   eventLog 'cron.fire' → agentCenter.askWithSession(payload, session)
 *                         → connectorCenter.notify(reply)
 *                         → eventLog 'cron.done' / 'cron.error'
 *
 * The listener owns a dedicated SessionStore for cron conversations,
 * independent of user chat sessions (Telegram, Web, etc.).
 */

import type { EventLog, EventLogEntry } from '../../core/event-log.js'
import type { CronFirePayload } from '../../core/agent-event.js'
import type { AgentCenter } from '../../core/agent-center.js'
import { SessionStore } from '../../core/session.js'
import type { ConnectorCenter } from '../../core/connector-center.js'
import type { Listener } from '../../core/listener.js'
import type { ListenerRegistry } from '../../core/listener-registry.js'

/** Internal jobs (prefixed with __) have dedicated handlers and should not be routed to the AI. */
function isInternalJob(name: string): boolean {
  return name.startsWith('__') && name.endsWith('__')
}

// ==================== Types ====================

export interface CronListenerOpts {
  connectorCenter: ConnectorCenter
  agentCenter: AgentCenter
  /** Registry to auto-register this listener with. */
  registry: ListenerRegistry
  /** Optional: inject a session for testing. Otherwise creates a dedicated cron session. */
  session?: SessionStore
}

export interface CronListener {
  /** Register the listener with the registry (idempotent). */
  start(): Promise<void>
  /** Unregister the listener from the registry. */
  stop(): void
  /** Expose the raw Listener object (for testing `handle()` directly). */
  readonly listener: Listener<'cron.fire'>
}

// ==================== Factory ====================

export function createCronListener(opts: CronListenerOpts): CronListener {
  const { connectorCenter, agentCenter, registry } = opts
  const session = opts.session ?? new SessionStore('cron/default')

  let processing = false
  let registered = false

  const listener: Listener<'cron.fire'> = {
    name: 'cron-router',
    eventType: 'cron.fire',
    async handle(entry: EventLogEntry<CronFirePayload>, eventLog: EventLog): Promise<void> {
      const payload = entry.payload

      // Guard: internal jobs (__heartbeat__, __snapshot__, etc.) have dedicated handlers
      if (isInternalJob(payload.jobName)) return

      // Guard: skip if already processing (serial execution)
      if (processing) {
        console.warn(`cron-listener: skipping job ${payload.jobId} (already processing)`)
        return
      }

      processing = true
      const startMs = Date.now()

      try {
        // Ask the AI engine with the cron payload
        const result = await agentCenter.askWithSession(payload.payload, session, {
          historyPreamble: `You are operating in the cron job context (session: cron/default, job: ${payload.jobName}). This is an automated cron job execution.`,
        })

        // Send notification through the last-interacted connector
        try {
          await connectorCenter.notify(result.text, {
            media: result.media,
            source: 'cron',
          })
        } catch (sendErr) {
          console.warn(`cron-listener: send failed for job ${payload.jobId}:`, sendErr)
        }

        // Log success
        await eventLog.append('cron.done', {
          jobId: payload.jobId,
          jobName: payload.jobName,
          reply: result.text,
          durationMs: Date.now() - startMs,
        })
      } catch (err) {
        console.error(`cron-listener: error processing job ${payload.jobId}:`, err)

        // Log error
        await eventLog.append('cron.error', {
          jobId: payload.jobId,
          jobName: payload.jobName,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startMs,
        })
      } finally {
        processing = false
      }
    },
  }

  return {
    listener,
    async start() {
      if (registered) return
      registry.register(listener)
      registered = true
    },
    stop() {
      if (registered) {
        registry.unregister(listener.name)
        registered = false
      }
    },
  }
}
