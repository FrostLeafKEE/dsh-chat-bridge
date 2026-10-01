import { describe, expect, it, vi } from 'vitest'
import { trapDialogTab } from '../src/client/dialog-focus'

describe('dialog keyboard focus', () => {
  it.each(['container', 'first', 'outside'])('Shift+Tab from %s goes to the last control', active => {
    const first = { focus: vi.fn() }, last = { focus: vi.fn() }
    const ownerDocument: { activeElement: unknown } = { activeElement: null }
    const node = { focus: vi.fn(), querySelectorAll: () => [first, last], ownerDocument,
      contains: () => active !== 'outside' }
    ownerDocument.activeElement = active === 'container' ? node : active === 'first' ? first : null
    const event = { shiftKey: true, preventDefault: vi.fn() }
    trapDialogTab(node as unknown as HTMLElement, event)
    expect(last.focus).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })
  it('wraps the last control forward and traps empty dialogs at their container', () => {
    const first = { focus: vi.fn() }, last = { focus: vi.fn() }
    const node = { focus: vi.fn(), querySelectorAll: () => [first, last],
      ownerDocument: { activeElement: last }, contains: () => true }
    const event = { shiftKey: false, preventDefault: vi.fn() }
    trapDialogTab(node as unknown as HTMLElement, event)
    expect(first.focus).toHaveBeenCalledOnce()
    node.querySelectorAll = () => []
    trapDialogTab(node as unknown as HTMLElement, event)
    expect(node.focus).toHaveBeenCalledOnce()
  })
})
