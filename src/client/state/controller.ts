/**
 * Panel state controller.
 *
 * One instance lives for the plugin's lifetime, created in `apply()` and shared
 * by the main panel and the sidebar entry through the slot `inject` face. That
 * is also what makes "returning to the chat panel restores the selected archive
 * and an unsubmitted import draft" true: mounting a component never resets this
 * object.
 *
 * The controller owns:
 *  - the lazily opened archive repository (opened once, failure remembered);
 *  - the load/search/select lifecycle of the archive list and detail pane;
 *  - the import draft, including its byte gate, decode, preview and save steps;
 *  - the work-handoff preview request.
 *
 * It never touches IndexedDB, React, or the DOM directly: storage goes through
 * `ArchiveRepository`, file reading through the caller-supplied `readFile`,
 * downloads through the injected `download` function. That keeps every branch
 * testable in Node.
 *
 * @module dsh-chat-bridge/client/state/controller
 */

import type {
  ArchiveRepository,
  ArchiveSummary,
  ChatSnapshot,
  ManualFormat,
  NavigationPort,
  WebCarrierPort,
  WorkImportPort,
  WorkImportPreview,
  WorkspaceChoice,
} from '../../shared/contracts'
import { errCode, type ArchiveError, type Result } from '../../shared/errors'
import { webConversationUrl } from '../../shared/web-history'
import { newLocalId } from '../../shared/ids'
import { buildImport, buildWebImport, type BuiltImport, type ManualInput } from '../../import/build-snapshot'
import { normalizeTitle } from '../../import/title'
import { decodeUtf8 } from '../../import/decode-text'
import { looksLikeArchiveDocument } from '../../import/parse-manual-json'
import { originalTextOf, parseArchiveDocument, serializeArchiveDocument } from '../../import/export-archive'
import { checkByteCeiling, detectFormatFromFileName, type InputCeiling } from '../../import/input'
import { safeExportFileName } from '../../import/title'
import type { DshChatBridgeLocaleKey } from '../locales'
import { withoutKeys } from './immutable'
import { TRANSFER_POLICY, type TransferPreferences, type TransferPreferenceStore } from '../../storage/transfer-preferences'

/** Which surface the panel header currently represents. */
export type PanelMode = 'chat' | 'work'

/** Largest number of messages rendered on one page of the detail pane. */
export const PAGE_SIZE = 50

/** How the archive list is doing. */
export interface ListState {
  phase: 'loading' | 'ready' | 'error'
  summaries: readonly ArchiveSummary[]
  error?: ArchiveError
}

/** How the detail pane is doing. */
export interface DetailState {
  phase: 'idle' | 'loading' | 'ready' | 'error'
  archiveId?: string
  snapshot?: ChatSnapshot
  error?: ArchiveError
  /** 1-based page index over the message list (or the single text block). */
  page: number
}

/** Which input the import wizard is on. */
export type ImportOrigin = 'file' | 'paste'

/** One in-progress import, preserved across panel unmounts. */
export interface ImportDraft {
  origin: ImportOrigin
  /** Mode selected for pasted text. */
  pasteMode: ManualFormat
  pasteText: string
  /** Base file name of the picked file, when any. */
  fileName?: string
  /** Decoded text of the picked file, kept so a failed save can retry. */
  fileText?: string
  /** Format the decoded text is being parsed as (changes when the user falls back to raw text). */
  fileFormat?: ManualFormat
  step: 'input' | 'preview'
  busy: boolean
  error?: ArchiveError
  /** Set once parsing succeeded; the preview and the snapshot to save. */
  built?: BuiltImport
  /** Editable title in the preview step. */
  title: string
  /** Locale key of a notice to show after a successful save. */
  noticeKey?: string
}

/** How the work-handoff dialog is doing. */
export interface WorkState {
  phase: 'loading' | 'ready' | 'error'
  requestId: string
  archiveId: string
  preview?: WorkImportPreview
  error?: ArchiveError
  /** A failed native handoff; the same request identity is retained for retry. */
  commitError?: ArchiveError
  workspaces?: WorkspaceChoice[]
  acceptContext?: boolean
  committing?: boolean
  targetLocked?: boolean
  preferenceAfterCommit?: TransferPreferences
}

export interface WebCaptureState {
  id: string
  phase: 'loading' | 'ready' | 'saving' | 'error'
  title: string
  acceptedScope: boolean
  acceptContext?: boolean
  workspaceId?: string
  workspaces?: WorkspaceChoice[]
  quick?: boolean
  enableQuick?: boolean
  noticeKey?: DshChatBridgeLocaleKey
  built?: BuiltImport
  error?: ArchiveError
}

export interface TransferSettingsState {
  phase: 'loading' | 'ready' | 'error'
  workspaceId: string
  quickEnabled: boolean
  workspaces: WorkspaceChoice[]
  error?: ArchiveError
}

/** Immutable view of everything the panel renders. */
export interface ChatBridgeState {
  /** Always `chat` while the panel is mounted; picking `work` navigates away. */
  mode: PanelMode
  list: ListState
  /** Unfiltered sidebar projection; manager searches never hide sidebar archives. */
  sidebarList?: ListState
  search: string
  detail: DetailState
  archiveDialog?: 'list' | 'detail'
  draft?: ImportDraft
  work?: WorkState
  capture?: WebCaptureState
  transferPreference?: TransferPreferences
  transferWorkspace?: WorkspaceChoice
  preferenceError?: ArchiveError
  transferSettings?: TransferSettingsState
  /** Result of the last navigation attempt, when it failed. */
  navigationError?: ArchiveError
  /** Locale key of a one-line notice about the last completed operation. */
  noticeKey?: DshChatBridgeLocaleKey
}

