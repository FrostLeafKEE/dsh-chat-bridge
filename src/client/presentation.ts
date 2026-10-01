/**
 * Pure text helpers shared by the panel components: error rendering, enum
 * labels, and number formatting. Keeping them out of the components means both
 * dictionaries stay the single source of user-visible copy.
 *
 * @module dsh-chat-bridge/client/presentation
 */

import type { ArchiveSummary, CapabilityStatus, Completeness, ManualFormat, SourceKind } from '../shared/contracts'
import { errCode, type ArchiveError } from '../shared/errors'
import { codePointLength } from '../shared/limits'
import { ERROR_KEYS, type DshChatBridgeLocaleKey } from './locales'
import { BRIDGE_BUILD, historyHostService, importBuild, importFault, importStage, type ImportStage } from '../shared/import-diagnostics'

/** The translate seat this plugin's registrations receive. */
export type Translate = (key: DshChatBridgeLocaleKey, params?: Record<string, unknown>) => string

/**
 * Every dictionary key the shared (locale-agnostic) core can name: the caveat
 * keys an import or handoff preview carries, plus the capability notes the seam
 * ports publish. The core deals in plain strings because it must not depend on
 * the client dictionary; this allow-list is what turns those strings back into
 * typed keys, and an unknown value is dropped rather than rendered as a raw key.
 */
const CORE_KEY_LIST = [
  'capture.scopeNote',
  'capture.exclusions',
  'import.warning.userSupplied',
  'import.warning.attachmentsMetadataOnly',
  'import.warning.unverifiedRoles',
  'import.warning.localArchiveOnly',
  'work.warning.workspaceNotWired',
  'work.warning.contextNotEstimated',
  'work.warning.userSuppliedOnly',
  'work.warning.quotedDraft',
  'capability.workImport.nativeDraft',
  'capability.webCarrier.desktop',
  'capability.webCarrier.desktopRequired',
  'capability.webCarrier.notImplemented',
  'capability.workImport.notImplemented',
  'capability.navigation.publicLayout',
] as const satisfies readonly DshChatBridgeLocaleKey[]

const CORE_KEYS: ReadonlySet<string> = new Set<string>(CORE_KEY_LIST)

/**
 * Resolve one core-side string key to a typed dictionary key.
 * @param key - key reported by the core.
 * @returns the dictionary key, or `undefined` when this build defines no copy for it.
 */
export function coreKey(key: string): DshChatBridgeLocaleKey | undefined {
  return CORE_KEYS.has(key) ? key as DshChatBridgeLocaleKey : undefined
}

/**
 * Filter the core's caveat keys down to the ones this dictionary defines.
 * @param keys - keys reported by the core.
 * @returns typed dictionary keys, in the core's order.
 */
export function warningKeys(keys: readonly string[]): DshChatBridgeLocaleKey[] {
  const known: DshChatBridgeLocaleKey[] = []
  for (const key of keys) {
    const resolved = coreKey(key)
    if (resolved !== undefined) known.push(resolved)
  }
  return known
}

/**
 * The capability note a seam publishes, as user-facing text. An unrecognized
 * note renders as nothing rather than as a raw key, and the caller decides
 * whether the line is shown at all.
 * @param t - namespace translate seat.
 * @param status - the seam's capability report.
 * @returns the note text, or an empty string when this build has no copy for it.
 */
export function capabilityText(t: Translate, status: CapabilityStatus): string {
  const key = coreKey(status.noteKey)
  return key === undefined ? '' : t(key)
}

/**
 * Render one error as user-facing text: the code's own sentence plus, when the
 * input named a field, that field path. Never includes user content.
 * @param t - namespace translate seat.
 * @param error - the failure to render.
 * @returns the message the user reads.
 */
