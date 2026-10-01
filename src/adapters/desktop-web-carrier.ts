/** Managed Desktop guest; user-triggered DOM capture has no credential/storage/network access. */
import type { CapabilityStatus, WebCarrierPort, WebCarrierTarget, WebConversationCapture } from '../shared/contracts'
import { errCode, ok, type ArchiveError, type Result } from '../shared/errors'
import { validateWebCapture } from '../import/web-capture'
import { isPlainObject } from '../import/guard'
import { currentConversationScript } from './deepseek-page-reader'
import { webHistoryScript } from './deepseek-history-reader'
import { WebHistoryMonitor, type WebHistoryPort } from './web-history-monitor'
import { validateWebHistory, type WebHistoryPage } from '../shared/web-history'

export const DEEPSEEK_WEB_URL = 'https://chat.deepseek.com/'
/** A storage identity, not a directory or registered Workspace identity. */
const STORAGE_ACCOUNT = 'dsh-chat-bridge:deepseek-web:v1'

interface Reservation { lease: string; partition: string }
interface BrowserBridge {
  acquire(account: string): Promise<Reservation>
  release(lease: string): Promise<void>
  onOpenRequested(lease: string, listener: (url: string) => void): () => void
}
interface ManagedWebview extends HTMLElement {
  loadURL(url: string): Promise<void>
  getURL(): string
  reload(): void
  stop(): void
  executeJavaScript?(code: string, userGesture?: boolean): Promise<unknown>
}
export interface WebCarrierState {
  phase: 'idle' | 'starting' | 'loading' | 'ready' | 'error'
  url: string
  error?: ArchiveError
}
/** DOM-facing adapter is separate from the portable business Port. */
export interface PresentedWebCarrier extends WebCarrierPort {
  readonly history: WebHistoryPort
  getSnapshot(): WebCarrierState
  subscribe(listener: () => void): () => void
  mount(host: HTMLElement): () => void
  reload(): void
}

function browserBridge(): BrowserBridge | undefined {
  const desktop: unknown = Reflect.get(globalThis, 'dshDesktop')
  if (typeof desktop !== 'object' || desktop === null || !('browser' in desktop)) return undefined
  const bridge = desktop.browser
  if (typeof bridge !== 'object' || bridge === null) return undefined
  if (!('acquire' in bridge) || typeof bridge.acquire !== 'function'
    || !('release' in bridge) || typeof bridge.release !== 'function'
    || !('onOpenRequested' in bridge) || typeof bridge.onOpenRequested !== 'function') return undefined
  return bridge as BrowserBridge
}

function acceptedUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.origin !== 'https://chat.deepseek.com' || url.username !== '' || url.password !== '') return undefined
    return url.href
  } catch { return undefined }
}

function captureCanceled(): Result<never> {
  return errCode('WEB_CAPTURE_CANCELED', 'guest capture was canceled or timed out')
}

/** Owns one guest lease at a time, including leases acquired after an unmount. */
class DesktopWebCarrier implements PresentedWebCarrier {
  readonly capability: CapabilityStatus
  readonly history = new WebHistoryMonitor((more, signal) => this.readHistory(more, signal))
  private state: WebCarrierState = { phase: 'idle', url: DEEPSEEK_WEB_URL }
  private listeners = new Set<() => void>()
  private host: HTMLElement | undefined
  private element: ManagedWebview | undefined
  private lease: string | undefined
  private lifetime: AbortController | undefined
  private offOpen: (() => void) | undefined
  private generation = 0
  private captureRevision = 0
  private disposed = false
  private ready = false
  private pending = DEEPSEEK_WEB_URL
  private readonly releases = new Set<Promise<void>>()

  constructor(private readonly bridge: BrowserBridge | undefined) {
    this.capability = bridge === undefined
      ? { state: 'unavailable', code: 'DESKTOP_REQUIRED', noteKey: 'capability.webCarrier.desktopRequired' }
      : { state: 'available', noteKey: 'capability.webCarrier.desktop' }
  }