/** Capabilities the panel renders as explicit "not wired up" notes. */
export interface CapabilityReport {
  webCarrier: WebCarrierPort['capability']
  workImport: WorkImportPort['capability']
}

/** Collaborators the controller needs; all injectable for tests. */
export interface ChatBridgeDeps {
  /** Open (or reuse) the archive repository. Called lazily, once. */
  openRepository(): Promise<Result<ArchiveRepository>>
  /** Panel navigation (public layout API). */
  navigation: NavigationPort
  /** Web carrier seam, owned for the controller lifetime. */
  webCarrier: WebCarrierPort
  transferPreferences?: TransferPreferenceStore
  /** Build the work-import seam for a repository. */
  createWorkImporter(repository: ArchiveRepository): WorkImportPort
  /** Persist one export to the user's disk. */
  download(fileName: string, text: string, mimeType: string): void
  /** Clock, injectable for tests. */
  now(): Date
  /** Id source for work-import requests, injectable for tests. */
  newRequestId(): string
}

/** Panel controller. */
export class ChatBridgeController {
  private state: ChatBridgeState = {
    mode: 'chat',
    list: { phase: 'loading', summaries: [] },
    sidebarList: { phase: 'loading', summaries: [] },
    search: '',
    detail: { phase: 'idle', page: 1 },
  }

  private readonly listeners = new Set<() => void>()
  private repository: ArchiveRepository | undefined
  private openingRepository: Promise<Result<ArchiveRepository>> | undefined
  private repositoryError: ArchiveError | undefined
  private importer: WorkImportPort | undefined
  private listGeneration = 0
  private detailGeneration = 0
  private disposed = false
  private captureAbort: AbortController | undefined
  private preferenceWriteFailed = false

  /**
   * @param deps - collaborators; see {@link ChatBridgeDeps}.
   */
  constructor(private readonly deps: ChatBridgeDeps) { this.reloadTransferPreference() }

  private reloadTransferPreference(): void {
    const stored = this.deps.transferPreferences?.read()
    this.clearKeys(['transferPreference', 'preferenceError', 'transferWorkspace'])
    if (stored?.ok && stored.value !== undefined) this.patch({ transferPreference: this.preferenceWriteFailed
      ? { ...stored.value, quickEnabled: false } : stored.value })
    else if (stored !== undefined && !stored.ok) this.patch({ preferenceError: stored.error })
  }

  private rememberTransferPreference(value: TransferPreferences): void {
    const saved = this.deps.transferPreferences?.write(value)
    if (saved?.ok) {
      this.preferenceWriteFailed = false
      if (this.state.transferWorkspace?.id !== value.workspaceId) this.clearKeys(['transferWorkspace'])
      this.clearKeys(['preferenceError'])
      this.patch({ transferPreference: value })
      void this.refreshTransferDestination()
    } else {
      this.preferenceWriteFailed = true
      this.clearKeys(['transferPreference'])
      this.patch({ preferenceError: saved?.error ?? errCode('TRANSFER_PREFERENCES_UNAVAILABLE', 'preference store unavailable').error })
    }
  }

  async openTransferSettings(): Promise<void> {
    if (this.disposed || this.state.capture !== undefined || this.state.work !== undefined || this.state.draft !== undefined
      || this.state.transferSettings !== undefined) return
    this.reloadTransferPreference()
    this.clearKeys(['archiveDialog'])
    const pending: TransferSettingsState = { phase: 'loading', workspaceId: this.state.transferPreference?.workspaceId ?? '',
      quickEnabled: this.state.transferPreference?.quickEnabled ?? false, workspaces: [] }
    this.patch({ transferSettings: pending })
    const choices = await this.availableWorkspaces()
    if (this.getSnapshot().transferSettings !== pending || this.disposed) return
    this.patch({ transferSettings: choices.ok ? { ...pending, phase: 'ready', workspaces: choices.value,
      workspaceId: choices.value.some(item => item.id === pending.workspaceId) ? pending.workspaceId : '',
      quickEnabled: pending.quickEnabled && choices.value.some(item => item.id === pending.workspaceId) }
      : { ...pending, phase: 'error', error: choices.error } })
  }

  updateTransferSettings(workspaceId: string, quickEnabled: boolean): void {
    const settings = this.state.transferSettings
    if (settings?.phase !== 'ready' || !settings.workspaces.some(item => item.id === workspaceId)) return
    this.patch({ transferSettings: { ...withoutKeys(settings, ['error']), workspaceId,
      quickEnabled: settings.workspaceId === workspaceId ? quickEnabled : false } })
  }

  saveTransferSettings(): void {
    const settings = this.state.transferSettings
    if (settings?.phase !== 'ready' || !settings.workspaces.some(item => item.id === settings.workspaceId)) return
    this.rememberTransferPreference({ schemaVersion: 1, policy: TRANSFER_POLICY,
      workspaceId: settings.workspaceId, quickEnabled: settings.quickEnabled })
    if (this.state.preferenceError !== undefined) this.patch({ transferSettings: { ...settings, error: this.state.preferenceError } })
    else this.closeTransferSettings()
  }

  closeTransferSettings(): void { this.clearKeys(['transferSettings']) }

  async refreshTransferDestination(): Promise<void> {
    const preference = this.state.transferPreference
    if (preference === undefined) return
    const choices = await this.availableWorkspaces()
    if (this.disposed || this.state.transferPreference !== preference || !choices.ok) return
    const workspace = choices.value.find(item => item.id === preference.workspaceId)
    if (workspace !== undefined) this.patch({ transferWorkspace: workspace })
    else this.clearKeys(['transferWorkspace'])
  }

