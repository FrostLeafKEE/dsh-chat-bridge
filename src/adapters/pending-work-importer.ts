/**
 * {@link WorkImportPort} for the basic stage.
 *
 * `prepare()` is real: it reads the archive back from storage, re-verifies the
 * content fingerprint against what the caller expected, and builds the handoff
 * preview the UI shows. `commit()` is deliberately not implemented — creating a
 * work session needs a real workspace choice, context-budget handling, and a
 * native Session importer, none of which exist yet.
 *
 * Two rules the placeholder enforces so a later implementation cannot quietly
 * relax them:
 *  - no receipt is ever produced while `commit()` is unimplemented (the
 *    `receipts` array is exposed so a test can assert it stays empty);
 *  - the preview never states a token count, a model capacity, or a
 *    "fits in context" conclusion — `contextCapacity` is pinned to
 *    `not-estimated`, and `workspaceId` stays `null` because no workspace has
 *    been selected.
 *
 * @module dsh-chat-bridge/adapters/pending-work-importer
 */

import type {
  ArchiveRepository,
  CapabilityStatus,
  ChatSnapshot,
  WorkImportPort,
  WorkImportPreview,
  WorkImportReceipt,
  WorkImportRequest,
} from '../shared/contracts'
import { errCode, ok, type Result } from '../shared/errors'
import { utf8ByteLength } from '../shared/limits'
import { summarizeAttachments } from '../import/build-snapshot'

/** Capability report for the work-import seam. */
export const WORK_IMPORT_CAPABILITY: CapabilityStatus = {
  state: 'unavailable',
  code: 'WORK_IMPORT_NOT_IMPLEMENTED',
  noteKey: 'capability.workImport.notImplemented',
}

/** A SHA-256 digest in lowercase hex. */
const FINGERPRINT = /^[0-9a-f]{64}$/

/** Locale keys the preview always carries. */
const PREVIEW_WARNINGS = [
  'work.warning.workspaceNotWired',
  'work.warning.contextNotEstimated',
  'work.warning.userSuppliedOnly',
] as const

/** Archive-backed work-import seam with an explicitly unimplemented commit. */
export class PendingWorkImporter implements WorkImportPort {
  readonly capability: CapabilityStatus = WORK_IMPORT_CAPABILITY

  /**
   * Receipts this importer has produced. Always empty in this stage; a future
   * implementation appends exactly one per committed request.
   */
  readonly receipts: WorkImportReceipt[] = []

  private disposed = false

  /**
   * @param repository - archive storage the preview is built from.
   */
  constructor(private readonly repository: ArchiveRepository) {}

  /**
   * Read the archive, verify it, and describe what a handoff would carry.
   * @param request - one user action's request.
   * @returns the preview, or a precise error.
   */
  async prepare(request: WorkImportRequest): Promise<Result<WorkImportPreview>> {
    if (this.disposed) {
      return errCode('WORK_IMPORT_NOT_IMPLEMENTED', 'work importer was disposed')
    }
    if (request.schemaVersion !== 1) {
      return errCode('UNSUPPORTED_VERSION', 'work import request schemaVersion is not supported', {
        path: 'schemaVersion',
      })
    }
    if (typeof request.requestId !== 'string' || request.requestId === '') {
      return errCode('INVALID_HISTORY', 'work import request needs a requestId', { path: 'requestId' })
    }
    if (!FINGERPRINT.test(request.expectedFingerprint)) {
      return errCode('INVALID_HISTORY', 'expectedFingerprint is not a lowercase SHA-256 hex digest', {
        path: 'expectedFingerprint',
      })
    }
    const snapshot = await this.repository.get(request.archiveId)
    if (!snapshot.ok) return snapshot
    if (snapshot.value.fingerprint !== request.expectedFingerprint) {
      return errCode('ARCHIVE_CORRUPTED', 'archive fingerprint does not match the requested fingerprint', {
        path: 'expectedFingerprint',
      })
    }
    return ok(buildPreview(request, snapshot.value))
  }

  /**
   * Create a work session from a prepared archive.
   *
   * Always fails with `WORK_IMPORT_NOT_IMPLEMENTED`: no Agent, no Session, no
   * receipt, and no model call may result from this call.
   * @param _request - the request that was prepared.
   * @param _preview - the preview the user saw.
   * @returns always `WORK_IMPORT_NOT_IMPLEMENTED`.
   */
  async commit(
    _request: WorkImportRequest,
    _preview: WorkImportPreview,
  ): Promise<Result<WorkImportReceipt>> {
    return errCode(
      'WORK_IMPORT_NOT_IMPLEMENTED',
      'creating a work session from an archive is not implemented in the basic build',
    )
  }

  /** Release the seam; further `prepare()` calls fail explicitly. */
  dispose(): void {
    this.disposed = true
  }
}

/**
 * Build the preview projection for one verified archive.
 * @param request - the originating request.
 * @param snapshot - the verified archive.
 * @returns the preview shown in the handoff dialog.
 */
function buildPreview(request: WorkImportRequest, snapshot: ChatSnapshot): WorkImportPreview {
  const history = snapshot.history
  const attachments = summarizeAttachments(history.kind === 'messages' ? history.messages : [])
  const preview: WorkImportPreview = {
    schemaVersion: 1,
    requestId: request.requestId,
    archiveId: snapshot.archiveId,
    fingerprint: snapshot.fingerprint,
    title: snapshot.title,
    sourceKind: snapshot.source.kind,
    historyKind: history.kind,
    originalBytes: utf8ByteLength(snapshot.original.text),
    completeness: history.completeness,
    attachments: {
      messagesWithAttachments: attachments.messagesWithAttachments,
      total: attachments.total,
      unavailable: attachments.unavailable,
      unavailableNames: attachments.unavailableNames,
    },
    warningKeys: [...PREVIEW_WARNINGS],
    // No workspace has been chosen, so none may be named.
    workspaceId: null,
    contextCapacity: { state: 'not-estimated' },
    hasRemoteConversationId: snapshot.source.conversationId !== undefined,
  }
  if (snapshot.source.url !== undefined) preview.sourceUrl = snapshot.source.url
  if (snapshot.source.fileName !== undefined) preview.sourceFileName = snapshot.source.fileName
  if (history.kind === 'messages') preview.messageCount = history.messages.length
  else preview.sourceTextLength = [...history.text].length
  return preview
}

/**
 * Create the pending importer.
 * @param repository - archive storage.
 * @returns the port.
 */
export function createPendingWorkImporter(repository: ArchiveRepository): WorkImportPort {
  return new PendingWorkImporter(repository)
}
