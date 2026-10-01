/**
 * Runtime validation of a stored or imported {@link ChatSnapshot}.
 *
 * One validator serves both callers: the repository uses it to detect a
 * corrupted record (which must be reported, never auto-deleted) and the
 * archive-file reader uses it on a document a user supplied.
 *
 * @module dsh-chat-bridge/import/validate-snapshot
 */

import type {
  ChatSnapshot,
  ImportedAttachment,
  ImportedHistory,
  ImportedMessage,
  ManualFormat,
  SnapshotSource,
} from '../shared/contracts'
import { type ErrorCode, errCode, ok, type Result } from '../shared/errors'
import { isLocalId } from '../shared/ids'
import { LIMITS, codePointLength } from '../shared/limits'
import { isPlainObject, optionalArray, optionalIsoTimestamp, optionalString } from './guard'
import { validateConversationId, validateSourceUrl } from './source-url'

/** Formats the archive model accepts. */
const FORMATS: ReadonlySet<string> = new Set<ManualFormat>(['json', 'text', 'markdown'])
/** Source kinds the archive model accepts. */
const SOURCE_KINDS: ReadonlySet<string> = new Set<SnapshotSource['kind']>([
  'manual-json', 'manual-text', 'manual-markdown',
  'web-dom',
])
/** A SHA-256 digest in lowercase hex. */
const FINGERPRINT = /^[0-9a-f]{64}$/

/**
 * Validate a manual v1 or web-capture v2 `ChatSnapshot`.
 * @param value - candidate value.
 * @param versionCode - error code for an unsupported `schemaVersion`.
 * @returns the validated snapshot or a precise error.
 */
export function validateSnapshot(value: unknown, versionCode: ErrorCode = 'ARCHIVE_CORRUPTED'): Result<ChatSnapshot> {
  if (!isPlainObject(value)) {
    return errCode('ARCHIVE_CORRUPTED', 'snapshot is not an object')
  }
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
    return errCode(versionCode, 'snapshot schemaVersion is not supported', { path: 'schemaVersion' })
  }
  if (typeof value.archiveId !== 'string' || !isLocalId(value.archiveId)) {
    return errCode('ARCHIVE_CORRUPTED', 'archiveId is not a local UUID', { path: 'archiveId' })
  }
  if (typeof value.fingerprint !== 'string' || !FINGERPRINT.test(value.fingerprint)) {
    return errCode('ARCHIVE_CORRUPTED', 'fingerprint is not a lowercase SHA-256 hex digest', { path: 'fingerprint' })
  }
  const title = validateTitle(value.title)
  if (!title.ok) return title
  const importedAt = requireTimestamp(value.importedAt, 'importedAt')
  if (!importedAt.ok) return importedAt
  const updatedAt = requireTimestamp(value.updatedAt, 'updatedAt')
  if (!updatedAt.ok) return updatedAt
  const source = validateSource(value.source)
  if (!source.ok) return source
  const original = validateOriginal(value.original)
  if (!original.ok) return original
  const history = validateHistory(value.history)
  if (!history.ok) return history
  if ((value.schemaVersion === 2) !== (source.value.kind === 'web-dom')
    || (value.schemaVersion === 1 && source.value.capture !== undefined)
    || (value.schemaVersion === 2 && (history.value.kind !== 'messages'
      || history.value.completeness !== 'partial' || original.value.format !== 'json'))) {
    return errCode('ARCHIVE_CORRUPTED', 'snapshot version and provenance disagree')
  }

  return ok({
    schemaVersion: value.schemaVersion,
    archiveId: value.archiveId,
    fingerprint: value.fingerprint,
    title: title.value,
    importedAt: importedAt.value,
    updatedAt: updatedAt.value,
    source: source.value,
    original: original.value,
    history: history.value,
  })
}

/**
 * Validate an archive title as stored (non-empty, within the limit).
 * @param value - candidate title.
 * @returns the title or `ARCHIVE_CORRUPTED`.
 */
function validateTitle(value: unknown): Result<string> {
  if (typeof value !== 'string' || value.trim() === '') {
    return errCode('ARCHIVE_CORRUPTED', 'title is missing or empty', { path: 'title' })
  }
  if (codePointLength(value) > LIMITS.maxTitleLength) {
    return errCode('ARCHIVE_CORRUPTED', 'title exceeds the configured length limit', { path: 'title' })
  }
  return ok(value)
}

/**
 * Validate a required ISO timestamp.
 * @param value - candidate value.
 * @param path - field path used in the error.
 * @returns the original string or `ARCHIVE_CORRUPTED`.
 */
function requireTimestamp(value: unknown, path: string): Result<string> {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return errCode('ARCHIVE_CORRUPTED', 'timestamp is missing or not an ISO-8601 instant', { path })
  }
  return ok(value)
}