  disableQuickTransfer(): void {
    const preference = this.state.transferPreference
    if (preference === undefined) return
    this.rememberTransferPreference({ ...preference, quickEnabled: false })
    const settings = this.state.transferSettings
    if (settings !== undefined) this.patch({ transferSettings: { ...settings, quickEnabled: false,
      ...(this.state.preferenceError === undefined ? {} : { error: this.state.preferenceError }) } })
  }

  private async availableWorkspaces(signal?: AbortSignal): Promise<Result<WorkspaceChoice[]>> {
    try {
      const importer = await this.ensureImporter()
      if (!importer.ok) return importer
      return await importer.value.listWorkspaces?.(signal) ?? errCode('WORK_IMPORT_NOT_IMPLEMENTED', 'workspace listing unavailable')
    } catch { return errCode('WORKSPACE_LIST_UNAVAILABLE', 'workspace registry could not be read') }
  }

  /** Capability report for the "not wired up" notes. */
  get capabilities(): CapabilityReport {
    return { webCarrier: this.deps.webCarrier.capability, workImport: this.importer?.capability ?? WORK_IMPORT_PENDING }
  }

  /**
   * Subscribe to state changes.
   * @param listener - change callback.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Current state. The reference changes on every mutation, which is what
   * `useSyncExternalStore` requires.
   * @returns the current immutable state.
   */
  getSnapshot(): ChatBridgeState {
    return this.state
  }

  /** Merge a partial change into the state and notify subscribers. */
  private patch(partial: Partial<ChatBridgeState>): void {
    if (this.disposed) return
    this.state = { ...this.state, ...partial }
    for (const listener of this.listeners) listener()
  }

  /**
   * Drop optional top-level fields (the only way to express "clear this" under
   * `exactOptionalPropertyTypes`).
   * @param keys - state keys to remove.
   */
  private clearKeys(keys: readonly (keyof ChatBridgeState)[]): void {
    if (this.disposed) return
    this.state = withoutKeys(this.state, keys)
    for (const listener of this.listeners) listener()
  }

  /**
   * Open the archive repository once and remember the outcome.
   * @returns the repository or the remembered failure.
   */
  private async ensureRepository(): Promise<Result<ArchiveRepository>> {
    if (this.disposed) return errCode('STORAGE_UNAVAILABLE', 'archive controller was disposed')
    if (this.repository !== undefined) return { ok: true, value: this.repository }
    if (this.repositoryError !== undefined) return { ok: false, error: this.repositoryError }
    this.openingRepository ??= this.deps.openRepository().catch(() => errCode('STORAGE_UNAVAILABLE', 'archive repository could not open')).then(opened => {
      if (this.disposed) {
        if (opened.ok) opened.value.dispose()
        return errCode('STORAGE_UNAVAILABLE', 'archive controller was disposed during opening')
      }
      if (!opened.ok) this.repositoryError = opened.error
      else this.repository = opened.value
      return opened
    })
    return this.openingRepository
  }

  /**
   * Open the work-import seam once the repository exists.
   * @returns the seam or the repository failure.
   */
  private async ensureImporter(): Promise<Result<WorkImportPort>> {
    if (this.importer !== undefined) return { ok: true, value: this.importer }
    const repository = await this.ensureRepository()
    if (!repository.ok) return repository
    if (this.disposed) return errCode('STORAGE_UNAVAILABLE', 'archive controller was disposed')
    this.importer ??= this.deps.createWorkImporter(repository.value)
    return { ok: true, value: this.importer }
  }

  /**
   * Reload the archive list for the current search text.
   *
   * A generation counter drops responses from a superseded query, so typing
   * quickly cannot let an older result overwrite a newer one.
   * @returns nothing; the list state is published.
   */
  async refresh(): Promise<void> {
    const generation = ++this.listGeneration
    this.patch({ list: { ...this.state.list, phase: 'loading' },
      sidebarList: { ...(this.state.sidebarList ?? this.state.list), phase: 'loading' } })
    const repository = await this.ensureRepository()
    if (generation !== this.listGeneration) return
    if (!repository.ok) {
      const failed: ListState = { phase: 'error', summaries: [], error: repository.error }
      this.patch({ list: failed, sidebarList: failed })
      return
    }
    const search = this.state.search.trim().toLowerCase()
    const listed = await repository.value.list()
    if (generation !== this.listGeneration) return
    if (!listed.ok) {
      const failed: ListState = { phase: 'error', summaries: [], error: listed.error }
      this.patch({ list: failed, sidebarList: failed })
      return
    }
    this.patch({ sidebarList: { phase: 'ready', summaries: listed.value },
      list: { phase: 'ready', summaries: search === '' ? listed.value
        : listed.value.filter(summary => summary.title.toLowerCase().includes(search)) } })
  }

  /**
   * Update the title search and reload the list.
   * @param search - new search text.
   */
  setSearch(search: string): void {
    this.patch({ search })
    void this.refresh()
  }

