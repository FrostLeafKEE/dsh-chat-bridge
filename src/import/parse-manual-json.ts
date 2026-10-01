/**
 * Parser for the plugin's own versioned manual-history JSON format.
 *
 * This format is this plugin's public contract. It is **not** a DeepSeek
 * export format: no official export shape is guessed at or accepted here. An
 * unknown JSON document is reported as unsupported so the user can choose to
 * re-read it as raw text; the importer never guesses fields and then claims a
 * faithful restore.
 *
 * @module dsh-chat-bridge/import/parse-manual-json
 */

import type { ImportedAttachment, ImportedMessage, MessageRole } from '../shared/contracts'
import { errCode, ok, type Result } from '../shared/errors'
import { LIMITS, utf8ByteLength } from '../shared/limits'
import {
  isPlainObject,
  optionalArray,
  optionalIsoTimestamp,
  optionalNonNegativeInteger,
  optionalString,
  rejectUnknownKeys,
  requiredArray,
  requiredString,
} from './guard'
import { validateConversationId, validateSourceUrl } from './source-url'
import { stripLeadingBomChar } from './decode-text'

/** `format` value of the manual-history document. */
export const MANUAL_HISTORY_FORMAT = 'dsh-chat-bridge.manual-history'

/** `format` value of a full local-archive document (see `archive-file.ts`). */
export const ARCHIVE_FORMAT = 'dsh-chat-bridge.archive'

/** Schema version this build writes and accepts. */
export const MANUAL_HISTORY_SCHEMA_VERSION = 1

/** Root fields of the manual-history document. */
const ROOT_KEYS = ['format', 'schemaVersion', 'title', 'source', 'completeness', 'messages'] as const
/** Fields of the optional `source` object. */
const SOURCE_KEYS = ['url', 'conversationId'] as const
/** Fields of one message. */
const MESSAGE_KEYS = ['id', 'role', 'content', 'createdAt', 'model', 'attachments'] as const
/** Fields of one attachment entry. */
const ATTACHMENT_KEYS = ['name', 'mimeType', 'sizeBytes', 'availability'] as const

/** A parsed, validated manual-history document. */
export interface ParsedManualHistory {
  /** Absent when the document had no usable title; the caller applies its own default. */
  title?: string
  source: {
    url?: string
    conversationId?: string
  }
  completeness: 'user-supplied' | 'partial'
  messages: ImportedMessage[]
}

/**
 * Whether a JSON document announces the full local-archive wrapper.
 * Used to route a picked `.json` file to the right parser.
 * @param text - JSON text.
 * @returns true when the document's `format` field is the archive wrapper.
 */
export function looksLikeArchiveDocument(text: string): boolean {
  const parsed = safeParse(stripLeadingBomChar(text))
  if (!parsed.ok) return false
  return isPlainObject(parsed.value) && parsed.value.format === ARCHIVE_FORMAT
}

/**
 * Parse JSON without leaking the input through the error message.
 * @param text - JSON text.
 * @returns the parsed value or `INVALID_JSON`.
 */
function safeParse(text: string): Result<unknown> {
  try {
    return ok(JSON.parse(text) as unknown)
  } catch {
    // JSON.parse's message may quote a fragment of the document; keep only the
    // structural fact.
    return errCode('INVALID_JSON', 'input is not valid JSON', { detail: { byteLength: utf8ByteLength(text) } })
  }
}

/**
 * Parse and validate a manual-history document.
 *
 * Byte limits are checked here as well as at the input boundary, so a caller
 * that skipped the byte gate still cannot store an oversized archive.
 * @param text - the document text (already decoded from UTF-8).
 * @returns the validated history or a precise error.
 */
