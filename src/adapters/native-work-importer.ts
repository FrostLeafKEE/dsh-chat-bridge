/** Import persisted context through the plugin Host; never submits or writes input. */
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces, WorkspaceSource } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  ArchiveRepository, CapabilityStatus, ChatSnapshot, WorkImportPort,
  WorkImportRequest, WorkImportPreview, WorkImportReceipt, WorkspaceChoice,
} from '../shared/contracts'
import { errCode, ok, type Result } from '../shared/errors'
import { PendingWorkImporter } from './pending-work-importer'
import { readWorkReceipt, saveWorkReceipt } from '../storage/work-receipts'
import { HISTORY_MODE, historySessionId, type HistoryRemote } from '../shared/history-rpc'
import { faultOf, importDiagnostic, type ImportStage } from '../shared/import-diagnostics'

export interface NativeWorkRuntime {
  sessions: ISessions
  workspaces: IWorkspaces
  conversation: IConversation
  navigation: UiWorkspace
  history?: HistoryRemote
  beginNavigation(): AbortSignal
  text(key: WorkDraftTextKey): string
}

export type WorkDraftTextKey = 'work.quote.intro' | 'work.quote.attachments' | 'work.quote.task' | 'work.pendingTitlePrefix'

/** Public workspace snapshots retain stale rows while reconnecting: wait for idle. */
const WORKSPACE_WAIT_MS = 10_000

function waitForWorkspaceChoices(source: WorkspaceSource, signal: AbortSignal): Promise<Result<WorkspaceChoice[]>> {
  const read = (): Result<WorkspaceChoice[]> | undefined => {
    if (signal.aborted) return errCode('WORK_IMPORT_CANCELED', 'workspace preparation canceled')
    try {
      const snapshot = source.getSnapshot()
      if (snapshot.state === 'error') return errCode('WORKSPACE_LIST_UNAVAILABLE', 'workspace stream failed')
      if (snapshot.phase !== 'ready' || snapshot.state !== 'idle') return undefined
      return ok(snapshot.items.map(item => ({ id: item.workspaceId, title: item.title, path: item.path })))
    } catch { return errCode('WORKSPACE_LIST_UNAVAILABLE', 'workspace projection could not be read') }
  }
  const initial = read()
  if (initial !== undefined) return Promise.resolve(initial)
  return new Promise(resolve => {
    let finished = false
    let unsubscribe: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (result: Result<WorkspaceChoice[]>): void => {
      if (finished) return
      finished = true
      if (timer !== undefined) clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      unsubscribe?.()
      resolve(result)
    }
    const onAbort = (): void => { finish(errCode('WORK_IMPORT_CANCELED', 'workspace preparation canceled')) }
    const check = (): void => { const result = read(); if (result !== undefined) finish(result) }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) { onAbort(); return }
    timer = setTimeout(() => { finish(errCode('WORKSPACE_LIST_TIMEOUT', 'workspace projection did not become ready')) }, WORKSPACE_WAIT_MS)
    try {
      unsubscribe = source.subscribe(check)
      // A source may notify synchronously in subscribe(); release it in that case.
      if (finished) unsubscribe()
      else check()
    } catch { finish(errCode('WORKSPACE_LIST_UNAVAILABLE', 'workspace subscription could not be established')) }
  })
}

