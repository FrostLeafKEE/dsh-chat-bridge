/**
 * Stylesheet installation and removal.
 *
 * The sheet lives in a single tagged `<style>` element. `installStyles`
 * returns an idempotent disposer that removes exactly that element, so
 * disabling the plugin leaves no rule behind — nothing else in the plugin is
 * allowed to write to `document.head`.
 *
 * @module dsh-chat-bridge/client/styles/install
 */

import { PLUGIN_STYLES, STYLE_TAG_ID } from './index'

/**
 * Inject the plugin stylesheet once.
 * @param doc - document to install into; injectable for tests.
 * @returns an idempotent disposer removing the injected element.
 */
export function installStyles(doc: Document = document): () => void {
  const selector = `style[data-plugin-css="${STYLE_TAG_ID}"]`
  if (doc.querySelector(selector) !== null) {
    // Another activation already injected the sheet; this activation owns nothing.
    return () => {}
  }
  const tag = doc.createElement('style')
  tag.dataset.plugin = STYLE_TAG_ID
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = PLUGIN_STYLES
  doc.head.appendChild(tag)
  let removed = false
  return () => {
    if (removed) return
    removed = true
    tag.remove()
  }
}
