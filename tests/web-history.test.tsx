import vm from 'node:vm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { webHistoryScript } from '../src/adapters/deepseek-history-reader'
import { WebHistoryMonitor } from '../src/adapters/web-history-monitor'
import { createDesktopWebCarrier } from '../src/adapters/desktop-web-carrier'
import { validateWebHistory, webConversationUrl, WEB_HISTORY_LIMITS, type WebHistoryPage } from '../src/shared/web-history'
import { ok, errCode, type Result } from '../src/shared/errors'
import { WebHistoryList } from '../src/client/components/WebHistoryList'
import { ChatBridgeController } from '../src/client/state/controller'
import { createPendingWorkImporter } from '../src/adapters/pending-work-importer'
import { MemoryArchiveRepository } from '../src/storage/memory-repository'
import { en, zh } from '../src/client/locales'
import { expectErr, expectOk } from './helpers'

const url = 'https://chat.deepseek.com/a/chat/s/synthetic-session'
const page: WebHistoryPage = { scope: 'loaded-sidebar', phase: 'ready', pageUrl: 'https://chat.deepseek.com/a/chat',
  items: [{ url, title: 'Synthetic web title' }], loadingMore: false }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function guest(options: { path?: string; known?: boolean; closed?: boolean; empty?: boolean; loading?: boolean;
  failed?: boolean; href?: string | null; title?: string; duplicate?: boolean } = {}) {
  const scrollTo = vi.fn()
  const row = { getAttribute: () => options.href === undefined ? '/a/chat/s/synthetic-session' : options.href,
    querySelectorAll: () => [{ textContent: options.title ?? 'Synthetic web title' }] }
  const root = { scrollHeight: 1800, scrollTo,
    querySelectorAll: () => options.empty ? [] : options.duplicate ? [row, row] : [row],
    querySelector: (selector: string) => options.failed && selector === '._47ef3ad, .fa9e7cfe'
      || options.loading && selector === '._06a97e9' || options.empty && selector === '.fd90d2b2' ? {} : null }
  const document = { scripts: [{ src: 'https://fe-static.deepseek.com/chat/static/main.' + (options.known === false ? 'other' : '6fca03582d') + '.js' }],
    querySelectorAll: () => options.closed ? [] : [root] }
  const run = (more = false): { ok: boolean; value?: unknown; code?: string } => vm.runInNewContext(webHistoryScript(more), {
    document, location: { origin: 'https://chat.deepseek.com', pathname: options.path ?? '/a/chat' }, URL, TextEncoder,
    // These APIs must never be touched by a DOM reader.
    get localStorage() { throw new Error('storage access forbidden') },
    get sessionStorage() { throw new Error('storage access forbidden') },
    fetch: () => { throw new Error('private network access forbidden') },
  })
  return { run, scrollTo }
}

describe('website sidebar DOM reader', () => {
  it('reads actual link targets and title nodes without scrolling or network calls', () => {
    const { run, scrollTo } = guest()
    expect(expectOk(validateWebHistory(run().value))).toEqual(page)
    expect(scrollTo).not.toHaveBeenCalled()
  })
  it('deduplicates pinned duplicates and scrolls only on an explicit load-more request', () => {
    const { run, scrollTo } = guest({ duplicate: true })
    expect(expectOk(validateWebHistory(run(true).value)).items).toHaveLength(1)
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 1800, behavior: 'instant' })
  })
  it('gates new frontend builds and multi-select or unsafe routes', () => {
    for (const options of [{ known: false }, { href: null }, { href: 'https://example.com/a/chat/s/x' },
      { href: '/a/chat/s/x?token=synthetic' }, { href: '/a/chat/s/x#fragment' }, { title: '' }]) {
      expect(guest(options).run()).toEqual({ ok: false, code: 'WEB_HISTORY_UNSUPPORTED' })
    }
  })
  it('distinguishes sign-in, hidden sidebar, loading, empty and server error', () => {
    for (const [options, phase] of [[{ path: '/sign_in' }, 'signed-out'], [{ closed: true }, 'sidebar-closed'],
      [{ loading: true }, 'loading'], [{ empty: true }, 'ready']] as const) {
      const read = expectOk(validateWebHistory(guest(options).run().value))
      expect(read.phase).toBe(phase); expect(read.items).toEqual([])
    }
    expect(guest({ failed: true }).run()).toEqual({ ok: false, code: 'WEB_HISTORY_LOAD_FAILED' })
  })
})

describe('untrusted history boundary', () => {
  it('accepts supported routes while rejecting credentials, queries and fabricated links', () => {
    expect(webConversationUrl(url)).toBe(url)
    for (const bad of ['https://user@chat.deepseek.com/a/chat/s/x', 'https://chat.deepseek.com/share/x',
      url + '?x=1', url + '#x', 'javascript:alert(1)', 'https://chat.deepseek.com/a/chat/s/%2fsecret']) {
      expect(webConversationUrl(bad)).toBeUndefined()
    }
  })
  it('rejects unknown data, duplicate URLs, remote-count claims and oversize titles', () => {
    for (const value of [{ ...page, total: 999 }, { ...page, items: [...page.items, ...page.items] },
      { ...page, phase: 'signed-out' }, { ...page, items: [{ url, title: 'x'.repeat(WEB_HISTORY_LIMITS.title + 1) }] },
      { ...page, items: [{ url, title: 'ok', token: 'synthetic' }] }, { ...page, pageUrl: page.pageUrl + '?secret=synthetic' }]) {
      expectErr(validateWebHistory(value), 'WEB_HISTORY_UNSUPPORTED')
    }
    expectErr(validateWebHistory({ ...page, items: Array.from({ length: 5001 }, () => page.items[0]) }), 'WEB_HISTORY_TOO_LARGE')
  })
  it('does not echo untrusted field names or titles in errors', () => {
    const result = validateWebHistory({ ...page, 'private title synthetic': true })
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain('private title')
  })
})

