/**
 * Strict UTF-8 decoding for selected files.
 *
 * Design note on the BOM: decoding is done with a *fatal* UTF-8 decoder, so
 * invalid bytes are an explicit error rather than a string full of U+FFFD
 * replacement characters saved as if it were the user's text. A leading UTF-8
 * BOM is consumed as the encoding signature it is (the decoder's default
 * behaviour), which means:
 *   - a BOM can never break `JSON.parse`;
 *   - the BOM never appears as an invisible character inside `original.text`;
 *   - `original.text` still contains every content byte of the file.
 * `hadBom` is reported so the UI (and the archive reader) can state what was
 * seen. Line endings are never rewritten: CRLF/LF survive decoding untouched.
 *
 * @module dsh-chat-bridge/import/decode-text
 */

import { errCode, ok, type Result } from '../shared/errors'

/** Result of decoding a byte buffer. */
export interface DecodedText {
  /** Decoded text; a leading BOM signature is not part of it. */
  text: string
  /** Whether the buffer started with the UTF-8 BOM signature (EF BB BF). */
  hadBom: boolean
}

/** The UTF-8 BOM signature bytes. */
const BOM_BYTES = [0xEF, 0xBB, 0xBF] as const

/**
 * Whether a buffer starts with the UTF-8 BOM signature.
 * @param bytes - raw input bytes.
 * @returns true when the first three bytes are the BOM.
 */
export function hasUtf8Bom(bytes: Uint8Array): boolean {
  if (bytes.byteLength < BOM_BYTES.length) return false
  return BOM_BYTES.every((byte, index) => bytes[index] === byte)
}

/**
 * Decode bytes as strict UTF-8.
 * @param bytes - raw file or pasted-input bytes.
 * @returns the decoded text plus BOM presence, or `INVALID_ENCODING`.
 */
export function decodeUtf8(bytes: Uint8Array): Result<DecodedText> {
  const hadBom = hasUtf8Bom(bytes)
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return ok({ text, hadBom })
  } catch {
    // The decoder's message may quote the offending bytes; keep the error
    // structural so nothing from the input can reach a log.
    return errCode('INVALID_ENCODING', 'input is not valid UTF-8', {
      detail: { byteLength: bytes.byteLength },
    })
  }
}

/**
 * Remove a leading U+FEFF from a string. Used on the *parse copy* only, for
 * callers that already hold text (e.g. a paste buffer) and for text that
 * arrived with a BOM character rather than BOM bytes.
 * @param text - candidate text.
 * @returns the text without a leading U+FEFF.
 */
export function stripLeadingBomChar(text: string): string {
  return text.startsWith('\uFEFF') ? text.slice(1) : text
}
