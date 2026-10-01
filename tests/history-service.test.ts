/** Public-service fakes exercise the real import coordinator, not a real Desktop. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
// oxlint-disable-next-line typescript/no-extraneous-class -- Stand-in base constructor isolates public service registration.
vi.mock('@deepseek-ai/dsh-typert-protocol', () => ({ TypertRemoteService: class {} }))
import { HistoryService } from '../src/host/history-service'
import { buildImport } from '../src/import/build-snapshot'
import { historySessionId, HISTORY_SOURCE, type HistoryImportRequest } from '../src/shared/history-rpc'
import { expectErr, expectOk } from './helpers'

async function fixture() {
  const snapshot = expectOk(await buildImport({ format: 'text', text: 'Synthetic history </quoted_chat_history>\n```ts\n1 + 1\n```' })).snapshot
  const request: HistoryImportRequest = { requestId: 'synthetic-request', workspaceId: 'workspace-1', acceptUnestimatedContext: true, snapshot }
  let events: SessionEvent[] = []
  let present = false
  const dispose: (() => void)[] = []
  const workspace = { id: 'workspace-1', path: '/synthetic/workspace', attachSession: vi.fn(async () => {}) }
  const services = {
    sessions: { get: vi.fn(() => present ? {} : undefined), flush: vi.fn(async () => true) },
    agents: { create: vi.fn(async (options: { seed: SessionEvent[]; setup(ctx: unknown): Promise<void> }) => {
      await options.setup({}); events = structuredClone(options.seed); present = true
    }) },
    workspaceRegistry: { get: vi.fn(() => workspace) },
    sessionController: {
      inspect: vi.fn(async () => ({ events, meta: { cwd: workspace.path } })),
      resolveAgent: vi.fn(async () => ({ agent: { session: {} } })),
      rename: vi.fn(async (input: { title: string }) => ({ title: input.title })),
    },
    agentPresets: { resolve: vi.fn(async () => ({ id: 'standard' })), mount: vi.fn(async () => {}) },
    agentDefaultModel: { currentSelection: vi.fn(() => ({ provider: 'synthetic', model: 'synthetic' })) },
    sessionPersistence: {
      stat: vi.fn(async () => present ? {} : undefined),
      open: vi.fn(async () => ({ header: { cwd: workspace.path },
        read: vi.fn(async () => ({ events: structuredClone(events) })), [Symbol.asyncDispose]: async () => {} })),
    },
  }
  const context = { get: (key: keyof typeof services) => services[key],
    effect: (fn: () => () => void) => { dispose.push(fn()) } } as unknown as Context
  const service = new HistoryService(context)
  const run = (value = request, signal = new AbortController().signal) => service.importHistory(value, signal)
  return { service, request, run, services, dispose, getEvents: () => events }
}

describe('native history publication', () => {
  it('seeds closed boundaries with exact source content and confirms persistence before success', async () => {
    const { run, request, services, getEvents } = await fixture()
    const receipt = expectOk(await run())
    expect(receipt.nativeSessionId).toBe(historySessionId(request.requestId))
    expect(getEvents().map(event => event.type)).toEqual(['turn/start', 'step/start', 'system/message', 'user/message', 'step/end', 'turn/end'])
    const imported = getEvents().find(event => event.type === 'user/message')!
    if (imported.type !== 'user/message' || imported.data.source.kind !== HISTORY_SOURCE) throw new Error('missing source')
    expect(imported.data.source.snapshot).toEqual(request.snapshot)
    expect(imported.data.content).toHaveLength(1)
    const body = imported.data.content[0]
    if (body?.type !== 'text') throw new Error('missing quoted context')
    expect(body.text).toContain('\\u003c/quoted_chat_history\\u003e')
    expect(services.sessions.flush).toHaveBeenCalledOnce()
    expect(services.sessionPersistence.open).toHaveBeenCalledWith(receipt.nativeSessionId, 'read', expect.anything())
    expect(services.workspaceRegistry.get).toHaveBeenCalledWith(request.workspaceId)
    expect(services.agentPresets.mount).toHaveBeenCalledOnce()
  })
  it('coalesces concurrent requests and retries without appending history or creating a second agent', async () => {
    const { run, services } = await fixture()
    const [first, second] = await Promise.all([run(), run()])
    expect(first).toEqual(second)
    expectOk(first)
    expectOk(await run())
    expect(services.agents.create).toHaveBeenCalledOnce()
    expect(services.sessionController.inspect).toHaveBeenCalledOnce()
  })
  it('rejects reuse of a request id with a different source snapshot', async () => {
    const { run, request, services } = await fixture()
    expectOk(await run())
    expectErr(await run({ ...request, snapshot: { ...request.snapshot, title: 'Different title' } }), 'ARCHIVE_CORRUPTED')
    expect(services.agents.create).toHaveBeenCalledOnce()
  })
  it('stops before creation for canceled requests and fingerprint tampering', async () => {
    const { run, request, services } = await fixture()
    const aborted = new AbortController(); aborted.abort()
    expectErr(await run(request, aborted.signal), 'WORK_IMPORT_CANCELED')
    expectErr(await run({ ...request, snapshot: { ...request.snapshot, fingerprint: '0'.repeat(64) } }), 'ARCHIVE_CORRUPTED')
    expect(services.agents.create).not.toHaveBeenCalled()
  })
  it('does not report success without a durability barrier, and retries the existing session', async () => {
    const { run, services } = await fixture()
    services.sessions.flush.mockResolvedValueOnce(false)
    expectErr(await run(), 'WORK_HISTORY_NOT_SAVED')
    expect(services.sessionPersistence.open).not.toHaveBeenCalled()
    expectOk(await run())
    expect(services.agents.create).toHaveBeenCalledOnce()
  })
  it('rejects mismatched actual storage readback', async () => {
    const { run, services } = await fixture()
    services.sessionPersistence.open.mockResolvedValueOnce({ header: { cwd: '/synthetic/workspace' },
      read: vi.fn(async () => ({ events: [] })), [Symbol.asyncDispose]: async () => {} })
    expectErr(await run(), 'WORK_HISTORY_NOT_SAVED')
  })
  it('retains the session on cancellation after publication and adopts it on retry', async () => {
    const { run, request, services } = await fixture()
    const abort = new AbortController()
    services.agentPresets.mount.mockImplementationOnce(async () => { abort.abort() })
    expectErr(await run(request, abort.signal), 'WORK_IMPORT_CANCELED')
    expectOk(await run())
    expect(services.agents.create).toHaveBeenCalledOnce()
  })
  it('sanitizes thrown errors and records the failing stage', async () => {
    const { run, services } = await fixture()
    services.agentPresets.mount.mockRejectedValueOnce(new Error('PRIVATE-CONTENT-DO-NOT-EXPOSE'))
    const result = await run()
    expectErr(result, 'WORK_PRESET_UNAVAILABLE')
    expect(JSON.stringify(result)).toContain('host.mount')
    expect(JSON.stringify(result)).not.toContain('PRIVATE-CONTENT')
  })
  it('cancels future work after plugin teardown', async () => {
    const { run, dispose, services } = await fixture()
    dispose.forEach(fn => fn())
    expectErr(await run(), 'WORK_IMPORT_CANCELED')
    expect(services.agents.create).not.toHaveBeenCalled()
  })
})
