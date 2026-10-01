/**
 * Local-archive export and re-import.
 *
 * Two exports exist, and they are different things:
 *  - the **original text** file, which is exactly `original.text`, byte for
 *    byte (this is the user's own material back);
 *  - the **full local archive** JSON, wrapped as
 *    `{ format, schemaVersion, snapshot }`, which also carries the normalized
 *    history and metadata.
 *
 * Re-importing an archive never trusts it: the wrapper and snapshot are
 * re-validated, the fingerprint is recomputed, the normalized history is
 * re-derived from the original text and must agree with the stored one, and the
 * local identity is regenerated (a fresh `archiveId`/timestamps, deduplicated
 * afterwards by fingerprint). A document can therefore never dictate which
 * database row it writes to, and a renamed export does not overwrite the title
 * of an existing archive.
 *
 * @module dsh-chat-bridge/import/export-archive
 */

import type { ChatSnapshot } from '../shared/contracts'
import { errCode, ok, type Result } from '../shared/errors'
import { newLocalId } from '../shared/ids'
import { LIMITS, utf8ByteLength } from '../shared/limits'
import { previewOf, verifyHistoryConsistency, verifySnapshotFingerprint, type ImportPreview } from './build-snapshot'
import { stripLeadingBomChar } from './decode-text'
import { ARCHIVE_FORMAT, MANUAL_HISTORY_SCHEMA_VERSION } from './parse-manual-json'
import { isPlainObject } from './guard'
import { validateSnapshot } from './validate-snapshot'

/** The full-archive document wrapper. */
export interface ArchiveDocument {
  format: typeof ARCHIVE_FORMAT
  schemaVersion: 1 | 2
  snapshot: ChatSnapshot
}

/**
 * Serialize one snapshot as a full local-archive document.
 * @param snapshot - the archive to export.
 * @returns pretty-printed JSON text.
 */
export function serializeArchiveDocument(snapshot: ChatSnapshot): string {
  const document: ArchiveDocument = {
    format: ARCHIVE_FORMAT,
    schemaVersion: snapshot.schemaVersion,
    snapshot,
  }
  return `${JSON.stringify(document, null, 2)}\n`
}

/**
 * The text an "export original" download must contain.
 * @param snapshot - the archive to export.
 * @returns `original.text` unchanged.
 */
export function originalTextOf(snapshot: ChatSnapshot): string {
  return snapshot.original.text
}

/** A re-imported archive plus the preview its new local identity implies. */
export interface ReimportedArchive {
  snapshot: ChatSnapshot
  preview: ImportPreview
}

/**
 * Parse a full local-archive document and rebuild it as a *new* local import.
 * @param text - document text (already decoded from UTF-8).
 * @param now - injectable clock (used by tests).
 * @returns the rebuilt snapshot or a precise error.
 */
export async function parseArchiveDocument(text: string, now: Date = new Date()): Promise<Result<ReimportedArchive>> {
  const bytes = utf8ByteLength(text)
  if (bytes > LIMITS.archiveFileBytes) {
    return errCode('INPUT_TOO_LARGE', 'archive document exceeds the archive-file byte limit', {
      detail: { limit: LIMITS.archiveFileBytes, actual: bytes },
    })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(stripLeadingBomChar(text)) as unknown
  } catch {
    return errCode('INVALID_JSON', 'archive document is not valid JSON', {
      detail: { byteLength: bytes },
    })
  }
  if (!isPlainObject(parsed)) {
    return errCode('UNSUPPORTED_FORMAT', 'archive document is not a JSON object')
  }
  if (parsed.format !== ARCHIVE_FORMAT) {
    return errCode('UNSUPPORTED_FORMAT', 'document format is not the supported archive format', {
      path: 'format',
    })
  }
  if (parsed.schemaVersion !== MANUAL_HISTORY_SCHEMA_VERSION && parsed.schemaVersion !== 2) {
    return errCode('UNSUPPORTED_VERSION', 'archive document schemaVersion is not supported', {
      path: 'schemaVersion',
    })
  }
  const validated = validateSnapshot(parsed.snapshot, 'UNSUPPORTED_VERSION')
  if (!validated.ok) return validated
  const stored = validated.value
  if (parsed.schemaVersion !== stored.schemaVersion) return errCode('UNSUPPORTED_VERSION', 'archive wrapper version differs from snapshot')

  // The embedded original text must itself obey the plain-input limit: the
  // archive file is allowed to be larger only because it also carries the
  // normalized copy.
  const originalBytes = utf8ByteLength(stored.original.text)
  if (originalBytes > LIMITS.manualInputBytes) {
    return errCode('INPUT_TOO_LARGE', 'embedded original text exceeds the manual-input byte limit', {
      path: 'snapshot.original.text',
      detail: { limit: LIMITS.manualInputBytes, actual: originalBytes },
    })
  }
  const fingerprint = await verifySnapshotFingerprint(stored)
  if (!fingerprint.ok) return fingerprint
  const consistent = verifyHistoryConsistency(stored)
  if (!consistent.ok) return consistent

  const timestamp = now.toISOString()
  const rebuilt: ChatSnapshot = {
    ...stored,
    // Local identity is regenerated on import; the document's ids are ignored
    // as write targets and deduplication falls back to the content fingerprint.
    archiveId: newLocalId(),
    importedAt: timestamp,
    updatedAt: timestamp,
  }
  return ok({ snapshot: rebuilt, preview: previewOf(rebuilt) })
}
