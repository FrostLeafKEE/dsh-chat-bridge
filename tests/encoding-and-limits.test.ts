/**
 * Byte-level input handling: strict UTF-8, the BOM, and the two size ceilings.
 * @module dsh-chat-bridge/tests/encoding-and-limits
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeUtf8, hasUtf8Bom, stripLeadingBomChar } from '../src/import/decode-text'
import { LIMITS, codePointLength, utf8ByteLength } from '../src/shared/limits'
import { checkByteCeiling, detectFormatFromFileName } from '../src/import/input'
import { expectErr, expectOk, readFixture } from './helpers'

describe('decodeUtf8', () => {
  it('decodes valid UTF-8 with CJK and emoji', () => {
    const text = '中文 🦀🚢 é'
    const decoded = expectOk(decodeUtf8(new TextEncoder().encode(text)))
    expect(decoded.text).toBe(text)
    expect(decoded.hadBom).toBe(false)
  })

  it('accepts a UTF-8 BOM as a signature, not as content', () => {
    const bytes = new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode('{"a":1}')])
    expect(hasUtf8Bom(bytes)).toBe(true)
    const decoded = expectOk(decodeUtf8(bytes))
    expect(decoded.hadBom).toBe(true)
    // The BOM cannot reach the text, so it can never break JSON.parse or show
    // up as an invisible character in the archive.
    expect(decoded.text).toBe('{"a":1}')
    expect(decoded.text).not.toContain('\uFEFF')
  })

  it('treats a mid-text BOM character as an ordinary character', () => {
    const decoded = expectOk(decodeUtf8(new TextEncoder().encode('a\uFEFFb')))
    expect(decoded.text).toBe('a\uFEFFb')
  })

  it('rejects invalid UTF-8 instead of storing replacement characters', () => {
    // A lone continuation byte and an invalid 2-byte start.
    for (const bytes of [new Uint8Array([0x80]), new Uint8Array([0xC3]), new Uint8Array([0xE4, 0xBD])]) {
      expectErr(decodeUtf8(bytes), 'INVALID_ENCODING')
    }
    const decoded = expectOk(decodeUtf8(new Uint8Array([0x41])))
    expect(decoded.text).not.toContain('\uFFFD')
  })

  it('strips a BOM character from a parse copy only when asked', () => {
    expect(stripLeadingBomChar('\uFEFF{}')).toBe('{}')
    expect(stripLeadingBomChar('{}')).toBe('{}')
  })

  it('reads the published fixtures as strict UTF-8', () => {
    for (const name of ['manual-history.v1.json', 'source-text.txt', 'source-markdown.md']) {
      const bytes = new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)))
      expect(expectOk(decodeUtf8(bytes)).text).toBe(readFixture(name))
    }
  })
})

describe('size limits', () => {
  it('counts UTF-8 bytes, not UTF-16 code units', () => {
    const emoji = '🦀'.repeat(10)
    expect(emoji.length).toBe(20)
    expect(utf8ByteLength(emoji)).toBe(40)
    expect(codePointLength(emoji)).toBe(10)
  })

  it('accepts the ceiling exactly and rejects one byte more', () => {
    expect(checkByteCeiling(LIMITS.manualInputBytes, 'manualInputBytes').ok).toBe(true)
    expectErr(checkByteCeiling(LIMITS.manualInputBytes + 1, 'manualInputBytes'), 'INPUT_TOO_LARGE')
    expect(checkByteCeiling(LIMITS.archiveFileBytes, 'archiveFileBytes').ok).toBe(true)
    expectErr(checkByteCeiling(LIMITS.archiveFileBytes + 1, 'archiveFileBytes'), 'INPUT_TOO_LARGE')
  })

  it('name the ceiling it refused on', () => {
    const error = expectErr(checkByteCeiling(LIMITS.archiveFileBytes + 1024, 'archiveFileBytes'), 'INPUT_TOO_LARGE')
    expect(error.message).toContain('byte limit')
  })
})

describe('detectFormatFromFileName', () => {
  it('accepts only the three documented extensions', () => {
    expect(expectOk(detectFormatFromFileName('a.json'))).toBe('json')
    expect(expectOk(detectFormatFromFileName('a.txt'))).toBe('text')
    expect(expectOk(detectFormatFromFileName('a.md'))).toBe('markdown')
    expect(expectOk(detectFormatFromFileName('a.markdown'))).toBe('markdown')
    expect(expectOk(detectFormatFromFileName('C:\\tmp\\A.TXT'))).toBe('text')
  })

  it('rejects everything else, including containers this stage does not parse', () => {
    for (const name of ['a.zip', 'a.html', 'a.pdf', 'a.png', 'a', 'a.json.bak']) {
      expectErr(detectFormatFromFileName(name), 'UNSUPPORTED_FORMAT')
    }
  })
})
