/** Version-gated sidebar metadata, read exclusively from the official guest DOM. */
import { WEB_HISTORY_LIMITS } from '../shared/web-history'

interface HistoryOptions { script: string; more: boolean; maxItems: number; maxBytes: number; maxTitle: number }

// oxlint-disable unicorn/consistent-function-scoping -- Stringified guest function cannot use outer closures.
function readSidebar(options: HistoryOptions): unknown {
  const failure = (code: string): unknown => ({ ok: false, code })
  if (location.origin !== 'https://chat.deepseek.com') return failure('WEB_NAVIGATION_BLOCKED')
  if (!Array.from(document.scripts).some(script => {
    try { const url = new URL(script.src); return url.origin === 'https://fe-static.deepseek.com'
      && url.pathname.endsWith('/' + options.script) } catch { return false }
  })) return failure('WEB_HISTORY_UNSUPPORTED')
  const page = { scope: 'loaded-sidebar', phase: 'ready', pageUrl: location.origin + location.pathname,
    items: [] as { url: string; title: string }[], loadingMore: false }
  if (['/sign_in', '/sign_up', '/forgot_password', '/mobile_verification', '/banned', '/authorized'].includes(location.pathname)) {
    page.phase = 'signed-out'
    return { ok: true, value: page }
  }
  const roots = document.querySelectorAll<HTMLElement>('._6d215eb')
  if (roots.length !== 1) { page.phase = 'sidebar-closed'; return { ok: true, value: page } }
  const root = roots[0]!
  if (root.querySelector('._47ef3ad, .fa9e7cfe') !== null) return failure('WEB_HISTORY_LOAD_FAILED')
  if (root.querySelector('._06a97e9') !== null) { page.phase = 'loading'; return { ok: true, value: page } }
  page.loadingMore = root.querySelector('._0f1bc20') !== null
  const rows = root.querySelectorAll<HTMLAnchorElement>('a._546d736')
  if (rows.length > options.maxItems) return failure('WEB_HISTORY_TOO_LARGE')
  const urls = new Set<string>()
  for (const row of rows) {
    // Multi-select replaces links with button roles. Do not invent targets from internal state.
    const href = row.getAttribute('href')
    const titles = row.querySelectorAll('.c08e6e93')
    if (href === null || titles.length !== 1) return failure('WEB_HISTORY_UNSUPPORTED')
    let url: URL
    try { url = new URL(href, location.origin) } catch { return failure('WEB_HISTORY_UNSUPPORTED') }
    if (url.origin !== location.origin || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== ''
      || !/^\/a\/[\w-]{1,128}\/s\/[\w-]{1,128}$/.test(url.pathname)) return failure('WEB_HISTORY_UNSUPPORTED')
    const title = titles[0]!.textContent?.trim() ?? ''
    if (title === '' || title.length > options.maxTitle) return failure('WEB_HISTORY_UNSUPPORTED')
    if (!urls.has(url.href)) { urls.add(url.href); page.items.push({ url: url.href, title }) }
  }
  if (rows.length === 0 && root.querySelector('.fd90d2b2') === null) {
    page.phase = 'sidebar-closed'
    return { ok: true, value: page }
  }
  if (new TextEncoder().encode(JSON.stringify(page)).byteLength > options.maxBytes) return failure('WEB_HISTORY_TOO_LARGE')
  // Explicit user action only: normal website scrolling may ask its own server for the next page.
  // Auto-refresh never scrolls, clicks, submits, reads storage, or calls a private endpoint.
  if (options.more && page.items.length > 0 && !page.loadingMore) root.scrollTo({ top: root.scrollHeight, behavior: 'instant' })
  return { ok: true, value: page }
}
// oxlint-enable unicorn/consistent-function-scoping

export function webHistoryScript(more = false): string {
  return '(' + readSidebar.toString() + ')(' + JSON.stringify({ script: 'main.6fca03582d.js', more,
    maxItems: WEB_HISTORY_LIMITS.items, maxBytes: WEB_HISTORY_LIMITS.bytes, maxTitle: WEB_HISTORY_LIMITS.title }) + ')'
}
