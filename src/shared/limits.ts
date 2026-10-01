/**
 * Central limits for the basic-stage plugin. Every size/count gate reads from
 * here so a limit is stated once and can be asserted by tests and documented
 * once in `docs/CONTRACTS.md`.
 *
 * All byte limits are UTF-8 byte counts, never string `.length` (which counts
 * UTF-16 code units and would let a 4-byte emoji pass a "5 MiB" gate).
 *
 * @module dsh-chat-bridge/shared/limits
 */

/** The MiB unit used by the public limits, spelled out to keep the numbers auditable. */
const MIB = 1024 * 1024

/** Hard limits enforced before and after parsing. */
export const LIMITS = {
  /**
   * Largest accepted plain history input (`.json` manual format, `.txt`, `.md`,
   * or pasted text), measured in UTF-8 bytes.
   */
  manualInputBytes: 5 * MIB,
  /**
   * Largest accepted full local-archive JSON file. It carries both the raw
   * original text and the normalized history, so it is larger than the plain
   * input gate; the `original.text` inside it is still checked against
   * {@link LIMITS.manualInputBytes}.
   */
  archiveFileBytes: 64 * MIB,
  /** Largest accepted number of structured messages in one import. */
  maxMessages: 5000,
  /** Largest accepted archive title, in Unicode code points. */
  maxTitleLength: 200,
  /** Largest accepted number of attachments on one message (metadata only). */
  maxAttachmentsPerMessage: 64,
  /** Largest accepted length of one attachment name. */
  maxAttachmentNameLength: 260,
  /** Largest accepted length of a source URL. */
  maxSourceUrlLength: 2048,
  /** Largest accepted length of a conversation id. */
  maxConversationIdLength: 256,
  /** Largest accepted length of a message `id`. */
  maxMessageIdLength: 128,
  /** Largest accepted length of a message `model` label. */
  maxModelLabelLength: 128,
} as const

/** Message-count style limits that are compared as integers. */
export type NumericLimitKey = 'maxMessages' | 'maxTitleLength' | 'maxAttachmentsPerMessage'
  | 'maxAttachmentNameLength' | 'maxSourceUrlLength' | 'maxConversationIdLength'
  | 'maxMessageIdLength' | 'maxModelLabelLength'

/** Byte-count limits, compared against encoded UTF-8 length. */
export type ByteLimitKey = 'manualInputBytes' | 'archiveFileBytes'

/**
 * Encode text as UTF-8 and return its byte length.
 * @param text - any string; surrogate pairs count as their UTF-8 width.
 * @returns the UTF-8 byte length.
 */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

/**
 * Count Unicode code points (what a user perceives as "characters"), so an
 * emoji title is not charged twice.
 * @param text - any string.
 * @returns the code-point count.
 */
export function codePointLength(text: string): number {
  let count = 0
  for (const _ of text) count += 1
  return count
}
