import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFixedModeSwitch } from '../src/client/fixed-mode-switch'
import type { ChatBridgeController } from '../src/client/state/controller'
import { DocumentStub, ElementStub, ObserverStub } from './dom-stub'

let doc: DocumentStub
beforeEach(() => {
  doc = new DocumentStub()
  vi.stubGlobal('document', doc)
  vi.stubGlobal('HTMLElement', ElementStub)
  vi.stubGlobal('ResizeObserver', ObserverStub)
})
afterEach(() => { vi.unstubAllGlobals() })

function fixture(phase = 'active') {
  const main = doc.createElement('div'); main.setAttribute('data-slot', 'main')
  const outlet = doc.createElement('div'); outlet.setAttribute('data-slot', 'main.conversation')
  const root = doc.createElement('div'); root.dataset.phase = phase
  root.rect.height = 900
  const header = doc.createElement('div'); header.setAttribute('data-conversation-header-leading', '')
  const content = doc.createElement('div'); content.setAttribute('data-conversation-content', '')
  root.append(header, content); outlet.append(root); main.append(outlet); doc.body.append(main)
  const controller = { openChatPanel: vi.fn(), returnToWork: vi.fn() }
  const modes = installFixedModeSwitch(controller as unknown as ChatBridgeController, () => {})
  const control = doc.body.children.at(-1)!
  return { main, outlet, root, controller, modes, control }
}

describe('resident mode switch public slot traversal', () => {
  it.each(['hero', 'active', 'settling'])('finds the nested %s work root and cleans up', phase => {
    const { root, modes, control, controller } = fixture(phase)
    modes.sync(null, key => key)
    expect(control.hidden).toBe(false)
    expect(root.children[0]?.className).toBe('dshcb-mode-seat')
    expect(control.children[1]?.getAttribute('aria-pressed')).toBe('true')
    control.children[0]!.dispatchEvent(new Event('click'))
    expect(controller.openChatPanel).toHaveBeenCalledOnce()
    modes.dispose(); modes.dispose()
    expect(root.children).toHaveLength(2)
    expect(control.isConnected).toBe(false)
  })

  it('retains the same control and coordinates when switching to the chat root', () => {
    const { main, outlet, root, modes, control, controller } = fixture()
    modes.sync(null, key => key)
    const position = { ...control.style }
    outlet.remove()
    const chat = doc.createElement('div')
    chat.className = 'dshcb-root'; chat.setAttribute('data-dsh-chat-bridge', 'panel'); chat.rect.height = 900
    const seat = doc.createElement('div'); seat.className = 'dshcb-mode-seat'
    chat.append(seat); main.append(chat)
    modes.sync('dsh-chat-bridge', key => key)
    expect(control.hidden).toBe(false)
    expect(control.style).toEqual(position)
    expect(root.children).toHaveLength(2)
    expect(control.children[0]?.getAttribute('aria-pressed')).toBe('true')
    control.children[1]!.dispatchEvent(new Event('click'))
    expect(controller.returnToWork).toHaveBeenCalledOnce()
    modes.dispose()
    expect(chat.children).toEqual([seat])
  })

  it('hides on ambiguous outlets and unrelated panels without mutating the host', () => {
    const { main, modes, control, root } = fixture()
    const extra = doc.createElement('div'); extra.setAttribute('data-slot', 'main.conversation'); main.append(extra)
    modes.sync(null, key => key)
    expect(control.hidden).toBe(true)
    expect(root.children).toHaveLength(2)
    extra.remove(); modes.sync(null, key => key)
    expect(control.hidden).toBe(false)
    modes.sync('settings', key => key)
    expect(control.hidden).toBe(true)
    expect(root.children).toHaveLength(2)
    modes.dispose()
  })

  it('marks only the owned seat with Mac windowed/fullscreen chrome', () => {
    const { root, modes } = fixture()
    doc.documentElement.dataset.platform = 'darwin'
    modes.sync(null, key => key)
    expect(root.children[0]?.dataset.chrome).toBe('macos-windowed')
    doc.documentElement.setAttribute('data-fullscreen', '')
    modes.sync(null, key => key)
    expect(root.children[0]?.dataset.chrome).toBe('macos-fullscreen')
    expect(root.dataset).toEqual({ phase: 'active' })
    modes.dispose()
  })
})
