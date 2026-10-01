/**
 * Title normalization and export file-name sanitization.
 *
 * A title is user-visible metadata only: it never becomes a path, never reaches
 * storage as an unvalidated value, and never touches the archive fingerprint.
 *
 * @module dsh-chat-bridge/import/title
 */

import { errCode, ok, type Result } from '../shared/errors'
import { LIMITS, codePointLength } from '../shared/limits'

/** Fallback title when the source has neither a title nor a usable file name. */
export const FALLBACK_TITLE = '导入的聊天'

/**
 * Characters forbidden in Windows/POSIX file names, plus control characters.
 * The control-character range is deliberate: stripping it is what keeps a
 * user-chosen title from becoming an odd file name on export.
 */
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const UNSAFE_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g

/** Windows reserved device names (compared case-insensitively, extension ignored). */
const RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
])

/**
 * Validate and normalize a user-supplied title.
 *
 * Surrounding whitespace is trimmed here (a title is a label, not archive
 * content, so trimming cannot lose imported data). The result is always
 * non-empty and within {@link LIMITS.maxTitleLength} code points.
 * @param raw - candidate title.
 * @returns the normalized title, or `INVALID_TITLE`.
 */
export function normalizeTitle(raw: string): Result<string> {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return errCode('INVALID_TITLE', 'title is empty after trimming', { path: 'title' })
  }
  const length = codePointLength(trimmed)
  if (length > LIMITS.maxTitleLength) {
    return errCode('INVALID_TITLE', 'title exceeds the configured length limit', {
      path: 'title',
      detail: { limit: LIMITS.maxTitleLength, actual: length },
    })
  }
  return ok(trimmed)
}

/**
 * Derive a starting title from a picked file's base name.
 *
 * Only the base name is used, so no directory from the user's machine can end
 * up in the archive.
 * @param fileName - base file name (as reported by the file input).
 * @returns a usable starting title.
 */
export function titleFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? ''
  const withoutExtension = base.replace(/\.(json|txt|md|markdown)$/i, '')
  const candidate = withoutExtension.trim()
  if (candidate === '') return FALLBACK_TITLE
  const clipped = [...candidate].slice(0, LIMITS.maxTitleLength).join('')
  return clipped.trim() === '' ? FALLBACK_TITLE : clipped
}

/**
 * Turn a title into a safe download file name (no path separators, no control
 * characters, not a reserved device name, bounded length).
 * @param title - archive title.
 * @param extension - file extension including the dot, e.g. `.json`.
 * @returns a file name safe to hand to a download.
 */
export function safeExportFileName(title: string, extension: string): string {
  let base = title.replace(UNSAFE_FILE_CHARS, '_').replace(/[. ]+$/g, '').trim()
  if (base === '') base = 'chat-archive'
  if (RESERVED_NAMES.has(base.toLowerCase())) base = `${base}_archive`
  const clipped = [...base].slice(0, LIMITS.maxTitleLength).join('').trim()
  return `${clipped === '' ? 'chat-archive' : clipped}${extension}`
}
