/**
 * {@link NavigationPort} backed by the public layout service.
 *
 * Two facts make this more than a one-line wrapper:
 *
 * 1. `selectPanel(null)` is the documented way back to the original
 *    conversation surface — it selects the session interface *without*
 *    changing the current session. "Work" therefore restores the user's own
 *    screen; it does not create a session, move history, or send a draft.
 * 2. `selectPanel(id)` throws when the key is not a live `main` registration,
 *    so the port converts that throw into a `NAVIGATION_UNAVAILABLE` result
 *    rather than letting an exception escape into a React event handler.
 *
 * The layout service is reached through a narrow structural interface instead
 * of the concrete client class, so this file stays importable from tests
 * without React or a live plugin tree.
 *
 * @module dsh-chat-bridge/adapters/dsh-navigation
 */

import type { CapabilityStatus, NavigationPort } from '../shared/contracts'
import { errCode, ok, type Result } from '../shared/errors'

/** The slice of `ctx.layout` this adapter uses. */
export interface LayoutPanelSeam {
  /**
   * Select a global main panel by id, or `null` for the conversation surface.
   * Throws when the id is not a live registration.
   * @param id - panel id or `null`.
   */
  selectPanel(id: string | null): void
}

/** Capability report for the navigation seam. */
export const NAVIGATION_CAPABILITY: CapabilityStatus = {
  state: 'available',
  noteKey: 'capability.navigation.publicLayout',
}

/**
 * Create the navigation port.
 * @param layout - the layout service seam.
 * @param panelId - this plugin's `main` panel key.
 * @returns the port.
 */
export function createDshNavigationPort(layout: LayoutPanelSeam, panelId: string): NavigationPort {
  let disposed = false
  return {
    /** Select this plugin's chat panel. */
    openChatPanel(): Result<undefined> {
      return select(layout, panelId, disposed)
    },
    /** Return to the original conversation surface. */
    returnToWork(): Result<undefined> {
      return select(layout, null, disposed)
    },
    /** Stop navigating; further calls report `NAVIGATION_UNAVAILABLE`. */
    dispose(): void {
      disposed = true
    },
  }
}

/**
 * Perform one selection, converting both disposal and thrown failures.
 * @param layout - the layout service seam.
 * @param id - panel id or `null`.
 * @param disposed - whether the port was released.
 * @returns success or `NAVIGATION_UNAVAILABLE`.
 */
function select(layout: LayoutPanelSeam, id: string | null, disposed: boolean): Result<undefined> {
  if (disposed) {
    return errCode('NAVIGATION_UNAVAILABLE', 'navigation port was disposed')
  }
  try {
    layout.selectPanel(id)
    return ok(undefined)
  } catch {
    // The layout service reports an unknown panel key by throwing; the message
    // is about the key, not about user content, but it is still not echoed.
    return errCode('NAVIGATION_UNAVAILABLE', 'the host layout service refused the panel selection', {
      detail: { panel: id === null ? 'conversation' : id },
    })
  }
}
