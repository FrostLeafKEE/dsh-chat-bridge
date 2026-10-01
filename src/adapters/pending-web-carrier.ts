/**
 * Placeholder {@link WebCarrierPort}.
 *
 * The basic stage does not embed the official web chat: that needs the Desktop
 * Browser lease, a webview lifecycle, login handling, and navigation policy —
 * all of which belong to the next stage. What this file *does* provide is the
 * seam: a stable type, an explicit `unavailable` capability the UI must render,
 * and a `dispose()` that a real carrier will implement to release a guest.
 *
 * Replacement point for the next stage: keep this file's exported factory name
 * and return a different {@link WebCarrierPort} implementation; nothing else in
 * the plugin needs to change.
 *
 * @module dsh-chat-bridge/adapters/pending-web-carrier
 */

import type { CapabilityStatus, WebCarrierPort, WebCarrierTarget } from '../shared/contracts'
import { errCode, type Result } from '../shared/errors'

/** Capability report the UI shows instead of a fake connected state. */
export const WEB_CARRIER_CAPABILITY: CapabilityStatus = {
  state: 'unavailable',
  code: 'WEB_CARRIER_NOT_IMPLEMENTED',
  noteKey: 'capability.webCarrier.notImplemented',
}

/**
 * Create the placeholder carrier. Every `open()` call fails with
 * `WEB_CARRIER_NOT_IMPLEMENTED`; nothing is rendered and no navigation happens.
 * @returns the placeholder port.
 */
export function createPendingWebCarrier(): WebCarrierPort {
  let disposed = false
  return {
    capability: WEB_CARRIER_CAPABILITY,
    /**
     * @param _target - requested page; ignored while the carrier is unavailable.
     * @returns always `WEB_CARRIER_NOT_IMPLEMENTED`.
     */
    open(_target?: WebCarrierTarget): Result<undefined> {
      if (disposed) {
        return errCode('WEB_CARRIER_NOT_IMPLEMENTED', 'web carrier was disposed')
      }
      return errCode('WEB_CARRIER_NOT_IMPLEMENTED', 'embedded web chat is not implemented in the basic build')
    },
    /** Release the carrier. Idempotent; a real carrier frees its guest here. */
    dispose(): void {
      disposed = true
    },
  }
}
