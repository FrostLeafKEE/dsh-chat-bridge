import { setImmediate } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDesktopWebCarrier } from '../src/adapters/desktop-web-carrier'
import { DocumentStub, ElementStub } from './dom-stub'
import { expectErr } from './helpers'
import { webHistoryScript } from '../src/adapters/deepseek-history-reader'

afterEach(() => { vi.unstubAllGlobals() })

function fixture() {
  const doc = new DocumentStub()
  const guest = Object.assign(new ElementStub('WEBVIEW'), {
    loadURL: vi.fn(async () => {}), getURL: (): string => 'https://chat.deepseek.com/a/chat',
    stop: vi.fn(), executeJavaScript: vi.fn(async (): Promise<unknown> => ({ ok: false, code: 'WEB_CAPTURE_BUSY' })),
  })
  vi.spyOn(doc, 'createElement').mockReturnValue(guest)
  const bridge = { acquire: vi.fn(async () => ({ lease: 'lease-1', partition: 'dsh-sidebar-browser-test' })),
    release: vi.fn(async () => {}), onOpenRequested: vi.fn(() => () => {}) }
  vi.stubGlobal('document', doc); vi.stubGlobal('dshDesktop', { browser: bridge })
  const host = new ElementStub()
  const carrier = createDesktopWebCarrier()
  return { doc, guest, bridge, host, carrier }
}

