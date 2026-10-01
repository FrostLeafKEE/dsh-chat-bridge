/** Read-only adapter derived from the official public main.6fca03582d.js render code. */
import { LIMITS } from '../shared/limits'
import { WEB_CAPTURE_ADAPTER } from '../import/web-capture'

interface PageOptions { adapter: string; script: string; maxMessages: number; maxBytes: number }

/** Self-contained: its compiled function text runs only inside the sandboxed official guest. */
// oxlint-disable unicorn/consistent-function-scoping -- Helpers must stay inside the stringified function; outer closures do not exist in the guest.
function readRenderedConversation(options: PageOptions): unknown {
  const failure = (code: string): unknown => ({ ok: false, code })
  if (location.origin !== 'https://chat.deepseek.com') return failure('WEB_NAVIGATION_BLOCKED')
  const knownBuild = Array.from(document.scripts).some(script => {
    try { const url = new URL(script.src); return url.origin === 'https://fe-static.deepseek.com'
      && url.pathname.endsWith('/' + options.script) } catch { return false }
  })
  if (!knownBuild) return failure('WEB_CAPTURE_UNSUPPORTED')
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.ds-message'))
  if (rows.length === 0) return failure('WEB_CAPTURE_EMPTY')
  if (rows.length > options.maxMessages) return failure('INPUT_TOO_LARGE')
  // With an unsent draft, the website may replace the Stop control with Send while generating.
  if (Array.from(document.querySelectorAll('textarea')).some(input => input.value.trim() !== '')) {
    return failure('WEB_CAPTURE_DRAFT_PRESENT')
  }
  // Exact controls/loader from the gated frontend build; no guessed translated tooltip.
  const controls = Array.from(document.querySelectorAll('._52c986b'))
  if (controls.some(control => control.querySelector('[data-icon="spin"]') !== null
    || Array.from(control.querySelectorAll('path')).some(path => (path.getAttribute('d') ?? '').startsWith('M2 4.88C2 3.68009')))
    || document.querySelector('.ds-message .b4e4476b') !== null) return failure('WEB_CAPTURE_BUSY')

  let unsupported = false
  const fence = (text: string, minimum = 3): string => {
    let length = minimum
    for (const match of text.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1)
    return '`'.repeat(length)
  }
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (!(node instanceof HTMLElement)) return ''
    if (['SCRIPT', 'STYLE', 'BUTTON', 'INPUT', 'TEXTAREA'].includes(node.tagName)) return ''
    if (node.classList.contains('md-code-block') || node.tagName === 'PRE') {
      const pre = node.tagName === 'PRE' ? node : node.querySelector('pre')
      if (pre === null) { unsupported = true; return '' }
      const code = pre.textContent ?? ''
      const marker = fence(code)
      const language = node.querySelector('.md-code-block-infostring')?.textContent ?? ''
      return '\n\n' + marker + (/^[\w.+#-]{1,40}$/.test(language) ? language : '') + '\n'
        + code + (code.endsWith('\n') ? '' : '\n') + marker + '\n\n'
    }
    if (node.classList.contains('katex')) {
      const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent
      if (tex === undefined || tex === null) { unsupported = true; return '' }
      return '$' + tex + '$'
    }
    if (node.tagName === 'BR') return '\n'
    if (node.tagName === 'IMG') { unsupported = true; return '' }
    const children = Array.from(node.childNodes, child => read(child)).join('')
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? ''
      return /^[a-z][\w+.-]*:/i.test(href) && !/[\s<>]/.test(href)
        ? '[' + children.replace(/\]/g, '\\]') + '](<' + href + '>)' : children
    }
    if (node.tagName === 'CODE') {
      const marker = fence(children, 1)
      return marker + ' ' + children + ' ' + marker
    }
    if (node.tagName === 'LI') return '\n- ' + children + '\n'
    if (/^H[1-6]$/.test(node.tagName)) return '\n\n' + '#'.repeat(Number(node.tagName.slice(1))) + ' ' + children + '\n\n'
    if (node.tagName === 'STRONG' || node.tagName === 'B') return '**' + children + '**'
    if (node.tagName === 'EM' || node.tagName === 'I') return '*' + children + '*'
    if (node.tagName === 'TD' || node.tagName === 'TH') return children + '\t'
    if (['P', 'DIV', 'UL', 'OL', 'BLOCKQUOTE', 'TABLE', 'TR'].includes(node.tagName)) return '\n' + children + '\n'
    return children
  }
  const messages: { id: string; role: 'user' | 'assistant'; content: string }[] = []
  for (const [index, row] of rows.entries()) {
    const isUser = row.closest('._9663006') !== null
    const isAssistant = row.closest('._4f9bf79') !== null
    if (isUser === isAssistant) return failure('WEB_CAPTURE_UNSUPPORTED')
    const bodies = row.querySelectorAll<HTMLElement>(isUser ? '.ds-collapsible-text > div > span' : '.ds-assistant-message-main-content')
    if (bodies.length !== 1 || row.querySelector('textarea') !== null) return failure('WEB_CAPTURE_UNSUPPORTED')
    const body = bodies[0]
    if (body === undefined) return failure('WEB_CAPTURE_UNSUPPORTED')
    const content = isUser ? body.textContent ?? '' : read(body).replace(/^\n+|\n+$/g, '')
    if (unsupported || content.trim() === '') return failure('WEB_CAPTURE_UNSUPPORTED')
    if (content.length > options.maxBytes) return failure('INPUT_TOO_LARGE')
    const key = row.closest('[data-virtual-list-item-key]')?.getAttribute('data-virtual-list-item-key')
    messages.push({ id: key ?? 'rendered-' + String(index + 1), role: isUser ? 'user' : 'assistant', content })
  }
  const capture = { adapter: options.adapter, url: location.origin + location.pathname,
    title: document.title.trim() || 'DeepSeek', scope: 'rendered-current-branch', completeness: 'partial', messages }
  if (new TextEncoder().encode(JSON.stringify(capture)).byteLength > options.maxBytes - 256) return failure('INPUT_TOO_LARGE')
  return { ok: true, value: capture }
}
// oxlint-enable unicorn/consistent-function-scoping

/** No user-controlled code is interpolated; all options are plugin-owned constants. */
export function currentConversationScript(): string {
  return '(' + readRenderedConversation.toString() + ')(' + JSON.stringify({ adapter: WEB_CAPTURE_ADAPTER,
    script: 'main.6fca03582d.js', maxMessages: LIMITS.maxMessages, maxBytes: LIMITS.manualInputBytes }) + ')'
}