  /**
   * Load one archive into the detail pane.
   * @param archiveId - local archive id.
   * @returns nothing; the detail state is published.
   */
  async selectArchive(archiveId: string): Promise<void> {
    const generation = ++this.detailGeneration
    this.patch({ detail: { phase: 'loading', archiveId, page: 1 } })
    const repository = await this.ensureRepository()
    if (generation !== this.detailGeneration || this.disposed) return
    if (!repository.ok) {
      this.patch({ detail: { phase: 'error', archiveId, page: 1, error: repository.error } })
      return
    }
    const snapshot = await repository.value.get(archiveId)
    if (generation !== this.detailGeneration || this.disposed) return
    if (!snapshot.ok) {
      this.patch({ detail: { phase: 'error', archiveId, page: 1, error: snapshot.error } })
      return
    }
    this.patch({ detail: { phase: 'ready', archiveId, snapshot: snapshot.value, page: 1 } })
  }

  /**
   * Move the detail pane to another page of the message list.
   * @param page - 1-based page index; clamped to the available range.
   */
  setPage(page: number): void {
    const detail = this.state.detail
    if (detail.snapshot?.history.kind !== 'messages') return
    const total = Math.max(1, Math.ceil(detail.snapshot.history.messages.length / PAGE_SIZE))
    this.patch({ detail: { ...detail, page: Math.min(Math.max(1, page), total) } })
  }

  /**
   * Leave the chat panel for the original conversation surface.
   *
   * This is a navigation action and nothing else: no session is created, no
   * history is moved, and no draft is submitted.
   */
  returnToWork(): void {
    this.closeWebCapture(true)
    this.closeTransferSettings()
    this.closeWork()
    const result = this.deps.navigation.returnToWork()
    if (result.ok) this.clearKeys(['navigationError'])
    else this.patch({ navigationError: result.error })
  }

  /** Bring the chat panel to the front (used by the sidebar entry). */
  openChatPanel(): void {
    const result = this.deps.navigation.openChatPanel()
    if (result.ok) this.clearKeys(['navigationError'])
    else this.patch({ navigationError: result.error })
  }

  /** Navigate a validated website link without transferring messages or submitting a draft. */
  openWebConversation(url: string): void {
    if (this.disposed || this.state.draft !== undefined || this.state.work !== undefined
      || this.state.capture !== undefined || this.state.transferSettings !== undefined) return
    if (webConversationUrl(url) === undefined) {
      this.patch({ navigationError: errCode('UNSAFE_SOURCE_URL', 'invalid website conversation target').error })
      return
    }
    const opened = this.deps.webCarrier.open({ url })
    if (!opened.ok) { this.patch({ navigationError: opened.error }); return }
    this.clearKeys(['archiveDialog'])
    this.openChatPanel()
  }

  /** Archive tools are opt-in dialogs; the web canvas stays resident underneath. */
  openArchiveManager(): void {
    this.openChatPanel()
    if (this.state.draft !== undefined || this.state.work !== undefined || this.state.capture !== undefined || this.state.transferSettings !== undefined) return
    this.patch({ archiveDialog: 'list' })
    void this.refresh()
  }
  openArchive(archiveId: string): void {
    this.openChatPanel()
    if (this.state.draft !== undefined || this.state.work !== undefined || this.state.capture !== undefined || this.state.transferSettings !== undefined) return
    this.patch({ archiveDialog: 'detail' })
    void this.selectArchive(archiveId)
  }
  closeArchiveManager(): void { this.clearKeys(['archiveDialog']) }

  /** Dismiss the current one-line notice. */
  clearNotice(): void {
    this.clearKeys(['noticeKey'])
  }

  /** Dismiss the last navigation failure. */
  clearNavigationError(): void {
    this.clearKeys(['navigationError'])
  }

  // ---------------------------------------------------------------- import

  /** Open the import wizard with a fresh draft. */
  openImport(): void {
    this.openChatPanel()
    if (this.state.work !== undefined || this.state.draft !== undefined || this.state.capture !== undefined || this.state.transferSettings !== undefined) return
    this.clearKeys(['archiveDialog'])
    this.patch({
      draft: {
        origin: 'file',
        pasteMode: 'text',
        pasteText: '',
        step: 'input',
        busy: false,
        title: '',
      },
    })
  }

  /** Read on a click; reviewed mode waits for confirmation, quick mode uses the stored policy. */
  async captureWebConversation(review = false): Promise<void> {
    if (this.disposed || this.state.draft !== undefined || this.state.work !== undefined
      || this.state.transferSettings !== undefined || this.state.capture?.phase === 'loading' || this.state.capture?.phase === 'saving') return
    this.reloadTransferPreference()
    this.closeWebCapture(true)
    this.clearKeys(['archiveDialog'])
    const abort = new AbortController()
    this.captureAbort = abort
    const id = this.deps.newRequestId()
    const pending: WebCaptureState = { id, phase: 'loading', title: '', acceptedScope: false }
    this.patch({ capture: pending })
    const choices = await this.availableWorkspaces(abort.signal)
    if (abort.signal.aborted || this.state.capture?.id !== id || this.disposed) return
    const preferred = this.state.transferPreference
    const workspaceId = choices.ok && choices.value.some(item => item.id === preferred?.workspaceId) ? preferred?.workspaceId : undefined
    const workspace = choices.ok ? choices.value.find(item => item.id === workspaceId) : undefined
    if (workspace !== undefined) this.patch({ transferWorkspace: workspace })
    const quick = !review && workspaceId !== undefined && preferred?.quickEnabled === true
    const readyOptions = { quick, enableQuick: preferred?.quickEnabled === true && workspaceId !== undefined,
      ...(workspaceId === undefined ? {} : { workspaceId }),
      ...(choices.ok ? { workspaces: choices.value } : {}),
      ...(choices.ok && preferred !== undefined && workspaceId === undefined ? { noticeKey: 'quick.targetMissing' as const } : {}) }
    this.patch({ capture: { ...pending, ...readyOptions } })
    const read = this.deps.webCarrier.captureCurrent
    let built: Result<BuiltImport>
    try {
      const captured = read === undefined ? errCode('WEB_CAPTURE_UNAVAILABLE', 'page read is unavailable')
        : await read.call(this.deps.webCarrier, abort.signal)
      if (abort.signal.aborted || this.state.capture?.id !== id || this.disposed) return
      built = captured.ok ? await buildWebImport(captured.value, this.deps.now()) : captured
    } catch { built = errCode('WEB_CAPTURE_UNAVAILABLE', 'page preview could not be built') }
    if (abort.signal.aborted || this.state.capture?.id !== id || this.disposed) return
    this.patch({ capture: built.ok
      ? { ...pending, ...readyOptions, phase: 'ready', title: built.value.snapshot.title, built: built.value,
        acceptedScope: quick, acceptContext: quick, ...(choices.ok ? {} : { error: choices.error }) }
      : { ...pending, ...readyOptions, phase: 'error', error: built.error } })
    if (built.ok && quick) await this.saveWebCaptureToWork()
  }

