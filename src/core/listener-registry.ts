/**
 * ListenerRegistry — centralized lifecycle management for Listeners.
 *
 * Each module that needs to listen owns its Listener and calls
 * `registry.register(...)` during its own setup. The registry activates
 * all registered listeners together via `start()` and tears them down
 * via `stop()`.
 *
 * Errors thrown inside a listener's `handle()` are caught and logged —
 * they do not affect other listeners.
 */

import type { AgentEventMap } from './agent-event.js'
import type { EventLog } from './event-log.js'
import type { Listener } from './listener.js'

export interface ListenerInfo {
  name: string
  eventType: string
}

export interface ListenerRegistry {
  /** Register a listener. Throws if the name is already taken. */
  register<K extends keyof AgentEventMap>(listener: Listener<K>): void
  /** Unregister a listener by name. Unsubscribes it if the registry is started. No-op if not found. */
  unregister(name: string): void
  /** Activate all registered listeners (subscribe to EventLog). */
  start(): Promise<void>
  /** Deactivate all listeners (unsubscribe). */
  stop(): Promise<void>
  /** Introspection — registered listener names and their event types. */
  list(): ReadonlyArray<ListenerInfo>
}

export function createListenerRegistry(eventLog: EventLog): ListenerRegistry {
  // Storage is necessarily wide-typed (union across all event types).
  // Per-call type precision is preserved via the generic `register<K>` signature.
  type AnyListener = Listener<keyof AgentEventMap>
  const listeners = new Map<string, AnyListener>()
  const unsubscribes = new Map<string, () => void>()
  let started = false

  function register<K extends keyof AgentEventMap>(listener: Listener<K>): void {
    if (listeners.has(listener.name)) {
      throw new Error(`ListenerRegistry: listener "${listener.name}" already registered`)
    }
    listeners.set(listener.name, listener as AnyListener)
    // If registry is already running, subscribe immediately
    if (started) {
      subscribeOne(listener as AnyListener)
    }
  }

  function subscribeOne(listener: AnyListener): void {
    const unsub = eventLog.subscribeType(listener.eventType, (entry) => {
      // Fire-and-forget with error isolation
      Promise.resolve()
        .then(() => listener.handle(entry, eventLog))
        .catch((err) => {
          console.error(`listener[${listener.name}]: unhandled error:`, err)
        })
    })
    unsubscribes.set(listener.name, unsub)
  }

  function unregister(name: string): void {
    const existing = listeners.get(name)
    if (!existing) return
    listeners.delete(name)
    const unsub = unsubscribes.get(name)
    if (unsub) {
      try { unsub() } catch { /* swallow */ }
      unsubscribes.delete(name)
    }
  }

  async function start(): Promise<void> {
    if (started) return
    started = true
    for (const listener of listeners.values()) {
      subscribeOne(listener)
    }
  }

  async function stop(): Promise<void> {
    if (!started) return
    started = false
    for (const unsub of unsubscribes.values()) {
      try { unsub() } catch { /* swallow */ }
    }
    unsubscribes.clear()
  }

  function list(): ReadonlyArray<ListenerInfo> {
    return Array.from(listeners.values()).map((l) => ({
      name: l.name,
      eventType: l.eventType,
    }))
  }

  return { register, unregister, start, stop, list }
}
