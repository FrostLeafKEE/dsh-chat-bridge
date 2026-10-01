/** Plugin-owned listbox, portaled outside the sidebar's clipped scroll region. */
import { createBridgeIcon } from './icons'
import type { Translate } from './presentation'

export type ChatBridgeMode = 'work' | 'chat'
export interface ModePicker {
  readonly element: HTMLDivElement
  update(mode: ChatBridgeMode, t: Translate): void
  close(): void
  dispose(): void
}

let nextPickerId = 0

export function createModePicker(onSelect: (mode: ChatBridgeMode) => void): ModePicker {
  const id = `dshcb-mode-picker-${++nextPickerId}`
  const element = document.createElement('div')
  element.className = 'dshcb-mode-picker'
  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'dshcb-mode-trigger'
  trigger.setAttribute('aria-haspopup', 'listbox')
  trigger.setAttribute('aria-controls', id)
  trigger.setAttribute('aria-expanded', 'false')
  const glyph = document.createElement('span')
  glyph.className = 'dshcb-mode-glyph'
  const label = document.createElement('span')
  label.className = 'dshcb-mode-label'
  const caret = document.createElement('span')
  caret.className = 'dshcb-mode-caret'
  caret.append(createBridgeIcon('chevron'))
  trigger.append(glyph, label, caret)
  element.append(trigger)

  const popup = document.createElement('div')
  popup.id = id
  popup.className = 'dshcb-mode-popover'
  popup.setAttribute('role', 'listbox')
  popup.tabIndex = -1
  popup.hidden = true
  const modes = ['work', 'chat'] as const
  const rows = modes.map(mode => {
    const row = document.createElement('div')
    row.className = 'dshcb-mode-option'
    row.id = `${id}-${mode}`
    row.setAttribute('role', 'option')
    const icon = document.createElement('span')
    icon.className = 'dshcb-mode-option-icon'
    icon.append(createBridgeIcon(mode))
    const copy = document.createElement('span')
    copy.className = 'dshcb-mode-option-copy'
    const title = document.createElement('span')
    title.className = 'dshcb-mode-option-title'
    title.id = `${row.id}-label`
    const description = document.createElement('span')
    description.className = 'dshcb-mode-option-description'
    description.id = `${row.id}-description`
    row.setAttribute('aria-labelledby', title.id)
    row.setAttribute('aria-describedby', description.id)
    copy.append(title, description)
    const check = document.createElement('span')
    check.className = 'dshcb-mode-option-check'
    check.append(createBridgeIcon('check'))
    row.append(icon, copy, check)
    popup.append(row)
    return { mode, row, title, description }
  })
  // No changes to the host subtree: this overlay and the trigger are both ours.
  document.body.append(popup)
  let selected: ChatBridgeMode = 'work'
  let highlighted = 0
  let disposed = false
  let listening = false

  const highlight = (index: number): void => {
    highlighted = (index + rows.length) % rows.length
    for (const [i, item] of rows.entries()) item.row.dataset.highlighted = String(i === highlighted)
    popup.setAttribute('aria-activedescendant', rows[highlighted]!.row.id)
    if (!popup.hidden) rows[highlighted]!.row.scrollIntoView({ block: 'nearest' })
  }
  const position = (): void => {
    if (popup.hidden) return
    if (!trigger.isConnected || trigger.getBoundingClientRect().width === 0) { close(); return }
    const rect = trigger.getBoundingClientRect()
    const margin = 12
    // The host publishes a pixel-resolved overlay inset for its native caption.
    const inset = Number.parseFloat(getComputedStyle(popup).scrollPaddingTop)
    const topInset = Math.max(margin, Number.isFinite(inset) ? inset : margin)
    const width = Math.min(Math.max(rect.width, 240), Math.max(0, window.innerWidth - 2 * margin))
    const availableHeight = Math.max(0, window.innerHeight - topInset - margin)
    popup.style.width = `${width}px`
    popup.style.maxHeight = `${availableHeight}px`
    const height = Math.min(popup.scrollHeight, availableHeight)
    const below = rect.bottom + 6
    const preferred = below + height <= window.innerHeight - margin ? below : rect.top - height - 6
    popup.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`
    popup.style.top = `${Math.max(topInset, Math.min(preferred, window.innerHeight - height - margin))}px`
  }
  const outside = (event: PointerEvent): void => {
    if (event.target instanceof Node && !element.contains(event.target) && !popup.contains(event.target)) close()
  }
  const focusOutside = (event: FocusEvent): void => {
    if (event.target instanceof Node && !element.contains(event.target) && !popup.contains(event.target)) close()
  }
  function close(restore = false): void {
    popup.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    if (listening) {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', focusOutside, true)
      document.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
      listening = false
    }
    if (restore && trigger.isConnected) trigger.focus()
  }
  const open = (index = modes.indexOf(selected)): void => {
    if (disposed) return
    popup.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    position()
    if (popup.hidden) return
    highlight(index)
    if (!listening) {
      document.addEventListener('pointerdown', outside, true)
      document.addEventListener('focusin', focusOutside, true)
      document.addEventListener('scroll', position, true)
      window.addEventListener('resize', position)
      listening = true
    }
    popup.focus({ preventScroll: true })
  }
  const choose = (mode: ChatBridgeMode): void => {
    close(true)
    if (mode !== selected) onSelect(mode)
  }
  trigger.addEventListener('click', () => { if (popup.hidden) open(); else close(true) })
  trigger.addEventListener('keydown', event => {
    if (event.isComposing || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    open(event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : modes.indexOf(selected))
  })
  popup.addEventListener('keydown', event => {
    if (event.isComposing) return
    if (event.key === 'Tab') { close(true); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') close(true)
    else if (event.key === 'Enter' || event.key === ' ') choose(rows[highlighted]!.mode)
    else highlight(event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
      : highlighted + (event.key === 'ArrowDown' ? 1 : -1))
  })
  for (const [index, item] of rows.entries()) {
    item.row.addEventListener('pointermove', () => { if (highlighted !== index) highlight(index) })
    item.row.addEventListener('click', () => { choose(item.mode) })
  }
  return {
    element,
    update(mode, t) {
      if (disposed) return
      const changed = mode !== selected
      selected = mode
      if (changed) close()
      const text = t(mode === 'chat' ? 'mode.chatArea' : 'mode.workspace')
      if (label.textContent !== text) label.textContent = text
      if (glyph.dataset.mode !== mode) {
        glyph.replaceChildren(createBridgeIcon(mode))
        glyph.dataset.mode = mode
      }
      const name = `${t('mode.group')}: ${text}`
      if (trigger.getAttribute('aria-label') !== name) trigger.setAttribute('aria-label', name)
      trigger.title = t('mode.keyboardWork')
      if (popup.getAttribute('aria-label') !== t('mode.group')) popup.setAttribute('aria-label', t('mode.group'))
      for (const item of rows) {
        const title = t(item.mode === 'chat' ? 'mode.chatArea' : 'mode.workspace')
        const description = t(item.mode === 'chat' ? 'mode.chatDescription' : 'mode.workDescription')
        if (item.title.textContent !== title) item.title.textContent = title
        if (item.description.textContent !== description) item.description.textContent = description
        item.row.setAttribute('aria-selected', String(item.mode === mode))
      }
      position()
    },
    close,
    dispose() {
      if (disposed) return
      disposed = true
      close()
      popup.remove()
      element.remove()
    },
  }
}
