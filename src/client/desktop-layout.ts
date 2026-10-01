/** Version-scoped additions for native chrome holes that do not expose a Slot. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PresentedWebCarrier } from '../adapters/desktop-web-carrier'
import { DEEPSEEK_WEB_URL } from '../adapters/desktop-web-carrier'
import type { ChatBridgeController } from './state/controller'
import { NS } from './locales'
import { createModePicker, type ModePicker } from './mode-picker'
import { installFixedModeSwitch } from './fixed-mode-switch'

/** Owns only added nodes and capture listeners; never replaces a host component. */
export function installDesktopLayout(ctx: Context, controller: ChatBridgeController, carrier: PresentedWebCarrier): () => void {
  const t = ctx.locale.bind(NS)
  const sidebarText = ctx.locale.bind('sidebar')
  const buttons = new Map<HTMLButtonElement, () => void>()
  let selector: ModePicker | undefined
  let selectorTarget: HTMLButtonElement | undefined
  let queued = false
  let frame = 0
  let active = true
  const isChat = (): boolean => ctx.layout.panelInfo.getSnapshot().activePanelId === 'dsh-chat-bridge'
  const chat = (): void => { controller.openChatPanel() }
  const newChat = (): void => { carrier.open({ url: DEEPSEEK_WEB_URL }); chat() }

  const schedule = (): void => {
    if (!active || queued) return
    queued = true
    frame = requestAnimationFrame(sync)
  }
  const fixedModes = installFixedModeSwitch(controller, schedule)

  const sync = (): void => {
    queued = false
    if (!active) return
    fixedModes.sync(ctx.layout.panelInfo.getSnapshot().activePanelId, t)
    if (carrier.capability.state !== 'available') return
    const label = sidebarText('session.new.label')
    const matches = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label]')]
      .filter(button => button.getAttribute('aria-label') === label && button.closest('.dshcb-root') === null)
    // Ambiguous/unrecognized chrome gets no interception; public Chat entry still works.
    if (matches.length > 2) {
      for (const off of buttons.values()) off()
      buttons.clear()
      selector?.dispose()
      selector = undefined
      selectorTarget = undefined
      return
    }
    for (const [button, off] of buttons) {
      if (!matches.includes(button)) { off(); buttons.delete(button) }
    }
    for (const button of matches) {
      if (buttons.has(button)) continue
      const click = (event: MouseEvent): void => {
        if (!isChat()) return
        event.preventDefault()
        event.stopImmediatePropagation()
        newChat()
      }
      button.addEventListener('click', click, true)
      buttons.set(button, () => { button.removeEventListener('click', click, true) })
    }
    // The brand button carries the same aria-label, so require the visible New Session text.
    const visibleLabel = sidebarText('session.new')
    const wideMatches = matches.filter(button => button.textContent?.includes(visibleLabel) === true
      && button.getBoundingClientRect().width >= 100)
    const wide = wideMatches.length === 1 ? wideMatches[0] : undefined
    if (selectorTarget !== wide || selector?.element.isConnected === false) {
      selector?.dispose()
      selector = undefined
      selectorTarget = wide
      const parent = wide?.parentElement
      if (wide !== undefined && parent != null) {
        selector = createModePicker(mode => {
          if (mode === 'chat') chat()
          else controller.returnToWork()
        })
        parent.insertBefore(selector.element, wide)
      }
    }
    if (selector !== undefined) {
      selector.update(isChat() ? 'chat' : 'work', t)
    }
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['aria-label', 'data-content-phase', 'data-phase'] })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-platform', 'data-fullscreen'] })
  const offLocale = ctx.locale.subscribe(schedule)
  const offPanel = ctx.layout.panelInfo.subscribe(schedule)
  window.addEventListener('resize', schedule)
  sync()
  return () => {
    active = false
    cancelAnimationFrame(frame)
    observer.disconnect()
    offLocale()
    offPanel()
    window.removeEventListener('resize', schedule)
    for (const off of buttons.values()) off()
    buttons.clear()
    selector?.dispose()
    fixedModes.dispose()
  }
}
