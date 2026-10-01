/** One resident switch for both panels; only owned spacers are added to native chrome. */
import type { ChatBridgeController } from './state/controller'
import type { DesktopChrome } from './desktop-chrome'
import type { Translate } from './presentation'

const MAIN_SLOT = '[data-slot="main"]'
const PANEL_ID = 'dsh-chat-bridge'

function chrome(): DesktopChrome {
  if (document.documentElement.dataset.platform !== 'darwin') return 'standard'
  return document.documentElement.hasAttribute('data-fullscreen') ? 'macos-fullscreen' : 'macos-windowed'
}

/** Resolve only the recognized main-panel root, never a random similarly sized element. */
function mainRoot(chat: boolean): HTMLElement | undefined {
  const slots = document.querySelectorAll<HTMLElement>(MAIN_SLOT)
  if (slots.length !== 1) return undefined
  const main = slots[0]!
  // ConversationPanel returns another public Slot, unlike our direct Chat root.
  // Its display:contents wrapper is still a DOM node and must be traversed explicitly.
  const outlets = chat ? [main]
    : [...main.querySelectorAll<HTMLElement>(':scope > [data-slot="main.conversation"]')]
  if (outlets.length !== 1) return undefined
  const roots = [...outlets[0]!.children].filter((node): node is HTMLElement => {
    if (!(node instanceof HTMLElement)) return false
    if (chat) return node.matches('.dshcb-root[data-dsh-chat-bridge="panel"]')
    return ['hero', 'active', 'settling'].includes(node.dataset.phase ?? '')
      && node.querySelector('[data-conversation-header-leading]') !== null
      && node.querySelector('[data-conversation-content]') !== null
  })
  return roots.length === 1 ? roots[0] : undefined
}

export interface FixedModeSwitch {
  sync(panelId: string | null, t: Translate): void
  dispose(): void
}

export function installFixedModeSwitch(controller: ChatBridgeController, schedule: () => void): FixedModeSwitch {
  const switcher = document.createElement('div')
  switcher.className = 'dshcb-modes dshcb-fixed-modes'
  switcher.setAttribute('role', 'group')
  switcher.hidden = true
  const chatButton = document.createElement('button')
  chatButton.className = 'dshcb-mode'
  chatButton.type = 'button'
  chatButton.addEventListener('click', () => { controller.openChatPanel() })
  const workButton = document.createElement('button')
  workButton.className = 'dshcb-mode'
  workButton.type = 'button'
  workButton.addEventListener('click', () => { controller.returnToWork() })
  switcher.append(chatButton, workButton)
  // Like the menu portal, the resident control comes after native drag rows.
  document.body.append(switcher)
  let observed: HTMLElement | undefined
  let nativeSeat: HTMLDivElement | undefined
  let disposed = false
  const resize = new ResizeObserver(schedule)

  const clearRoot = (): void => {
    resize.disconnect()
    observed = undefined
    nativeSeat?.remove()
    nativeSeat = undefined
  }
  return {
    sync(panelId, t) {
      if (disposed) return
      const chat = panelId === PANEL_ID
      const root = panelId === null || chat ? mainRoot(chat) : undefined
      if (observed !== root) {
        clearRoot()
        observed = root
        if (root !== undefined) resize.observe(root)
      }
      if (root === undefined) { switcher.hidden = true; return }
      // Chat owns its seat through React; only the native panel needs a removable addition.
      if (!chat && nativeSeat?.isConnected !== true) {
        nativeSeat = document.createElement('div')
        nativeSeat.className = 'dshcb-mode-seat'
        nativeSeat.setAttribute('aria-hidden', 'true')
        root.prepend(nativeSeat)
      }
      const seats = [...root.children].filter((child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains('dshcb-mode-seat'))
      const seat = seats.length === 1 ? seats[0] : undefined
      if (seat === undefined) { switcher.hidden = true; return }
      seat.dataset.chrome = chrome()
      const rect = seat.getBoundingClientRect()
      if (rect.width < 192 || rect.height < 48 || root.getBoundingClientRect().height < rect.height) {
        switcher.hidden = true
        return
      }
      if (chatButton.textContent !== t('mode.chat')) chatButton.textContent = t('mode.chat')
      if (workButton.textContent !== t('mode.work')) workButton.textContent = t('mode.work')
      chatButton.title = t('mode.chatHint')
      workButton.title = t('mode.workHint')
      chatButton.setAttribute('aria-pressed', String(chat))
      workButton.setAttribute('aria-pressed', String(!chat))
      if (switcher.getAttribute('aria-label') !== t('mode.group')) switcher.setAttribute('aria-label', t('mode.group'))
      switcher.style.left = `${rect.left + rect.width / 2}px`
      // Every seat ends with the same 56px row: 8px + 40px control + 8px.
      switcher.style.top = `${rect.bottom - 48}px`
      switcher.hidden = false
    },
    dispose() {
      if (disposed) return
      disposed = true
      clearRoot()
      switcher.remove()
    },
  }
}