  getSnapshot = (): WebCarrierState => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private patch(state: WebCarrierState): void {
    if (this.disposed) return
    this.state = state
    if (state.phase === 'ready') this.history.resume()
    else this.history.pause(state.phase === 'loading' || state.phase === 'starting' ? 'loading' : 'unavailable')
    for (const listener of this.listeners) listener()
  }
  private fail(code: 'WEB_LOAD_FAILED' | 'WEB_NAVIGATION_BLOCKED' | 'DESKTOP_REQUIRED'): void {
    const failure = errCode(code, 'managed web carrier operation failed')
    this.patch({ phase: 'error', url: this.pending, error: failure.error })
  }

  open(target: WebCarrierTarget = {}): Result<undefined> {
    if (this.disposed || this.bridge === undefined) return errCode('DESKTOP_REQUIRED', 'Desktop browser bridge unavailable')
    // conversationId alone is not enough to invent a website route.
    const url = acceptedUrl(target.url ?? DEEPSEEK_WEB_URL)
    if (url === undefined) return errCode('UNSAFE_SOURCE_URL', 'web carrier target is outside the supported origin')
    this.captureRevision++
    this.pending = url
    this.history.pause('loading')
    if (this.ready) this.loadPending()
    return ok(undefined)
  }

  mount(host: HTMLElement): () => void {
    if (this.disposed) return () => {}
    this.detach()
    this.host = host
    const generation = this.generation
    if (this.bridge === undefined) this.fail('DESKTOP_REQUIRED')
    else {
      this.patch({ phase: 'starting', url: this.pending })
      void this.acquire(host, generation)
    }
    return () => { if (this.current(host, generation)) this.detach() }
  }

  private async acquire(host: HTMLElement, generation: number): Promise<void> {
    const bridge = this.bridge
    if (bridge === undefined) return
    let reservation: Reservation
    try { reservation = await bridge.acquire(STORAGE_ACCOUNT) }
    catch { if (this.current(host, generation)) this.fail('WEB_LOAD_FAILED'); return }
    if (!this.current(host, generation)) { this.release(reservation?.lease); return }
    if (reservation == null || typeof reservation.lease !== 'string' || typeof reservation.partition !== 'string'
      || !reservation.partition.startsWith('dsh-sidebar-browser-')) {
      this.release(reservation?.lease)
      this.fail('WEB_LOAD_FAILED')
      return
    }
    // Own the lease before any DOM/preload operation that can throw.
    this.lease = reservation.lease
    try {
      const element = document.createElement('webview') as ManagedWebview
      this.element = element
      const lifetime = new AbortController()
      this.lifetime = lifetime
      const options = { signal: lifetime.signal }
      element.className = 'dshcb-webview'
      element.setAttribute('partition', reservation.partition)
      element.setAttribute('name', reservation.lease)
      element.setAttribute('allowpopups', '')
      element.setAttribute('src', `about:blank#${reservation.lease}`)
      element.setAttribute('aria-label', 'DeepSeek')
      this.offOpen = bridge.onOpenRequested(reservation.lease, url => {
        if (!this.current(host, generation)) return
        if (acceptedUrl(url) === undefined) this.fail('WEB_NAVIGATION_BLOCKED')
        else this.open({ url })
      })
      let bootstrap = true
      element.addEventListener('dom-ready', () => {
        this.ready = true
        if (bootstrap) { bootstrap = false; this.loadPending(); return }
        this.observe(element)
      }, options)
      element.addEventListener('did-start-loading', () => {
        this.captureRevision++
        if (!bootstrap && this.state.phase !== 'error') this.patch({ phase: 'loading', url: this.pending })
      }, options)
      element.addEventListener('did-stop-loading', () => { if (!bootstrap && this.state.phase !== 'error') this.observe(element) }, options)
      element.addEventListener('did-navigate', () => { this.captureRevision++; this.history.pause('loading'); this.observe(element) }, options)
      element.addEventListener('did-navigate-in-page', () => { this.captureRevision++; this.history.pause('loading'); this.observe(element) }, options)
      element.addEventListener('did-fail-load', event => {
        if ('isMainFrame' in event && event.isMainFrame === true && 'errorCode' in event && event.errorCode !== -3) this.fail('WEB_LOAD_FAILED')
      }, options)
      for (const name of ['render-process-gone', 'destroyed']) {
        element.addEventListener(name, () => {
          if (!this.current(host, generation)) return
          this.detach()
          this.host = host
          this.fail('WEB_LOAD_FAILED')
        }, options)
      }
      host.append(element)
    } catch {
      this.detach()
      this.host = host
      this.fail('WEB_LOAD_FAILED')
    }
  }

