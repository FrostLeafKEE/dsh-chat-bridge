/**
 * Archive repository behaviour: real IndexedDB (via `fake-indexeddb`) for the
 * production implementation, plus the contract checks that must hold for any
 * implementation.
 * @module dsh-chat-bridge/tests/repository
 */

import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import type { ChatSnapshot } from '../src/shared/contracts'
import { buildImport } from '../src/import/build-snapshot'
import {
  DATABASE_NAME,
  IndexedDbArchiveRepository,
  openArchiveRepository,
} from '../src/storage/indexeddb-repository'
import { MemoryArchiveRepository, MEMORY_REPOSITORY_NOTICE } from '../src/storage/memory-repository'
import { expectErr, expectOk } from './helpers'

/**
 * Build a small text archive.
 * @param text - original text.
 * @param title - optional typed title.
 * @returns the snapshot.
 */
async function makeSnapshot(text: string, title?: string): Promise<ChatSnapshot> {
  const built = await buildImport(title === undefined
    ? { format: 'text', text }
    : { format: 'text', text, title })
  return expectOk(built).snapshot
}

describe('IndexedDbArchiveRepository', () => {
  it('opens a fresh database and lists nothing', async () => {
    const repository = expectOk(await openArchiveRepository(new IDBFactory()))
    expect(expectOk(await repository.list())).toEqual([])
    repository.dispose()
  })

  it('saves, lists, reads back, renames and removes', async () => {
    const repository = expectOk(await openArchiveRepository(new IDBFactory()))
    const snapshot = await makeSnapshot('第一条 🦀', '我的档案')

    const saved = expectOk(await repository.save(snapshot))
    expect(saved).toEqual({ archiveId: snapshot.archiveId, duplicate: false })

    const listed = expectOk(await repository.list())
    expect(listed).toHaveLength(1)
    expect(listed[0]?.title).toBe('我的档案')
    expect(listed[0]?.status).toBe('ok')
    expect(listed[0]?.historyKind).toBe('source-text')
    // The list projection must not carry the archive body.
    expect(Object.keys(listed[0] ?? {})).not.toContain('original')
    expect(JSON.stringify(listed)).not.toContain('第一条')

    const read = expectOk(await repository.get(snapshot.archiveId))
    expect(read.original.text).toBe('第一条 🦀')

    expect(expectOk(await repository.rename(snapshot.archiveId, '  改名了  '))).toBeUndefined()
    const afterRename = expectOk(await repository.get(snapshot.archiveId))
    expect(afterRename.title).toBe('改名了')
    expect(afterRename.original.text).toBe('第一条 🦀')
    expect(afterRename.fingerprint).toBe(snapshot.fingerprint)

    expect(expectOk(await repository.remove(snapshot.archiveId))).toBeUndefined()
    expect(expectErr(await repository.get(snapshot.archiveId), 'ARCHIVE_NOT_FOUND')).toBeTruthy()
    expect(expectOk(await repository.list())).toEqual([])
    repository.dispose()
  })

  it('deduplicates by fingerprint and keeps the existing title after a rename', async () => {
    const repository = expectOk(await openArchiveRepository(new IDBFactory()))
    const first = await makeSnapshot('same content', '原始标题')
    expect(expectOk(await repository.save(first)).duplicate).toBe(false)
    expect(expectOk(await repository.rename(first.archiveId, '新标题'))).toBeUndefined()

    const again = await makeSnapshot('same content', '重复导入的标题')
    const second = expectOk(await repository.save(again))
    expect(second).toEqual({ archiveId: first.archiveId, duplicate: true })

    const listed = expectOk(await repository.list())
    expect(listed).toHaveLength(1)
    expect(listed[0]?.title).toBe('新标题')
    repository.dispose()
  })

  it('treats JSON that only differs in whitespace as a new archive', async () => {
    const repository = expectOk(await openArchiveRepository(new IDBFactory()))
    const a = expectOk(await buildImport({
      format: 'json',
      text: JSON.stringify({ format: 'dsh-chat-bridge.manual-history', schemaVersion: 1, messages: [{ id: 'a', role: 'user', content: 'x' }] }),
    })).snapshot
    const b = expectOk(await buildImport({
      format: 'json',
      text: JSON.stringify({ format: 'dsh-chat-bridge.manual-history', schemaVersion: 1, messages: [{ id: 'a', role: 'user', content: 'x' }] }, null, 2),
    })).snapshot
    expect(expectOk(await repository.save(a)).duplicate).toBe(false)
    expect(expectOk(await repository.save(b)).duplicate).toBe(false)
    expect(expectOk(await repository.list())).toHaveLength(2)
    repository.dispose()
  })

  it('searches by title only and sorts by updatedAt then id', async () => {
    const repository = expectOk(await openArchiveRepository(new IDBFactory()))
    const older = await makeSnapshot('body one', 'Alpha')
    const newer = await makeSnapshot('body two', 'Beta')
    // Force a deterministic ordering without sleeping.
    expect(expectOk(await repository.save({ ...older, updatedAt: '2026-01-01T00:00:00.000Z' })).duplicate).toBe(false)
    expect(expectOk(await repository.save({ ...newer, updatedAt: '2026-01-02T00:00:00.000Z' })).duplicate).toBe(false)

    expect(expectOk(await repository.list()).map(item => item.title)).toEqual(['Beta', 'Alpha'])
    expect(expectOk(await repository.list({ search: 'alp' })).map(item => item.title)).toEqual(['Alpha'])
    // A body-only match must not appear: the search covers titles.
    expect(expectOk(await repository.list({ search: 'body two' }))).toEqual([])
    repository.dispose()
  })

  it('keeps archives across a reopened database handle', async () => {
    const factory = new IDBFactory()
    const first = expectOk(await openArchiveRepository(factory))
    const snapshot = await makeSnapshot('持久化检查')
    expect(expectOk(await first.save(snapshot)).duplicate).toBe(false)
    first.dispose()

    const second = expectOk(await openArchiveRepository(factory))
    expect(expectOk(await second.list())).toHaveLength(1)
    expect(expectOk(await second.get(snapshot.archiveId)).original.text).toBe('持久化检查')
    second.dispose()
  })

  it('reports a corrupted record without deleting it or breaking the list', async () => {
    const factory = new IDBFactory()
    const repository = expectOk(await openArchiveRepository(factory))
    const good = await makeSnapshot('good record', 'Good')
    const bad = await makeSnapshot('bad record', 'Bad')
    expect(expectOk(await repository.save(good)).duplicate).toBe(false)
    expect(expectOk(await repository.save(bad)).duplicate).toBe(false)
    repository.dispose()

    // Overwrite one stored snapshot with a structure this build cannot read.
    await writeRaw(factory, 'archives', { ...bad, schemaVersion: 99 })
    // And plant a summary row that is not even an object.
    await writeRaw(factory, 'summaries', { archiveId: 'planted-row', fingerprint: 1 })

    const reopened = expectOk(await openArchiveRepository(factory))
    const listed = expectOk(await reopened.list())
    expect(listed).toHaveLength(3)
    expect(listed.filter(item => item.status === 'corrupted')).toHaveLength(1)
    expect(listed.find(item => item.archiveId === 'planted-row')?.status).toBe('corrupted')
    // The good record is still readable, and the unreadable archive reports itself.
    expect(expectOk(await reopened.get(good.archiveId)).title).toBe('Good')
    expectErr(await reopened.get(bad.archiveId), 'ARCHIVE_CORRUPTED')
    // Nothing was auto-deleted: the record is still there to be removed by hand.
    expect(expectOk(await reopened.list()).some(item => item.archiveId === bad.archiveId)).toBe(true)
    reopened.dispose()
  })

  it('refuses writes once disposed and reports storage as unavailable', async () => {
    const repository = expectOk(await openArchiveRepository(new IDBFactory()))
    const snapshot = await makeSnapshot('x')
    repository.dispose()
    expectErr(await repository.list(), 'STORAGE_UNAVAILABLE')
    expectErr(await repository.save(snapshot), 'STORAGE_UNAVAILABLE')
  })

  it('reports STORAGE_UNAVAILABLE when IndexedDB is missing', async () => {
    expectErr(await openArchiveRepository(undefined as unknown as IDBFactory), 'STORAGE_UNAVAILABLE')
  })

  it('uses the documented database name', () => {
    expect(DATABASE_NAME).toBe('dsh-chat-bridge.archives.v1')
  })

  it('rejects a snapshot whose fingerprint does not match its text', async () => {
    const repository = expectOk(await openArchiveRepository(new IDBFactory()))
    const snapshot = await makeSnapshot('original')
    expectErr(await repository.save({ ...snapshot, fingerprint: 'f'.repeat(64) }), 'ARCHIVE_CORRUPTED')
    repository.dispose()
  })
})

