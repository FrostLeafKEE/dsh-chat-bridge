/** Host-origin metadata only. This key never contains chat text or website credentials. */
import { errCode, ok, type Result } from '../shared/errors'

export const TRANSFER_POLICY = 'rendered-context-v2' as const
const KEY = 'dsh-chat-bridge.transfer-preferences.v1'

export interface TransferPreferences {
  schemaVersion: 1
  policy: typeof TRANSFER_POLICY
  workspaceId: string
  quickEnabled: boolean
}

export interface TransferPreferenceStore {
  read(): Result<TransferPreferences | undefined>
  write(value: TransferPreferences): Result<undefined>
}

function valid(value: unknown): value is TransferPreferences {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return Object.keys(item).length === 4 && item.schemaVersion === 1 && item.policy === TRANSFER_POLICY
    && typeof item.workspaceId === 'string' && item.workspaceId.length > 0 && item.workspaceId.length <= 4096
    && typeof item.quickEnabled === 'boolean'
}

export function createTransferPreferenceStore(): TransferPreferenceStore {
  return {
    read() {
      try {
        const raw = localStorage.getItem(KEY)
        if (raw === null) return ok(undefined)
        const value: unknown = JSON.parse(raw)
        // Keep the remembered target, but require a fresh opt-in for the new
        // operation which persists model-visible history instead of a draft.
        if (typeof value === 'object' && value !== null) {
          const previous = value as Record<string, unknown>
          if (Object.keys(previous).length === 4 && previous.schemaVersion === 1
            && previous.policy === 'rendered-quoted-v1' && typeof previous.quickEnabled === 'boolean'
            && typeof previous.workspaceId === 'string' && previous.workspaceId.length > 0 && previous.workspaceId.length <= 4096) {
            return ok({ schemaVersion: 1, policy: TRANSFER_POLICY, workspaceId: previous.workspaceId, quickEnabled: false })
          }
        }
        return valid(value) ? ok(value) : errCode('TRANSFER_PREFERENCES_UNAVAILABLE', 'transfer preference version or structure unsupported')
      } catch { return errCode('TRANSFER_PREFERENCES_UNAVAILABLE', 'transfer preferences could not be read') }
    },
    write(value) {
      if (!valid(value)) return errCode('TRANSFER_PREFERENCES_UNAVAILABLE', 'invalid transfer preferences')
      try {
        const raw = JSON.stringify(value)
        localStorage.setItem(KEY, raw)
        return localStorage.getItem(KEY) === raw ? ok(undefined)
          : errCode('TRANSFER_PREFERENCES_UNAVAILABLE', 'transfer preferences read-back failed')
      } catch { return errCode('TRANSFER_PREFERENCES_UNAVAILABLE', 'transfer preferences could not be saved') }
    },
  }
}