  private current(host: HTMLElement, generation: number): boolean {
    return !this.disposed && this.host === host && this.generation === generation
  }
  private observe(element: ManagedWebview): void {
    if (this.element !== element || !this.ready) return
    try {
      const value = element.getURL()
      if (value.startsWith('about:blank#')) return
      const url = acceptedUrl(value)
      // Electron renderer navigation events cannot enforce a main-process allowlist.
      // Main retains its own isolation policy; this guard stops unsupported observed pages.
      if (url === undefined) {
        element.stop()
        const host = this.host
        this.detach()
        this.host = host
        this.fail('WEB_NAVIGATION_BLOCKED')
        return
      }
      this.pending = url
      this.patch({ phase: 'ready', url })
    } catch { this.fail('WEB_LOAD_FAILED') }
  }
  private loadPending(): void {
    const element = this.element
    if (!this.ready || element === undefined) return
    const url = this.pending
    this.patch({ phase: 'loading', url })
    void Promise.resolve().then(() => {
      if (this.element !== element || !this.ready) return
      return element.loadURL(url)
    }).catch((error: unknown) => {
      if (this.element !== element || this.pending !== url) return
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_ABORTED') return
      this.fail('WEB_LOAD_FAILED')
    })
  }
  reload(): void {
    this.captureRevision++
    if (this.disposed) return
    if (this.host === undefined) return
    if (this.element === undefined) { const host = this.host; this.mount(host); return }
    this.loadPending()
  }

  private async readHistory(more: boolean, signal: AbortSignal): Promise<Result<WebHistoryPage>> {
    const element = this.element
    if (element === undefined || !this.ready || this.state.phase !== 'ready'
      || typeof element.executeJavaScript !== 'function') return errCode('WEB_HISTORY_UNAVAILABLE', 'guest history read unavailable')
    const generation = this.generation
    const revision = this.captureRevision
    const stop = AbortSignal.any([signal, AbortSignal.timeout(6000), ...(this.lifetime === undefined ? [] : [this.lifetime.signal])])
    let off: (() => void) | undefined
    try {
      if (stop.aborted) return errCode('WEB_HISTORY_UNAVAILABLE', 'guest history read canceled')
      const canceled = new Promise<never>((_resolve, reject) => {
        const listener = (): void => { reject(new Error('history read canceled')) }
        stop.addEventListener('abort', listener, { once: true })
        off = () => { stop.removeEventListener('abort', listener) }
      })
      const result = await Promise.race([element.executeJavaScript(webHistoryScript(more), false), canceled])
      if (stop.aborted || this.element !== element || this.generation !== generation || this.captureRevision !== revision) {
        return errCode('WEB_HISTORY_UNAVAILABLE', 'guest history read superseded')
      }
      if (!isPlainObject(result)) return errCode('WEB_HISTORY_UNSUPPORTED', 'invalid history envelope')
      if (result.ok === true) {
        const validated = validateWebHistory(result.value)
        if (!validated.ok) return validated
        const current = new URL(element.getURL())
        if (validated.value.pageUrl !== current.origin + current.pathname) return errCode('WEB_HISTORY_UNAVAILABLE', 'guest history route changed')
        return validated
      }
      switch (result.code) {
        case 'WEB_HISTORY_UNSUPPORTED': case 'WEB_HISTORY_LOAD_FAILED': case 'WEB_HISTORY_TOO_LARGE':
        case 'WEB_NAVIGATION_BLOCKED': return errCode(result.code, 'guest history could not be read')
        default: return errCode('WEB_HISTORY_UNAVAILABLE', 'guest history read failed')
      }
    } catch { return errCode('WEB_HISTORY_UNAVAILABLE', 'guest history read failed') }
    finally { off?.() }
  }