describe('MemoryArchiveRepository (tests and marked development previews only)', () => {
  it('implements the same contract', async () => {
    const repository = new MemoryArchiveRepository()
    const snapshot = await makeSnapshot('memory body', 'Mem')
    expect(expectOk(await repository.save(snapshot)).duplicate).toBe(false)
    expect(expectOk(await repository.save(snapshot)).duplicate).toBe(true)
    expect(expectOk(await repository.list({ search: 'mem' }))).toHaveLength(1)
    expect(expectOk(await repository.get(snapshot.archiveId)).original.text).toBe('memory body')
    expect(expectOk(await repository.rename(snapshot.archiveId, 'Renamed'))).toBeUndefined()
    expect(expectOk(await repository.remove(snapshot.archiveId))).toBeUndefined()
    expectErr(await repository.get(snapshot.archiveId), 'ARCHIVE_NOT_FOUND')
  })

  it('surfaces a storage failure instead of pretending to save', async () => {
    const repository = new MemoryArchiveRepository({ failWrites: true })
    const snapshot = await makeSnapshot('x')
    expectErr(await repository.save(snapshot), 'STORAGE_UNAVAILABLE')
    expect(expectOk(await repository.list())).toEqual([])
  })

  it('is explicitly marked as non-persistent', () => {
    expect(MEMORY_REPOSITORY_NOTICE).toContain('non-persistent')
  })

  it('degrads a planted bad record to a corrupted list entry', async () => {
    const repository = new MemoryArchiveRepository()
    repository.plantCorruptedRecord({ archiveId: 'broken', history: undefined })
    const listed = expectOk(await repository.list())
    expect(listed).toHaveLength(1)
    expect(listed[0]?.status).toBe('corrupted')
  })
})

/**
 * Write a raw record into one object store, bypassing the repository, to
 * simulate a database row that this build cannot read.
 * @param factory - the database factory.
 * @param store - object store name.
 * @param record - record to put.
 * @returns a promise that resolves when the transaction completes.
 */
async function writeRaw(factory: IDBFactory, store: string, record: unknown): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, 1)
    request.onsuccess = () => { resolve(request.result) }
    request.onerror = () => { reject(request.error) }
  })
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(record)
    tx.oncomplete = () => { resolve() }
    tx.onerror = () => { reject(tx.error) }
  })
  db.close()
}

describe('IndexedDbArchiveRepository.open', () => {
  it('is the documented entry point for the client', async () => {
    const opened = await IndexedDbArchiveRepository.open(new IDBFactory())
    expect(opened.ok).toBe(true)
    if (opened.ok) opened.value.dispose()
  })
})