describe('history monitor lifetime', () => {
  it('updates changed titles and replaces the entire list on sign-out', async () => {
    vi.useFakeTimers()
    const read = vi.fn(async (): Promise<Result<WebHistoryPage>> => ok(page))
    const history = new WebHistoryMonitor(read)
    history.resume(); await vi.advanceTimersByTimeAsync(0)
    expect(history.getSnapshot().items).toEqual(page.items)
    read.mockResolvedValue(ok({ ...page, items: [{ url, title: 'Renamed' }] }))
    await vi.advanceTimersByTimeAsync(3000)
    expect(history.getSnapshot().items[0]?.title).toBe('Renamed')
    read.mockResolvedValue(ok({ ...page, phase: 'signed-out', pageUrl: 'https://chat.deepseek.com/sign_in', items: [] }))
    await vi.advanceTimersByTimeAsync(3000)
    expect(history.getSnapshot().items).toEqual([])
    history.dispose(); await vi.advanceTimersByTimeAsync(9000)
    expect(read).toHaveBeenCalledTimes(3)
  })
  it('ignores old in-flight reads after pause and never overlaps reads', async () => {
    vi.useFakeTimers()
    let finish!: (value: Result<WebHistoryPage>) => void
    const read = vi.fn(() => new Promise<Result<WebHistoryPage>>(resolve => { finish = resolve }))
    const history = new WebHistoryMonitor(read)
    history.resume(); await history.refresh(true)
    expect(read).toHaveBeenCalledTimes(1)
    history.pause('loading')
    finish(ok(page)); await vi.advanceTimersByTimeAsync(10000)
    expect(history.getSnapshot().items).toEqual([]); expect(read).toHaveBeenCalledTimes(1)
    history.dispose()
  })
  it('keeps links while work is active, clears errors and cancels pending timers', async () => {
    vi.useFakeTimers()
    const read = vi.fn(async (): Promise<Result<WebHistoryPage>> => ok(page))
    const history = new WebHistoryMonitor(read)
    history.resume(); await vi.advanceTimersByTimeAsync(0)
    history.pause('paused', false)
    expect(history.getSnapshot().items).toEqual(page.items)
    await vi.advanceTimersByTimeAsync(9000); expect(read).toHaveBeenCalledOnce()
    read.mockResolvedValue(errCode('WEB_HISTORY_UNSUPPORTED', 'unsupported page'))
    history.resume(); await vi.advanceTimersByTimeAsync(0)
    expect(history.getSnapshot().items).toEqual([]); expect(history.getSnapshot().phase).toBe('error')
    history.dispose()
  })
})

describe('sidebar rendering and navigation', () => {
  it('renders escaped web titles, loaded count, active target and separate scope in both languages', async () => {
    vi.useFakeTimers()
    const carrier = createDesktopWebCarrier()
    const history = new WebHistoryMonitor(async () => ok({ ...page, items: [{ url, title: '<script>synthetic</script>' }] }))
    history.resume(); await vi.advanceTimersByTimeAsync(0)
    const presented = { ...carrier, capability: carrier.capability, history,
      getSnapshot: () => ({ phase: 'ready' as const, url }), subscribe: () => () => {}, mount: () => () => {},
      open: () => ok(undefined), reload: () => {}, dispose: () => {} }
    const controller = {} as ChatBridgeController
    for (const dictionary of [en, zh]) {
      const html = renderToStaticMarkup(<WebHistoryList t={key => dictionary[key as keyof typeof en] ?? key}
        controller={controller} carrier={presented} />)
      expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>')
      expect(html).toContain('aria-current="page"'); expect(html).toContain('dshcb-sidebar-history-scope')
    }
    history.dispose(); carrier.dispose()
  })
  it('queues a web target and opens Chat without importing or sending', () => {
    const open = vi.fn(() => ok(undefined))
    const openChatPanel = vi.fn(() => ok(undefined))
    const repository = new MemoryArchiveRepository()
    const controller = new ChatBridgeController({ openRepository: async () => ok(repository),
      navigation: { openChatPanel, returnToWork: () => ok(undefined), dispose: () => {} },
      webCarrier: { capability: { state: 'available', noteKey: 'test' }, open, dispose: () => {} },
      createWorkImporter: repo => createPendingWorkImporter(repo), download: () => {}, now: () => new Date(), newRequestId: () => 'id' })
    controller.openWebConversation(url)
    expect(open).toHaveBeenCalledExactlyOnceWith({ url }); expect(openChatPanel).toHaveBeenCalledOnce()
    controller.openWebConversation('https://example.com')
    expect(open).toHaveBeenCalledOnce()
    controller.openImport(); controller.openWebConversation(url)
    expect(open).toHaveBeenCalledOnce()
    controller.dispose()
  })
})
