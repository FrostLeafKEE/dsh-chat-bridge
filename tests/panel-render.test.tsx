/**
 * Static render checks for the panel and the sidebar entry.
 *
 * `renderToStaticMarkup` runs no effects, so this is not an interaction test and
 * is **not** a substitute for loading the plugin in the official desktop. What it
 * does prove is worth having anyway: the components render without throwing for
 * every list/detail state, the copy comes from the English dictionary (a missing
 * key throws here instead of reaching a user), the empty production state shows
 * no fixture data, and there is no sendable chat input anywhere.
 *
 * @module dsh-chat-bridge/tests/panel-render
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// The sidebar glyph comes from the host's shared module table at runtime. The
// published package's own production dependencies are not installed in this
// project (and must not be, since the shell provides the module), so the test
// stubs the single icon the way the shell would supply it.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconPaperPlaneOutlineRegular: () => null,
}))
import { buildImport } from '../src/import/build-snapshot'
import { createDshNavigationPort } from '../src/adapters/dsh-navigation'
import { createPendingWebCarrier } from '../src/adapters/pending-web-carrier'
import { createPendingWorkImporter } from '../src/adapters/pending-work-importer'
import { ChatBridgePanel, type ChatBridgePanelProps } from '../src/client/components/ChatBridgePanel'
import { ChatEntry } from '../src/client/components/SidebarEntry'
import { en } from '../src/client/locales/en'
import { ChatBridgeController } from '../src/client/state/controller'
import type { ArchiveRepository } from '../src/shared/contracts'
import { ok, type Result } from '../src/shared/errors'
import { MemoryArchiveRepository } from '../src/storage/memory-repository'
import { expectOk, readFixture } from './helpers'

/**
 * A translate seat backed by the real English dictionary, so every key the
 * components ask for must exist and placeholders are actually substituted.
 *
 * The key parameter is deliberately wider than the plugin's own key union: the
 * framework-injected seat also accepts the shared common vocabulary, so the fake
 * must too in order to be assignable to the component props.
 * @returns the translate function.
 */
function makeT(): (key: string, params?: Record<string, unknown>) => string {
  return (key, params) => {
    const template = (en as Record<string, string>)[key]
    if (template === undefined) throw new Error(`missing locale key: ${key}`)
    return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name] ?? `{${name}}`))
  }
}

/**
 * Build a controller over a memory repository.
 * @param repository - repository to use.
 * @returns the controller.
 */
function makeController(repository: ArchiveRepository = new MemoryArchiveRepository()): ChatBridgeController {
  return new ChatBridgeController({
    openRepository: async (): Promise<Result<ArchiveRepository>> => ok(repository),
    navigation: createDshNavigationPort({ selectPanel: () => {} }, 'dsh-chat-bridge'),
    webCarrier: createPendingWebCarrier(),
    createWorkImporter: repo => createPendingWorkImporter(repo),
    download: () => {},
    now: () => new Date('2026-04-05T06:07:08.000Z'),
    newRequestId: () => 'request-1',
  })
}

/**
 * The framework-injected seats the renderer normally supplies. The components
 * under test never call them (they are the shell's panel-metadata selectors), so
 * a stub satisfies the props contract without a live slot renderer.
 */
const frameworkSeats = {
  usePanelInfo: () => ({ activePanelId: null }),
} as unknown as Pick<ChatBridgePanelProps, 'usePanelInfo'>

/**
 * Render the panel to static HTML. Hooks require a real render pass, so the
 * component goes through the reconciler rather than being called directly.
 * @param controller - the controller to render.
 * @returns the HTML.
 */
function renderPanel(controller: ChatBridgeController): string {
  return renderToStaticMarkup(<ChatBridgePanel t={makeT()} controller={controller} {...frameworkSeats} />)
}

