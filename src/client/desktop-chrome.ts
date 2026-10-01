/** Read the desktop shell's public document markers; never infer a platform from a UA. */
import { useSyncExternalStore } from 'react'

export type DesktopChrome = 'standard' | 'macos-windowed' | 'macos-fullscreen'

function snapshot(): DesktopChrome {
  if (typeof document === 'undefined' || document.documentElement.dataset.platform !== 'darwin') return 'standard'
  return document.documentElement.hasAttribute('data-fullscreen') ? 'macos-fullscreen' : 'macos-windowed'
}

function subscribe(listener: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-platform', 'data-fullscreen'],
  })
  return () => { observer.disconnect() }
}

/** Keep the panel clear of native macOS controls, including after a fullscreen transition. */
export function useDesktopChrome(): DesktopChrome {
  return useSyncExternalStore(subscribe, snapshot, () => 'standard')
}