export function errorText(t: Translate, error: ArchiveError): string {
  const base = t(ERROR_KEYS[error.code])
  const lines = [base]
  if (error.path !== undefined && error.path !== '') lines.push(t('common.field', { path: error.path }))
  const stage = importStage(error.detail?.stage)
  if (stage !== undefined) {
    const build = importBuild(error.detail?.build) ?? BRIDGE_BUILD
    lines.push(t('error.importStage', { stage: t(IMPORT_STAGE_KEYS[stage]), build }))
    if (stage.startsWith('host.') && build !== BRIDGE_BUILD) {
      lines.push(t('error.importBuildMismatch', { host: build, client: BRIDGE_BUILD }))
    }
    const fault = importFault(error.detail?.fault)
    if (fault !== undefined) lines.push(t('error.importFault', { fault }))
    const service = historyHostService(error.detail?.service)
    if (service !== undefined) lines.push(t('error.importService', { service }))
  }
  return lines.join('\n')
}

const IMPORT_STAGE_KEYS: Record<ImportStage, DshChatBridgeLocaleKey> = {
  'client.prepare': 'diagnostic.clientPrepare', 'client.rpc': 'diagnostic.clientRpc',
  'client.receipt': 'diagnostic.clientReceipt', 'client.activate': 'diagnostic.clientActivate',
  'host.services': 'diagnostic.hostServices', 'host.validate': 'diagnostic.hostValidate',
  'host.workspace': 'diagnostic.hostWorkspace', 'host.inspect': 'diagnostic.hostInspect',
  'host.preset': 'diagnostic.hostPreset', 'host.model': 'diagnostic.hostModel',
  'host.seed': 'diagnostic.hostSeed', 'host.create': 'diagnostic.hostCreate',
  'host.mount': 'diagnostic.hostMount', 'host.publish': 'diagnostic.hostPublish',
  'host.activate': 'diagnostic.hostActivate',
  'host.attach': 'diagnostic.hostAttach', 'host.title': 'diagnostic.hostTitle',
  'host.flush': 'diagnostic.hostFlush', 'host.readback': 'diagnostic.hostReadback',
}

/**
 * Label for a manual format.
 * @param t - namespace translate seat.
 * @param format - the original input format.
 * @returns the localized label.
 */
export function formatText(t: Translate, format: ManualFormat): string {
  return format === 'json' ? t('detail.format.json') : format === 'markdown' ? t('detail.format.markdown') : t('detail.format.text')
}

/**
 * Label for a source kind (the archive's provenance vocabulary).
 * @param t - namespace translate seat.
 * @param kind - source kind.
 * @returns the localized label; the kind is derived from the format.
 */
export function sourceKindText(t: Translate, kind: SourceKind): string {
  if (kind === 'web-dom') return t('capture.sourceKind')
  return formatText(t, kind === 'manual-json' ? 'json' : kind === 'manual-markdown' ? 'markdown' : 'text')
}

/**
 * Sentence for a completeness value.
 * @param t - namespace translate seat.
 * @param completeness - the archive's completeness.
 * @returns the localized sentence.
 */
export function completenessText(t: Translate, completeness: Completeness): string {
  if (completeness === 'user-supplied') return t('detail.completeness.user-supplied')
  if (completeness === 'partial') return t('detail.completeness.partial')
  return t('detail.completeness.unknown')
}

/**
 * One-line size description for a list row.
 * @param t - namespace translate seat.
 * @param summary - the archive's list projection.
 * @returns a short description of how much content the archive holds.
 */
export function summarySizeText(t: Translate, summary: ArchiveSummary): string {
  if (summary.historyKind === 'messages') return t('archives.messagesCount', { count: summary.messageCount ?? 0 })
  return t('archives.sourceTextCount', { count: summary.textLength ?? 0 })
}

/**
 * Format a local timestamp for display without pulling in a date library.
 * @param iso - ISO-8601 string.
 * @returns a locale-formatted date/time, or the raw value when unparseable.
 */
export function formatTimestamp(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleString()
}

/**
 * Count characters the way a reader does (code points, not UTF-16 units).
 * @param text - any string.
 * @returns the code-point count.
 */
export function characterCount(text: string): number {
  return codePointLength(text)
}

/**
 * Build the failure reported when a picked file cannot be read at all.
 * Constructed here (rather than in a component) so no component creates error
 * literals of its own.
 * @returns a `FILE_READ_FAILED` error.
 */
export function fileReadError(): ArchiveError {
  return errCode('FILE_READ_FAILED', 'the selected file could not be read').error
}
