/**
 * Export and re-import: both output shapes, the archive wrapper, and every way
 * a document can disagree with itself.
 * @module dsh-chat-bridge/tests/export-reimport
 */

import { describe, expect, it } from 'vitest'
import type { ChatSnapshot } from '../src/shared/contracts'
import { buildImport } from '../src/import/build-snapshot'
import { originalTextOf, parseArchiveDocument, serializeArchiveDocument } from '../src/import/export-archive'
import { LIMITS } from '../src/shared/limits'
import { MemoryArchiveRepository } from '../src/storage/memory-repository'
import { expectErr, expectOk, readFixture } from './helpers'

const FIXTURE = readFixture('manual-history.v1.json')
const LATER = new Date('2026-09-09T09:09:09.000Z')

/**
 * Build the JSON-fixture archive.
 * @returns the snapshot.
 */
async function fixtureSnapshot(): Promise<ChatSnapshot> {
  return expectOk(await buildImport({ format: 'json', text: FIXTURE, fileName: 'history.json' })).snapshot
}

describe('original text export', () => {
  it('returns the imported text byte for byte', async () => {
    const snapshot = await fixtureSnapshot()
    const exported = originalTextOf(snapshot)
    expect(exported).toBe(FIXTURE)
    expect(exported).toContain('最后一条消息（必须保留）。✅')
    expect(exported).not.toContain('\uFEFF')
  })
})

describe('archive document export and re-import', () => {
  it('wraps the snapshot in the documented envelope', async () => {
    const snapshot = await fixtureSnapshot()
    const document = JSON.parse(serializeArchiveDocument(snapshot)) as Record<string, unknown>
    expect(document.format).toBe('dsh-chat-bridge.archive')
    expect(document.schemaVersion).toBe(1)
    expect(document.snapshot).toEqual(snapshot)
  })

  it('rebuilds a fresh local identity from the original material', async () => {
    const snapshot = await fixtureSnapshot()
    const reimported = expectOk(await parseArchiveDocument(serializeArchiveDocument(snapshot), LATER))
    expect(reimported.snapshot.archiveId).not.toBe(snapshot.archiveId)
    expect(reimported.snapshot.importedAt).toBe(LATER.toISOString())
    expect(reimported.snapshot.updatedAt).toBe(LATER.toISOString())
    // Content identity is preserved...
    expect(reimported.snapshot.fingerprint).toBe(snapshot.fingerprint)
    expect(reimported.snapshot.title).toBe(snapshot.title)
    expect(reimported.snapshot.original).toEqual(snapshot.original)
    expect(reimported.snapshot.history).toEqual(snapshot.history)
    // ...including the last message.
    if (reimported.snapshot.history.kind !== 'messages') throw new Error('unreachable')
    expect(reimported.snapshot.history.messages.at(-1)?.content).toBe('最后一条消息（必须保留）。✅')
  })

  it('deduplicates against the existing archive without clobbering its title', async () => {
    const repository = new MemoryArchiveRepository()
    const snapshot = await fixtureSnapshot()
    expect(expectOk(await repository.save(snapshot)).duplicate).toBe(false)
    expect(expectOk(await repository.rename(snapshot.archiveId, '本地改名'))).toBeUndefined()

    const reimported = expectOk(await parseArchiveDocument(serializeArchiveDocument(snapshot), LATER))
    const saved = expectOk(await repository.save(reimported.snapshot))
    expect(saved).toEqual({ archiveId: snapshot.archiveId, duplicate: true })
    expect(expectOk(await repository.get(snapshot.archiveId)).title).toBe('本地改名')
  })

  it('cannot be used to address an existing row: the embedded id is ignored', async () => {
    const repository = new MemoryArchiveRepository()
    const snapshot = await fixtureSnapshot()
    expect(expectOk(await repository.save(snapshot)).duplicate).toBe(false)
    // A document that declares a different original text but reuses the stored
    // archiveId must not overwrite that row.
    const foreign = serializeArchiveDocument({ ...snapshot, original: { format: 'text', text: 'other' }, fingerprint: 'a'.repeat(64) })
    const parsed = await parseArchiveDocument(foreign, LATER)
    expect(parsed.ok).toBe(false)
    expect(expectOk(await repository.get(snapshot.archiveId)).original.text).toBe(FIXTURE)
  })

  it('rejects a wrapper with the wrong format or version', async () => {
    const snapshot = await fixtureSnapshot()
    const document = JSON.parse(serializeArchiveDocument(snapshot)) as Record<string, unknown>

    expectErr(await parseArchiveDocument('not json'), 'INVALID_JSON')
    expectErr(await parseArchiveDocument(JSON.stringify([1, 2, 3])), 'UNSUPPORTED_FORMAT')
    expectErr(await parseArchiveDocument(JSON.stringify({ ...document, format: 'other' })), 'UNSUPPORTED_FORMAT')
    expectErr(await parseArchiveDocument(JSON.stringify({ ...document, schemaVersion: 99 })), 'UNSUPPORTED_VERSION')
    expectErr(await parseArchiveDocument(JSON.stringify({
      ...document, snapshot: { ...snapshot, schemaVersion: 99 },
    })), 'UNSUPPORTED_VERSION')
  })

  it('rejects a document whose original text and normalized history disagree', async () => {
    const snapshot = await fixtureSnapshot()
    if (snapshot.history.kind !== 'messages') throw new Error('unreachable')
    const tampered = {
      ...snapshot,
      history: { ...snapshot.history, messages: snapshot.history.messages.slice(0, -1) },
    }
    expectErr(await parseArchiveDocument(serializeArchiveDocument(tampered)), 'ARCHIVE_CORRUPTED')
  })

  it('rejects a document whose fingerprint does not match its own text', async () => {
    const snapshot = await fixtureSnapshot()
    expectErr(await parseArchiveDocument(serializeArchiveDocument({
      ...snapshot, fingerprint: 'b'.repeat(64),
    })), 'ARCHIVE_CORRUPTED')
  })

  it('rejects a document whose embedded original text exceeds the plain-input ceiling', async () => {
    const snapshot = await fixtureSnapshot()
    const huge = {
      ...snapshot,
      original: { format: 'text' as const, text: 'あ'.repeat(LIMITS.manualInputBytes) },
    }
    expectErr(await parseArchiveDocument(serializeArchiveDocument(huge)), 'INPUT_TOO_LARGE')
  })

  it('rejects an over-large archive file', async () => {
    const padded = `{"format":"dsh-chat-bridge.archive","schemaVersion":1,"snapshot":null,"pad":"${'x'.repeat(LIMITS.archiveFileBytes)}"}`
    expectErr(await parseArchiveDocument(padded), 'INPUT_TOO_LARGE')
  })

  it('rejects a stored source URL that is not the supported host', async () => {
    const snapshot = await fixtureSnapshot()
    const tampered = { ...snapshot, source: { ...snapshot.source, url: 'https://evil.example/' } }
    expectErr(await parseArchiveDocument(serializeArchiveDocument(tampered)), 'ARCHIVE_CORRUPTED')
  })
})