export function parseManualHistoryJson(text: string): Result<ParsedManualHistory> {
  const bytes = utf8ByteLength(text)
  if (bytes > LIMITS.manualInputBytes) {
    return errCode('INPUT_TOO_LARGE', 'input exceeds the manual-input byte limit', {
      detail: { limit: LIMITS.manualInputBytes, actual: bytes },
    })
  }
  const parsed = safeParse(stripLeadingBomChar(text))
  if (!parsed.ok) return parsed
  const root = parsed.value
  if (!isPlainObject(root)) {
    return errCode('INVALID_HISTORY', 'manual history must be a JSON object', { path: '' })
  }

  // Format and version are checked first: a foreign JSON document must be
  // reported as "this format is not supported" so the user can choose to
  // re-read it as raw text, rather than as a field-level complaint about a
  // schema it never claimed to follow.
  const format = root.format
  if (format === undefined) {
    return errCode('UNSUPPORTED_FORMAT', 'document has no format field', { path: 'format' })
  }
  if (typeof format !== 'string' || format !== MANUAL_HISTORY_FORMAT) {
    return errCode('UNSUPPORTED_FORMAT', 'document format is not the supported manual-history format', {
      path: 'format',
      ...safeLiteralDetail(format),
    })
  }
  const version = root.schemaVersion
  if (version === undefined) {
    return errCode('UNSUPPORTED_VERSION', 'document has no schemaVersion field', { path: 'schemaVersion' })
  }
  if (version !== MANUAL_HISTORY_SCHEMA_VERSION) {
    return errCode('UNSUPPORTED_VERSION', 'document schemaVersion is not supported by this build', {
      path: 'schemaVersion',
      ...safeLiteralDetail(version),
    })
  }

  const knownRoot = rejectUnknownKeys(root, ROOT_KEYS, '')
  if (!knownRoot.ok) return knownRoot

  const titleResult = optionalString(root.title, 'title')
  if (!titleResult.ok) return titleResult
  const source = parseSource(root.source)
  if (!source.ok) return source
  const completeness = parseCompleteness(root.completeness)
  if (!completeness.ok) return completeness
  const messages = parseMessages(root.messages)
  if (!messages.ok) return messages

  const result: ParsedManualHistory = {
    source: source.value,
    completeness: completeness.value,
    messages: messages.value,
  }
  if (titleResult.value !== undefined) result.title = titleResult.value
  return ok(result)
}

/**
 * Include a scalar literal in the error detail only when it is a short, safe
 * identifier — never a fragment of user prose.
 * @param value - raw field value.
 * @returns a detail object, or an empty object when the value is not safe to echo.
 */
function safeLiteralDetail(value: unknown): { detail?: Record<string, string | number> } {
  if (typeof value === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(value)) return { detail: { found: value } }
  if (typeof value === 'number' && Number.isFinite(value)) return { detail: { found: value } }
  return {}
}

/**
 * Validate the optional `source` object.
 * @param value - raw `source` value.
 * @returns the normalized source, or an error.
 */
function parseSource(value: unknown): Result<ParsedManualHistory['source']> {
  if (value === undefined) return ok({})
  if (!isPlainObject(value)) {
    return errCode('INVALID_HISTORY', 'source must be an object', { path: 'source' })
  }
  const known = rejectUnknownKeys(value, SOURCE_KEYS, 'source')
  if (!known.ok) return known
  const source: ParsedManualHistory['source'] = {}
  const urlRaw = optionalString(value.url, 'source.url')
  if (!urlRaw.ok) return urlRaw
  if (urlRaw.value !== undefined) {
    const url = validateSourceUrl(urlRaw.value)
    if (!url.ok) return url
    source.url = url.value
  }
  const idRaw = optionalString(value.conversationId, 'source.conversationId')
  if (!idRaw.ok) return idRaw
  if (idRaw.value !== undefined) {
    const id = validateConversationId(idRaw.value)
    if (!id.ok) return id
    source.conversationId = id.value
  }
  return ok(source)
}

/**
 * Validate the optional `completeness` field.
 *
 * Absent means `user-supplied`, which is the honest reading for a document a
 * user handed to the importer; it still never claims a full web history.
 * @param value - raw `completeness` value.
 * @returns the accepted completeness or an error.
 */
function parseCompleteness(value: unknown): Result<'user-supplied' | 'partial'> {
  if (value === undefined) return ok('user-supplied')
  if (value !== 'user-supplied' && value !== 'partial') {
    return errCode('INVALID_HISTORY', 'completeness must be user-supplied or partial', {
      path: 'completeness',
    })
  }
  return ok(value)
}

/**
 * Validate the required `messages` array: order, ids, roles, content, and the
 * optional per-message fields.
 * @param value - raw `messages` value.
 * @returns the validated messages in source order.
 */
function parseMessages(value: unknown): Result<ImportedMessage[]> {
  const array = requiredArray(value, 'messages')
  if (!array.ok) return array
  if (array.value.length > LIMITS.maxMessages) {
    return errCode('INPUT_TOO_LARGE', 'message count exceeds the configured limit', {
      path: 'messages',
      detail: { limit: LIMITS.maxMessages, actual: array.value.length },
    })
  }
  const messages: ImportedMessage[] = []
  const seenIds = new Map<string, number>()
  for (let index = 0; index < array.value.length; index += 1) {
    const result = parseMessage(array.value[index], index)
    if (!result.ok) return result
    const message = result.value
    const previous = seenIds.get(message.id)
    if (previous !== undefined) {
      return errCode('INVALID_HISTORY', 'message id is duplicated', {
        path: `messages[${index}].id`,
        detail: { firstIndex: previous },
      })
    }
    seenIds.set(message.id, index)
    messages.push(message)
  }
  return ok(messages)
}

/**
 * Validate one message object.
 * @param value - raw message value.
 * @param index - position in the source array, used for field paths.
 * @returns the validated message or an error.
 */