describe('managed guest lifecycle', () => {
  it('mirrors loaded history, passes only fixed script options and clears titles on login navigation', async () => {
    const { carrier, guest, host } = fixture()
    const page = { scope: 'loaded-sidebar', phase: 'ready', pageUrl: 'https://chat.deepseek.com/a/chat',
      items: [{ url: 'https://chat.deepseek.com/a/chat/s/synthetic', title: 'Synthetic title' }], loadingMore: false }
    guest.executeJavaScript.mockResolvedValue({ ok: true, value: page })
    carrier.mount(host as unknown as HTMLElement); await setImmediate()
    guest.dispatchEvent(new Event('dom-ready')); await setImmediate()
    guest.dispatchEvent(new Event('dom-ready')); await setImmediate()
    expect(carrier.history.getSnapshot().items).toEqual(page.items)
    expect(guest.executeJavaScript).toHaveBeenLastCalledWith(webHistoryScript(), false)
    guest.getURL = () => 'https://chat.deepseek.com/sign_in'
    guest.executeJavaScript.mockResolvedValue({ ok: true, value: { ...page, phase: 'signed-out',
      pageUrl: 'https://chat.deepseek.com/sign_in', items: [] } })
    guest.dispatchEvent(new Event('did-navigate-in-page')); await setImmediate()
    expect(carrier.history.getSnapshot().phase).toBe('signed-out')
    expect(carrier.history.getSnapshot().items).toEqual([])
    carrier.dispose()
  })
  it('discards a late history result after navigation and contains malformed guest replies', async () => {
    const { carrier, guest, host } = fixture()
    let finish!: (value: unknown) => void
    guest.executeJavaScript.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    carrier.mount(host as unknown as HTMLElement); await setImmediate()
    guest.dispatchEvent(new Event('dom-ready')); await setImmediate()
    guest.dispatchEvent(new Event('dom-ready')); await setImmediate()
    carrier.open({ url: 'https://chat.deepseek.com/' })
    finish({ ok: true, value: { scope: 'loaded-sidebar', phase: 'ready', pageUrl: 'https://chat.deepseek.com/a/chat',
      items: [{ url: 'https://chat.deepseek.com/a/chat/s/synthetic', title: 'Old title' }], loadingMore: false } })
    await setImmediate()
    expect(carrier.history.getSnapshot().items).toEqual([])
    guest.executeJavaScript.mockResolvedValue({ ok: true, value: { token: 'synthetic private data' } })
    guest.dispatchEvent(new Event('dom-ready')); await setImmediate()
    expect(carrier.history.getSnapshot().error?.code).toBe('WEB_HISTORY_UNSUPPORTED')
    expect(JSON.stringify(carrier.history.getSnapshot())).not.toContain('synthetic private data')
    carrier.dispose()
  })
  it('rejects external origins and credential-bearing URLs', () => {
    const { carrier, bridge } = fixture()
    for (const url of ['https://example.com', 'https://user@chat.deepseek.com/', 'javascript:alert(1)']) {
      expectErr(carrier.open({ url }), 'UNSAFE_SOURCE_URL')
    }
    expect(bridge.acquire).not.toHaveBeenCalled()
    carrier.dispose()
  })
  it('releases a reservation returned after unmount without attaching a guest', async () => {
    const { carrier, bridge, host } = fixture()
    const unmount = carrier.mount(host as unknown as HTMLElement)
    unmount(); await setImmediate()
    expect(host.children).toHaveLength(0)
    expect(bridge.release).toHaveBeenCalledExactlyOnceWith('lease-1')
    carrier.dispose()
  })
  it('contains preload subscription errors and releases the acquired lease', async () => {
    const { carrier, bridge, host } = fixture()
    bridge.onOpenRequested.mockImplementation(() => { throw new Error('preload unavailable') })
    carrier.mount(host as unknown as HTMLElement); await setImmediate()
    expect(carrier.getSnapshot().phase).toBe('error')
    expect(host.children).toHaveLength(0)
    expect(bridge.release).toHaveBeenCalledExactlyOnceWith('lease-1')
    carrier.dispose()
  })
  it('contains element creation and synchronous release failures', async () => {
    const { carrier, bridge, doc, host } = fixture()
    vi.mocked(doc.createElement).mockImplementation(() => { throw new Error('DOM unavailable') })
    bridge.release.mockImplementation(() => { throw new Error('bridge gone') })
    carrier.mount(host as unknown as HTMLElement); await setImmediate()
    expect(carrier.getSnapshot().phase).toBe('error')
    expect(bridge.release).toHaveBeenCalledOnce()
    carrier.dispose()
  })
  it('ignores stale unmount cleanup after remount into the same host', async () => {
    const { carrier, bridge, host } = fixture()
    const oldUnmount = carrier.mount(host as unknown as HTMLElement)
    await setImmediate()
    carrier.mount(host as unknown as HTMLElement); await setImmediate()
    oldUnmount()
    expect(host.children).toHaveLength(1)
    expect(bridge.release).toHaveBeenCalledTimes(1)
    carrier.dispose(); await setImmediate()
    expect(bridge.release).toHaveBeenCalledTimes(2)
  })
  it('bootstraps once, refuses streaming capture, and detaches unsupported navigation', async () => {
    const { carrier, guest, bridge, host } = fixture()
    carrier.mount(host as unknown as HTMLElement); await setImmediate()
    guest.dispatchEvent(new Event('dom-ready')); await setImmediate()
    expect(guest.loadURL).toHaveBeenCalledExactlyOnceWith('https://chat.deepseek.com/')
    guest.dispatchEvent(new Event('dom-ready'))
    expect(carrier.getSnapshot().phase).toBe('ready')
    expectErr(await carrier.captureCurrent!(new AbortController().signal), 'WEB_CAPTURE_BUSY')
    guest.getURL = () => 'https://example.com/'
    guest.dispatchEvent(new Event('did-navigate')); await setImmediate()
    expect(carrier.getSnapshot().error?.code).toBe('WEB_NAVIGATION_BLOCKED')
    expect(host.children).toHaveLength(0)
    expect(bridge.release).toHaveBeenCalledOnce()
    carrier.dispose()
  })
  it('cancels a pending guest read on disposal', async () => {
    const { carrier, guest, host } = fixture()
    carrier.mount(host as unknown as HTMLElement); await setImmediate()
    guest.dispatchEvent(new Event('dom-ready')); await setImmediate()
    guest.dispatchEvent(new Event('dom-ready'))
    guest.executeJavaScript.mockImplementation(() => new Promise(() => {}))
    const capture = carrier.captureCurrent!(new AbortController().signal)
    carrier.dispose()
    expectErr(await capture, 'WEB_CAPTURE_CANCELED')
  })
})
