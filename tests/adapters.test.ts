/**
 * The three seam adapters: navigation through the public layout API, the web
 * carrier placeholder, and their disposal behaviour.
 * @module dsh-chat-bridge/tests/adapters
 */

import { describe, expect, it, vi } from 'vitest'
import { createDshNavigationPort } from '../src/adapters/dsh-navigation'
import { createPendingWebCarrier } from '../src/adapters/pending-web-carrier'
import { expectErr, expectOk } from './helpers'

describe('NavigationPort', () => {
  it('selects the plugin panel and returns to the conversation surface', () => {
    const selectPanel = vi.fn<(id: string | null) => void>()
    const port = createDshNavigationPort({ selectPanel }, 'dsh-chat-bridge')

    expect(expectOk(port.openChatPanel())).toBeUndefined()
    expect(selectPanel).toHaveBeenLastCalledWith('dsh-chat-bridge')

    // "Work" is `null` — the reserved conversation surface. It is not a new
    // session and does not change the current one.
    expect(expectOk(port.returnToWork())).toBeUndefined()
    expect(selectPanel).toHaveBeenLastCalledWith(null)
    expect(selectPanel).toHaveBeenCalledTimes(2)
  })

  it('converts a refused selection into a result instead of throwing', () => {
    const port = createDshNavigationPort({
      selectPanel: () => { throw new Error('keyed slot "main" has no entry for key "dsh-chat-bridge"') },
    }, 'dsh-chat-bridge')
    const error = expectErr(port.openChatPanel(), 'NAVIGATION_UNAVAILABLE')
    expect(error.message).not.toContain('dsh-chat-bridge')
  })

  it('stops navigating after dispose', () => {
    const selectPanel = vi.fn<(id: string | null) => void>()
    const port = createDshNavigationPort({ selectPanel }, 'dsh-chat-bridge')
    port.dispose()
    expectErr(port.openChatPanel(), 'NAVIGATION_UNAVAILABLE')
    expectErr(port.returnToWork(), 'NAVIGATION_UNAVAILABLE')
    expect(selectPanel).not.toHaveBeenCalled()
  })
})

describe('WebCarrierPort placeholder', () => {
  it('reports an unavailable capability and refuses to open', () => {
    const carrier = createPendingWebCarrier()
    expect(carrier.capability.state).toBe('unavailable')
    expect(carrier.capability.code).toBe('WEB_CARRIER_NOT_IMPLEMENTED')
    expect(carrier.capability.noteKey).toBe('capability.webCarrier.notImplemented')
    expectErr(carrier.open(), 'WEB_CARRIER_NOT_IMPLEMENTED')
    expectErr(carrier.open({ url: 'https://chat.deepseek.com/' }), 'WEB_CARRIER_NOT_IMPLEMENTED')
  })

  it('disposes idempotently', () => {
    const carrier = createPendingWebCarrier()
    carrier.dispose()
    carrier.dispose()
    expectErr(carrier.open(), 'WEB_CARRIER_NOT_IMPLEMENTED')
  })
})