  setWebCaptureTitle(title: string): void {
    const capture = this.state.capture
    if (capture?.phase === 'ready') this.patch({ capture: { ...capture, title } })
  }
  acceptWebCaptureScope(acceptedScope: boolean): void {
    const capture = this.state.capture
    if (capture?.phase === 'ready') this.patch({ capture: { ...capture, acceptedScope } })
  }
  acceptWebCaptureContext(acceptContext: boolean): void {
    const capture = this.state.capture
    if (capture?.phase === 'ready') this.patch({ capture: { ...capture, acceptContext } })
  }
  chooseWebCaptureWorkspace(workspaceId: string): void {
    const capture = this.state.capture
    if (capture?.phase !== 'ready' || !capture.workspaces?.some(item => item.id === workspaceId)) return
    this.patch({ capture: { ...capture, workspaceId,
      enableQuick: workspaceId === capture.workspaceId && capture.enableQuick === true } })
  }
  enableQuickTransfer(enableQuick: boolean): void {
    const capture = this.state.capture
    if (capture?.phase === 'ready') this.patch({ capture: { ...capture, enableQuick } })
  }
  /** Force is used only when leaving/unloading the panel; an in-flight archive may already persist. */
  closeWebCapture(force = false): void {
    if (!force && this.state.capture?.phase === 'saving') return
    this.captureAbort?.abort()
    this.captureAbort = undefined
    this.clearKeys(['capture'])
  }

  /** Persist the reviewed snapshot first; late completion after navigation never opens work. */
  async saveWebCaptureToWork(): Promise<void> {
    const capture = this.state.capture
    if (capture?.phase !== 'ready' || capture.built === undefined || !capture.acceptedScope || !capture.acceptContext
      || capture.workspaceId === undefined || !capture.workspaces?.some(item => item.id === capture.workspaceId) || this.disposed) return
    const title = normalizeTitle(capture.title)
    if (!title.ok) { this.patch({ capture: { ...capture, error: title.error } }); return }
    const saving: WebCaptureState = { ...withoutKeys(capture, ['error']), phase: 'saving' }
    this.patch({ capture: saving })
    const repository = await this.ensureRepository()
    if (this.state.capture !== saving || this.disposed) return
    const saved = repository.ok ? await repository.value.save({ ...capture.built.snapshot, title: title.value }) : repository
    if (!saved.ok) {
      if (this.state.capture === saving) this.patch({ capture: { ...saving, phase: 'ready', error: saved.error } })
      return
    }
    void this.refresh()
    if (this.state.capture !== saving || this.disposed) return
    this.closeWebCapture(true)
    await this.prepareWork(saved.value.archiveId, { workspaceId: capture.workspaceId,
      acceptContext: true, autoCommit: true, quickEnabled: capture.enableQuick === true })
  }

  /** Close the import wizard. Nothing is written before the user confirms. */
  closeImport(): void {
    this.clearKeys(['draft'])
  }

  /**
   * Switch between the file and paste inputs.
   * @param origin - the input to show.
   */
  setImportOrigin(origin: ImportOrigin): void {
    const draft = this.state.draft
    if (draft === undefined || draft.busy) return
    this.patch({ draft: { ...withoutKeys(draft, ['error', 'noticeKey']), origin } })
  }

  /**
   * Change the mode pasted text is parsed as. The draft returns to the input
   * step so the user re-previews under the new mode.
   * @param mode - the selected manual format.
   */
  setPasteMode(mode: ManualFormat): void {
    const draft = this.state.draft
    if (draft === undefined || draft.busy) return
    this.patch({ draft: { ...withoutKeys(draft, ['built', 'error']), pasteMode: mode, step: 'input' } })
  }

  /**
   * Update the pasted text.
   * @param text - the current textarea value.
   */
  setPasteText(text: string): void {
    const draft = this.state.draft
    if (draft === undefined || draft.busy) return
    this.patch({ draft: { ...withoutKeys(draft, ['built', 'error']), pasteText: text, step: 'input' } })
  }

  /**
   * Update the editable preview title.
   * @param title - the current title field value.
   */
  setDraftTitle(title: string): void {
    const draft = this.state.draft
    if (draft === undefined || draft.busy) return
    this.patch({ draft: { ...draft, title } })
  }

  /**
   * Parse the pasted text and move to the preview step.
   * @returns nothing; the draft state is published.
   */
  async previewPaste(): Promise<void> {
    const draft = this.state.draft
    if (draft === undefined || draft.busy) return
    await this.runImport(draft.pasteText, draft.pasteMode, undefined)
  }

