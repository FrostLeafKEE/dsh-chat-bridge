/** Canonical, bounded webpage capture format. Contains no raw HTML or page storage. */
import type { WebConversationCapture } from '../shared/contracts'
import { errCode, ok, type Result } from '../shared/errors'
import { LIMITS, utf8ByteLength } from '../shared/limits'
import { isPlainObject, rejectUnknownKeys } from './guard'
import { MANUAL_HISTORY_FORMAT, parseManualHistoryJson } from './parse-manual-json'
import { normalizeTitle } from './title'

export const WEB_CAPTURE_FORMAT = 'dsh-chat-bridge.web-capture'
export const WEB_CAPTURE_ADAPTER = 'deepseek-dom-2026-10-01'

/** Validate an untrusted page result using the same message/attachment limits as manual imports. */
export function validateWebCapture(value: unknown): Result<WebConversationCapture> {
  if (!isPlainObject(value)) return errCode('INVALID_HISTORY', 'web capture must be an object')
  const keys = rejectUnknownKeys(value, ['adapter', 'url', 'title', 'scope', 'completeness', 'messages'], 'capture')
  if (!keys.ok) return keys
  if (value.adapter !== WEB_CAPTURE_ADAPTER || value.scope !== 'rendered-current-branch'
    || value.completeness !== 'partial' || typeof value.url !== 'string' || typeof value.title !== 'string') {
    return errCode('INVALID_HISTORY', 'web capture metadata is unsupported')
  }
  const title = normalizeTitle(value.title)
  if (!title.ok) return title
  if (!Array.isArray(value.messages)) return errCode('INVALID_HISTORY', 'web capture messages must be an array')
  if (value.messages.length > LIMITS.maxMessages) return errCode('INPUT_TOO_LARGE', 'web capture message count exceeds the limit')
  let contentBytes = 0
  for (const message of value.messages) {
    if (!isPlainObject(message) || typeof message.content !== 'string') return errCode('INVALID_HISTORY', 'web message content is invalid')
    contentBytes += utf8ByteLength(message.content)
    if (contentBytes > LIMITS.manualInputBytes) return errCode('INPUT_TOO_LARGE', 'web capture text exceeds the input limit')
  }
  const parsed = parseManualHistoryJson(JSON.stringify({ format: MANUAL_HISTORY_FORMAT, schemaVersion: 1,
    title: title.value, source: { url: value.url }, completeness: 'partial', messages: value.messages }))
  if (!parsed.ok) return parsed
  if (parsed.value.messages.length === 0) return errCode('WEB_CAPTURE_EMPTY', 'web capture contains no messages')
  if (parsed.value.source.url === undefined) return errCode('UNSAFE_SOURCE_URL', 'web capture source is required')
  return ok({ adapter: WEB_CAPTURE_ADAPTER, url: parsed.value.source.url, title: title.value,
    scope: 'rendered-current-branch', completeness: 'partial', messages: parsed.value.messages })
}

/** Stable bytes exclude the local capture clock, so reading unchanged content deduplicates. */
export function serializeWebCapture(capture: WebConversationCapture): string {
  return JSON.stringify({ format: WEB_CAPTURE_FORMAT, schemaVersion: 1, capture })
}

export function parseWebCapture(text: string): Result<WebConversationCapture> {
  if (utf8ByteLength(text) > LIMITS.manualInputBytes) return errCode('INPUT_TOO_LARGE', 'web capture exceeds the input limit')
  let value: unknown
  try { value = JSON.parse(text) as unknown } catch { return errCode('INVALID_JSON', 'web capture JSON is invalid') }
  if (!isPlainObject(value) || value.format !== WEB_CAPTURE_FORMAT || value.schemaVersion !== 1) {
    return errCode('UNSUPPORTED_FORMAT', 'web capture format is unsupported')
  }
  const keys = rejectUnknownKeys(value, ['format', 'schemaVersion', 'capture'], 'webCapture')
  return keys.ok ? validateWebCapture(value.capture) : keys
}
