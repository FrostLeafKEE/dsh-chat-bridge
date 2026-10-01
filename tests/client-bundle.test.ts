/**
 * Client bundle protocol.
 *
 * The claim under test is the artifact contract, not the UI: executing
 * `lib/client.js` must only *register* a factory keyed by the bare package name,
 * materializing it must produce the plugin exports, and applying it must touch
 * only public slots, the plugin's own style tag, and the layout service.
 *
 * Everything runs in a `node:vm` context with hand-written stubs — there is no
 * DOM implementation and no real module loader here, which is exactly the point:
 * the bundle must not need either.
 *
 * Requires `lib/client.js`; `npm test` builds it first.
 * @module dsh-chat-bridge/tests/client-bundle
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PLATFORM_MODULES } from '../build/platform-externals'
import { DocumentStub, ElementStub, ObserverStub } from './dom-stub'

const here = dirname(fileURLToPath(import.meta.url))
const BUNDLE_PATH = join(here, '..', 'lib', 'client.js')
const BUNDLE_SOURCE = readFileSync(BUNDLE_PATH, 'utf8')

/** One captured `window.__ModuleLoader__.load(...)` call. */
interface Registration {
  id: string
  factory: (require: (specifier: string) => unknown) => Record<string, unknown>
}

/** Minimal document stand-in supporting exactly what the plugin uses. */
class FakeDocument extends DocumentStub {
  /** @returns a new style element stand-in. */
  override createElement(tag: string): ElementStub {
    return super.createElement(tag)
  }

  /**
   * Resolve the single selector shape the plugin uses.
   * @param selector - a `style[data-plugin-css="..."]` selector.
   * @returns the matching element, or null.
   */
  override querySelector(selector: string): ElementStub | null {
    const match = /data-plugin-css="([^"]+)"/.exec(selector)
    if (match === null) return super.querySelector(selector)
    const id = match[1]
    return this.head.children.find(child => child.dataset.pluginCss === id) ?? null
  }
}

/** Captured side effects of one `apply()` call. */
interface FakeContextRecorder {
  registrations: { options: Record<string, unknown>; component: unknown }[]
  dictionaries: { ns: string; dicts: Record<string, Record<string, string>> }[]
  visitedPanels: (string | null)[]
  disposers: (() => void)[]
}

/**
 * Build the minimal context the plugin body touches.
 * @returns the context object plus the recorder.
 */
function makeContext(): { ctx: unknown; recorder: FakeContextRecorder } {
  const recorder: FakeContextRecorder = {
    registrations: [],
    dictionaries: [],
    visitedPanels: [],
    disposers: [],
  }
  const record = (value: unknown): void => {
    if (typeof value === 'function') recorder.disposers.push(value as () => void)
  }
  const ctx = {
    effect: (callback: () => unknown): (() => void) => {
      record(callback())
      return () => {}
    },
    locale: {
      bind: () => (key: string) => key,
      subscribe: () => () => {},
      register: (ns: string, dicts: Record<string, Record<string, string>>): (() => void) => {
        recorder.dictionaries.push({ ns, dicts })
        return () => {}
      },
    },
    remote: { $mount: async () => {} },
    get: () => undefined,
    layout: {
      selectPanel: (id: string | null) => { recorder.visitedPanels.push(id) },
      panelInfo: { getSnapshot: () => ({ activePanelId: null }), subscribe: () => () => {} },
    },
    slots: {
      inject: (_key: string, callback: () => unknown): (() => void) => {
        record(callback())
        return () => {}
      },
      register: (options: Record<string, unknown>, component: unknown): (() => void) => {
        recorder.registrations.push({ options, component })
        return () => {}
      },
    },
  }
  return { ctx, recorder }
}

/**
 * Execute the bundle and return the registrations it made.
 * @returns the captured registrations.
 */