  /** Gate a browser File before allocating its buffer; ignore a closed/replaced wizard. */
  async readFile(file: Pick<File, 'name' | 'size' | 'arrayBuffer'>): Promise<void> {
    const draft = this.state.draft
    if (draft === undefined || draft.busy || this.disposed) return
    const format = detectFormatFromFileName(file.name)
    const allowed = format.ok ? checkByteCeiling(file.size, ceilingForFormat(format.value)) : format
    if (!allowed.ok) { this.reportDraftError(allowed.error); return }
    const reading: ImportDraft = { ...withoutKeys(draft, ['built', 'error']), step: 'input', busy: true }
    this.patch({ draft: reading })
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (this.state.draft !== reading || this.disposed) return
      this.patch({ draft: { ...reading, busy: false } })
      await this.chooseFile(file.name, bytes)
    } catch {
      if (this.state.draft === reading && !this.disposed) {
        this.reportDraftError(errCode('FILE_READ_FAILED', 'the selected file could not be read').error)
      }
    }
  }

  /**
   * Accept a picked file: gate its bytes, decode strictly, and preview it.
   * @param fileName - base file name reported by the file input.
   * @param bytes - the file's bytes.
   * @returns nothing; the draft state is published.
   */
  async chooseFile(fileName: string, bytes: Uint8Array): Promise<void> {
    const draft = this.state.draft
    if (draft === undefined || draft.busy) return
    const baseName = fileName.split(/[\\/]/).pop() ?? fileName
    const fail = (error: ArchiveError): void => {
      this.patch({
        draft: { ...withoutKeys(draft, ['fileText', 'fileFormat', 'built']), fileName: baseName, step: 'input', error },
      })
    }
    const format = detectFormatFromFileName(baseName)
    if (!format.ok) {
      fail(format.error)
      return
    }
    // A `.json` pick may be a full archive document (64 MiB ceiling) rather than
    // a plain manual history (5 MiB). The tighter gate is re-applied inside the
    // parsers once the document's identity is known.
    const ceiling = checkByteCeiling(bytes.byteLength, ceilingForFormat(format.value))
    if (!ceiling.ok) {
      fail(ceiling.error)
      return
    }
    const decoded = decodeUtf8(bytes)
    if (!decoded.ok) {
      fail(decoded.error)
      return
    }
    await this.runImport(decoded.value.text, format.value, baseName)
  }

  /**
   * Attach a failure produced outside the controller (for example a file read
   * that never yielded bytes) to the current draft.
   * @param error - the failure to show.
   */
  reportDraftError(error: ArchiveError): void {
    const draft = this.state.draft
    if (draft === undefined) return
    this.patch({ draft: { ...withoutKeys(draft, ['built']), step: 'input', busy: false, error } })
  }

  /**
   * Fall back to reading the current input as raw text.
   *
   * Offered only when a JSON parse failed: the user's bytes are re-previewed as
   * one unverified text block instead of the import silently downgrading.
   */
  async reparseAsRawText(): Promise<void> {
    const draft = this.state.draft
    if (draft === undefined || draft.busy) return
    const text = draft.origin === 'file' ? draft.fileText : draft.pasteText
    if (text === undefined) return
    await this.runImport(text, 'text', draft.fileName)
  }

  /**
   * Parse one input into a preview, routing full-archive documents to the
   * re-import path and everything else to the manual-import path.
   * @param text - decoded input text.
   * @param format - format to parse as.
   * @param fileName - base file name, when the input came from a file.
   */
  private async runImport(text: string, format: ManualFormat, fileName: string | undefined): Promise<void> {
    const draft = this.state.draft
    if (draft === undefined) return
    const origin = draft.origin
    const busy: ImportDraft = { ...withoutKeys(draft, ['error', 'noticeKey', 'built']), step: 'input', busy: true }
    if (origin === 'file') {
      // The decoded text is kept so a failed save, or a fallback to raw text,
      // never needs to re-read the file.
      busy.fileText = text
      busy.fileFormat = format
      if (fileName !== undefined) busy.fileName = fileName
    }
    this.patch({ draft: busy })

    const input: ManualInput = { format, text }
    if (fileName !== undefined) input.fileName = fileName
    const built = format === 'json' && looksLikeArchiveDocument(text)
      ? await parseArchiveDocument(text, this.deps.now())
      : await buildImport(this.withTitle(input, draft.title), this.deps.now())

    // Parsing is async: if the user closed the wizard — or opened a fresh one —
    // while it ran, this result belongs to a draft that is no longer on screen.
    const current = this.state.draft
    if (current !== busy) return
    if (!built.ok) {
      this.patch({ draft: { ...current, busy: false, step: 'input', error: built.error } })
      return
    }
    this.patch({
      draft: {
        ...withoutKeys(current, ['error']),
        busy: false,
        step: 'preview',
        built: built.value,
        title: built.value.preview.title,
      },
    })
  }

  /**
   * Apply the typed title to a manual input when the user already changed it.
   * @param input - the input to build from.
   * @param typed - the current title field value.
   * @returns the input with the typed title applied.
   */
  private withTitle(input: ManualInput, typed: string): ManualInput {
    const trimmed = typed.trim()
    return trimmed === '' ? input : { ...input, title: trimmed }
  }

  /**
   * Save the previewed draft into the local archives.
   *
   * A second click while the first save is in flight is ignored, so one double
   * click produces one archive. A failed save keeps the preview and the original
   * text in place so the user can retry without re-importing.
   * @returns nothing; the draft, list, and detail states are published.
   */
  async saveDraft(): Promise<void> {
    const draft = this.state.draft
    if (draft === undefined || draft.built === undefined || draft.busy) return
    const title = normalizeTitle(draft.title)
    if (!title.ok) { this.patch({ draft: { ...draft, error: title.error } }); return }
    // Marking busy synchronously is what makes a double click one import: the
    // second click re-reads this state and returns above.
    const saving = { ...withoutKeys(draft, ['error']), busy: true }
    this.patch({ draft: saving })
    /** Failures only return to the draft that is still on screen. */
    const failTo = (error: ArchiveError): void => {
      if (this.state.draft === saving) this.patch({ draft: { ...saving, busy: false, error } })
    }

    const repository = await this.ensureRepository()
    if (!repository.ok) {
      failTo(repository.error)
      return
    }
    const saved = await repository.value.save({ ...draft.built.snapshot, title: title.value })
    if (!saved.ok) {
      failTo(saved.error)
      return
    }
    // The user may have closed the wizard while the write was in flight; the
    // archive is saved either way, so only the draft handling is conditional.
    const showSavedDetail = this.state.draft === saving
    if (showSavedDetail) this.clearKeys(['draft'])
    this.patch({ noticeKey: saved.value.duplicate ? 'import.duplicate' : 'import.saved' })
    await this.refresh()
    await this.selectArchive(saved.value.archiveId)
    if (showSavedDetail && this.state.draft === undefined && this.state.work === undefined
      && this.state.archiveDialog === undefined) this.patch({ archiveDialog: 'detail' })
  }

  // ----------------------------------------------------------- archive ops

  /**
   * Rename one archive.
   * @param archiveId - local archive id.
   * @param title - the new title.
   * @returns a promise resolving to the failure, when there is one.
   */
  async renameArchive(archiveId: string, title: string): Promise<ArchiveError | undefined> {
    const repository = await this.ensureRepository()
    if (!repository.ok) return repository.error
    const renamed = await repository.value.rename(archiveId, title)
    await this.refresh()
    if (this.state.detail.archiveId === archiveId) await this.selectArchive(archiveId)
    return renamed.ok ? undefined : renamed.error
  }

  /**
   * Delete one local archive record.
   * @param archiveId - local archive id.
   * @returns a promise resolving to the failure, when there is one.
   */
  async deleteArchive(archiveId: string): Promise<ArchiveError | undefined> {
    const repository = await this.ensureRepository()
    if (!repository.ok) return repository.error
    const removed = await repository.value.remove(archiveId)
    if (this.state.detail.archiveId === archiveId) {
      this.patch({ detail: { phase: 'idle', page: 1 } })
    }
    await this.refresh()
    return removed.ok ? undefined : removed.error
  }

  /**
   * Export the archive's original text exactly as imported.
   * @param archiveId - local archive id.
   * @returns a promise resolving to the failure, when there is one.
   */
  async exportOriginal(archiveId: string): Promise<ArchiveError | undefined> {
    return this.exportArchive(archiveId, 'original')
  }

  /**
   * Export the full local-archive document.
   * @param archiveId - local archive id.
   * @returns a promise resolving to the failure, when there is one.
   */
  async exportDocument(archiveId: string): Promise<ArchiveError | undefined> {
    return this.exportArchive(archiveId, 'document')
  }

  /**
   * Shared export path for both output shapes.
   * @param archiveId - local archive id.
   * @param shape - `original` for the raw text, `document` for the wrapped JSON.
   * @returns the failure, when there is one.
   */
  private async exportArchive(archiveId: string, shape: 'original' | 'document'): Promise<ArchiveError | undefined> {
    const repository = await this.ensureRepository()
    if (!repository.ok) return repository.error
    const snapshot = await repository.value.get(archiveId)
    if (!snapshot.ok) return snapshot.error
    if (shape === 'original') {
      const extension = snapshot.value.original.format === 'markdown'
        ? '.md'
        : snapshot.value.original.format === 'json' ? '.json' : '.txt'
      this.deps.download(safeExportFileName(snapshot.value.title, extension), originalTextOf(snapshot.value), 'text/plain;charset=utf-8')
      return undefined
    }
    this.deps.download(
      safeExportFileName(snapshot.value.title, '.archive.json'),
      serializeArchiveDocument(snapshot.value),
      'application/json;charset=utf-8',
    )
    return undefined
  }

  // -------------------------------------------------------------- work seam

  /**
   * Build the handoff preview for one archive.
   * @param archiveId - local archive id.
   * @returns nothing; the work state is published.
   */
  async prepareWork(archiveId: string, transfer?: { workspaceId: string; acceptContext: boolean; autoCommit: boolean; quickEnabled: boolean }): Promise<void> {
    if (this.disposed || this.state.work?.committing === true || this.state.transferSettings !== undefined) return
    this.clearKeys(['archiveDialog'])
    const requestId = this.deps.newRequestId()
    this.patch({ work: { phase: 'loading', requestId, archiveId } })
    const importer = await this.ensureImporter()
    if (this.state.work?.requestId !== requestId || this.disposed) return
    if (!importer.ok) {
      this.patch({ work: { phase: 'error', requestId, archiveId, error: importer.error } })
      return
    }
    const detail = await this.ensureRepository()
    if (this.state.work?.requestId !== requestId || this.disposed) return
    if (!detail.ok) {
      this.patch({ work: { phase: 'error', requestId, archiveId, error: detail.error } })
      return
    }
    const snapshot = await detail.value.get(archiveId)
    if (this.state.work?.requestId !== requestId || this.disposed) return
    if (!snapshot.ok) {
      this.patch({ work: { phase: 'error', requestId, archiveId, error: snapshot.error } })
      return
    }
    const preview = await importer.value.prepare({
      schemaVersion: 1,
      requestId,
      archiveId,
      expectedFingerprint: snapshot.value.fingerprint,
    })
    if (this.state.work?.requestId !== requestId || this.disposed) return
    if (!preview.ok) {
      this.patch({ work: { phase: 'error', requestId, archiveId, error: preview.error } })
      return
    }
    const choices = await importer.value.listWorkspaces?.()
    if (this.state.work?.requestId !== requestId || this.disposed) return
    if (choices !== undefined && !choices.ok) {
      this.patch({ work: { phase: 'error', requestId, archiveId, error: choices.error } })
      return
    }
    const selectedId = transfer?.workspaceId ?? this.state.transferPreference?.workspaceId
    const workspaceId = choices?.ok && choices.value.some(item => item.id === selectedId) ? selectedId : undefined
    this.patch({ work: { phase: 'ready', requestId, archiveId,
      preview: { ...preview.value, workspaceId: workspaceId ?? null },
      acceptContext: transfer !== undefined && workspaceId !== undefined && transfer.acceptContext,
      ...(choices?.ok ? { workspaces: choices.value } : {}),
      ...(transfer === undefined || workspaceId === undefined ? {} : { preferenceAfterCommit: {
        schemaVersion: 1, policy: TRANSFER_POLICY, workspaceId, quickEnabled: transfer.quickEnabled } }) } })
    if (transfer?.autoCommit === true && workspaceId !== undefined) await this.commitWork()
  }

  /** Select only an existing registry workspace; no directory is created. */
  chooseWorkWorkspace(workspaceId: string): void {
    const work = this.state.work
    if (work?.preview === undefined || work.committing === true || work.targetLocked === true) return
    if (!work.workspaces?.some(item => item.id === workspaceId)) return
    this.patch({ work: { ...withoutKeys(work, ['preferenceAfterCommit']), preview: { ...work.preview, workspaceId } } })
  }
  acceptWorkContext(accepted: boolean): void {
    const work = this.state.work
    if (work === undefined || work.committing === true) return
    this.patch({ work: { ...work, acceptContext: accepted } })
  }

  /** Close the handoff dialog without creating anything. */
  closeWork(): void {
    if (this.state.work?.committing === true) return
    this.clearKeys(['work'])
  }

  /**
   * Commit a preview through the active adapter. A native commit creates a
   * persisted history context; errors preserve the source and retry identity.
   * @returns nothing; the work state is published.
   */
  async commitWork(): Promise<void> {
    const work = this.state.work
    if (work?.preview === undefined || work.committing === true || work.acceptContext !== true
      || work.preview.workspaceId === null || this.disposed) return
    this.patch({ work: { ...work, committing: true, targetLocked: true } })
    const importer = await this.ensureImporter()
    if (!importer.ok) {
      this.patch({ work: { ...work, committing: false, commitError: importer.error } })
      return
    }
    const committed = await importer.value.commit(
      {
        schemaVersion: 1,
        requestId: work.requestId,
        archiveId: work.archiveId,
        expectedFingerprint: work.preview.fingerprint,
        ...(work.preview.workspaceId === null ? {} : { workspaceId: work.preview.workspaceId }),
        acceptUnestimatedContext: work.acceptContext === true,
      },
      work.preview,
    )
    const current = this.state.work
    if (current?.requestId !== work.requestId || this.disposed) return
    if (!committed.ok) {
      if (committed.error.code !== 'WORK_IMPORT_CANCELED') this.deps.navigation.openChatPanel()
      this.patch({ work: { ...current, committing: false, commitError: committed.error } })
    } else {
      const preference = work.preferenceAfterCommit ?? { schemaVersion: 1 as const, policy: TRANSFER_POLICY,
        workspaceId: committed.value.workspaceId,
        quickEnabled: this.state.transferPreference?.workspaceId === committed.value.workspaceId
          && this.state.transferPreference.quickEnabled }
      this.rememberTransferPreference(preference)
      this.clearKeys(['work'])
      this.patch({ noticeKey: this.state.preferenceError === undefined ? 'work.created' : 'quick.createdWithoutPreference' })
    }
  }

  /** Release the seams. Called from the plugin's effect teardown. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.captureAbort?.abort()
    this.deps.navigation.dispose()
    this.deps.webCarrier.dispose()
    this.importer?.dispose()
    this.repository?.dispose()
    this.repository = undefined
    this.listeners.clear()
  }
}

/** Capability reported before the work seam has been built. */
const WORK_IMPORT_PENDING: WorkImportPort['capability'] = {
  state: 'unavailable',
  code: 'WORK_IMPORT_NOT_IMPLEMENTED',
  noteKey: 'capability.workImport.notImplemented',
}

/** Default id source for work-import requests. */
export function defaultRequestId(): string {
  return newLocalId()
}

/**
 * Byte ceiling that applies to a picked file before its contents are known.
 *
 * A `.json` pick may be a full archive document, whose own ceiling is 64 MiB;
 * the 5 MiB plain-history gate is re-applied inside the parsers as soon as the
 * document turns out to be a manual history rather than an archive.
 * @param format - the format detected from the file extension.
 * @returns the limit key to check against.
 */
function ceilingForFormat(format: ManualFormat): InputCeiling {
  return format === 'json' ? 'archiveFileBytes' : 'manualInputBytes'
}
