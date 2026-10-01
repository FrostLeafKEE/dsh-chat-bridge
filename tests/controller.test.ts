/**
 * Panel controller behaviour that only exists at the UI boundary: cancelling an
 * import writes nothing, one double click saves one archive, a failed save keeps
 * the preview, and the handoff preview never claims a workspace.
 * @module dsh-chat-bridge/tests/controller
 */

import { describe, expect, it, vi } from 'vitest'
import { buildImport } from '../src/import/build-snapshot'
import { createDshNavigationPort } from '../src/adapters/dsh-navigation'
import { createPendingWebCarrier } from '../src/adapters/pending-web-carrier'
import { createPendingWorkImporter } from '../src/adapters/pending-work-importer'
import { ChatBridgeController } from '../src/client/state/controller'
import { MemoryArchiveRepository } from '../src/storage/memory-repository'
import { ok, type Result } from '../src/shared/errors'
import type { ArchiveRepository } from '../src/shared/contracts'
import { LIMITS } from '../src/shared/limits'
import { expectOk, readFixture } from './helpers'

const FIXTURE = readFixture('manual-history.v1.json')
const NOW = new Date('2026-06-07T08:09:10.000Z')

/**
 * Build a controller over a memory repository plus recorded side effects.
 * @param options - repository override and layout behaviour.
 * @returns the controller and its collaborators.
 */
function makeController(options: { repository?: ArchiveRepository; panelId?: string } = {}) {
  const repository = options.repository ?? new MemoryArchiveRepository()
  const downloads: { fileName: string; text: string; mimeType: string }[] = []
  const selectPanel = vi.fn<(id: string | null) => void>()
  const controller = new ChatBridgeController({
    openRepository: async (): Promise<Result<ArchiveRepository>> => ok(repository),
    navigation: createDshNavigationPort({ selectPanel }, options.panelId ?? 'dsh-chat-bridge'),
    webCarrier: createPendingWebCarrier(),
    createWorkImporter: repo => createPendingWorkImporter(repo),
    download: (fileName, text, mimeType) => { downloads.push({ fileName, text, mimeType }) },
    now: () => NOW,
    newRequestId: () => 'request-fixed',
  })
  return { controller, repository, downloads, selectPanel }
}