describe('ChatBridgePanel', () => {
  it('reserves a seat for the resident switch and keeps archives out of the web canvas', () => {
    const html = renderPanel(makeController())
    expect(html).toContain('Chat area')
    expect(html).toContain('dshcb-mode-seat')
    expect(html).not.toContain('Imported history')
    expect(html).not.toContain('role="dialog"')
  })

  it('never renders a sendable chat input or a fabricated assistant reply', () => {
    const html = renderPanel(makeController())
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Send')
    expect(html).not.toContain('type="submit"')
    expect(html).not.toContain('Connected')
    expect(html).not.toContain('Synced')
  })

  it('shows no fixture or sample conversation in the production default state', () => {
    const html = renderPanel(makeController())
    for (const marker of ['\u793a\u4f8b\u804a\u5929', 'fixture', 'sample', 'demo']) {
      expect(html.toLowerCase()).not.toContain(marker.toLowerCase())
    }
  })

  it('lists a stored archive and renders its detail with the pagination totals', async () => {
    const repository = new MemoryArchiveRepository()
    const snapshot = expectOk(await buildImport({
      format: 'json',
      text: readFixture('manual-history.v1.json'),
      fileName: 'history.json',
    })).snapshot
    expect(expectOk(await repository.save(snapshot)).duplicate).toBe(false)

    const controller = makeController(repository)
    await controller.refresh()
    controller.openArchive(snapshot.archiveId)
    await controller.selectArchive(snapshot.archiveId)
    const html = renderPanel(controller)

    expect(html).toContain(snapshot.title)
    expect(html).toContain('Messages 1–5 of 5')
    expect(html).toContain('最后一条消息（必须保留）。✅')
    expect(html).toContain('Turn into work')
    // Provenance is stated, and missing facts stay stated as missing.
    expect(html).toContain('Supplied by you. This does not prove it is the full web history.')
    expect(html).toContain('Metadata only (2 item(s), 1 unavailable). No file content was read.')
    expect(html).toContain('Links stay as source text.')
  })

  it('renders a corrupted record as an explicit error instead of a blank pane', async () => {
    const repository = new MemoryArchiveRepository()
    repository.plantCorruptedRecord({ archiveId: 'broken', title: 'Broken' })
    const controller = makeController(repository)
    await controller.refresh()
    controller.openArchive('broken')
    await controller.selectArchive('broken')
    const html = renderPanel(controller)
    expect(html).toContain('The archive or document is inconsistent and was not used.')
    controller.openArchiveManager()
    await controller.refresh()
    expect(renderPanel(controller)).toContain('This record cannot be read')
  })

  it('renders a storage failure as an alert instead of an empty list', async () => {
    const failing: ArchiveRepository = {
      list: async () => ({ ok: false, error: { code: 'STORAGE_UNAVAILABLE', messageKey: 'error.STORAGE_UNAVAILABLE', message: 'down' } }),
      get: async () => ({ ok: false, error: { code: 'STORAGE_UNAVAILABLE', messageKey: 'error.STORAGE_UNAVAILABLE', message: 'down' } }),
      save: async () => ({ ok: false, error: { code: 'STORAGE_UNAVAILABLE', messageKey: 'error.STORAGE_UNAVAILABLE', message: 'down' } }),
      rename: async () => ({ ok: false, error: { code: 'STORAGE_UNAVAILABLE', messageKey: 'error.STORAGE_UNAVAILABLE', message: 'down' } }),
      remove: async () => ({ ok: false, error: { code: 'STORAGE_UNAVAILABLE', messageKey: 'error.STORAGE_UNAVAILABLE', message: 'down' } }),
      dispose: () => {},
    }
    const controller = makeController(failing)
    controller.openArchiveManager()
    await controller.refresh()
    const html = renderPanel(controller)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Local archive storage is unavailable. Nothing was saved.')
  })

  it('renders the import wizard with the paste modes and the standing caveats', () => {
    const controller = makeController()
    controller.openImport()
    controller.setImportOrigin('paste')
    controller.setPasteText('hello')
    const html = renderPanel(controller)
    expect(html).toContain('Choose a file')
    expect(html).toContain('Paste text')
    expect(html).toContain('Plain text')
    expect(html).toContain('Markdown')
    expect(html).toContain('Plugin JSON')
  })

  it('renders the handoff preview with the two unimplemented facts', async () => {
    const repository = new MemoryArchiveRepository()
    const snapshot = expectOk(await buildImport({ format: 'text', text: 'hello' })).snapshot
    expect(expectOk(await repository.save(snapshot)).duplicate).toBe(false)
    const controller = makeController(repository)
    await controller.refresh()
    await controller.prepareWork(snapshot.archiveId)
    const html = renderPanel(controller)
    expect(html).toContain('Turn into work')
    expect(html).toContain('Not selected — workspace picking is not wired up yet.')
    expect(html).toContain('Not estimated. This build does not compute token counts.')
    expect(html).toContain('Create work session (not wired up)')
    // The button must be disabled, not a live control that only shows a toast.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Create work session/)
  })
})

describe('ChatEntry', () => {
  it('renders a labelled row in wide mode and an icon-only button in rail mode', async () => {
    const repository = new MemoryArchiveRepository()
    const snapshot = expectOk(await buildImport({ format: 'text', text: 'x' })).snapshot
    expect(expectOk(await repository.save(snapshot)).duplicate).toBe(false)
    const controller = makeController(repository)
    await controller.refresh()

    const wide = renderToStaticMarkup(
      <ChatEntry t={makeT()} controller={controller} wide {...frameworkSeats} />,
    )
    expect(wide).toContain('>Chat<')
    expect(wide).toContain('>1<')
    expect(wide).toContain('aria-label="Chat area"')

    const rail = renderToStaticMarkup(
      <ChatEntry t={makeT()} controller={controller} wide={false} {...frameworkSeats} />,
    )
    expect(rail).not.toContain('>Chat<')
    expect(rail).toContain('aria-label="Chat area"')
    expect(rail).toContain('title="Open the chat area (1 local archives)"')
  })
})
