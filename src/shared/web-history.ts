/** Ephemeral website list metadata. It never implies message history was imported. */
import { isPlainObject } from '../import/guard'
import { errCode, ok, type Result } from './errors'

export const WEB_HISTORY_LIMITS = { items: 5000, bytes: 1024 * 1024, title: 1024 } as const
export interface WebHistoryItem { url: string; title: string }
export interface WebHistoryPage {
  scope: 'loaded-sidebar'
  phase: 'ready' | 'loading' | 'signed-out' | 'sidebar-closed'
  pageUrl: string
  items: WebHistoryItem[]
  loadingMore: boolean
}

/** Accept only the session routes observed in the supported official render code. */
export function webConversationUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.origin !== 'https://chat.deepseek.com' || url.username !== '' || url.password !== ''
      || url.search !== '' || url.hash !== '' || !/^\/a\/[\w-]{1,128}\/s\/[\w-]{1,128}$/.test(url.pathname)) return undefined
    return url.href === value ? value : undefined
  } catch { return undefined }
}

/** Validate the guest boundary again; errors never carry guest text or unknown field names. */
function invalid(): Result<never> { return errCode('WEB_HISTORY_UNSUPPORTED', 'guest history metadata is unsupported') }

export function validateWebHistory(value: unknown): Result<WebHistoryPage> {
  if (!isPlainObject(value) || Object.keys(value).some(key => !['scope', 'phase', 'pageUrl', 'items', 'loadingMore'].includes(key))
    || value.scope !== 'loaded-sidebar' || typeof value.phase !== 'string' || !['ready', 'loading', 'signed-out', 'sidebar-closed'].includes(value.phase)
    || typeof value.pageUrl !== 'string' || typeof value.loadingMore !== 'boolean' || !Array.isArray(value.items)) return invalid()
  try {
    const url = new URL(value.pageUrl)
    if (url.origin !== 'https://chat.deepseek.com' || url.username !== '' || url.password !== ''
      || url.search !== '' || url.hash !== '' || url.href !== value.pageUrl || value.pageUrl.length > 512) return invalid()
  } catch { return invalid() }
  if (value.items.length > WEB_HISTORY_LIMITS.items) return errCode('WEB_HISTORY_TOO_LARGE', 'history list exceeds item limit')
  const urls = new Set<string>()
  const items: WebHistoryItem[] = []
  for (const item of value.items) {
    if (!isPlainObject(item) || Object.keys(item).some(key => !['url', 'title'].includes(key))
      || typeof item.url !== 'string' || webConversationUrl(item.url) === undefined || urls.has(item.url)
      || typeof item.title !== 'string' || item.title.trim() === '' || item.title.length > WEB_HISTORY_LIMITS.title) return invalid()
    urls.add(item.url)
    items.push({ url: item.url, title: item.title })
  }
  if (value.phase !== 'ready' && items.length > 0) return invalid()
  const page: WebHistoryPage = { scope: 'loaded-sidebar', phase: value.phase as WebHistoryPage['phase'],
    pageUrl: value.pageUrl, items, loadingMore: value.loadingMore }
  if (new TextEncoder().encode(JSON.stringify(page)).byteLength > WEB_HISTORY_LIMITS.bytes) {
    return errCode('WEB_HISTORY_TOO_LARGE', 'history metadata exceeds byte limit')
  }
  return ok(page)
}
