import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { createEventLog, type EventLog } from '../../core/event-log.js'
import { createListenerRegistry, type ListenerRegistry } from '../../core/listener-registry.js'
import { createTaskRouter, type TaskRouter } from './listener.js'
import { SessionStore } from '../../core/session.js'
import type { TaskRequestedPayload } from '../../core/agent-event.js'
import { ConnectorCenter } from '../../core/connector-center.js'

function tempPath(ext: string): string {
  return join(tmpdir(), `task-router-test-${randomUUID()}.${ext}`)
}

function createMockEngine(response = 'AI reply') {
  const calls: Array<{ prompt: string; session: SessionStore }> = []
  let shouldFail = false

  return {
    calls,
    setResponse(text: string) { response = text },
    setShouldFail(val: boolean) { shouldFail = val },
    askWithSession: vi.fn(async (prompt: string, session: SessionStore) => {
      calls.push({ prompt, session })
      if (shouldFail) throw new Error('engine error')
      return { text: response, media: [] }
    }),
    ask: vi.fn(),
  }
}

describe('task router', () => {
  let eventLog: EventLog
  let registry: ListenerRegistry
  let taskRouter: TaskRouter
  let mockEngine: ReturnType<typeof createMockEngine>
  let session: SessionStore
  let connectorCenter: ConnectorCenter
  let logPath: string

  beforeEach(async () => {
    logPath = tempPath('jsonl')
    eventLog = await createEventLog({ logPath })
    registry = createListenerRegistry(eventLog)
    mockEngine = createMockEngine()
    session = new SessionStore(`test/task-${randomUUID()}`)
    connectorCenter = new ConnectorCenter()

    taskRouter = createTaskRouter({
      connectorCenter,
      agentCenter: mockEngine as any,
      registry,
      session,
    })
    await taskRouter.start()
    await registry.start()
  })

  afterEach(async () => {
    await registry.stop()
    await eventLog._resetForTest()
  })

  describe('event handling', () => {
    it('calls agent on task.requested with the provided prompt', async () => {
      await eventLog.append('task.requested', {
        prompt: 'What is the price of BTC?',
      } satisfies TaskRequestedPayload)

      await vi.waitFor(() => {
        expect(mockEngine.askWithSession).toHaveBeenCalledTimes(1)
      })
      expect(mockEngine.askWithSession).toHaveBeenCalledWith(
        'What is the price of BTC?',
        session,
        expect.objectContaining({ historyPreamble: expect.any(String) }),
      )
    })

    it('emits task.done with reply on success', async () => {
      mockEngine.setResponse('BTC is around $65,000')
      await eventLog.append('task.requested', {
        prompt: 'BTC price?',
      } satisfies TaskRequestedPayload)

      await vi.waitFor(() => {
        const done = eventLog.recent({ type: 'task.done' })
        expect(done).toHaveLength(1)
        expect((done[0].payload as { reply: string }).reply).toBe('BTC is around $65,000')
        expect((done[0].payload as { prompt: string }).prompt).toBe('BTC price?')
      })
    })

    it('emits task.error when the agent throws', async () => {
      mockEngine.setShouldFail(true)
      const origErr = console.error
      console.error = () => {}

      try {
        await eventLog.append('task.requested', {
          prompt: 'This will fail',
        } satisfies TaskRequestedPayload)

        await vi.waitFor(() => {
          const err = eventLog.recent({ type: 'task.error' })
          expect(err).toHaveLength(1)
          expect((err[0].payload as { error: string }).error).toBe('engine error')
        })
      } finally {
        console.error = origErr
      }
    })

    it('sets causedBy on emitted task.done', async () => {
      const fireEntry = await eventLog.append('task.requested', {
        prompt: 'hi',
      } satisfies TaskRequestedPayload)

      await vi.waitFor(() => {
        const done = eventLog.recent({ type: 'task.done' })
        expect(done).toHaveLength(1)
        expect(done[0].causedBy).toBe(fireEntry.seq)
      })
    })
  })

  describe('registry integration', () => {
    it('registers with the listener registry', () => {
      const info = registry.list().find((l) => l.name === 'task-router')
      expect(info).toBeDefined()
      expect(info?.subscribes).toEqual(['task.requested'])
      expect(info?.emits).toEqual(['task.done', 'task.error'])
    })

    it('stop() unregisters it', () => {
      taskRouter.stop()
      const info = registry.list().find((l) => l.name === 'task-router')
      expect(info).toBeUndefined()
    })
  })
})
