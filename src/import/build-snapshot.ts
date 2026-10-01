/**
 * Turns one manual input into a saveable {@link ChatSnapshot}.
 *
 * This is the single place where "what the user handed us" becomes "what we
 * store": the original text is kept verbatim, the normalized history is derived
 * only from that text, and the content fingerprint is computed from the same
 * pair. The function is pure apart from id/time generation, so the import
 * wizard can build a preview without writing anything to storage.
 *
 * @module dsh-chat-bridge/import/build-snapshot
 */

import type {
  ChatSnapshot,
  Completeness,
  ImportedHistory,
  ImportedMessage,
  ManualFormat,
  SnapshotSource,
  SourceKind,
  WebConversationCapture,
} from '../shared/contracts'
import { errCode, ok, type Result } from '../shared/errors'
import { newLocalId } from '../shared/ids'
import { codePointLength, utf8ByteLength } from '../shared/limits'
import { fingerprintOf } from './fingerprint'
import { parseManualHistoryJson } from './parse-manual-json'
import { parseSourceText } from './parse-source-text'
import { FALLBACK_TITLE, normalizeTitle, titleFromFileName } from './title'
import { parseWebCapture, serializeWebCapture, validateWebCapture } from './web-capture'

/** One raw manual input, already decoded from UTF-8 by the caller. */
export interface ManualInput {
  /** Format the user selected (or the one implied by the picked file). */
  format: ManualFormat
  /** The decoded full text. */
  text: string
  /** Base file name when the input came from a file; never a full path. */
  fileName?: string
  /** Title the user typed in the preview; when absent a default is derived. */
  title?: string
}

/** Attachment accounting shown in previews. */
export interface AttachmentSummary {
  /** Messages carrying at least one attachment. */
  messagesWithAttachments: number
  /** Total attachment entries. */
  total: number
  /** Entries marked `unavailable`. */
  unavailable: number
  /** Names of the unavailable entries. */
  unavailableNames: string[]
}

/** Everything a preview screen needs, derived from a built snapshot. */
export interface ImportPreview {
  title: string
  format: ManualFormat
  sourceKind: SourceKind
  fileName?: string
  sourceUrl?: string
  hasConversationId: boolean
  historyKind: 'messages' | 'source-text'
  /** Message count for structured history. */
  messageCount?: number
  /** Code points of the source text for unstructured history. */
  sourceTextLength?: number
  /** UTF-8 bytes of the original text. */
  originalBytes: number
  completeness: Completeness
  attachments: AttachmentSummary
  /** Locale keys for caveats the user must see before saving. */
  warningKeys: string[]
}

/** A built snapshot plus its preview projection. */
export interface BuiltImport {
  snapshot: ChatSnapshot
  preview: ImportPreview
}

/** Source kind implied by a manual format. */
const SOURCE_KIND: Record<ManualFormat, SourceKind> = {
  json: 'manual-json',
  text: 'manual-text',
  markdown: 'manual-markdown',
}

/** Locale keys for the standing caveats of each history kind. */
const STRUCTURED_WARNINGS = ['import.warning.userSupplied', 'import.warning.attachmentsMetadataOnly'] as const
const SOURCE_TEXT_WARNINGS = ['import.warning.unverifiedRoles', 'import.warning.localArchiveOnly'] as const

/**
 * Reduce a picked file name to its base name.
 * @param fileName - raw name reported by the file input.
 * @returns the base name, or `undefined`.
 */
export function baseFileName(fileName: string | undefined): string | undefined {
  if (fileName === undefined) return undefined
  const base = fileName.split(/[\\/]/).pop()
  return base === undefined || base === '' ? undefined : base
}

/**
 * Count attachments across a structured history.
 * @param messages - imported messages.
 * @returns attachment accounting for previews.
 */
export function summarizeAttachments(messages: readonly ImportedMessage[]): AttachmentSummary {
  let messagesWithAttachments = 0
  let total = 0
  let unavailable = 0
  const unavailableNames: string[] = []
  for (const message of messages) {
    const attachments = message.attachments ?? []
    if (attachments.length > 0) messagesWithAttachments += 1
    for (const attachment of attachments) {
      total += 1
      if (attachment.availability === 'unavailable') {
        unavailable += 1
        unavailableNames.push(attachment.name)
      }
    }
  }
  return { messagesWithAttachments, total, unavailable, unavailableNames }
}

/**
 * Build the preview projection for a snapshot.
 * @param snapshot - a built snapshot.
 * @returns the preview shown before saving and in the work-handoff dialog.
 */
