/**
 * IndexedDB-backed {@link ArchiveRepository}: the real persistence of the
 * basic stage.
 *
 * Layout — one database, two object stores, one transaction:
 *  - `summaries` holds the list projection only (no message bodies), keyed by
 *    `archiveId`, with a **unique** `fingerprint` index and an `updatedAt`
 *    index. The unique index is what makes duplicate detection a database
 *    guarantee rather than a best-effort read-then-write.
 *  - `archives` holds the full {@link ChatSnapshot}, keyed by `archiveId`.
 *
 * The UI never touches IndexedDB: everything goes through the repository
 * interface, so a later host-side archive service can be swapped in without
 * changing a component.
 *
 * Failure policy: an unavailable database is reported as `STORAGE_UNAVAILABLE`
 * and never silently downgraded to memory (which would tell the user their
 * archive is safe when it is not). A corrupt or unknown-version record is
 * reported and never auto-deleted; the rest of the archive list stays usable.
 *
 * @module dsh-chat-bridge/storage/indexeddb-repository
 */

import type {
  ArchiveListQuery,
  ArchiveRepository,
  ArchiveSummary,
  ChatSnapshot,
  SaveOutcome,
} from '../shared/contracts'
import { errCode, ok, type Result } from '../shared/errors'
import { codePointLength, utf8ByteLength } from '../shared/limits'
import { summarizeAttachments, verifyHistoryConsistency, verifySnapshotFingerprint } from '../import/build-snapshot'
import { isPlainObject } from '../import/guard'
import { normalizeTitle } from '../import/title'
import { validateSnapshot } from '../import/validate-snapshot'

/** Database name; versioned so a future schema change is an explicit migration. */
export const DATABASE_NAME = 'dsh-chat-bridge.archives.v1'

/** Schema version of the database (independent of the snapshot schema version). */
export const DATABASE_VERSION = 1

/** Object store holding list projections. */
const SUMMARY_STORE = 'summaries'
/** Object store holding full snapshots. */
const ARCHIVE_STORE = 'archives'
/** Index name for the unique content fingerprint. */
const FINGERPRINT_INDEX = 'fingerprint'
/** Index name for the archive-list sort key. */
const UPDATED_AT_INDEX = 'updatedAt'

/** Fields of a stored summary record (the projection plus its sort key). */
interface StoredSummary extends ArchiveSummary {
  /** Duplicated from the summary for an explicit sort key. */
  sortKey: string
}

/**
 * Convert a validated snapshot into its list projection.
 * @param snapshot - a validated snapshot.
 * @returns the summary record to store.
 */
export function toSummary(snapshot: ChatSnapshot): StoredSummary {
  const history = snapshot.history
  const messages = history.kind === 'messages' ? history.messages : []
  const attachments = summarizeAttachments(messages)
  const summary: StoredSummary = {
    archiveId: snapshot.archiveId,
    fingerprint: snapshot.fingerprint,
    title: snapshot.title,
    importedAt: snapshot.importedAt,
    updatedAt: snapshot.updatedAt,
    sourceKind: snapshot.source.kind,
    historyKind: history.kind,
    originalBytes: utf8ByteLength(snapshot.original.text),
    completeness: history.completeness,
    attachmentCount: attachments.total,
    missingAttachmentCount: attachments.unavailable,
    status: 'ok',
    sortKey: snapshot.updatedAt,
  }
  if (snapshot.source.fileName !== undefined) summary.fileName = snapshot.source.fileName
  if (history.kind === 'messages') summary.messageCount = history.messages.length
  else summary.textLength = codePointLength(history.text)
  return summary
}

/**
 * Build the list entry shown for a record this build cannot read. The record is
 * never deleted or hidden: the user must be able to see it and remove it.
 * @param archiveId - the record's key, when it had one.
 * @param messageKey - locale key describing the corruption.
 * @returns a `corrupted` list entry.
 */
export function corruptedSummary(archiveId: string, messageKey: string): ArchiveSummary {
  return {
    archiveId,
    fingerprint: '',
    title: '',
    importedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    sourceKind: 'manual-json',
    historyKind: 'source-text',
    originalBytes: 0,
    completeness: 'unknown',
    attachmentCount: 0,
    missingAttachmentCount: 0,
    status: 'corrupted',
    statusMessageKey: messageKey,
  }
}

/**
 * Validate a stored summary record.
 * @param value - candidate record.
 * @returns the record with `status` set, or a corruption reason key.
 */