describe('import flow', () => {
  it('saves the edited preview title without changing source bytes or fingerprint', async () => {
    const { controller, repository } = makeController()
    controller.openImport(); controller.setImportOrigin('paste'); controller.setPasteText('Synthetic source')
    await controller.previewPaste()
    const before = controller.getSnapshot().draft!.built!.snapshot
    controller.setDraftTitle('  Edited title  ')
    await controller.saveDraft()
    const saved = expectOk(await repository.get(before.archiveId))
    expect(saved.title).toBe('Edited title')
    expect(saved.original).toEqual(before.original)
    expect(saved.fingerprint).toBe(before.fingerprint)
  })
  it('rejects an invalid edited title without losing the preview', async () => {
    const { controller, repository } = makeController()
    controller.openImport(); controller.setImportOrigin('paste'); controller.setPasteText('Synthetic source')
    await controller.previewPaste()
    controller.setDraftTitle('  '); await controller.saveDraft()
    expect(controller.getSnapshot().draft?.error?.code).toBe('INVALID_TITLE')
    expect(controller.getSnapshot().draft?.built).toBeDefined()
    expect(expectOk(await repository.list())).toHaveLength(0)
  })
  it('checks file size and extension before asking for an arrayBuffer', async () => {
    const { controller } = makeController()
    controller.openImport()
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0))
    await controller.readFile({ name: 'huge.txt', size: LIMITS.manualInputBytes + 1, arrayBuffer })
    expect(controller.getSnapshot().draft?.error?.code).toBe('INPUT_TOO_LARGE')
    await controller.readFile({ name: 'unsupported.zip', size: 1, arrayBuffer })
    expect(controller.getSnapshot().draft?.error?.code).toBe('UNSUPPORTED_FORMAT')
    expect(arrayBuffer).not.toHaveBeenCalled()
  })
  it('ignores late file reads after closing and opening another wizard', async () => {
    const { controller } = makeController()
    controller.openImport()
    let finish!: (buffer: ArrayBuffer) => void
    const reading = controller.readFile({ name: 'late.txt', size: 1,
      arrayBuffer: () => new Promise(resolve => { finish = resolve }) })
    controller.closeImport(); controller.openImport(); controller.setImportOrigin('paste'); controller.setPasteText('New draft')
    finish(new Uint8Array([65]).buffer); await reading
    expect(controller.getSnapshot().draft?.pasteText).toBe('New draft')
    expect(controller.getSnapshot().draft?.built).toBeUndefined()
  })
  it('locks edits while parsing so an ignored parse cannot leave busy stuck', async () => {
    const { controller } = makeController()
    controller.openImport(); controller.setImportOrigin('paste'); controller.setPasteText('Original text')
    const parsing = controller.previewPaste()
    controller.setPasteText('Other text'); controller.setPasteMode('json'); controller.setDraftTitle('Other title')
    await parsing
    expect(controller.getSnapshot().draft?.busy).toBe(false)
    expect(controller.getSnapshot().draft?.built?.snapshot.original.text).toBe('Original text')
  })
  it('writes nothing when the wizard is cancelled', async () => {
    const { controller, repository } = makeController()
    controller.openImport()
    controller.setImportOrigin('paste')
    controller.setPasteText(FIXTURE)
    controller.setPasteMode('json')
    await controller.previewPaste()
    expect(controller.getSnapshot().draft?.step).toBe('preview')

    controller.closeImport()
    expect(controller.getSnapshot().draft).toBeUndefined()
    expect(expectOk(await repository.list())).toEqual([])
  })

  it('previews a paste before saving, then saves only on confirmation', async () => {
    const { controller, repository } = makeController()
    controller.openImport()
    controller.setImportOrigin('paste')
    controller.setPasteMode('json')
    controller.setPasteText(FIXTURE)
    await controller.previewPaste()

    const draft = controller.getSnapshot().draft
    expect(draft?.step).toBe('preview')
    expect(draft?.title).toBe('示例聊天：代码块、空白与表情')
    expect(expectOk(await repository.list())).toEqual([])

    await controller.saveDraft()
    const listed = expectOk(await repository.list())
    expect(listed).toHaveLength(1)
    expect(controller.getSnapshot().draft).toBeUndefined()
    expect(controller.getSnapshot().noticeKey).toBe('import.saved')
    expect(controller.getSnapshot().detail.snapshot?.original.text).toBe(FIXTURE)
  })

  it('turns one double click into exactly one archive', async () => {
    const { controller, repository } = makeController()
    controller.openImport()
    controller.setImportOrigin('paste')
    controller.setPasteMode('json')
    controller.setPasteText(FIXTURE)
    await controller.previewPaste()

    // Two clicks before the first save resolves: the second is ignored.
    await Promise.all([controller.saveDraft(), controller.saveDraft()])
    expect(expectOk(await repository.list())).toHaveLength(1)
  })

  it('reports a duplicate import and opens the existing archive', async () => {
    const { controller } = makeController()
    for (const _ of [0, 1]) {
      controller.openImport()
      controller.setImportOrigin('paste')
      controller.setPasteMode('json')
      controller.setPasteText(FIXTURE)
      // oxlint-disable-next-line no-await-in-loop -- Re-import must follow a completed first save.
      await controller.previewPaste()
      // oxlint-disable-next-line no-await-in-loop -- Exercise sequential duplicate detection.
      await controller.saveDraft()
    }
    expect(controller.getSnapshot().noticeKey).toBe('import.duplicate')
  })

  it('keeps the preview and the original text when saving fails', async () => {
    const repository = new MemoryArchiveRepository({ failWrites: true })
    const { controller } = makeController({ repository })
    controller.openImport()
    controller.setImportOrigin('paste')
    controller.setPasteMode('json')
    controller.setPasteText(FIXTURE)
    await controller.previewPaste()
    await controller.saveDraft()

    const draft = controller.getSnapshot().draft
    expect(draft?.error?.code).toBe('STORAGE_UNAVAILABLE')
    expect(draft?.built).toBeDefined()
    expect(draft?.step).toBe('preview')
    expect(draft?.busy).toBe(false)
    expect(controller.getSnapshot().detail.snapshot).toBeUndefined()
  })

  it('keeps the archive and the closed wizard when the wizard is closed mid-save', async () => {
    const inner = new MemoryArchiveRepository()
    const deferred: { release?: () => void } = {}
    const gate = new Promise<void>((resolve) => { deferred.release = () => { resolve() } })
    const slow: ArchiveRepository = {
      list: query => inner.list(query),
      get: id => inner.get(id),
      // Hold the write open so the user can close the wizard first.
      save: async snapshot => { await gate; return inner.save(snapshot) },
      rename: (id, title) => inner.rename(id, title),
      remove: id => inner.remove(id),
      dispose: () => { inner.dispose() },
    }
    const { controller } = makeController({ repository: slow })
    controller.openImport()
    controller.setImportOrigin('paste')
    controller.setPasteMode('json')
    controller.setPasteText(FIXTURE)
    await controller.previewPaste()

    const saving = controller.saveDraft()
    controller.closeImport()
    expect(controller.getSnapshot().draft).toBeUndefined()
    deferred.release?.()
    await saving

    // The write completed, so the list must show it even though the wizard is gone.
    expect(expectOk(await inner.list())).toHaveLength(1)
    expect(controller.getSnapshot().draft).toBeUndefined()
    expect(controller.getSnapshot().noticeKey).toBe('import.saved')
    expect(controller.getSnapshot().list.summaries).toHaveLength(1)
  })

  it('reports a storage failure as an error state instead of an empty list', async () => {
    const failing: ArchiveRepository = {
      list: async () => ({ ok: false, error: { code: 'STORAGE_UNAVAILABLE', messageKey: 'error.STORAGE_UNAVAILABLE', message: 'down' } }),
      get: async () => ({ ok: false, error: { code: 'STORAGE_UNAVAILABLE', messageKey: 'error.STORAGE_UNAVAILABLE', message: 'down' } }),
      save: async () => ({ ok: false, error: { code: 'STORAGE_UNAVAILABLE', messageKey: 'error.STORAGE_UNAVAILABLE', message: 'down' } }),
      rename: async () => ({ ok: false, error: { code: 'STORAGE_UNAVAILABLE', messageKey: 'error.STORAGE_UNAVAILABLE', message: 'down' } }),
      remove: async () => ({ ok: false, error: { code: 'STORAGE_UNAVAILABLE', messageKey: 'error.STORAGE_UNAVAILABLE', message: 'down' } }),
      dispose: () => {},
    }
    const { controller } = makeController({ repository: failing })
    await controller.refresh()
    expect(controller.getSnapshot().list.phase).toBe('error')
    expect(controller.getSnapshot().list.error?.code).toBe('STORAGE_UNAVAILABLE')
  })

  it('refuses an unsupported file extension without reading the file', async () => {
    const { controller } = makeController()
    controller.openImport()
    await controller.chooseFile('archive.zip', new Uint8Array([1, 2, 3]))
    expect(controller.getSnapshot().draft?.error?.code).toBe('UNSUPPORTED_FORMAT')
    expect(controller.getSnapshot().draft?.step).toBe('input')
  })

  it('falls back to raw text only when the user asks for it', async () => {
    const { controller } = makeController()
    controller.openImport()
    controller.setImportOrigin('paste')
    controller.setPasteMode('json')
    controller.setPasteText('{"unrelated": true}')
    await controller.previewPaste()
    expect(controller.getSnapshot().draft?.error?.code).toBe('UNSUPPORTED_FORMAT')
    expect(controller.getSnapshot().draft?.step).toBe('input')

    await controller.reparseAsRawText()
    const draft = controller.getSnapshot().draft
    expect(draft?.step).toBe('preview')
    expect(draft?.built?.snapshot.original.format).toBe('text')
    expect(draft?.built?.snapshot.history.kind).toBe('source-text')
  })
})