/**
 * Validate the snapshot's `source` object, re-running URL vetting so a stored
 * record can never smuggle in a foreign or credential-bearing URL.
 * @param value - candidate value.
 * @returns the source or `ARCHIVE_CORRUPTED`.
 */
function validateSource(value: unknown): Result<SnapshotSource> {
  if (!isPlainObject(value)) {
    return errCode('ARCHIVE_CORRUPTED', 'source is not an object', { path: 'source' })
  }
  if (typeof value.kind !== 'string' || !SOURCE_KINDS.has(value.kind)) {
    return errCode('ARCHIVE_CORRUPTED', 'source.kind is not supported', { path: 'source.kind' })
  }
  const source: SnapshotSource = { kind: value.kind as SnapshotSource['kind'] }
  if (value.kind === 'web-dom') {
    const capture = value.capture
    if (!isPlainObject(capture) || capture.adapter !== 'deepseek-dom-2026-10-01'
      || capture.scope !== 'rendered-current-branch' || typeof capture.capturedAt !== 'string'
      || Number.isNaN(Date.parse(capture.capturedAt)) || typeof value.url !== 'string'
      || value.fileName !== undefined || value.conversationId !== undefined) {
      return errCode('ARCHIVE_CORRUPTED', 'web source metadata is invalid', { path: 'source.capture' })
    }
    source.capture = { adapter: capture.adapter, scope: capture.scope, capturedAt: capture.capturedAt }
  } else if (value.capture !== undefined) return errCode('ARCHIVE_CORRUPTED', 'manual source contains web capture metadata')
  const fileName = optionalString(value.fileName, 'source.fileName')
  if (!fileName.ok) return fileName
  if (fileName.value !== undefined) {
    // A stored file name must never contain a directory separator.
    if (/[\\/]/.test(fileName.value)) {
      return errCode('ARCHIVE_CORRUPTED', 'source.fileName must be a base name', { path: 'source.fileName' })
    }
    source.fileName = fileName.value
  }
  const url = optionalString(value.url, 'source.url')
  if (!url.ok) return url
  if (url.value !== undefined) {
    const checked = validateSourceUrl(url.value)
    if (!checked.ok) return errCode('ARCHIVE_CORRUPTED', 'source.url failed re-validation', { path: 'source.url' })
    source.url = checked.value
  }
  const conversationId = optionalString(value.conversationId, 'source.conversationId')
  if (!conversationId.ok) return conversationId
  if (conversationId.value !== undefined) {
    const checked = validateConversationId(conversationId.value)
    if (!checked.ok) return errCode('ARCHIVE_CORRUPTED', 'source.conversationId failed re-validation', {
      path: 'source.conversationId',
    })
    source.conversationId = checked.value
  }
  return ok(source)
}

/**
 * Validate the snapshot's `original` block.
 * @param value - candidate value.
 * @returns the original block or `ARCHIVE_CORRUPTED`.
 */
function validateOriginal(value: unknown): Result<ChatSnapshot['original']> {
  if (!isPlainObject(value)) {
    return errCode('ARCHIVE_CORRUPTED', 'original is not an object', { path: 'original' })
  }
  if (typeof value.format !== 'string' || !FORMATS.has(value.format)) {
    return errCode('ARCHIVE_CORRUPTED', 'original.format is not supported', { path: 'original.format' })
  }
  if (typeof value.text !== 'string') {
    return errCode('ARCHIVE_CORRUPTED', 'original.text is not a string', { path: 'original.text' })
  }
  return ok({ format: value.format as ManualFormat, text: value.text })
}

/**
 * Validate the snapshot's normalized history.
 * @param value - candidate value.
 * @returns the history or `ARCHIVE_CORRUPTED`.
 */
