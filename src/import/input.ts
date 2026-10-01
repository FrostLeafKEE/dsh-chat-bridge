/**
 * The manual-input boundary: what a picked file or a paste may be, how it is
 * size-gated, and which format it is routed to.
 *
 * The gate runs on raw bytes *before* decoding and again inside the parsers, so
 * an oversized input is refused rather than truncated, and a caller that skips
 * one check is still caught by the other.
 *
 * @module dsh-chat-bridge/import/input
 */

import type { ManualFormat } from '../shared/contracts'
import { errCode, ok, type Result } from '../shared/errors'
import { LIMITS } from '../shared/limits'

/** Extensions this stage accepts. `.markdown` is accepted as the long form of `.md`. */
const FILE_EXTENSIONS: readonly { readonly pattern: RegExp; readonly format: ManualFormat }[] = [
  { pattern: /\.json$/i, format: 'json' },
  { pattern: /\.md$/i, format: 'markdown' },
  { pattern: /\.markdown$/i, format: 'markdown' },
  { pattern: /\.txt$/i, format: 'text' },
]

/** Which byte ceiling applies to an input. */
export type InputCeiling = 'manualInputBytes' | 'archiveFileBytes'

/**
 * Check a buffer against a ceiling before anything else happens.
 * @param byteLength - the buffer's UTF-8 byte length.
 * @param ceiling - which limit to apply.
 * @returns success, or `INPUT_TOO_LARGE` naming the limit.
 */
export function checkByteCeiling(byteLength: number, ceiling: InputCeiling): Result<undefined> {
  const limit = LIMITS[ceiling]
  if (byteLength > limit) {
    return errCode('INPUT_TOO_LARGE', 'input exceeds the configured byte limit', {
      detail: { limit, actual: byteLength, limitKey: ceiling },
    })
  }
  return ok(undefined)
}

/**
 * Route a picked file to a format by extension.
 * @param fileName - base file name reported by the file input.
 * @returns the format, or `UNSUPPORTED_FORMAT` for anything else.
 */
export function detectFormatFromFileName(fileName: string): Result<ManualFormat> {
  for (const { pattern, format } of FILE_EXTENSIONS) {
    if (pattern.test(fileName)) return ok(format)
  }
  return errCode('UNSUPPORTED_FORMAT', 'file extension is not one of .json, .txt or .md', {
    detail: { extensionSupported: false },
  })
}

/**
 * The input element's `accept` attribute, kept next to the accepted extensions
 * so the picker and the validator cannot drift apart.
 */
export const ACCEPT_ATTRIBUTE = '.json,.txt,.md,.markdown'
