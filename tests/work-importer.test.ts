/**
 * Work-import seam: `prepare()` really reads and verifies the archive, and
 * `commit()` really is not implemented.
 * @module dsh-chat-bridge/tests/work-importer
 */

import { describe, expect, it } from 'vitest'
import type { WorkImportRequest } from '../src/shared/contracts'
import { buildImport } from '../src/import/build-snapshot'
import { PendingWorkImporter } from '../src/adapters/pending-work-importer'
import { MemoryArchiveRepository } from '../src/storage/memory-repository'
import { expectErr, expectOk, readFixture } from './helpers'

/**
 * Prepare a repository holding the JSON fixture.
 * @returns the repository, the importer, and the stored snapshot.
 */
async function setup() {
  const repository = new MemoryArchiveRepository()
  const snapshot = expectOk(await buildImport({
    format: 'json',
    text: readFixture('manual-history.v1.json'),
    fileName: 'history.json',
  })).snapshot
  expect(expectOk(await repository.save(snapshot)).duplicate).toBe(false)
  return { repository, importer: new PendingWorkImporter(repository), snapshot }
}

/**
 * Build a well-formed request for a stored snapshot.
 * @param archiveId - target archive.
 * @param fingerprint - expected fingerprint.
 * @returns the request.
 */
function requestFor(archiveId: string, fingerprint: string): WorkImportRequest {
  return { schemaVersion: 1, requestId: 'req-1', archiveId, expectedFingerprint: fingerprint }
}

describe('PendingWorkImporter.prepare', () => {
  it('describes an archive without inventing a workspace or a capacity', async () => {
    const { importer, snapshot } = await setup()
    const preview = expectOk(await importer.prepare(requestFor(snapshot.archiveId, snapshot.fingerprint)))

    expect(preview.archiveId).toBe(snapshot.archiveId)
    expect(preview.fingerprint).toBe(snapshot.fingerprint)
    expect(preview.title).toBe(snapshot.title)
    expect(preview.historyKind).toBe('messages')
    expect(preview.messageCount).toBe(5)
    expect(preview.completeness).toBe('user-supplied')
    expect(preview.attachments).toEqual({
      messagesWithAttachments: 1,
      total: 2,
      unavailable: 1,
      unavailableNames: ['missing.bin'],
    })
    // The three hard "not yet" facts, stated as data rather than prose.
    expect(preview.workspaceId).toBeNull()
    expect(preview.contextCapacity).toEqual({ state: 'not-estimated' })
    expect(preview.warningKeys).toContain('work.warning.workspaceNotWired')
    expect(preview.warningKeys).toContain('work.warning.contextNotEstimated')
    // No token count, no model capacity, no "fits" conclusion anywhere.
    expect(JSON.stringify(preview)).not.toMatch(/token|capacity":\s*\d|fits/i)
    expect(preview.hasRemoteConversationId).toBe(true)
  })

  it('reports a missing archive', async () => {
    const { importer } = await setup()
    expectErr(await importer.prepare(requestFor('11111111-1111-4111-8111-111111111111', 'a'.repeat(64))), 'ARCHIVE_NOT_FOUND')
  })

  it('refuses a fingerprint that does not match the stored archive', async () => {
    const { importer, snapshot } = await setup()
    expectErr(await importer.prepare(requestFor(snapshot.archiveId, 'c'.repeat(64))), 'ARCHIVE_CORRUPTED')
  })

  it('refuses a malformed request', async () => {
    const { importer, snapshot } = await setup()
    expectErr(await importer.prepare({
      schemaVersion: 2, requestId: 'r', archiveId: snapshot.archiveId, expectedFingerprint: snapshot.fingerprint,
    } as unknown as WorkImportRequest), 'UNSUPPORTED_VERSION')
    expectErr(await importer.prepare({
      schemaVersion: 1, requestId: '', archiveId: snapshot.archiveId, expectedFingerprint: snapshot.fingerprint,
    }), 'INVALID_HISTORY')
    expectErr(await importer.prepare({
      schemaVersion: 1, requestId: 'r', archiveId: snapshot.archiveId, expectedFingerprint: 'nope',
    }), 'INVALID_HISTORY')
  })

  it('reports a source-text archive as one unverified block', async () => {
    const repository = new MemoryArchiveRepository()
    const snapshot = expectOk(await buildImport({
      format: 'markdown', text: readFixture('source-markdown.md'),
    })).snapshot
    expect(expectOk(await repository.save(snapshot)).duplicate).toBe(false)
    const importer = new PendingWorkImporter(repository)
    const preview = expectOk(await importer.prepare(requestFor(snapshot.archiveId, snapshot.fingerprint)))
    expect(preview.historyKind).toBe('source-text')
    expect(preview.messageCount).toBeUndefined()
    expect(preview.sourceTextLength).toBeGreaterThan(0)
    expect(preview.completeness).toBe('unknown')
  })

  it('stops working after dispose', async () => {
    const { importer, snapshot } = await setup()
    importer.dispose()
    expectErr(await importer.prepare(requestFor(snapshot.archiveId, snapshot.fingerprint)), 'WORK_IMPORT_NOT_IMPLEMENTED')
  })
})

describe('PendingWorkImporter.commit', () => {
  it('is explicitly unimplemented and produces no receipt', async () => {
    const { importer, snapshot } = await setup()
    const preview = expectOk(await importer.prepare(requestFor(snapshot.archiveId, snapshot.fingerprint)))
    const request = requestFor(snapshot.archiveId, snapshot.fingerprint)
    expectErr(await importer.commit(request, preview), 'WORK_IMPORT_NOT_IMPLEMENTED')
    expectErr(await importer.commit(request, preview), 'WORK_IMPORT_NOT_IMPLEMENTED')
    // The only observable trace of a commit must be nothing at all.
    expect(importer.receipts).toEqual([])
  })

  it('reports an unavailable capability', () => {
    const importer = new PendingWorkImporter(new MemoryArchiveRepository())
    expect(importer.capability.state).toBe('unavailable')
    expect(importer.capability.code).toBe('WORK_IMPORT_NOT_IMPLEMENTED')
  })
})
