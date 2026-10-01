/**
 * Snapshot construction: title resolution, source kinds, preview statistics and
 * the guarantee that the original text survives untouched.
 * @module dsh-chat-bridge/tests/build-snapshot
 */

import { describe, expect, it } from 'vitest'
import { buildImport, previewOf, summarizeAttachments, verifyHistoryConsistency, verifySnapshotFingerprint } from '../src/import/build-snapshot'
import { titleFromFileName, normalizeTitle, safeExportFileName, FALLBACK_TITLE } from '../src/import/title'
import { LIMITS } from '../src/shared/limits'
import { expectErr, expectOk, readFixture } from './helpers'

const FIXED_NOW = new Date('2026-03-04T05:06:07.000Z')

describe('buildImport', () => {
  it('builds a structured snapshot from the JSON fixture', async () => {
    const built = expectOk(await buildImport(
      { format: 'json', text: readFixture('manual-history.v1.json'), fileName: 'history.json' },
      FIXED_NOW,
    ))
    const snapshot = built.snapshot
    expect(snapshot.schemaVersion).toBe(1)
    expect(snapshot.archiveId).toMatch(/^[0-9a-f-]{36}$/)
    expect(snapshot.importedAt).toBe(FIXED_NOW.toISOString())
    expect(snapshot.updatedAt).toBe(FIXED_NOW.toISOString())
    expect(snapshot.title).toBe('示例聊天：代码块、空白与表情')
    expect(snapshot.source.kind).toBe('manual-json')
    expect(snapshot.source.fileName).toBe('history.json')
    expect(snapshot.original.text).toBe(readFixture('manual-history.v1.json'))
    expect(snapshot.history.kind).toBe('messages')
    if (snapshot.history.kind !== 'messages') throw new Error('unreachable')
    expect(snapshot.history.messages).toHaveLength(5)
    expect(snapshot.history.completeness).toBe('user-supplied')
    // The last message is present in the normalized copy as well.
    expect(snapshot.history.messages.at(-1)?.content).toBe('最后一条消息（必须保留）。✅')
  })

  it('builds a source-text snapshot for text and markdown', async () => {
    await Promise.all(([
      ['text', 'source-text.txt', 'manual-text'],
      ['markdown', 'source-markdown.md', 'manual-markdown'],
    ] as const).map(async ([format, name, kind]) => {
      const text = readFixture(name)
      const built = expectOk(await buildImport({ format, text, fileName: name }, FIXED_NOW))
      expect(built.snapshot.source.kind).toBe(kind)
      expect(built.snapshot.history.kind).toBe('source-text')
      if (built.snapshot.history.kind !== 'source-text') throw new Error('unreachable')
      expect(built.snapshot.history.completeness).toBe('unknown')
      expect(built.snapshot.history.text).toBe(text)
      expect(built.snapshot.original.text).toBe(text)
    }))
  })

  it('strips directories from a picked file name', async () => {
    const built = expectOk(await buildImport(
      { format: 'text', text: 'hi', fileName: 'C:\\Users\\someone\\Documents\\secret-folder\\notes.txt' },
      FIXED_NOW,
    ))
    expect(built.snapshot.source.fileName).toBe('notes.txt')
    expect(built.snapshot.source.fileName).not.toContain('Users')
  })

  it('prefers the typed title over the document title', async () => {
    const built = expectOk(await buildImport(
      { format: 'json', text: readFixture('manual-history.v1.json'), fileName: 'x.json', title: '  改过的标题  ' },
      FIXED_NOW,
    ))
    expect(built.snapshot.title).toBe('改过的标题')
  })

  it('derives the title from the file name and then the neutral fallback', async () => {
    const fromName = expectOk(await buildImport(
      { format: 'text', text: 'hi', fileName: 'meeting-notes.md' },
      FIXED_NOW,
    ))
    expect(fromName.snapshot.title).toBe('meeting-notes')

    const fallback = expectOk(await buildImport({ format: 'text', text: 'hi' }, FIXED_NOW))
    expect(fallback.snapshot.title).toBe(FALLBACK_TITLE)
  })

  it('refuses an unusable typed title', async () => {
    expectErr(await buildImport(
      { format: 'text', text: 'hi', title: '   ' },
      FIXED_NOW,
    ), 'INVALID_TITLE')
    expectErr(await buildImport(
      { format: 'text', text: 'hi', title: 'x'.repeat(LIMITS.maxTitleLength + 1) },
      FIXED_NOW,
    ), 'INVALID_TITLE')
  })

  it('produces a preview that matches the stored snapshot', async () => {
    const built = expectOk(await buildImport(
      { format: 'json', text: readFixture('manual-history.v1.json'), fileName: 'history.json' },
      FIXED_NOW,
    ))
    expect(built.preview).toEqual(previewOf(built.snapshot))
    expect(built.preview.messageCount).toBe(5)
    expect(built.preview.historyKind).toBe('messages')
    expect(built.preview.attachments).toEqual({
      messagesWithAttachments: 1,
      total: 2,
      unavailable: 1,
      unavailableNames: ['missing.bin'],
    })
    expect(built.preview.hasConversationId).toBe(true)
    expect(built.preview.warningKeys).toContain('import.warning.attachmentsMetadataOnly')
  })

  it('reports source-text length in code points', async () => {
    const built = expectOk(await buildImport({ format: 'text', text: '🦀🦀ab' }, FIXED_NOW))
    expect(built.preview.sourceTextLength).toBe(4)
  })

  it('verifies its own fingerprint and history consistency', async () => {
    const built = expectOk(await buildImport({ format: 'text', text: 'hello' }, FIXED_NOW))
    expect(expectOk(await verifySnapshotFingerprint(built.snapshot))).toBe(built.snapshot.fingerprint)
    expect(verifyHistoryConsistency(built.snapshot).ok).toBe(true)
  })

  it('detects a snapshot whose original and normalized halves disagree', async () => {
    const built = expectOk(await buildImport({ format: 'text', text: 'hello' }, FIXED_NOW))
    const tampered = {
      ...built.snapshot,
      history: { kind: 'source-text' as const, completeness: 'unknown' as const, text: 'not hello' },
    }
    expectErr(verifyHistoryConsistency(tampered), 'ARCHIVE_CORRUPTED')
  })
})