function readStoredSummary(value: unknown): { summary?: StoredSummary; corruptionKey?: string } {
  if (!isPlainObject(value)) return { corruptionKey: 'archive.status.corruptedStructure' }
  const archiveId = value.archiveId
  const fingerprint = value.fingerprint
  const updatedAt = value.updatedAt
  const importedAt = value.importedAt
  if (typeof archiveId !== 'string' || typeof fingerprint !== 'string') {
    return { corruptionKey: 'archive.status.corruptedStructure' }
  }
  if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) {
    return { corruptionKey: 'archive.status.corruptedTimestamp' }
  }
  if (typeof importedAt !== 'string' || Number.isNaN(Date.parse(importedAt))) {
    return { corruptionKey: 'archive.status.corruptedTimestamp' }
  }
  if (value.status !== 'ok' && value.status !== 'corrupted') {
    return { corruptionKey: 'archive.status.corruptedStructure' }
  }
  const historyKind = value.historyKind
  if (historyKind !== 'messages' && historyKind !== 'source-text') {
    return { corruptionKey: 'archive.status.corruptedStructure' }
  }
  const completeness = value.completeness
  if (completeness !== 'user-supplied' && completeness !== 'partial' && completeness !== 'unknown') {
    return { corruptionKey: 'archive.status.corruptedStructure' }
  }
  const sourceKind = value.sourceKind
  if (sourceKind !== 'manual-json' && sourceKind !== 'manual-text' && sourceKind !== 'manual-markdown' && sourceKind !== 'web-dom') {
    return { corruptionKey: 'archive.status.corruptedStructure' }
  }
  const summary: StoredSummary = {
    archiveId,
    fingerprint,
    title: typeof value.title === 'string' && value.title !== '' ? value.title : archiveId,
    importedAt,
    updatedAt,
    sourceKind,
    historyKind,
    originalBytes: typeof value.originalBytes === 'number' ? value.originalBytes : 0,
    completeness,
    attachmentCount: typeof value.attachmentCount === 'number' ? value.attachmentCount : 0,
    missingAttachmentCount: typeof value.missingAttachmentCount === 'number' ? value.missingAttachmentCount : 0,
    status: value.status,
    sortKey: updatedAt,
  }
  if (typeof value.fileName === 'string') summary.fileName = value.fileName
  if (typeof value.messageCount === 'number') summary.messageCount = value.messageCount
  if (typeof value.textLength === 'number') summary.textLength = value.textLength
  if (typeof value.statusMessageKey === 'string') summary.statusMessageKey = value.statusMessageKey
  return { summary }
}

/** Promise wrapper for a single IndexedDB request. */
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => { resolve(req.result) }
    req.onerror = () => { reject(req.error ?? new Error('IndexedDB request failed')) }
  })
}

/** Promise wrapper for transaction completion. */
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => { resolve() }
    tx.onerror = () => { reject(tx.error ?? new Error('IndexedDB transaction failed')) }
    tx.onabort = () => { reject(tx.error ?? new Error('IndexedDB transaction aborted')) }
  })
}

/** Whether an unknown error is a quota failure. */
function isQuotaError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
}

/** Whether an unknown error is a unique-index constraint failure. */
function isConstraintError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConstraintError'
}

/** Map any storage exception onto a logging-safe result error. */
function storageFailure(error: unknown, operation: string): Result<never> {
  if (isQuotaError(error)) {
    return errCode('STORAGE_QUOTA_EXCEEDED', 'archive storage is full', { detail: { operation } })
  }
  return errCode('STORAGE_UNAVAILABLE', 'archive storage operation failed', { detail: { operation } })
}

/**
 * Open (and, on first run, create) the plugin database.
 * @param factory - the `IDBFactory` to use; injectable for tests.
 * @returns an open handle or `STORAGE_UNAVAILABLE`.
 */
async function openDatabase(factory: IDBFactory): Promise<Result<IDBDatabase>> {
  const opened = new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(DATABASE_NAME, DATABASE_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(SUMMARY_STORE)) {
        const summaries = db.createObjectStore(SUMMARY_STORE, { keyPath: 'archiveId' })
        summaries.createIndex(FINGERPRINT_INDEX, 'fingerprint', { unique: true })
        summaries.createIndex(UPDATED_AT_INDEX, 'sortKey', { unique: false })
      }
      if (!db.objectStoreNames.contains(ARCHIVE_STORE)) {
        db.createObjectStore(ARCHIVE_STORE, { keyPath: 'archiveId' })
      }
    }
    req.onsuccess = () => { resolve(req.result) }
    req.onerror = () => { reject(req.error ?? new Error('IndexedDB open failed')) }
    req.onblocked = () => { reject(new Error('IndexedDB open is blocked by another connection')) }
  })
  try {
    return ok(await opened)
  } catch (error) {
    return storageFailure(error, 'open')
  }
}