export function previewOf(snapshot: ChatSnapshot): ImportPreview {
  const history = snapshot.history
  const attachments = summarizeAttachments(history.kind === 'messages' ? history.messages : [])
  const preview: ImportPreview = {
    title: snapshot.title,
    format: snapshot.original.format,
    sourceKind: snapshot.source.kind,
    originalBytes: utf8ByteLength(snapshot.original.text),
    completeness: history.completeness,
    historyKind: history.kind,
    attachments,
    warningKeys: snapshot.source.kind === 'web-dom' ? ['capture.scopeNote', 'capture.exclusions']
      : history.kind === 'messages' ? [...STRUCTURED_WARNINGS] : [...SOURCE_TEXT_WARNINGS],
    hasConversationId: snapshot.source.conversationId !== undefined,
  }
  if (snapshot.source.fileName !== undefined) preview.fileName = snapshot.source.fileName
  if (snapshot.source.url !== undefined) preview.sourceUrl = snapshot.source.url
  if (history.kind === 'messages') preview.messageCount = history.messages.length
  else preview.sourceTextLength = codePointLength(history.text)
  return preview
}

/**
 * Parse one manual input into a normalized history.
 * @param input - decoded input.
 * @returns the history plus any source metadata the input declared.
 */
function normalizeHistory(
  input: ManualInput,
): Result<{ history: ImportedHistory; source: SnapshotSource; declaredTitle?: string }> {
  const fileName = baseFileName(input.fileName)
  const baseSource: SnapshotSource = { kind: SOURCE_KIND[input.format] }
  if (fileName !== undefined) baseSource.fileName = fileName

  if (input.format === 'json') {
    const parsed = parseManualHistoryJson(input.text)
    if (!parsed.ok) return parsed
    if (parsed.value.source.url !== undefined) baseSource.url = parsed.value.source.url
    if (parsed.value.source.conversationId !== undefined) {
      baseSource.conversationId = parsed.value.source.conversationId
    }
    const result: { history: ImportedHistory; source: SnapshotSource; declaredTitle?: string } = {
      history: {
        kind: 'messages',
        completeness: parsed.value.completeness,
        messages: parsed.value.messages,
      },
      source: baseSource,
    }
    const declared = parsed.value.title
    if (declared !== undefined) result.declaredTitle = declared
    return ok(result)
  }

  const textResult = parseSourceText(input.text, input.format)
  if (!textResult.ok) return textResult
  return ok({
    history: { kind: 'source-text', completeness: 'unknown', text: textResult.value.text },
    source: baseSource,
  })
}

/**
 * Build a snapshot from one manual input.
 *
 * The returned snapshot is complete and validated, but nothing is stored: the
 * caller decides after the preview whether to save it.
 * @param input - decoded input.
 * @param now - injectable clock (used by tests).
 * @returns the snapshot plus preview, or a precise error.
 */
export async function buildImport(input: ManualInput, now: Date = new Date()): Promise<Result<BuiltImport>> {
  const normalized = normalizeHistory(input)
  if (!normalized.ok) return normalized

  const titleResult = resolveTitle(input.title, normalized.value.declaredTitle, input.fileName)
  if (!titleResult.ok) return titleResult

  const fingerprint = await fingerprintOf(input.format, input.text)
  if (!fingerprint.ok) return fingerprint

  const timestamp = now.toISOString()
  const snapshot: ChatSnapshot = {
    schemaVersion: 1,
    archiveId: newLocalId(),
    fingerprint: fingerprint.value,
    title: titleResult.value,
    importedAt: timestamp,
    updatedAt: timestamp,
    source: normalized.value.source,
    original: { format: input.format, text: input.text },
    history: normalized.value.history,
  }
  return ok({ snapshot, preview: previewOf(snapshot) })
}

/** Build a schema v2 web archive without changing or migrating existing v1 manual archives. */
export async function buildWebImport(capture: WebConversationCapture, now: Date = new Date()): Promise<Result<BuiltImport>> {
  const checked = validateWebCapture(capture)
  if (!checked.ok) return checked
  const text = serializeWebCapture(checked.value)
  const bounded = parseWebCapture(text)
  if (!bounded.ok) return bounded
  const fingerprint = await fingerprintOf('json', text)
  if (!fingerprint.ok) return fingerprint
  const timestamp = now.toISOString()
  const snapshot: ChatSnapshot = { schemaVersion: 2, archiveId: newLocalId(), fingerprint: fingerprint.value,
    title: checked.value.title, importedAt: timestamp, updatedAt: timestamp,
    source: { kind: 'web-dom', url: checked.value.url,
      capture: { adapter: checked.value.adapter, scope: checked.value.scope, capturedAt: timestamp } },
    original: { format: 'json', text },
    history: { kind: 'messages', completeness: 'partial', messages: checked.value.messages } }
  return ok({ snapshot, preview: previewOf(snapshot) })
}