/** Legacy alpha.2–4 draft formatter, retained for compatibility; the importer no longer uses it. */
export function quotedHistoryDraft(snapshot: ChatSnapshot, text: NativeWorkRuntime['text']): string {
  const body = JSON.stringify({
    title: snapshot.title, fingerprint: snapshot.fingerprint,
    source: snapshot.source, history: snapshot.history,
  }, null, 2).replace(/[<>&\ufffc\ue000-\uf8ff]/g, value => `\\u${value.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return `${text('work.quote.intro')}\n${text('work.quote.attachments')}\n\n`
    + `<quoted_chat_history>\n${body}\n</quoted_chat_history>\n\n${text('work.quote.task')}\n`
}

class NativeWorkImporter implements WorkImportPort {
  readonly capability: CapabilityStatus = { state: 'available', noteKey: 'capability.workImport.nativeDraft' }
  private readonly previewer: PendingWorkImporter
  private readonly lifetime = new AbortController()
  private readonly commits = new Map<string, { identity: string; result: Promise<Result<WorkImportReceipt>> }>()
  private readonly identities = new Map<string, string>()
  constructor(private readonly repository: ArchiveRepository, private readonly runtime: NativeWorkRuntime) {
    this.previewer = new PendingWorkImporter(repository)
  }
  async listWorkspaces(signal?: AbortSignal): Promise<Result<WorkspaceChoice[]>> {
    const active = signal === undefined ? this.lifetime.signal : AbortSignal.any([this.lifetime.signal, signal])
    try { return await waitForWorkspaceChoices(this.runtime.workspaces.list, active) }
    catch { return errCode('WORKSPACE_LIST_UNAVAILABLE', 'workspace registry could not be read') }
  }
  async prepare(request: WorkImportRequest): Promise<Result<WorkImportPreview>> {
    const preview = await this.previewer.prepare(request)
    if (!preview.ok) return preview
    return ok({ ...preview.value, workspaceId: request.workspaceId ?? null,
      warningKeys: ['work.warning.quotedDraft', 'work.warning.contextNotEstimated',
        ...(preview.value.sourceKind === 'web-dom' ? ['capture.scopeNote', 'capture.exclusions'] : ['work.warning.userSuppliedOnly'])] })
  }
  commit(request: WorkImportRequest, preview: WorkImportPreview): Promise<Result<WorkImportReceipt>> {
    const identity = JSON.stringify([request.archiveId, request.expectedFingerprint, request.workspaceId])
    const previousIdentity = this.identities.get(request.requestId)
    if (previousIdentity !== undefined && previousIdentity !== identity) return Promise.resolve(errCode('WORK_IMPORT_FAILED', 'request identity changed; start a new preview'))
    this.identities.set(request.requestId, identity)
    const prior = this.commits.get(request.requestId)
    if (prior !== undefined) return prior.identity === identity ? prior.result
      : Promise.resolve(errCode('WORK_IMPORT_FAILED', 'request identity changed during import'))
    const progress: { stage: ImportStage } = { stage: 'client.prepare' }
    const result = this.perform(request, preview, progress)
      .then(value => importDiagnostic(value, progress.stage))
      .catch((error: unknown) => importDiagnostic(errCode('WORK_IMPORT_FAILED', 'native handoff failed; retry adopts the same session'), progress.stage, faultOf(error)))
      .finally(() => { this.commits.delete(request.requestId) })
    this.commits.set(request.requestId, { identity, result })
    return result
  }
  private async perform(request: WorkImportRequest, preview: WorkImportPreview, progress: { stage: ImportStage }): Promise<Result<WorkImportReceipt>> {
    if (this.lifetime.signal.aborted) return errCode('WORK_IMPORT_CANCELED', 'work importer disposed')
    if (this.runtime.history === undefined) return errCode('WORK_HISTORY_SERVICE_UNAVAILABLE', 'native history Client namespace unavailable')
    if (request.schemaVersion !== 1 || !/^[a-zA-Z0-9-]{1,100}$/.test(request.requestId)
      || preview.requestId !== request.requestId || preview.archiveId !== request.archiveId
      || preview.fingerprint !== request.expectedFingerprint) return errCode('INVALID_HISTORY', 'invalid history import request')
    if (request.acceptUnestimatedContext !== true) return errCode('WORK_IMPORT_FAILED', 'context decision required')
    const navigation = this.runtime.beginNavigation()
    const signal = AbortSignal.any([this.lifetime.signal, navigation])
    const workspaces = await this.listWorkspaces(signal)
    if (signal.aborted) return errCode('WORK_IMPORT_CANCELED', 'history import canceled during preparation')
    if (!workspaces.ok) return workspaces
    const workspace = workspaces.value.find(item => item.id === request.workspaceId)
    if (workspace === undefined) return errCode('WORK_IMPORT_FAILED', 'a registered workspace is required')
    const prior = await readWorkReceipt(request.requestId)
    if (!prior.ok) return prior
    if (prior.value !== undefined && (prior.value.transferMode !== HISTORY_MODE
      || prior.value.sourceArchiveId !== request.archiveId || prior.value.sourceFingerprint !== request.expectedFingerprint
      || prior.value.workspaceId !== workspace.id)) return errCode('WORK_IMPORT_FAILED', 'stored request belongs to another transfer')
    const snapshot = await this.repository.get(request.archiveId)
    if (!snapshot.ok) return snapshot
    if (snapshot.value.fingerprint !== request.expectedFingerprint) return errCode('ARCHIVE_CORRUPTED', 'archive changed before import')
    if (signal.aborted) return errCode('WORK_IMPORT_CANCELED', 'history import canceled before publication')
    // The Host independently validates, creates with a seed, flushes and reads storage back.
    // It also verifies retries instead of trusting this client receipt.
    progress.stage = 'client.rpc'
    const remote = await this.runtime.history.importHistory({ requestId: request.requestId, workspaceId: workspace.id,
      snapshot: snapshot.value, acceptUnestimatedContext: true }, signal)
    if (!remote.ok) return signal.aborted ? errCode('WORK_IMPORT_CANCELED', 'history import RPC canceled')
      : importDiagnostic(errCode('WORK_HISTORY_REQUEST_FAILED', 'history import RPC failed; source retained'), progress.stage, faultOf(remote.error))
    const imported = remote.value
    if (!imported.ok) return imported
    progress.stage = 'client.receipt'
    const receipt = imported.value
    if (receipt.transferMode !== HISTORY_MODE || receipt.nativeSessionId !== historySessionId(request.requestId)
      || receipt.sourceArchiveId !== request.archiveId || receipt.sourceFingerprint !== request.expectedFingerprint
      || receipt.workspaceId !== workspace.id) return errCode('WORK_IMPORT_FAILED', 'Host receipt identity mismatch')
    if (signal.aborted) return errCode('WORK_IMPORT_CANCELED', 'history saved; retry adopts the same session')
    const saved = await saveWorkReceipt(receipt)
    if (!saved.ok) return saved
    progress.stage = 'client.activate'
    const sessionId = receipt.nativeSessionId as SessionId
    const reference = this.runtime.sessions.retain(sessionId, { source: 'controllerOperation', signal })
    try {
      await reference.ready
      if (signal.aborted) return errCode('WORK_IMPORT_CANCELED', 'history saved; navigation canceled')
      // Input stays untouched: this native session already contains its history context.
      this.runtime.navigation.openSession(sessionId)
      return ok(receipt)
    } finally { reference.release() }
  }
  dispose(): void { this.lifetime.abort(); this.previewer.dispose() }
}

export function createNativeWorkImporter(repository: ArchiveRepository, runtime: NativeWorkRuntime): WorkImportPort {
  return new NativeWorkImporter(repository, runtime)
}