describe('archive operations', () => {
  it('renames, exports and deletes through the repository', async () => {
    const { controller, repository, downloads } = makeController()
    const snapshot = expectOk(await buildImport({ format: 'text', text: 'body 🦀', title: '标题/含斜杠' }, NOW)).snapshot
    const saved = expectOk(await repository.save(snapshot))
    await controller.refresh()

    expect(await controller.renameArchive(saved.archiveId, '新标题')).toBeUndefined()
    expect(controller.getSnapshot().list.summaries[0]?.title).toBe('新标题')

    expect(await controller.exportOriginal(saved.archiveId)).toBeUndefined()
    expect(downloads[0]?.text).toBe('body 🦀')
    expect(downloads[0]?.fileName).not.toContain('/')

    expect(await controller.exportDocument(saved.archiveId)).toBeUndefined()
    expect(JSON.parse(downloads[1]?.text ?? '{}')).toMatchObject({ format: 'dsh-chat-bridge.archive' })

    expect(await controller.deleteArchive(saved.archiveId)).toBeUndefined()
    expect(controller.getSnapshot().list.summaries).toEqual([])
    expect(controller.getSnapshot().detail.phase).toBe('idle')
  })

  it('surfaces a rename failure instead of reporting success', async () => {
    const { controller } = makeController()
    const error = await controller.renameArchive('99999999-9999-4999-8999-999999999999', 'x')
    expect(error?.code).toBe('ARCHIVE_NOT_FOUND')
  })
})