  /** Compare two bounded reads; abort on navigation, draft input, streaming, or changing content. */
  async captureCurrent(signal: AbortSignal): Promise<Result<WebConversationCapture>> {
    const element = this.element
    if (element === undefined || !this.ready || this.state.phase !== 'ready'
      || typeof element.executeJavaScript !== 'function') return errCode('WEB_CAPTURE_UNAVAILABLE', 'guest page read is unavailable')
    const revision = this.captureRevision
    const generation = this.generation
    const lifetime = this.lifetime?.signal
    const stop = AbortSignal.any([signal, ...(lifetime === undefined ? [] : [lifetime]), AbortSignal.timeout(12000)])
    const unchanged = (): boolean => this.element === element && revision === this.captureRevision
      && generation === this.generation && this.state.phase === 'ready'
    const read = async (): Promise<Result<WebConversationCapture>> => {
      if (stop.aborted) return captureCanceled()
      if (!unchanged()) return errCode('WEB_CAPTURE_CHANGED', 'guest changed during capture')
      let off: (() => void) | undefined
      try {
        const aborted = new Promise<never>((_resolve, reject) => {
          const listener = (): void => { reject(new Error('capture canceled')) }
          stop.addEventListener('abort', listener, { once: true })
          off = () => { stop.removeEventListener('abort', listener) }
        })
        const value = await Promise.race([element.executeJavaScript!(currentConversationScript(), false), aborted])
        if (stop.aborted) return captureCanceled()
        if (!unchanged()) return errCode('WEB_CAPTURE_CHANGED', 'guest changed during capture')
        if (!isPlainObject(value)) return errCode('WEB_CAPTURE_UNSUPPORTED', 'page returned invalid capture envelope')
        if (value.ok === false) {
          switch (value.code) {
            case 'WEB_NAVIGATION_BLOCKED': case 'WEB_CAPTURE_UNSUPPORTED': case 'WEB_CAPTURE_EMPTY':
            case 'WEB_CAPTURE_BUSY': case 'WEB_CAPTURE_DRAFT_PRESENT': case 'INPUT_TOO_LARGE':
              return errCode(value.code, 'page capture could not complete')
            default: return errCode('WEB_CAPTURE_UNSUPPORTED', 'page returned unsupported capture status')
          }
        }
        return value.ok === true ? validateWebCapture(value.value)
          : errCode('WEB_CAPTURE_UNSUPPORTED', 'page returned invalid capture status')
      } catch { return stop.aborted ? captureCanceled() : errCode('WEB_CAPTURE_UNAVAILABLE', 'guest page read failed') }
      finally { off?.() }
    }
    const first = await read()
    if (!first.ok) return first
    // A cancellable pause catches normal streaming updates; explicit Stop/loader checks also run in both reads.
    await new Promise<void>(resolve => {
      if (stop.aborted) { resolve(); return }
      const done = (): void => { clearTimeout(timer); stop.removeEventListener('abort', done); resolve() }
      const timer = setTimeout(done, 800)
      stop.addEventListener('abort', done, { once: true })
    })
    const second = await read()
    if (!second.ok) return second
    return JSON.stringify(first.value) === JSON.stringify(second.value) ? second
      : errCode('WEB_CAPTURE_CHANGED', 'rendered conversation changed between reads')
  }
  private release(lease: string | undefined): void {
    if (this.bridge === undefined || typeof lease !== 'string' || lease.length === 0) return
    const released = Promise.resolve().then(() => this.bridge!.release(lease)).catch(() => {
      // Main also reclaims window-owned leases on destruction; never log account data.
    }).finally(() => { this.releases.delete(released) })
    this.releases.add(released)
  }
  private detach(): void {
    this.history.pause('paused', false)
    this.captureRevision++
    this.generation++
    this.offOpen?.()
    this.offOpen = undefined
    this.lifetime?.abort()
    this.lifetime = undefined
    this.element?.remove()
    this.element = undefined
    if (this.lease !== undefined) this.release(this.lease)
    this.lease = undefined
    this.ready = false
    this.host = undefined
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.detach()
    this.history.dispose()
    this.listeners.clear()
  }
}

/** Creates a desktop carrier, or an explicit unavailable adapter in a web-only host. */
export function createDesktopWebCarrier(): PresentedWebCarrier {
  return new DesktopWebCarrier(browserBridge())
}
