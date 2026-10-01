/**
 * Manual-history JSON parsing: accepted shapes, every rejected shape, and the
 * promise that nothing is rewritten, reordered, or silently dropped.
 * @module dsh-chat-bridge/tests/manual-json
 */

import { describe, expect, it } from 'vitest'
import { LIMITS } from '../src/shared/limits'
import { parseManualHistoryJson } from '../src/import/parse-manual-json'
import { expectErr, expectOk, readFixture } from './helpers'

/** The fixture document, as text. */
const FIXTURE_TEXT = readFixture('manual-history.v1.json')

/**
 * Build a minimal valid document around the given messages.
 * @param messages - message entries to embed.
 * @param extra - additional root fields.
 * @returns JSON text.
 */
function documentWith(messages: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: 'dsh-chat-bridge.manual-history',
    schemaVersion: 1,
    messages,
    ...extra,
  })
}

describe('parseManualHistoryJson: accepted input', () => {
  it('parses the published fixture without altering any content', () => {
    const parsed = expectOk(parseManualHistoryJson(FIXTURE_TEXT))
    expect(parsed.messages).toHaveLength(5)
    expect(parsed.completeness).toBe('user-supplied')
    expect(parsed.title).toBe('示例聊天：代码块、空白与表情')
    expect(parsed.source.url).toBe('https://chat.deepseek.com/')
    expect(parsed.source.conversationId).toBe('fixture-conversation-0001')

    // Order is the file order: no re-sorting by time, no role alternation.
    expect(parsed.messages.map(message => message.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
    expect(parsed.messages.map(message => message.role)).toEqual(
      ['user', 'assistant', 'user', 'assistant', 'user'],
    )
  })

  it('keeps CRLF, leading/trailing spaces, code fences and emoji byte for byte', () => {
    const parsed = expectOk(parseManualHistoryJson(FIXTURE_TEXT))
    const [first, second, third] = parsed.messages
    expect(first?.content).toBe('请解释这个示例问题。\n第一行\r\n第二行（CRLF 保留）。')
    expect(second?.content).toContain('```python\nprint("空白与代码按原文保存")\n```')
    expect(second?.content).toContain('🦀')
    expect(third?.content).toBe('  首尾空白必须保留  ')
  })

  it('accepts an empty content string and keeps the last message', () => {
    const parsed = expectOk(parseManualHistoryJson(FIXTURE_TEXT))
    expect(parsed.messages[3]?.content).toBe('')
    expect(parsed.messages[4]?.content).toBe('最后一条消息（必须保留）。✅')
  })

  it('keeps attachment metadata and never invents file content', () => {
    const parsed = expectOk(parseManualHistoryJson(FIXTURE_TEXT))
    const attachments = parsed.messages[1]?.attachments ?? []
    expect(attachments).toHaveLength(2)
    expect(attachments[0]).toEqual({
      name: 'diagram.png',
      mimeType: 'image/png',
      sizeBytes: 20480,
      availability: 'metadata-only',
    })
    expect(attachments[1]).toEqual({ name: 'missing.bin', availability: 'unavailable' })
    expect(JSON.stringify(attachments)).not.toContain('data:')
  })

  it('defaults absent completeness to user-supplied without claiming a full history', () => {
    const parsed = expectOk(parseManualHistoryJson(documentWith([
      { id: 'a', role: 'user', content: 'x' },
    ])))
    expect(parsed.completeness).toBe('user-supplied')
    expect(parsed.title).toBeUndefined()
    expect(parsed.source).toEqual({})
  })

  it('accepts partial completeness', () => {
    const parsed = expectOk(parseManualHistoryJson(documentWith(
      [{ id: 'a', role: 'user', content: 'x' }],
      { completeness: 'partial' },
    )))
    expect(parsed.completeness).toBe('partial')
  })

  it('keeps a source-supplied ISO timestamp and leaves absent times absent', () => {
    const parsed = expectOk(parseManualHistoryJson(documentWith([
      { id: 'a', role: 'user', content: 'x', createdAt: '2026-01-02T03:04:05.000Z' },
      { id: 'b', role: 'assistant', content: 'y' },
    ])))
    expect(parsed.messages[0]?.createdAt).toBe('2026-01-02T03:04:05.000Z')
    expect(parsed.messages[1]?.createdAt).toBeUndefined()
  })
})

describe('parseManualHistoryJson: rejected input', () => {
  it('reports invalid JSON without echoing the document', () => {
    const error = expectErr(parseManualHistoryJson('{"format": '), 'INVALID_JSON')
    expect(error.message).not.toContain('format')
  })

  it('rejects an unknown format and an unknown schema version', () => {
    expectErr(parseManualHistoryJson(JSON.stringify({ schemaVersion: 1, messages: [] })), 'UNSUPPORTED_FORMAT')
    expectErr(parseManualHistoryJson(JSON.stringify({
      format: 'deepseek.export', schemaVersion: 1, messages: [],
    })), 'UNSUPPORTED_FORMAT')
    expectErr(parseManualHistoryJson(JSON.stringify({
      format: 'dsh-chat-bridge.manual-history', messages: [],
    })), 'UNSUPPORTED_VERSION')
    expectErr(parseManualHistoryJson(JSON.stringify({
      format: 'dsh-chat-bridge.manual-history', schemaVersion: 2, messages: [],
    })), 'UNSUPPORTED_VERSION')
  })

  it('rejects unsupported fields instead of dropping them', () => {
    const error = expectErr(parseManualHistoryJson(documentWith(
      [{ id: 'a', role: 'user', content: 'x' }],
      { reasoning: 'hidden chain' },
    )), 'INVALID_HISTORY')
    expect(error.path).toBe('reasoning')

    const nested = expectErr(parseManualHistoryJson(documentWith(
      [{ id: 'a', role: 'user', content: 'x', branch: 'b1' }],
    )), 'INVALID_HISTORY')
    expect(nested.path).toBe('messages[0].branch')
  })

  it('rejects wrong field types and missing required fields', () => {
    expectErr(parseManualHistoryJson(documentWith([], { title: 42 })), 'INVALID_HISTORY')
    expectErr(parseManualHistoryJson(documentWith([], { messages: undefined })), 'INVALID_HISTORY')
    expectErr(parseManualHistoryJson(documentWith([{ role: 'user', content: 'x' }])), 'INVALID_HISTORY')
    expectErr(parseManualHistoryJson(documentWith([{ id: 'a', role: 'user' }])), 'INVALID_HISTORY')
    expectErr(parseManualHistoryJson(documentWith([{ id: 'a', role: 'user', content: 1 }])), 'INVALID_HISTORY')
    expectErr(parseManualHistoryJson(documentWith([{ id: '', role: 'user', content: 'x' }])), 'INVALID_HISTORY')
    expectErr(parseManualHistoryJson(documentWith([{ id: 'a', role: 'user', content: 'x', createdAt: 'yesterday' }])), 'INVALID_HISTORY')
    expectErr(parseManualHistoryJson(documentWith([{ id: 'a', role: 'user', content: 'x', attachments: [{}] }])), 'INVALID_HISTORY')
    expectErr(parseManualHistoryJson(documentWith([{ id: 'a', role: 'user', content: 'x', attachments: [{ name: 'f', sizeBytes: -1 }] }])), 'INVALID_HISTORY')
    expectErr(parseManualHistoryJson(documentWith([{ id: 'a', role: 'user', content: 'x', attachments: [{ name: 'f', availability: 'link' }] }])), 'INVALID_HISTORY')
    expectErr(parseManualHistoryJson(documentWith([], { completeness: 'full' })), 'INVALID_HISTORY')
  })

  it('rejects roles it cannot represent instead of promoting or dropping them', () => {
    for (const role of ['system', 'developer', 'tool', 'USER', 7]) {
      const error = expectErr(parseManualHistoryJson(documentWith([{ id: 'a', role, content: 'x' }])), 'INVALID_HISTORY')
      expect(error.path).toBe('messages[0].role')
    }
  })

  it('rejects duplicate message ids', () => {
    const error = expectErr(parseManualHistoryJson(documentWith([
      { id: 'dup', role: 'user', content: 'x' },
      { id: 'dup', role: 'assistant', content: 'y' },
    ])), 'INVALID_HISTORY')
    expect(error.path).toBe('messages[1].id')
  })

  it('rejects unsafe source URLs', () => {
    const cases = [
      'javascript:alert(1)',
      'data:text/plain,hello',
      'file:///C:/secret.txt',
      'http://chat.deepseek.com/',
      'https://evil.example/chat.deepseek.com',
      'https://chat.deepseek.com.evil.example/',
      'https://user:pass@chat.deepseek.com/',
      'https://user@chat.deepseek.com/',
      'not a url',
    ]
    for (const url of cases) {
      const error = expectErr(parseManualHistoryJson(documentWith(
        [{ id: 'a', role: 'user', content: 'x' }],
        { source: { url } },
      )), 'UNSAFE_SOURCE_URL')
      expect(error.path).toBe('source.url')
    }
  })

  it('accepts the supported host over https and drops the fragment', () => {
    const parsed = expectOk(parseManualHistoryJson(documentWith(
      [{ id: 'a', role: 'user', content: 'x' }],
      { source: { url: 'https://chat.deepseek.com/a/chat/s/abc#turn-4' } },
    )))
    expect(parsed.source.url).toBe('https://chat.deepseek.com/a/chat/s/abc')
  })
})

describe('parseManualHistoryJson: limits', () => {
  it('accepts exactly the message ceiling and rejects one more', () => {
    const atLimit = Array.from({ length: LIMITS.maxMessages }, (_, index) => ({
      id: `m${index}`, role: 'user', content: 'x',
    }))
    expect(expectOk(parseManualHistoryJson(documentWith(atLimit))).messages).toHaveLength(LIMITS.maxMessages)

    const overLimit = [...atLimit, { id: 'extra', role: 'user', content: 'x' }]
    const error = expectErr(parseManualHistoryJson(documentWith(overLimit)), 'INPUT_TOO_LARGE')
    expect(error.message).not.toContain('truncat')
  })

  it('refuses oversized input rather than truncating it', () => {
    const filler = 'あ'.repeat(Math.ceil((LIMITS.manualInputBytes + 1024) / 3))
    const error = expectErr(parseManualHistoryJson(documentWith([
      { id: 'a', role: 'user', content: filler },
    ])), 'INPUT_TOO_LARGE')
    expect(error.message).toContain('byte limit')
  })
})
