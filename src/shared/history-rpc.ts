/** Handwritten public Typert boundary, shared by the standalone Host and Client. */
import type { InvocationDescriptor, RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { ChatSnapshot, WorkImportReceipt } from './contracts'
import { ERROR_CODES, type Result } from './errors'
import { validateSnapshot } from '../import/validate-snapshot'
import { LIMITS, utf8ByteLength } from './limits'

export const HISTORY_SERVICE = 'dshChatBridgeHistory'
export const HISTORY_NAMESPACE = 'dshChatBridge'
export const HISTORY_MODE = 'imported-context' as const
export const HISTORY_SOURCE = 'dsh-chat-bridge-history' as const

export interface HistoryImportRequest {
  requestId: string
  workspaceId: string
  acceptUnestimatedContext: true
  snapshot: ChatSnapshot
}

export interface HistoryRemote {
  importHistory(request: HistoryImportRequest, signal: AbortSignal): Promise<RemoteResult<Result<WorkImportReceipt>>>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap { dshChatBridge: HistoryRemote }
}

export function historySessionId(requestId: string): string {
  return `session-dsh-chat-bridge-history-${requestId}`
}

export function parseHistoryRequest(value: unknown): HistoryImportRequest {
  if (typeof value !== 'object' || value === null) throw new Error('invalid history import envelope')
  const item = value as Record<string, unknown>
  if (Object.keys(item).length !== 4 || typeof item.requestId !== 'string'
    || !/^[a-zA-Z0-9-]{1,100}$/.test(item.requestId)
    || typeof item.workspaceId !== 'string' || item.workspaceId.length === 0 || item.workspaceId.length > 4096
    || item.acceptUnestimatedContext !== true) throw new Error('invalid history import identity')
  if (utf8ByteLength(JSON.stringify(item.snapshot)) > LIMITS.archiveFileBytes) throw new Error('history import exceeds archive limit')
  const snapshot = validateSnapshot(item.snapshot)
  if (!snapshot.ok) throw new Error('invalid history import snapshot')
  return { requestId: item.requestId, workspaceId: item.workspaceId,
    acceptUnestimatedContext: true, snapshot: snapshot.value }
}

/** This receipt is separate from the older quoted-draft receipts. */
export function isHistoryReceipt(value: unknown): value is WorkImportReceipt {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return item.schemaVersion === 1 && item.transferMode === HISTORY_MODE && item.importedRange === 'full'
    && typeof item.requestId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(item.requestId)
    && item.nativeSessionId === historySessionId(item.requestId)
    && typeof item.sourceArchiveId === 'string' && item.sourceArchiveId.length > 0
    && typeof item.sourceFingerprint === 'string' && /^[0-9a-f]{64}$/.test(item.sourceFingerprint)
    && typeof item.workspaceId === 'string' && item.workspaceId.length > 0
    && typeof item.importedAt === 'string' && Number.isFinite(Date.parse(item.importedAt))
}

function parseResult(value: unknown): Result<WorkImportReceipt> {
  if (typeof value !== 'object' || value === null) throw new Error('invalid history import result')
  const item = value as Record<string, unknown>
  if (item.ok === true && isHistoryReceipt(item.value)) return value as Result<WorkImportReceipt>
  if (item.ok === false && typeof item.error === 'object' && item.error !== null) {
    const error = item.error as Record<string, unknown>
    if (typeof error.code === 'string' && (ERROR_CODES as readonly string[]).includes(error.code)
      && typeof error.messageKey === 'string' && typeof error.message === 'string') return value as Result<WorkImportReceipt>
  }
  throw new Error('invalid history import result')
}

export const HISTORY_DESCRIPTORS: readonly InvocationDescriptor[] = [{
  id: 'dsh-chat-bridge#importHistory.v1', service: HISTORY_SERVICE, namespace: HISTORY_NAMESPACE,
  method: 'importHistory', invocation: { kind: 'direct' },
  parameters: [{ name: 'request', wire: 'request', source: 'json',
    codec: { mode: 'strict', typeSymbol: 'HistoryImportRequest.v1', create: () => ({ parse: parseHistoryRequest }) } }],
  cancellation: { parameter: 'signal' },
  result: { mode: 'strict', typeSymbol: 'HistoryImportResult.v1', create: () => ({ parse: parseResult }), decode: parseResult },
}]

export const HISTORY_REMOTE: TypertRemoteContribution = { package: 'dsh-chat-bridge', descriptors: HISTORY_DESCRIPTORS }
