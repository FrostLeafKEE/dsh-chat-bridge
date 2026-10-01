/**
 * The fingerprint rule is a published contract: the digest input is pinned
 * against an independent implementation (`node:crypto`) so a change to the rule
 * cannot slip through unnoticed.
 * @module dsh-chat-bridge/tests/fingerprint
 */

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { FINGERPRINT_PREFIX, fingerprintInput, fingerprintOf } from '../src/import/fingerprint'
import { expectOk } from './helpers'

/**
 * Compute the expected digest with Node's crypto, independently of Web Crypto.
 * @param format - the manual format.
 * @param text - the original text.
 * @returns lowercase hex SHA-256.
 */
function referenceDigest(format: string, text: string): string {
  const input = `${FINGERPRINT_PREFIX}\u0000${format}\u0000${text}`
  return createHash('sha256').update(Buffer.from(input, 'utf8')).digest('hex')
}

describe('fingerprintOf', () => {
  it('matches the documented digest input', () => {
    expect(fingerprintInput('text', 'hello')).toBe('manual-history:v1\u0000text\u0000hello')
  })

  it('matches an independent SHA-256 implementation', async () => {
    await Promise.all(([
      ['json', '{"a":1}'],
      ['text', '中文 🦀 with spaces  '],
      ['markdown', '# 标题\n\n```\ncode\n```'],
      ['text', ''],
    ] as const).map(async ([format, text]) => {
      const digest = expectOk(await fingerprintOf(format, text))
      expect(digest).toBe(referenceDigest(format, text))
      expect(digest).toMatch(/^[0-9a-f]{64}$/)
    }))
  })

  it('separates the fields so shifting text across the boundary cannot collide', async () => {
    const a = expectOk(await fingerprintOf('text', 'ab\u0000c'))
    const b = expectOk(await fingerprintOf('text', 'a\u0000bc'))
    expect(a).not.toBe(b)
  })

  it('changes when the format changes, even for identical text', async () => {
    const asText = expectOk(await fingerprintOf('text', 'same'))
    const asMarkdown = expectOk(await fingerprintOf('markdown', 'same'))
    expect(asText).not.toBe(asMarkdown)
  })

  it('changes when only whitespace changes (no semantic dedupe)', async () => {
    const a = expectOk(await fingerprintOf('json', '{"a": 1}'))
    const b = expectOk(await fingerprintOf('json', '{"a":1}'))
    expect(a).not.toBe(b)
  })
})
