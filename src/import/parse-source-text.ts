/**
 * Parser for plain text and Markdown input.
 *
 * The whole input becomes one `source-text` block. Roles and turn boundaries
 * are unknown, and the importer does not guess them: it never splits on
 * "you:"/"assistant:" style markers and never cuts a Markdown code fence into
 * separate messages. The archive is labelled as unverified source text so a
 * later work handoff can present it as clearly-marked reference material.
 *
 * @module dsh-chat-bridge/import/parse-source-text
 */

import { errCode, ok, type Result } from '../shared/errors'
import { LIMITS, utf8ByteLength } from '../shared/limits'

/** Text-like manual formats. */
export type SourceTextFormat = 'text' | 'markdown'

/** A validated source-text input. */
export interface ParsedSourceText {
  format: SourceTextFormat
  /** The input verbatim: line endings, leading/trailing whitespace and all. */
  text: string
}

/**
 * Validate a plain-text or Markdown input.
 *
 * Nothing is normalized: no newline conversion, no trimming, no unescaping.
 * @param text - decoded input text.
 * @param format - which text-like format the user selected.
 * @returns the block or a precise error.
 */
export function parseSourceText(text: string, format: SourceTextFormat): Result<ParsedSourceText> {
  const bytes = utf8ByteLength(text)
  if (bytes > LIMITS.manualInputBytes) {
    return errCode('INPUT_TOO_LARGE', 'input exceeds the manual-input byte limit', {
      detail: { limit: LIMITS.manualInputBytes, actual: bytes },
    })
  }
  if (text === '') {
    return errCode('INVALID_HISTORY', 'source text is empty')
  }
  return ok({ format, text })
}

/**
 * Map a file name or paste mode onto a text-like format.
 * @param fileName - optional picked file name.
 * @param fallback - format to use when the name gives no hint.
 * @returns `markdown` for `.md`/`.markdown`, otherwise the fallback.
 */
export function textFormatFromFileName(
  fileName: string | undefined,
  fallback: SourceTextFormat = 'text',
): SourceTextFormat {
  if (fileName === undefined) return fallback
  return /\.(md|markdown)$/i.test(fileName) ? 'markdown' : fallback
}
