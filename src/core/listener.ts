/**
 * Listener — standard interface for subscribing to AgentEvent types.
 *
 * A Listener represents a single handler for one event type. Filtering,
 * serial locks, and internal state are the listener's own responsibility —
 * the registry only manages subscription lifecycle and error isolation.
 */

import type { AgentEventMap } from './agent-event.js'
import type { EventLog, EventLogEntry } from './event-log.js'

export interface Listener<K extends keyof AgentEventMap = keyof AgentEventMap> {
  /** Unique name for identification (registry key, future UI display). */
  name: string
  /** Event type this listener subscribes to. */
  eventType: K
  /** Called when a matching event is appended. Receives the entry + full EventLog for history queries. */
  handle(entry: EventLogEntry<AgentEventMap[K]>, eventLog: EventLog): Promise<void>
}