/** IndexedDB-backed archive repository. */
export class IndexedDbArchiveRepository implements ArchiveRepository {
  private db: IDBDatabase | undefined
  private disposed = false

  /**
   * @param db - an already-open database handle.
   */
  private constructor(db: IDBDatabase) {
    this.db = db
  }

  /**
   * Open the repository.
   * @param factory - `IDBFactory` to use; defaults to `globalThis.indexedDB`.
   * @returns the repository, or `STORAGE_UNAVAILABLE` when IndexedDB is absent
   * or cannot be opened.
   */
  static async open(factory?: IDBFactory): Promise<Result<IndexedDbArchiveRepository>> {
    const resolved = factory ?? globalThis.indexedDB
    if (resolved === undefined || resolved === null) {
      return errCode('STORAGE_UNAVAILABLE', 'IndexedDB is not available in this environment')
    }
    const db = await openDatabase(resolved)
    if (!db.ok) return db
    return ok(new IndexedDbArchiveRepository(db.value))
  }

  /** The live handle, or a failure when the repository was disposed. */
  private handle(): Result<IDBDatabase> {
    if (this.disposed || this.db === undefined) {
      return errCode('STORAGE_UNAVAILABLE', 'archive repository is disposed')
    }
    return ok(this.db)
  }

  /**
   * List archive summaries, newest first.
   * @param query - optional title search.
   * @returns summaries sorted by `updatedAt` descending, ties broken by id.
   */
  async list(query: ArchiveListQuery = {}): Promise<Result<ArchiveSummary[]>> {
    const db = this.handle()
    if (!db.ok) return db
    try {
      const tx = db.value.transaction(SUMMARY_STORE, 'readonly')
      const records = await request(tx.objectStore(SUMMARY_STORE).getAll())
      await transactionDone(tx)
      const summaries: ArchiveSummary[] = []
      for (const record of records) {
        const read = readStoredSummary(record)
        if (read.summary === undefined) {
          // A record this build cannot read is surfaced, never dropped.
          const key = (record as { archiveId?: unknown }).archiveId
          summaries.push(corruptedSummary(
            typeof key === 'string' ? key : 'unknown-record',
            read.corruptionKey ?? 'archive.status.corruptedStructure',
          ))
          continue
        }
        summaries.push(read.summary)
      }
      const needle = query.search?.trim().toLowerCase()
      const filtered = needle === undefined || needle === ''
        ? summaries
        : summaries.filter(summary => summary.title.toLowerCase().includes(needle))
      filtered.sort((left, right) => {
        if (left.updatedAt !== right.updatedAt) return left.updatedAt < right.updatedAt ? 1 : -1
        return left.archiveId < right.archiveId ? -1 : left.archiveId > right.archiveId ? 1 : 0
      })
      return ok(filtered)
    } catch (error) {
      return storageFailure(error, 'list')
    }
  }

  /**
   * Read one archive.
   * @param archiveId - local archive id.
   * @returns the validated snapshot, `ARCHIVE_NOT_FOUND`, or `ARCHIVE_CORRUPTED`.
   */
  async get(archiveId: string): Promise<Result<ChatSnapshot>> {
    const db = this.handle()
    if (!db.ok) return db
    try {
      const tx = db.value.transaction(ARCHIVE_STORE, 'readonly')
      const record = await request(tx.objectStore(ARCHIVE_STORE).get(archiveId))
      await transactionDone(tx)
      if (record === undefined) {
        return errCode('ARCHIVE_NOT_FOUND', 'no archive is stored under this id')
      }
      const validated = validateSnapshot(record)
      if (!validated.ok) return validated
      const verified = await verifySnapshotFingerprint(validated.value)
      if (!verified.ok) return verified
      const consistent = verifyHistoryConsistency(validated.value)
      if (!consistent.ok) return consistent
      return ok(validated.value)
    } catch (error) {
      return storageFailure(error, 'get')
    }
  }

