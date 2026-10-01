/** Closed, content-free diagnostics shared across the import boundary. */
import type { Err, ErrorCode, Result } from './errors'
import { errCode } from './errors'

export const BRIDGE_BUILD = '1.0.0'
const DIAGNOSTIC_BUILDS = ['0.2.0-alpha.5', '0.2.0-alpha.6', '0.2.0-alpha.7', '0.2.0-alpha.8', '0.2.0-alpha.9', '0.2.0-alpha.10', '0.2.0-alpha.11', '0.2.0-alpha.12', BRIDGE_BUILD] as const
export const IMPORT_STAGES = [
  'client.prepare', 'client.rpc', 'client.receipt', 'client.activate',
  'host.services', 'host.validate', 'host.workspace', 'host.inspect', 'host.preset',
  'host.model', 'host.seed', 'host.create', 'host.mount', 'host.publish',
  'host.activate', 'host.attach', 'host.title', 'host.flush', 'host.readback',
] as const
export type ImportStage = typeof IMPORT_STAGES[number]
export const HISTORY_HOST_SERVICES = [
  'sessions', 'agents', 'workspaceRegistry', 'sessionController', 'agentPresets', 'agentDefaultModel', 'sessionPersistence',
] as const
export type HistoryHostService = typeof HISTORY_HOST_SERVICES[number]

const IMPORT_FAULTS = [
  'gateway/ambiguous-endpoint', 'gateway/arguments-invalid', 'gateway/bad-request', 'gateway/binding-invalid',
  'gateway/cancelled', 'gateway/context-failed', 'gateway/context-not-found', 'gateway/context-unavailable',
  'gateway/definition-unavailable', 'gateway/input-invalid', 'gateway/internal', 'gateway/invocation-unavailable',
  'gateway/lookup-failed', 'gateway/lookup-not-found', 'gateway/lookup-unavailable', 'gateway/method-unavailable',
  'gateway/protocol', 'gateway/provider-mismatch', 'gateway/result-invalid', 'gateway/service-unavailable',
  'gateway/signature-invalid', 'gateway/uplink-overflow',
  'agent-preset/not-found', 'agent-preset/invalid', 'agent-preset/locked',
  'SessionPersistenceNotFoundError', 'SessionAlreadyExistsError', 'SessionAlreadyOwnedError',
  'SessionReadOnlyError', 'SessionOwnershipLostError', 'SessionHandleClosedError',
  'SessionPersistenceCorruptionError', 'SessionFormatUnsupportedError',
  'EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'EBUSY', 'EIO',
  'cordis/missing-inject', 'cordis/inactive-service', 'session/invalid-seed',
  'INACTIVE_EFFECT', 'INVARIANT', 'session/system-message-outside-step',
  'agent/factory-unavailable', 'agent/default-model-api-unavailable', 'agent/create-api-unavailable',
  'runtime/type-error', 'runtime/range-error', 'runtime/unclassified',
] as const
export type ImportFault = typeof IMPORT_FAULTS[number]

export function importBuild(value: unknown): string | undefined {
  return typeof value === 'string' && (DIAGNOSTIC_BUILDS as readonly string[]).includes(value) ? value : undefined
}

export function importStage(value: unknown): ImportStage | undefined {
  return typeof value === 'string' && (IMPORT_STAGES as readonly string[]).includes(value) ? value as ImportStage : undefined
}
export function importFault(value: unknown): ImportFault | undefined {
  return typeof value === 'string' && (IMPORT_FAULTS as readonly string[]).includes(value) ? value as ImportFault : undefined
}
export function historyHostService(value: unknown): HistoryHostService | undefined {
  return typeof value === 'string' && (HISTORY_HOST_SERVICES as readonly string[]).includes(value) ? value as HistoryHostService : undefined
}

/** Inspect fixed exception vocabulary only; never retain messages, stacks, paths or details. */
function directFault(value: object): ImportFault | undefined {
  try {
    const item = value as { code?: unknown; name?: unknown; message?: unknown }
    if (item.code === 'INVARIANT' && typeof item.message === 'string'
      && item.message.startsWith('invariant violated by "@deepseek-ai/dsh-session": system/message names turn ')) {
      return 'session/system-message-outside-step'
    }
    const named = importFault(item.code) ?? importFault(item.name)
    if (named !== undefined) return named
    if (typeof item.message !== 'string') return undefined
    if (item.message.startsWith('cannot get property "') && item.message.endsWith('" without inject')) return 'cordis/missing-inject'
    if (item.message.startsWith('cannot get required service "') && item.message.endsWith('" in inactive context')) return 'cordis/inactive-service'
    if (item.message === 'no agent factory registered (load an agent-loop plugin)') return 'agent/factory-unavailable'
    if (/^(invalid seed event at index |seed event at index |seed (system|user|assistant|developer)\/message at index )/.test(item.message)) return 'session/invalid-seed'
  } catch { /* Untrusted exception accessors are not diagnostic data. */ }
  return undefined
}

/** Search bounded wrapper causes for fixed codes; never copy exception data. */
export function faultOf(value: unknown): ImportFault {
  const queue: unknown[] = [value]
  const seen = new Set<object>()
  let fallback: ImportFault = 'runtime/unclassified'
  let broadFault: ImportFault | undefined
  for (let index = 0; index < queue.length && index < 12; index += 1) {
    const item = queue[index]
    if (typeof item !== 'object' || item === null || seen.has(item)) continue
    seen.add(item)
    const direct = directFault(item)
    if (direct !== undefined) {
      if (direct !== 'INVARIANT') return direct
      broadFault ??= direct
    }
    try {
      const error = item as { name?: unknown; cause?: unknown; errors?: unknown }
      if (error.name === 'TypeError') fallback = 'runtime/type-error'
      else if (error.name === 'RangeError' && fallback === 'runtime/unclassified') fallback = 'runtime/range-error'
      if (error.cause !== undefined && queue.length < 12) queue.push(error.cause)
      if (Array.isArray(error.errors)) {
        for (let child = 0; child < error.errors.length && queue.length < 12; child += 1) queue.push(error.errors[child])
      }
    } catch { /* Accessor failures do not expose or prevent closed diagnostics. */ }
  }
  return broadFault ?? fallback
}

/** Preserve a Host stage when a Client layer forwards the same business failure. */
export function importDiagnostic(result: Err, stage: ImportStage, fault?: ImportFault): Err
export function importDiagnostic<T>(result: Result<T>, stage: ImportStage, fault?: ImportFault): Result<T>
export function importDiagnostic<T>(result: Result<T>, stage: ImportStage, fault?: ImportFault): Result<T> {
  if (result.ok) return result
  return { ok: false, error: { ...result.error, detail: { ...result.error.detail,
    stage: importStage(result.error.detail?.stage) ?? stage,
    build: importBuild(result.error.detail?.build) ?? BRIDGE_BUILD,
    ...(fault === undefined ? {} : { fault }),
  } } }
}

/** A setup callback can report its narrower stage without retaining the original exception. */
export class ImportStageFailure extends Error {
  constructor(readonly stage: ImportStage, readonly code: ErrorCode, readonly fault?: ImportFault) {
    super('native history import stage failed')
  }
  result(): Err { return importDiagnostic(errCode(this.code, 'native history import stage failed'), this.stage, this.fault) }
}