function parseMessage(value: unknown, index: number): Result<ImportedMessage> {
  const path = `messages[${index}]`
  if (!isPlainObject(value)) {
    return errCode('INVALID_HISTORY', 'message must be an object', { path })
  }
  const known = rejectUnknownKeys(value, MESSAGE_KEYS, path)
  if (!known.ok) return known

  const id = requiredString(value.id, `${path}.id`, LIMITS.maxMessageIdLength)
  if (!id.ok) return id
  const role = parseRole(value.role, `${path}.role`)
  if (!role.ok) return role
  if (typeof value.content !== 'string') {
    return errCode('INVALID_HISTORY', 'message content is required and must be a string', {
      path: `${path}.content`,
      detail: { actual: typeof value.content },
    })
  }
  const createdAt = optionalIsoTimestamp(value.createdAt, `${path}.createdAt`)
  if (!createdAt.ok) return createdAt
  const model = optionalString(value.model, `${path}.model`)
  if (!model.ok) return model
  if (model.value !== undefined && [...model.value].length > LIMITS.maxModelLabelLength) {
    return errCode('INVALID_HISTORY', 'model label exceeds the configured length limit', {
      path: `${path}.model`,
    })
  }
  const attachments = parseAttachments(value.attachments, path)
  if (!attachments.ok) return attachments

  const message: ImportedMessage = { id: id.value, role: role.value, content: value.content }
  if (createdAt.value !== undefined) message.createdAt = createdAt.value
  if (model.value !== undefined) message.model = model.value
  if (attachments.value !== undefined) message.attachments = attachments.value
  return ok(message)
}

/**
 * Validate a message role. `system`, `developer`, `tool`, and anything else are
 * errors: the importer never promotes a role and never drops one silently.
 * @param value - raw `role` value.
 * @param path - field path used in the error.
 * @returns `user`/`assistant`, or an error.
 */
function parseRole(value: unknown, path: string): Result<MessageRole> {
  if (value !== 'user' && value !== 'assistant') {
    return errCode('INVALID_HISTORY', 'role must be user or assistant', { path })
  }
  return ok(value)
}

/**
 * Validate an optional attachment array.
 * @param value - raw `attachments` value.
 * @param messagePath - parent message path used in errors.
 * @returns the validated attachments, `undefined`, or an error.
 */
function parseAttachments(value: unknown, messagePath: string): Result<ImportedAttachment[] | undefined> {
  const array = optionalArray(value, `${messagePath}.attachments`)
  if (!array.ok) return array
  if (array.value === undefined) return ok(undefined)
  if (array.value.length > LIMITS.maxAttachmentsPerMessage) {
    return errCode('INPUT_TOO_LARGE', 'attachment count exceeds the configured limit', {
      path: `${messagePath}.attachments`,
      detail: { limit: LIMITS.maxAttachmentsPerMessage, actual: array.value.length },
    })
  }
  const attachments: ImportedAttachment[] = []
  for (let index = 0; index < array.value.length; index += 1) {
    const result = parseAttachment(array.value[index], `${messagePath}.attachments[${index}]`)
    if (!result.ok) return result
    attachments.push(result.value)
  }
  return ok(attachments)
}

/**
 * Validate one attachment entry. Only metadata is ever kept; no link is
 * followed and no file content is invented.
 * @param value - raw attachment value.
 * @param path - field path used in the error.
 * @returns the validated attachment or an error.
 */
function parseAttachment(value: unknown, path: string): Result<ImportedAttachment> {
  if (!isPlainObject(value)) {
    return errCode('INVALID_HISTORY', 'attachment must be an object', { path })
  }
  const known = rejectUnknownKeys(value, ATTACHMENT_KEYS, path)
  if (!known.ok) return known
  const name = requiredString(value.name, `${path}.name`, LIMITS.maxAttachmentNameLength)
  if (!name.ok) return name
  const mimeType = optionalString(value.mimeType, `${path}.mimeType`)
  if (!mimeType.ok) return mimeType
  const sizeBytes = optionalNonNegativeInteger(value.sizeBytes, `${path}.sizeBytes`)
  if (!sizeBytes.ok) return sizeBytes
  const availability = value.availability
  if (availability !== undefined && availability !== 'metadata-only' && availability !== 'unavailable') {
    return errCode('INVALID_HISTORY', 'attachment availability must be metadata-only or unavailable', {
      path: `${path}.availability`,
    })
  }
  const attachment: ImportedAttachment = {
    name: name.value,
    // Only metadata is ever held; absent means the source gave no hint either way.
    availability: availability === 'unavailable' ? 'unavailable' : 'metadata-only',
  }
  if (mimeType.value !== undefined) attachment.mimeType = mimeType.value
  if (sizeBytes.value !== undefined) attachment.sizeBytes = sizeBytes.value
  return ok(attachment)
}