function validateHistory(value: unknown): Result<ImportedHistory> {
  if (!isPlainObject(value)) {
    return errCode('ARCHIVE_CORRUPTED', 'history is not an object', { path: 'history' })
  }
  if (value.kind === 'source-text') {
    if (value.completeness !== 'unknown') {
      return errCode('ARCHIVE_CORRUPTED', 'source-text history must be marked unknown', {
        path: 'history.completeness',
      })
    }
    if (typeof value.text !== 'string') {
      return errCode('ARCHIVE_CORRUPTED', 'history.text is not a string', { path: 'history.text' })
    }
    return ok({ kind: 'source-text', completeness: 'unknown', text: value.text })
  }
  if (value.kind !== 'messages') {
    return errCode('ARCHIVE_CORRUPTED', 'history.kind is not supported', { path: 'history.kind' })
  }
  if (value.completeness !== 'user-supplied' && value.completeness !== 'partial') {
    return errCode('ARCHIVE_CORRUPTED', 'messages history completeness is not supported', {
      path: 'history.completeness',
    })
  }
  const array = optionalArray(value.messages, 'history.messages')
  if (!array.ok) return errCode('ARCHIVE_CORRUPTED', 'history.messages is not an array', { path: 'history.messages' })
  if (array.value === undefined) {
    return errCode('ARCHIVE_CORRUPTED', 'history.messages is missing', { path: 'history.messages' })
  }
  if (array.value.length > LIMITS.maxMessages) {
    return errCode('ARCHIVE_CORRUPTED', 'message count exceeds the configured limit', {
      path: 'history.messages',
      detail: { limit: LIMITS.maxMessages },
    })
  }
  const messages: ImportedMessage[] = []
  const seen = new Set<string>()
  for (let index = 0; index < array.value.length; index += 1) {
    const message = validateMessage(array.value[index], index)
    if (!message.ok) return message
    if (seen.has(message.value.id)) {
      return errCode('ARCHIVE_CORRUPTED', 'message id is duplicated', { path: `history.messages[${index}].id` })
    }
    seen.add(message.value.id)
    messages.push(message.value)
  }
  return ok({ kind: 'messages', completeness: value.completeness, messages })
}

/**
 * Validate one stored message.
 * @param value - candidate value.
 * @param index - position used for field paths.
 * @returns the message or `ARCHIVE_CORRUPTED`.
 */
function validateMessage(value: unknown, index: number): Result<ImportedMessage> {
  const path = `history.messages[${index}]`
  if (!isPlainObject(value)) {
    return errCode('ARCHIVE_CORRUPTED', 'message is not an object', { path })
  }
  if (typeof value.id !== 'string' || value.id === '') {
    return errCode('ARCHIVE_CORRUPTED', 'message id is missing', { path: `${path}.id` })
  }
  if (value.role !== 'user' && value.role !== 'assistant') {
    return errCode('ARCHIVE_CORRUPTED', 'message role is not supported', { path: `${path}.role` })
  }
  if (typeof value.content !== 'string') {
    return errCode('ARCHIVE_CORRUPTED', 'message content is not a string', { path: `${path}.content` })
  }
  const message: ImportedMessage = { id: value.id, role: value.role, content: value.content }
  const createdAt = optionalIsoTimestamp(value.createdAt, `${path}.createdAt`)
  if (!createdAt.ok) return createdAt
  if (createdAt.value !== undefined) message.createdAt = createdAt.value
  const model = optionalString(value.model, `${path}.model`)
  if (!model.ok) return model
  if (model.value !== undefined) message.model = model.value
  const attachments = validateAttachments(value.attachments, path)
  if (!attachments.ok) return attachments
  if (attachments.value !== undefined) message.attachments = attachments.value
  return ok(message)
}

/**
 * Validate a stored attachment array.
 * @param value - candidate value.
 * @param messagePath - parent message path used in errors.
 * @returns the attachments, `undefined`, or `ARCHIVE_CORRUPTED`.
 */
function validateAttachments(value: unknown, messagePath: string): Result<ImportedAttachment[] | undefined> {
  if (value === undefined) return ok(undefined)
  if (!Array.isArray(value) || value.length > LIMITS.maxAttachmentsPerMessage) {
    return errCode('ARCHIVE_CORRUPTED', 'attachment list is invalid', { path: `${messagePath}.attachments` })
  }
  const attachments: ImportedAttachment[] = []
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index]
    const path = `${messagePath}.attachments[${index}]`
    if (!isPlainObject(entry) || typeof entry.name !== 'string' || entry.name === '') {
      return errCode('ARCHIVE_CORRUPTED', 'attachment name is missing', { path })
    }
    if (entry.availability !== 'metadata-only' && entry.availability !== 'unavailable') {
      return errCode('ARCHIVE_CORRUPTED', 'attachment availability is not supported', { path })
    }
    const attachment: ImportedAttachment = { name: entry.name, availability: entry.availability }
    if (entry.mimeType !== undefined) {
      if (typeof entry.mimeType !== 'string') {
        return errCode('ARCHIVE_CORRUPTED', 'attachment mimeType is not a string', { path })
      }
      attachment.mimeType = entry.mimeType
    }
    if (entry.sizeBytes !== undefined) {
      if (typeof entry.sizeBytes !== 'number' || !Number.isInteger(entry.sizeBytes) || entry.sizeBytes < 0) {
        return errCode('ARCHIVE_CORRUPTED', 'attachment sizeBytes is not a non-negative integer', { path })
      }
      attachment.sizeBytes = entry.sizeBytes
    }
    attachments.push(attachment)
  }
  return ok(attachments)
}