describe('summarizeAttachments', () => {
  it('counts messages, totals, and unavailable names', () => {
    expect(summarizeAttachments([
      { id: 'a', role: 'user', content: '', attachments: [{ name: 'x', availability: 'metadata-only' }] },
      { id: 'b', role: 'user', content: '' },
      { id: 'c', role: 'user', content: '', attachments: [{ name: 'y', availability: 'unavailable' }] },
    ])).toEqual({ messagesWithAttachments: 2, total: 2, unavailable: 1, unavailableNames: ['y'] })
  })
})

describe('titles and export file names', () => {
  it('normalizes titles', () => {
    expect(expectOk(normalizeTitle('  a  '))).toBe('a')
    expectErr(normalizeTitle('   '), 'INVALID_TITLE')
  })

  it('derives a title from a file name', () => {
    expect(titleFromFileName('C:\\x\\My Chat.md')).toBe('My Chat')
    expect(titleFromFileName('.txt')).toBe(FALLBACK_TITLE)
    expect(titleFromFileName('')).toBe(FALLBACK_TITLE)
  })

  it('makes export file names safe and never a path', () => {
    expect(safeExportFileName('a/b\\c:d*e?f"g<h>i|j', '.json')).toBe('a_b_c_d_e_f_g_h_i_j.json')
    expect(safeExportFileName('../../etc/passwd', '.txt')).toBe('.._.._etc_passwd.txt')
    expect(safeExportFileName('   ', '.txt')).toBe('chat-archive.txt')
    expect(safeExportFileName('CON', '.json')).toBe('CON_archive.json')
    expect(safeExportFileName('trailing. ', '.json')).toBe('trailing.json')
    expect(safeExportFileName('标题', '.json')).toBe('标题.json')
  })
})
