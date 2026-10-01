import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNativeWorkImporter, type NativeWorkRuntime } from '../src/adapters/native-work-importer'
import { buildImport } from '../src/import/build-snapshot'
import { MemoryArchiveRepository } from '../src/storage/memory-repository'
import { historySessionId, type HistoryImportRequest } from '../src/shared/history-rpc'
import { ok } from '../src/shared/errors'
import { expectErr, expectOk } from './helpers'

beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()) })
afterEach(() => { vi.unstubAllGlobals() })

async function fixture() {
  const repository = new MemoryArchiveRepository()
  const snapshot = expectOk(await buildImport({ format: 'text', text: 'Synthetic native client source' })).snapshot
  expectOk(await repository.save(snapshot))
  const request = { schemaVersion: 1 as const, requestId: 'client-request', archiveId: snapshot.archiveId,
    expectedFingerprint: snapshot.fingerprint, workspaceId: 'workspace-1', acceptUnestimatedContext: true }
  const release = vi.fn(), openSession = vi.fn()
  const importHistory = vi.fn(async (input: HistoryImportRequest) => ok(ok({ schemaVersion: 1 as const,
    requestId: input.requestId, sourceArchiveId: input.snapshot.archiveId, sourceFingerprint: input.snapshot.fingerprint,
    workspaceId: input.workspaceId, nativeSessionId: historySessionId(input.requestId), importedAt: new Date().toISOString(),
    importedRange: 'full' as const, transferMode: 'imported-context' as const })))
  const projection = { phase: 'ready', state: 'idle', items: [{ workspaceId: 'workspace-1', title: 'Synthetic workspace', path: '/synthetic' }] }
  const subscribers = new Set<() => void>()
  const navigation = new AbortController()
  const runtime = { sessions: { retain: vi.fn(() => ({ ready: Promise.resolve(), release })) },
    workspaces: { list: { getSnapshot: () => projection, subscribe: (listener: () => void) => {
      subscribers.add(listener); return () => { subscribers.delete(listener) }
    } } },
    conversation: {}, navigation: { openSession }, history: { importHistory },
    beginNavigation: () => navigation.signal, text: (key: string) => key }
  const importer = createNativeWorkImporter(repository, runtime as unknown as NativeWorkRuntime)
  const preview = expectOk(await importer.prepare(request))
  return { importer, request, preview, importHistory, openSession, release, navigation, projection, subscribers }
}

describe('native Client handoff', () => {
  it('sends one RPC for concurrent commits, releases retention, and opens the persisted session', async () => {
    const { importer, request, preview, importHistory, openSession, release } = await fixture()
    const [first, second] = await Promise.all([importer.commit(request, preview), importer.commit(request, preview)])
    expectOk(first); expect(first).toEqual(second)
    expect(importHistory).toHaveBeenCalledOnce()
    expect(openSession).toHaveBeenCalledExactlyOnceWith(historySessionId(request.requestId))
    expect(release).toHaveBeenCalledOnce()
    importer.dispose()
  })
  it('refuses context not accepted or an unregistered workspace before any RPC', async () => {
    const { importer, request, preview, importHistory } = await fixture()
    expectErr(await importer.commit({ ...request, acceptUnestimatedContext: false }, preview), 'WORK_IMPORT_FAILED')
    expectErr(await importer.commit({ ...request, requestId: 'missing-workspace', workspaceId: 'missing' },
      { ...preview, requestId: 'missing-workspace' }), 'WORK_IMPORT_FAILED')
    expect(importHistory).not.toHaveBeenCalled()
    importer.dispose()
  })
  it('waits for an idle workspace projection and releases the subscription on cancellation', async () => {
    const { importer, projection, subscribers } = await fixture()
    projection.state = 'loading'
    const abort = new AbortController()
    const pending = importer.listWorkspaces!(abort.signal)
    expect(subscribers.size).toBe(1)
    abort.abort()
    expectErr(await pending, 'WORK_IMPORT_CANCELED')
    expect(subscribers.size).toBe(0)
    importer.dispose()
  })
  it('accepts a ready projection after reconnect and releases its subscription', async () => {
    const { importer, projection, subscribers } = await fixture()
    projection.phase = 'loading'
    const pending = importer.listWorkspaces!()
    projection.phase = 'ready'
    subscribers.forEach(listener => listener())
    expect(expectOk(await pending)).toHaveLength(1)
    expect(subscribers.size).toBe(0)
    importer.dispose()
  })
  it('does not navigate when canceled after RPC publication', async () => {
    const { importer, request, preview, importHistory, navigation, openSession } = await fixture()
    const original = importHistory.getMockImplementation()!
    importHistory.mockImplementation(async input => { const result = await original(input); navigation.abort(); return result })
    expectErr(await importer.commit(request, preview), 'WORK_IMPORT_CANCELED')
    expect(openSession).not.toHaveBeenCalled()
    importer.dispose()
  })
})
