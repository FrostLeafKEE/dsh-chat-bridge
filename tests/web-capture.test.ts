import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { currentConversationScript } from '../src/adapters/deepseek-page-reader'
import { buildWebImport } from '../src/import/build-snapshot'
import { parseArchiveDocument, serializeArchiveDocument } from '../src/import/export-archive'
import { validateWebCapture, WEB_CAPTURE_ADAPTER } from '../src/import/web-capture'
import { expectErr, expectOk } from './helpers'

const capture = { adapter: WEB_CAPTURE_ADAPTER, url: 'https://chat.deepseek.com/a/synthetic', title: 'Synthetic capture',
  scope: 'rendered-current-branch', completeness: 'partial',
  messages: [{ id: 'u1', role: 'user', content: 'Keep the code and whitespace' },
    { id: 'a1', role: 'assistant', content: '```ts\n  const n = 1\n```\n中文 🦀' }] }

describe('web provenance and archive roundtrip', () => {
  it('roundtrips v2 without promoting partial coverage or changing bytes', async () => {
    const first = expectOk(await buildWebImport(expectOk(validateWebCapture(capture))))
    const second = expectOk(await parseArchiveDocument(serializeArchiveDocument(first.snapshot)))
    expect(second.snapshot.schemaVersion).toBe(2)
    expect(second.snapshot.source.kind).toBe('web-dom')
    expect(second.snapshot.history).toEqual(first.snapshot.history)
    expect(second.snapshot.original).toEqual(first.snapshot.original)
    expect(second.snapshot.history.completeness).toBe('partial')
  })
  it('deduplicates unchanged captures despite local capture timestamps', async () => {
    const value = expectOk(validateWebCapture(capture))
    const first = expectOk(await buildWebImport(value, new Date('2026-10-01T01:00:00Z')))
    const second = expectOk(await buildWebImport(value, new Date('2026-10-01T02:00:00Z')))
    expect(first.snapshot.fingerprint).toBe(second.snapshot.fingerprint)
  })
  it('rejects claims of full coverage, foreign origins and unknown fields', () => {
    expectErr(validateWebCapture({ ...capture, completeness: 'full' }), 'INVALID_HISTORY')
    expect(validateWebCapture({ ...capture, url: 'https://example.com' }).ok).toBe(false)
    expect(validateWebCapture({ ...capture, token: 'synthetic' }).ok).toBe(false)
  })
})

/** Only the gate is mocked: execute the actual self-contained page script. */
function gate(options: { known?: boolean; draft?: string; streaming?: boolean; origin?: string } = {}): unknown {
  return vm.runInNewContext(currentConversationScript(), {
    location: { origin: options.origin ?? 'https://chat.deepseek.com' }, URL,
    document: {
      scripts: [{ src: 'https://fe-static.deepseek.com/chat/main.' + (options.known === false ? 'unknown' : '6fca03582d') + '.js' }],
      querySelectorAll: (selector: string) => selector === '.ds-message' ? [{}]
        : selector === 'textarea' ? [{ value: options.draft ?? '' }]
        : selector === '._52c986b' && options.streaming === true
          ? [{ querySelector: () => ({}), querySelectorAll: () => [] }] : [],
      querySelector: () => null,
    },
  })
}

describe('self-contained page read gates', () => {
  it('stops before reading messages on unknown frontend versions', () => {
    expect(gate({ known: false })).toEqual({ ok: false, code: 'WEB_CAPTURE_UNSUPPORTED' })
  })
  it('stops for an unsent draft or active generation', () => {
    expect(gate({ draft: 'Unsent synthetic task' })).toEqual({ ok: false, code: 'WEB_CAPTURE_DRAFT_PRESENT' })
    expect(gate({ streaming: true })).toEqual({ ok: false, code: 'WEB_CAPTURE_BUSY' })
  })
  it('stops on unsupported origins before looking at document contents', () => {
    expect(gate({ origin: 'https://example.com' })).toEqual({ ok: false, code: 'WEB_NAVIGATION_BLOCKED' })
  })
})
