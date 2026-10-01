/**
 * Content fingerprint for duplicate detection.
 *
 * The digest input is fixed and documented so an archive imported by one build
 * deduplicates against the same archive imported by another:
 *
 * ```text
 * UTF-8 bytes of:  "manual-history:v1" NUL <format> NUL <original.text>
 * SHA-256, lowercase hex
 * ```
 *
 * Deliberately excluded from the digest: the archive id, import/update
 * timestamps, file name, title (including any rename), and source metadata.
 * A user renaming an archive must not change its identity, and re-importing the
 * same file must land on the existing archive.
 *
 * Equality is by exact original text: JSON that only differs in insignificant
 * whitespace is a *different* archive in this stage. No semantic dedupe.
 *
 * @module dsh-chat-bridge/import/fingerprint
 */

import { errCode, ok, type Result } from '../shared/errors'
import type { ManualFormat } from '../shared/contracts'

/** Domain-separation prefix, versioned independently of the archive schema. */
export const FINGERPRINT_PREFIX = 'manual-history:v1'

/** Separator byte placed between the digest input fields. */
const SEPARATOR = '\u0000'

/**
 * Build the exact UTF-8 digest input for a format/text pair.
 * @param format - the original input format.
 * @param originalText - the untouched original text.
 * @returns the digest input string.
 */
export function fingerprintInput(format: ManualFormat, originalText: string): string {
  return `${FINGERPRINT_PREFIX}${SEPARATOR}${format}${SEPARATOR}${originalText}`
}

/**
 * Compute the SHA-256 content fingerprint.
 * @param format - the original input format.
 * @param originalText - the untouched original text.
 * @returns lowercase hex digest, or `UNEXPECTED` when Web Crypto is unavailable.
 */
export async function fingerprintOf(format: ManualFormat, originalText: string): Promise<Result<string>> {
  const subtle = globalThis.crypto?.subtle
  if (subtle === undefined) {
    return errCode('UNEXPECTED', 'Web Crypto subtle digest is unavailable in this environment')
  }
  const bytes = new TextEncoder().encode(fingerprintInput(format, originalText))
  const digest = await subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return ok(hex)
}
