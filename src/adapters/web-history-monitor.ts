/** One cancellable read at a time; metadata is replaced, never merged or persisted. */
import type { ArchiveError, Result } from '../shared/errors'
import type { WebHistoryItem, WebHistoryPage } from '../shared/web-history'

export interface WebHistoryState {
  phase: WebHistoryPage['phase'] | 'paused' | 'unavailable' | 'error'
  items: WebHistoryItem[]
  refreshing: boolean
  loadingMore: boolean
  error?: ArchiveError
}
export interface WebHistoryPort {
  getSnapshot(): WebHistoryState
  subscribe(listener: () => void): () => void
  refresh(more?: boolean): Promise<void>
}
export class WebHistoryMonitor implements WebHistoryPort {
  private state: WebHistoryState = { phase: 'paused', items: [], refreshing: false, loadingMore: false }
  private listeners = new Set<() => void>()
  private active = false
  private disposed = false
  private abort: AbortController | undefined
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly read: (more: boolean, signal: AbortSignal) => Promise<Result<WebHistoryPage>>) {}
  getSnapshot = (): WebHistoryState => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private patch(state: WebHistoryState): void {
    if (this.disposed || JSON.stringify(state) === JSON.stringify(this.state)) return
    this.state = state
    for (const listener of this.listeners) listener()
  }
  pause(phase: 'paused' | 'loading' | 'unavailable', clear = true): void {
    this.active = false
    this.abort?.abort()
    this.abort = undefined
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.patch({ phase, items: clear ? [] : this.state.items, refreshing: false, loadingMore: false })
  }
  resume(): void {
    if (this.active || this.disposed) return
    this.active = true
    void this.refresh()
  }
  async refresh(more = false): Promise<void> {
    if (!this.active || this.disposed || this.abort !== undefined) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    const abort = new AbortController()
    this.abort = abort
    // Do not make the list flicker on every background poll.
    if (more) this.patch({ ...this.state, refreshing: true })
    try {
      const result = await this.read(more, abort.signal)
      if (this.abort !== abort || abort.signal.aborted || this.disposed) return
      if (result.ok) this.patch({ phase: result.value.phase, items: result.value.items,
        refreshing: false, loadingMore: result.value.loadingMore })
      else this.patch({ phase: 'error', items: [], refreshing: false, loadingMore: false, error: result.error })
    } catch {
      if (this.abort === abort && !abort.signal.aborted) {
        this.patch({ phase: 'unavailable', items: [], refreshing: false, loadingMore: false })
      }
    } finally {
      if (this.abort === abort) {
        this.abort = undefined
        if (this.active && !this.disposed) this.timer = setTimeout(() => { void this.refresh() }, more ? 800 : 3000)
      }
    }
  }
  dispose(): void {
    this.pause('unavailable')
    this.disposed = true
    this.listeners.clear()
  }
}
