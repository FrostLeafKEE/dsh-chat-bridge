/**
 * Source URL vetting.
 *
 * A source URL is provenance metadata, never a navigation target for this
 * stage (the basic build opens no links at all). Even so it is validated
 * strictly: only the official chat host over HTTPS, no credentials in the
 * authority, no dangerous scheme. The validated value is what gets stored;
 * the raw text the user pasted stays in `original.text`.
 *
 * @module dsh-chat-bridge/import/source-url
 */

import { errCode, ok, type Result } from '../shared/errors'
import { LIMITS } from '../shared/limits'

/** The only accepted source host. */
export const SOURCE_HOST = 'chat.deepseek.com'

/** The canonical source page used when a target needs one and none was given. */
export const SOURCE_ORIGIN = `https://${SOURCE_HOST}/`

/**
 * Validate a user-supplied source URL.
 *
 * Rejections (all reported as `UNSAFE_SOURCE_URL`): non-HTTPS schemes, hosts
 * other than {@link SOURCE_HOST} (including sub-domain look-alikes),
 * credentials in the authority, and over-long values.
 * @param raw - candidate URL text.
 * @returns the normalized URL string, or `UNSAFE_SOURCE_URL`.
 */
export function validateSourceUrl(raw: string): Result<string> {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return errCode('UNSAFE_SOURCE_URL', 'source URL is empty', { path: 'source.url' })
  }
  if (trimmed.length > LIMITS.maxSourceUrlLength) {
    return errCode('UNSAFE_SOURCE_URL', 'source URL exceeds the configured length limit', {
      path: 'source.url',
      detail: { limit: LIMITS.maxSourceUrlLength },
    })
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return errCode('UNSAFE_SOURCE_URL', 'source URL is not parseable', { path: 'source.url' })
  }
  if (url.protocol !== 'https:') {
    return errCode('UNSAFE_SOURCE_URL', 'source URL scheme is not https', {
      path: 'source.url',
      detail: { scheme: url.protocol },
    })
  }
  if (url.username !== '' || url.password !== '') {
    return errCode('UNSAFE_SOURCE_URL', 'source URL carries credentials', { path: 'source.url' })
  }
  if (url.hostname !== SOURCE_HOST) {
    return errCode('UNSAFE_SOURCE_URL', 'source URL host is not the supported chat host', {
      path: 'source.url',
    })
  }
  // Drop the fragment: it is client-side view state, not provenance.
  url.hash = ''
  return ok(url.toString())
}

/**
 * Validate a source conversation id.
 * @param raw - candidate id text.
 * @returns the trimmed id, or `INVALID_HISTORY` when unusable.
 */
export function validateConversationId(raw: string): Result<string> {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return errCode('INVALID_HISTORY', 'conversationId is empty', { path: 'source.conversationId' })
  }
  if (trimmed.length > LIMITS.maxConversationIdLength) {
    return errCode('INVALID_HISTORY', 'conversationId exceeds the configured length limit', {
      path: 'source.conversationId',
      detail: { limit: LIMITS.maxConversationIdLength },
    })
  }
  return ok(trimmed)
}