  /**
   * Save a snapshot, deduplicating by content fingerprint.
   * @param snapshot - the snapshot to store.
   * @returns the stored (or pre-existing) archive id and whether it is a duplicate.
   */
  async save(snapshot: ChatSnapshot): Promise<Result<SaveOutcome>> {
    const db = this.handle()
    if (!db.ok) return db
    const validated = validateSnapshot(snapshot)
    if (!validated.ok) return validated
    const value = validated.value
    const fingerprint = await verifySnapshotFingerprint(value)
    if (!fingerprint.ok) return fingerprint
    const consistent = verifyHistoryConsistency(value)
    if (!consistent.ok) return consistent

    try {
      const tx = db.value.transaction([SUMMARY_STORE, ARCHIVE_STORE], 'readwrite')
      const summaries = tx.objectStore(SUMMARY_STORE)
      const existing = await request(summaries.index(FINGERPRINT_INDEX).get(value.fingerprint))
      if (existing !== undefined) {
        // Same format and byte-identical original text: return the existing
        // archive untouched, so a rename or an earlier title is never clobbered.
        await transactionDone(tx)
        const read = readStoredSummary(existing)
        const archiveId = read.summary?.archiveId ?? value.archiveId
        return ok({ archiveId, duplicate: true })
      }
      summaries.put(toSummary(value))
      tx.objectStore(ARCHIVE_STORE).put(value)
      await transactionDone(tx)
      return ok({ archiveId: value.archiveId, duplicate: false })
    } catch (error) {
      if (isConstraintError(error)) {
        // A concurrent save won the unique-index race; report it as a duplicate
        // of that record rather than failing the user's click.
        const existing = await this.findByFingerprint(value.fingerprint)
        if (existing !== undefined) return ok({ archiveId: existing, duplicate: true })
      }
      return storageFailure(error, 'save')
    }
  }

  /**
   * Look up an archive id by fingerprint, used only to resolve a lost race.
   * @param fingerprint - content fingerprint.
   * @returns the archive id when present.
   */
  private async findByFingerprint(fingerprint: string): Promise<string | undefined> {
    const db = this.db
    if (db === undefined) return undefined
    try {
      const tx = db.transaction(SUMMARY_STORE, 'readonly')
      const record = await request(tx.objectStore(SUMMARY_STORE).index(FINGERPRINT_INDEX).get(fingerprint))
      await transactionDone(tx)
      return readStoredSummary(record).summary?.archiveId
    } catch {
      return undefined
    }
  }

  /**
   * Rename an archive. Only the title and `updatedAt` change; the original
   * text, the normalized history, and the fingerprint are untouched.
   * @param archiveId - local archive id.
   * @param title - the new title.
   * @returns success, `ARCHIVE_NOT_FOUND`, or `INVALID_TITLE`.
   */
  async rename(archiveId: string, title: string): Promise<Result<undefined>> {
    const db = this.handle()
    if (!db.ok) return db
    const normalized = normalizeTitle(title)
    if (!normalized.ok) return normalized
    try {
      const tx = db.value.transaction([SUMMARY_STORE, ARCHIVE_STORE], 'readwrite')
      const archives = tx.objectStore(ARCHIVE_STORE)
      const record = await request(archives.get(archiveId))
      if (record === undefined) {
        tx.abort()
        return errCode('ARCHIVE_NOT_FOUND', 'no archive is stored under this id')
      }
      const validated = validateSnapshot(record)
      if (!validated.ok) {
        tx.abort()
        return validated
      }
      const updated: ChatSnapshot = {
        ...validated.value,
        title: normalized.value,
        updatedAt: new Date().toISOString(),
      }
      archives.put(updated)
      tx.objectStore(SUMMARY_STORE).put(toSummary(updated))
      await transactionDone(tx)
      return ok(undefined)
    } catch (error) {
      return storageFailure(error, 'rename')
    }
  }

  /**
   * Delete one archive record. Nothing outside this database is touched: no
   * source file, no remote conversation.
   * @param archiveId - local archive id.
   * @returns success or `ARCHIVE_NOT_FOUND`.
   */
  async remove(archiveId: string): Promise<Result<undefined>> {
    const db = this.handle()
    if (!db.ok) return db
    try {
      const tx = db.value.transaction([SUMMARY_STORE, ARCHIVE_STORE], 'readwrite')
      const summaries = tx.objectStore(SUMMARY_STORE)
      const existing = await request(summaries.get(archiveId))
      if (existing === undefined) {
        tx.abort()
        return errCode('ARCHIVE_NOT_FOUND', 'no archive is stored under this id')
      }
      summaries.delete(archiveId)
      tx.objectStore(ARCHIVE_STORE).delete(archiveId)
      await transactionDone(tx)
      return ok(undefined)
    } catch (error) {
      return storageFailure(error, 'remove')
    }
  }

  /** Close the database handle. Later calls report `STORAGE_UNAVAILABLE`. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.db?.close()
    this.db = undefined
  }
}

/**
 * Convenience opener returning the repository interface.
 * @param factory - `IDBFactory` to use; defaults to `globalThis.indexedDB`.
 * @returns the repository or `STORAGE_UNAVAILABLE`.
 */
export async function openArchiveRepository(factory?: IDBFactory): Promise<Result<ArchiveRepository>> {
  const repository = await IndexedDbArchiveRepository.open(factory)
  if (!repository.ok) return repository
  return ok(repository.value)
}