describe('navigation and work seam', () => {
  it('returns to work through the layout service without touching archives', async () => {
    const { controller, selectPanel } = makeController()
    controller.returnToWork()
    expect(selectPanel).toHaveBeenLastCalledWith(null)
    expect(controller.getSnapshot().navigationError).toBeUndefined()
  })

  it('records a navigation failure', () => {
    const controller = new ChatBridgeController({
      openRepository: async () => ok(new MemoryArchiveRepository()),
      navigation: createDshNavigationPort({ selectPanel: () => { throw new Error('no slot') } }, 'dsh-chat-bridge'),
      webCarrier: createPendingWebCarrier(),
      createWorkImporter: repo => createPendingWorkImporter(repo),
      download: () => {},
      now: () => NOW,
      newRequestId: () => 'r',
    })
    controller.returnToWork()
    expect(controller.getSnapshot().navigationError?.code).toBe('NAVIGATION_UNAVAILABLE')
    controller.clearNavigationError()
    expect(controller.getSnapshot().navigationError).toBeUndefined()
  })

  it('prepares a pending preview and blocks commit without workspace and context acceptance', async () => {
    const { controller, repository } = makeController()
    const snapshot = expectOk(await buildImport({ format: 'json', text: FIXTURE }, NOW)).snapshot
    const saved = expectOk(await repository.save(snapshot))
    await controller.refresh()

    await controller.prepareWork(saved.archiveId)
    const work = controller.getSnapshot().work
    expect(work?.phase).toBe('ready')
    expect(work?.preview?.workspaceId).toBeNull()
    expect(work?.preview?.contextCapacity.state).toBe('not-estimated')

    await controller.commitWork()
    expect(controller.getSnapshot().work?.commitError).toBeUndefined()
    expect(controller.getSnapshot().work?.committing).not.toBe(true)
    // No receipt-like claim is recorded anywhere in the state.
    expect(JSON.stringify(controller.getSnapshot().work)).not.toContain('nativeSessionId')

    controller.closeWork()
    expect(controller.getSnapshot().work).toBeUndefined()
  })

  it('keeps the selected archive and the draft when the panel state is read again', async () => {
    const { controller } = makeController()
    controller.openImport()
    controller.setImportOrigin('paste')
    controller.setPasteText('draft text')
    const before = controller.getSnapshot()
    expect(controller.getSnapshot()).toBe(before)
    expect(controller.getSnapshot().draft?.pasteText).toBe('draft text')
  })
})
