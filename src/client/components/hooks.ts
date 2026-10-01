/**
 * React binding for the state controller.
 *
 * `subscribe` and `getSnapshot` are wrapped in `useCallback` so the store
 * identity stays stable across renders — an inline pair would make React
 * resubscribe on every render.
 *
 * @module dsh-chat-bridge/client/components/hooks
 */

import { useCallback, useSyncExternalStore } from 'react'
import type { ChatBridgeController, ChatBridgeState } from '../state/controller'

/**
 * Subscribe the calling component to the controller's state.
 * @param controller - the plugin's controller instance.
 * @returns the current state.
 */
export function usePanelState(controller: ChatBridgeController): ChatBridgeState {
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller])
  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