function loadBundle(): Registration[] {
  const registrations: Registration[] = []
  const sandbox = {
    window: Object.assign(new EventTarget(), { __ModuleLoader__: { load: (registration: Registration) => { registrations.push(registration) } } }),
    AbortController, AbortSignal, URL, HTMLElement: ElementStub,
    ResizeObserver: ObserverStub, MutationObserver: ObserverStub,
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
    // The factory's lexical scope is this sandbox, so `document` must exist here
    // (not merely on the test runner's global) for the style effect to run.
    document: currentDocument(),
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(BUNDLE_SOURCE, sandbox, { filename: 'client.js' })
  return registrations
}

/**
 * Materialize the registered factory against the shared module table.
 * @param registration - the captured registration.
 * @returns the plugin's module exports.
 */
function materialize(registration: Registration): Record<string, unknown> {
  const table: Record<string, unknown> = {
    'react': React,
    'react/jsx-runtime': JsxRuntime,
    // ui-primitives is a platform module; only the icon the entry uses is needed.
    '@deepseek-ai/dsh-client-ui-primitives': { IconPaperPlaneOutlineRegular: () => null },
  }
  return registration.factory(specifier => {
    if (!(specifier in table)) throw new Error(`unexpected module-table request: ${specifier}`)
    return table[specifier]
  })
}

/**
 * The fake document this test installs as the global `document`.
 * @returns the installed fake.
 */
function currentDocument(): FakeDocument {
  return (globalThis as unknown as { document: FakeDocument }).document
}

let restoreDocument: (() => void) | undefined

beforeEach(() => {
  const fake = new FakeDocument()
  const original = (globalThis as { document?: unknown }).document
  ;(globalThis as { document?: unknown }).document = fake
  restoreDocument = () => {
    if (original === undefined) delete (globalThis as { document?: unknown }).document
    else (globalThis as { document?: unknown }).document = original
  }
})

afterEach(() => {
  restoreDocument?.()
  restoreDocument = undefined
})

describe('lazy-CJS registration', () => {
  it('registers exactly one factory under the bare package name', () => {
    const registrations = loadBundle()
    expect(registrations).toHaveLength(1)
    expect(registrations[0]?.id).toBe('dsh-chat-bridge')
    expect(typeof registrations[0]?.factory).toBe('function')
  })

  it('runs no module body before materialization', () => {
    // Loading alone must not install styles or touch the document.
    loadBundle()
    expect(currentDocument().head.children).toHaveLength(0)
  })

  it('resolves only module-table externals and no relative chunks', () => {
    const requested = [...BUNDLE_SOURCE.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1])
    expect(new Set(requested)).toEqual(new Set([
      'react',
      'react/jsx-runtime',
      '@deepseek-ai/dsh-client-ui-primitives',
    ]))
    expect(BUNDLE_SOURCE).not.toMatch(/require\("\.\//)
    expect(BUNDLE_SOURCE).not.toMatch(/require\("node:/)
    expect(BUNDLE_SOURCE).not.toMatch(/from\s*"node:/)
  })

  it('agrees with the manifest: the bundle id is the package name and every request is a declared row', () => {
    const manifest = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
      name: string
      type: string
      dsh?: { client?: { platform?: string; external?: string[] } }
    }
    const [registration] = loadBundle()
    // The loader keys rows by the bare package name, so the ids must match exactly.
    expect(registration?.id).toBe(manifest.name)

    const declared = new Set<string>([...PLATFORM_MODULES, ...(manifest.dsh?.client?.external ?? [])])
    for (const specifier of BUNDLE_SOURCE.matchAll(/require\("([^"]+)"\)/g)) {
      expect(declared.has(specifier[1] ?? '')).toBe(true)
    }
    expect(manifest.type).toBe('module')
    expect(manifest.dsh?.client?.platform).toBe('web')
  })

  it('carries no test fixtures or sample conversations', () => {
    for (const marker of ['\u793a\u4f8b\u804a\u5929', '\u6700\u540e\u4e00\u6761\u6d88\u606f', 'fixtures/', 'fixture-conversation-0001']) {
      expect(BUNDLE_SOURCE).not.toContain(marker)
    }
  })

  it('materializes into the plugin exports', () => {
    const [registration] = loadBundle()
    expect(registration).toBeDefined()
    if (registration === undefined) return
    const exports = materialize(registration)
    expect(typeof exports.apply).toBe('function')
    expect(exports.PANEL_ID).toBe('dsh-chat-bridge')
    expect(exports.inject).toEqual(['slots', 'locale', 'layout', 'sessions', 'workspaces', 'conversation', 'uiWorkspace', 'remote'])
    // The artifact is the module-loader handoff, not a page.
    expect(BUNDLE_SOURCE.startsWith('window.__ModuleLoader__.load(')).toBe(true)
    const withoutSourceMap = BUNDLE_SOURCE.replace(/\n\/\/# sourceMappingURL=.*\s*$/, '').trimEnd()
    expect(withoutSourceMap).toContain('return module.exports;')
    // The factory closure and the load() call are the two things that close the artifact.
    expect(withoutSourceMap.endsWith('\t}\n});') || withoutSourceMap.endsWith('}\n});')).toBe(true)
  })
})

describe('apply() through public slots', () => {
  it('registers the locale namespace, the panel and the sidebar entry', async () => {
    const [registration] = loadBundle()
    if (registration === undefined) throw new Error('bundle did not register')
    const exports = materialize(registration)
    const { ctx, recorder } = makeContext()
    await (exports.apply as (context: unknown) => Promise<void>)(ctx)

    expect(recorder.dictionaries).toHaveLength(1)
    const dictionary = recorder.dictionaries[0]
    expect(dictionary?.ns).toBe('dshChatBridge')
    expect(Object.keys(dictionary?.dicts.zh ?? {}).toSorted()).toEqual(Object.keys(dictionary?.dicts.en ?? {}).toSorted())
    expect(Object.keys(dictionary?.dicts.en ?? {}).length).toBeGreaterThan(50)

    const panel = recorder.registrations.find(registered => registered.options.name === 'main')
    expect(panel?.options.key).toBe('dsh-chat-bridge')
    expect(panel?.options.locale).toBe('dshChatBridge')
    expect(typeof panel?.component).toBe('function')

    const sidebar = recorder.registrations.find(registered => registered.options.name === 'sidebar.footer.action')
    expect(sidebar?.options.id).toBe('dsh-chat-bridge')
    expect(typeof sidebar?.component).toBe('function')

    // Nothing registers into the reserved conversation surface, replaces the
    // sidebar column, or claims the root slot.
    for (const registered of recorder.registrations) {
      expect(registered.options.name).not.toBe('conversation')
      expect(registered.options.name).not.toBe('sidebar')
      expect(registered.options.name).not.toBe('root')
    }
  })

  it('shares one controller between the panel and the sidebar entry', async () => {
    const [registration] = loadBundle()
    if (registration === undefined) throw new Error('bundle did not register')
    const exports = materialize(registration)
    const { ctx, recorder } = makeContext()
    await (exports.apply as (context: unknown) => Promise<void>)(ctx)

    const panel = recorder.registrations.find(entry => entry.options.name === 'main')
    const sidebar = recorder.registrations.find(entry => entry.options.name === 'sidebar.footer.action')
    const injectPanel = panel?.options.inject as undefined | (() => { controller: unknown })
    const injectSidebar = sidebar?.options.inject as undefined | (() => { controller: unknown })
    expect(typeof injectPanel).toBe('function')
    expect(typeof injectSidebar).toBe('function')
    // One state source: the sidebar count and the panel can never disagree.
    expect(injectPanel?.().controller).toBe(injectSidebar?.().controller)
  })

  it('installs one style tag and removes it on teardown', async () => {
    const [registration] = loadBundle()
    if (registration === undefined) throw new Error('bundle did not register')
    const exports = materialize(registration)
    const { ctx, recorder } = makeContext()
    await (exports.apply as (context: unknown) => Promise<void>)(ctx)

    const doc = currentDocument()
    expect(doc.head.children).toHaveLength(1)
    const style = doc.head.children[0]
    expect(style?.dataset.plugin).toBe('dsh-chat-bridge')
    expect(style?.textContent).toContain('.dshcb-root')
    // Every rule is rooted at the plugin's own class: nothing can match host markup.
    for (const selectorLine of (style?.textContent ?? '').split('\n')) {
      const trimmed = selectorLine.trim()
      if (trimmed === '' || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('}')) continue
      if (!trimmed.includes('{') || trimmed.startsWith('@media ')) continue
      expect(trimmed).toContain('.dshcb-')
    }

    for (const dispose of recorder.disposers.toReversed()) dispose()
    expect(doc.head.children).toHaveLength(0)
  })
})
