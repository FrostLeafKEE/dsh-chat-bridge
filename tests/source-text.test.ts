/**
 * Plain text and Markdown input: one unverified block, never a guessed
 * conversation.
 * @module dsh-chat-bridge/tests/source-text
 */

import { describe, expect, it } from 'vitest'
import { LIMITS } from '../src/shared/limits'
import { parseSourceText, textFormatFromFileName } from '../src/import/parse-source-text'
import { expectErr, expectOk, readFixture } from './helpers'

describe('parseSourceText', () => {
  it('keeps the plain-text fixture as one block without role guessing', () => {
    const text = readFixture('source-text.txt')
    const parsed = expectOk(parseSourceText(text, 'text'))
    expect(parsed.text).toBe(text)
    expect(parsed.format).toBe('text')
    // The markers survive as text; no message list exists to hold "roles".
    expect(parsed.text).toContain('你：请不要根据这一行自动拆分角色。')
    expect(parsed.text).toContain('助手：也不要把下面这段代码拆成单独的消息。')
  })

  it('keeps a Markdown code fence intact', () => {
    const text = readFixture('source-markdown.md')
    const parsed = expectOk(parseSourceText(text, 'markdown'))
    expect(parsed.text).toBe(text)
    expect(parsed.text).toContain('```bash\necho "代码围栏里的 # 不是标题"\necho "也不应该被当作角色标记"\n```')
  })

  it('never converts line endings', () => {
    const parsed = expectOk(parseSourceText('a\r\nb\nc', 'text'))
    expect(parsed.text).toBe('a\r\nb\nc')
  })

  it('rejects an empty input', () => {
    expectErr(parseSourceText('', 'text'), 'INVALID_HISTORY')
  })

  it('refuses oversized input without truncating it', () => {
    expectErr(parseSourceText('あ'.repeat(LIMITS.manualInputBytes), 'text'), 'INPUT_TOO_LARGE')
  })
})

describe('textFormatFromFileName', () => {
  it('routes .md and .markdown to markdown and everything else to the fallback', () => {
    expect(textFormatFromFileName('notes.md')).toBe('markdown')
    expect(textFormatFromFileName('NOTES.MARKDOWN')).toBe('markdown')
    expect(textFormatFromFileName('notes.txt')).toBe('text')
    expect(textFormatFromFileName(undefined)).toBe('text')
    expect(textFormatFromFileName('notes.txt', 'markdown')).toBe('markdown')
  })
})