/**
 * Choose the archive title: the user's typed title wins, then the document's
 * declared title, then the file name, then the neutral fallback.
 * @param typed - title entered in the preview step.
 * @param declared - title declared inside a manual-history document.
 * @param fileName - picked file name.
 * @returns the normalized title or `INVALID_TITLE`.
 */
function resolveTitle(typed: string | undefined, declared: string | undefined, fileName: string | undefined): Result<string> {
  for (const candidate of [typed, declared]) {
    if (candidate === undefined) continue
    return normalizeTitle(candidate)
  }
  const derived = titleFromFileName(fileName ?? '')
  return ok(derived === '' ? FALLBACK_TITLE : derived)
}

/**
 * Rebuild the expected fingerprint of a snapshot and compare it with the
 * stored one. Used by both the repository on write and the archive-file reader.
 * @param snapshot - snapshot to verify.
 * @returns the recomputed fingerprint, or `ARCHIVE_CORRUPTED` on mismatch.
 */
export async function verifySnapshotFingerprint(snapshot: ChatSnapshot): Promise<Result<string>> {
  const computed = await fingerprintOf(snapshot.original.format, snapshot.original.text)
  if (!computed.ok) return computed
  if (computed.value !== snapshot.fingerprint) {
    return errCode('ARCHIVE_CORRUPTED', 'stored fingerprint does not match the original text', {
      path: 'fingerprint',
    })
  }
  return computed
}

/**
 * Re-derive the normalized history from a snapshot's original text and require
 * it to match what is stored. A record whose original and normalized halves
 * disagree is reported as corrupted instead of being trusted.
 * @param snapshot - snapshot to verify.
 * @returns success when the stored history is reproducible from the original.
 */
export function verifyHistoryConsistency(snapshot: ChatSnapshot): Result<undefined> {
  if (snapshot.schemaVersion === 2) {
    const parsed = parseWebCapture(snapshot.original.text)
    if (!parsed.ok) return parsed
    const capture = parsed.value
    if (snapshot.source.kind !== 'web-dom' || snapshot.original.format !== 'json'
      || snapshot.source.url !== capture.url || snapshot.source.capture?.adapter !== capture.adapter
      || snapshot.source.capture.scope !== capture.scope || snapshot.history.kind !== 'messages'
      || snapshot.history.completeness !== 'partial'
      || JSON.stringify(snapshot.history.messages) !== JSON.stringify(capture.messages)) {
      return errCode('ARCHIVE_CORRUPTED', 'web capture and normalized history differ')
    }
    return ok(undefined)
  }
  const input: ManualInput = { format: snapshot.original.format, text: snapshot.original.text }
  const normalized = normalizeHistory(input)
  if (!normalized.ok) return normalized
  const expected = normalized.value.history
  const stored = snapshot.history
  if (expected.kind !== stored.kind) {
    return errCode('ARCHIVE_CORRUPTED', 'stored history kind does not match the original text', {
      path: 'history.kind',
    })
  }
  if (expected.kind === 'messages' && stored.kind === 'messages') {
    if (expected.messages.length !== stored.messages.length) {
      return errCode('ARCHIVE_CORRUPTED', 'stored message count does not match the original text', {
        path: 'history.messages',
        detail: { expected: expected.messages.length, stored: stored.messages.length },
      })
    }
    for (let index = 0; index < expected.messages.length; index += 1) {
      const a = expected.messages[index]
      const b = stored.messages[index]
      if (a === undefined || b === undefined || a.id !== b.id || a.role !== b.role || a.content !== b.content) {
        return errCode('ARCHIVE_CORRUPTED', 'stored message does not match the original text', {
          path: `history.messages[${index}]`,
        })
      }
    }
    if (expected.completeness !== stored.completeness) {
      return errCode('ARCHIVE_CORRUPTED', 'stored completeness does not match the original text', {
        path: 'history.completeness',
      })
    }
    return ok(undefined)
  }
  if (expected.kind === 'source-text' && stored.kind === 'source-text') {
    if (expected.text !== stored.text) {
      return errCode('ARCHIVE_CORRUPTED', 'stored source text does not match the original text', {
        path: 'history.text',
      })
    }
    return ok(undefined)
  }
  return errCode('ARCHIVE_CORRUPTED', 'stored history does not match the original text', { path: 'history' })
}
