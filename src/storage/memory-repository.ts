/**
 * In-memory {@link ArchiveRepository}.
 *
 * **This implementation does not persist anything.** It exists for unit tests
 * and, explicitly labelled as such, for a development preview where IndexedDB
 * is unavailable. The production client never falls back to it silently: an
 * unavailable database is reported as `STORAGE_UNAVAILABLE` so the user is
 * never told that an archive was saved when it was not.
 *
 * It implements the same contract as the IndexedDB repository — including
 * fingerprint deduplication, corruption reporting, and the exact same error
 * codes — so tests exercise the interface the UI actually depends on.
 *
 * @module dsh-chat-bridge/storage/memory-repository
 */

import type {
  ArchiveListQuery,
  ArchiveRepository,
  ArchiveSummary,
  ChatSnapshot,
  SaveOutcome,
} from '../shared/contracts'
import { errCode, ok, type Result } from '../shared/errors'
import { verifyHistoryConsistency, verifySnapshotFingerprint } from '../import/build-snapshot'
import { normalizeTitle } from '../import/title'
import { validateSnapshot } from '../import/validate-snapshot'
import { corruptedSummary, toSummary } from './indexeddb-repository'

/**
 * Project one stored record, degrading to a `corrupted` list entry instead of
 * throwing, so one bad row cannot take the whole list down.
 * @param archiveId - the record's key.
 * @param record - the raw stored record.
 * @returns the summary to list.
 */
function safeSummary(archiveId: string, record: unknown): ArchiveSummary {
  const validated = validateSnapshot(record)
  if (validated.ok) return toSummary(validated.value)
  return corruptedSummary(archiveId, 'archive.status.corruptedStructure')
}

/** Marker shown wherever this repository is used, so it can never be mistaken for real storage. */
export const MEMORY_REPOSITORY_NOTICE = 'non-persistent test repository'

/** Volatile archive repository. */
export class MemoryArchiveRepository implements ArchiveRepository {
  private readonly archives = new Map<string, ChatSnapshot>()
  private readonly byFingerprint = new Map<string, string>()
  private disposed = false

  /**
   * @param options - test hooks; production code passes nothing.
   */
  constructor(options: { readonly failWrites?: boolean } = {}) {
    this.failWrites = options.failWrites ?? false
  }

  /** When true every write reports `STORAGE_UNAVAILABLE`, to exercise failure paths. */
  private readonly failWrites: boolean

  /**
   * List summaries, newest first.
   * @param query - optional title search.
   * @returns summaries sorted by `updatedAt` descending, ties broken by id.
   */
  async list(query: ArchiveListQuery = {}): Promise<Result<ArchiveSummary[]>> {
    if (this.disposed) return errCode('STORAGE_UNAVAILABLE', 'archive repository is disposed')
    const needle = query.search?.trim().toLowerCase()
    const summaries: ArchiveSummary[] = []
    for (const [archiveId, record] of this.archives) {
      const summary = safeSummary(archiveId, record)
      if (needle !== undefined && needle !== '' && !summary.title.toLowerCase().includes(needle)) continue
      summaries.push(summary)
    }
    summaries.sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) return left.updatedAt < right.updatedAt ? 1 : -1
      return left.archiveId < right.archiveId ? -1 : left.archiveId > right.archiveId ? 1 : 0
    })
    return ok(summaries)
  }

  /**
   * Read one archive.
   * @param archiveId - local archive id.
   * @returns the validated snapshot or a precise error.
   */
  async get(archiveId: string): Promise<Result<ChatSnapshot>> {
    if (this.disposed) return errCode('STORAGE_UNAVAILABLE', 'archive repository is disposed')
    const record = this.archives.get(archiveId)
    if (record === undefined) {
      return errCode('ARCHIVE_NOT_FOUND', 'no archive is stored under this id')
    }
    const validated = validateSnapshot(record)
    if (!validated.ok) return validated
    const fingerprint = await verifySnapshotFingerprint(validated.value)
    if (!fingerprint.ok) return fingerprint
    const consistent = verifyHistoryConsistency(validated.value)
    if (!consistent.ok) return consistent
    return ok(validated.value)
  }

  /**
   * Save a snapshot with fingerprint deduplication.
   * @param snapshot - the snapshot to store.
   * @returns the stored or pre-existing id and whether it is a duplicate.
   */
  async save(snapshot: ChatSnapshot): Promise<Result<SaveOutcome>> {
    if (this.disposed) return errCode('STORAGE_UNAVAILABLE', 'archive repository is disposed')
    if (this.failWrites) return errCode('STORAGE_UNAVAILABLE', 'write failed (test hook)')
    const validated = validateSnapshot(snapshot)
    if (!validated.ok) return validated
    const value = validated.value
    const fingerprint = await verifySnapshotFingerprint(value)
    if (!fingerprint.ok) return fingerprint
    const consistent = verifyHistoryConsistency(value)
    if (!consistent.ok) return consistent
    const existing = this.byFingerprint.get(value.fingerprint)
    if (existing !== undefined) return ok({ archiveId: existing, duplicate: true })
    this.archives.set(value.archiveId, value)
    this.byFingerprint.set(value.fingerprint, value.archiveId)
    return ok({ archiveId: value.archiveId, duplicate: false })
  }

  /**
   * Rename an archive without touching its content.
   * @param archiveId - local archive id.
   * @param title - the new title.
   * @returns success or a precise error.
   */
  async rename(archiveId: string, title: string): Promise<Result<undefined>> {
    if (this.disposed) return errCode('STORAGE_UNAVAILABLE', 'archive repository is disposed')
    if (this.failWrites) return errCode('STORAGE_UNAVAILABLE', 'write failed (test hook)')
    const normalized = normalizeTitle(title)
    if (!normalized.ok) return normalized
    const existing = this.archives.get(archiveId)
    if (existing === undefined) return errCode('ARCHIVE_NOT_FOUND', 'no archive is stored under this id')
    this.archives.set(archiveId, { ...existing, title: normalized.value, updatedAt: new Date().toISOString() })
    return ok(undefined)
  }

  /**
   * Delete one archive record.
   * @param archiveId - local archive id.
   * @returns success or `ARCHIVE_NOT_FOUND`.
   */
  async remove(archiveId: string): Promise<Result<undefined>> {
    if (this.disposed) return errCode('STORAGE_UNAVAILABLE', 'archive repository is disposed')
    if (this.failWrites) return errCode('STORAGE_UNAVAILABLE', 'write failed (test hook)')
    const existing = this.archives.get(archiveId)
    if (existing === undefined) return errCode('ARCHIVE_NOT_FOUND', 'no archive is stored under this id')
    this.archives.delete(archiveId)
    this.byFingerprint.delete(existing.fingerprint)
    return ok(undefined)
  }

  /** Drop all in-memory state. */
  dispose(): void {
    this.disposed = true
    this.archives.clear()
    this.byFingerprint.clear()
  }

  /**
   * Insert a record without validation, to simulate a corrupted database row.
   * Test-only helper; the production repository has no equivalent.
   * @param record - raw record to plant.
   */
  plantCorruptedRecord(record: unknown): void {
    const archiveId = (record as { archiveId?: unknown }).archiveId
    if (typeof archiveId !== 'string') throw new Error('planted record needs a string archiveId')
    this.archives.set(archiveId, record as ChatSnapshot)
  }
}
