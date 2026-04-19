/**
 * Task Router — subscribes to externally-ingested `task.requested` events
 * and routes them through the AgentCenter for one-shot processing.
 *
 * Flow:
 *   POST /api/events/ingest { type: 'task.requested', payload: { prompt } }
 *     → eventLog 'task.requested'
 *     → agentCenter.askWithSession(prompt, session)
 *     → connectorCenter.notify(reply)
 *     → ctx.emit 'task.done' / 'task.error'
 *
 * The listener owns a dedicated SessionStore for externally-triggered tasks
 * (`task/default`), independent of cron, heartbeat, and chat sessions.
 */

import type { EventLogEntry } from '../../core/event-log.js'
import type { TaskRequestedPayload } from '../../core/agent-event.js'
import type { AgentCenter } from '../../core/agent-center.js'
import { SessionStore } from '../../core/session.js'
import type { ConnectorCenter } from '../../core/connector-center.js'
import type { Listener, ListenerContext } from '../../core/listener.js'
import type { ListenerRegistry } from '../../core/listener-registry.js'

// ==================== Types ====================

const TASK_EMITS = ['task.done', 'task.error'] as const
type TaskEmits = typeof TASK_EMITS

export interface TaskRouterOpts {
  connectorCenter: ConnectorCenter
  agentCenter: AgentCenter
  /** Registry to auto-register this listener with. */
  registry: ListenerRegistry
  /** Optional: inject a session for testing. Otherwise creates `task/default`. */
  session?: SessionStore
}

export interface TaskRouter {
  /** Register the listener with the registry (idempotent). */
  start(): Promise<void>
  /** Unregister the listener from the registry. */
  stop(): void
  /** Expose the raw Listener object (for testing `handle()` directly). */
  readonly listener: Listener<'task.requested', TaskEmits>
}

// ==================== Factory ====================

export function createTaskRouter(opts: TaskRouterOpts): TaskRouter {
  const { connectorCenter, agentCenter, registry } = opts
  const session = opts.session ?? new SessionStore('task/default')

  let processing = false
  let registered = false

  const listener: Listener<'task.requested', TaskEmits> = {
    name: 'task-router',
    subscribes: 'task.requested',
    emits: TASK_EMITS,
    async handle(
      entry: EventLogEntry<TaskRequestedPayload>,
      ctx: ListenerContext<TaskEmits>,
    ): Promise<void> {
      const payload = entry.payload

      // Guard: skip if already processing (serial execution, same as cron-router)
      if (processing) {
        console.warn(`task-router: skipping (already processing)`)
        return
      }

      processing = true
      const startMs = Date.now()

      try {
        const result = await agentCenter.askWithSession(payload.prompt, session, {
          historyPreamble: `You are handling an externally-triggered task (session: task/default). Follow the prompt and reply with what the caller needs.`,
        })

        try {
          await connectorCenter.notify(result.text, {
            media: result.media,
            source: 'task',
          })
        } catch (sendErr) {
          console.warn(`task-router: send failed:`, sendErr)
        }

        await ctx.emit('task.done', {
          prompt: payload.prompt,
          reply: result.text,
          durationMs: Date.now() - startMs,
        })
      } catch (err) {
        console.error(`task-router: error:`, err)

        await ctx.emit('task.error', {
          prompt: payload.prompt,
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
