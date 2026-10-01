/** Durable source-to-native links; contains metadata only, never credentials or text. */
import type { WorkImportReceipt } from '../shared/contracts'
import { errCode, ok, type Result } from '../shared/errors'
import { isHistoryReceipt } from '../shared/history-rpc'

const DATABASE = 'dsh-chat-bridge.work-imports.v1'
const STORE = 'receipts'

async function connection(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    let blocked = false
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'requestId' }) }
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result) }
    request.onerror = () => { reject(new Error('receipt database unavailable')) }
    request.onblocked = () => { blocked = true; reject(new Error('receipt database blocked')) }
  })
}

function valid(value: unknown): value is WorkImportReceipt {
  if (isHistoryReceipt(value)) return true
  if (typeof value !== 'object' || value === null || !('schemaVersion' in value) || value.schemaVersion !== 1) return false
  return ['requestId', 'sourceArchiveId', 'sourceFingerprint', 'workspaceId', 'nativeSessionId', 'importedAt']
    .every(key => typeof Reflect.get(value, key) === 'string' && Reflect.get(value, key).length > 0)
    && 'requestId' in value && typeof value.requestId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value.requestId)
    && 'nativeSessionId' in value && value.nativeSessionId === `session-dsh-chat-bridge-${value.requestId}`
    && 'sourceFingerprint' in value && typeof value.sourceFingerprint === 'string' && /^[0-9a-f]{64}$/.test(value.sourceFingerprint)
    && 'importedAt' in value && typeof value.importedAt === 'string' && Number.isFinite(Date.parse(value.importedAt))
    && 'importedRange' in value && value.importedRange === 'full'
    && 'transferMode' in value && value.transferMode === 'quoted-draft'
}

export async function readWorkReceipt(requestId: string): Promise<Result<WorkImportReceipt | undefined>> {
  let database: IDBDatabase | undefined
  try {
    database = await connection()
    const record: unknown = await new Promise((resolve, reject) => {
      const transaction = database!.transaction(STORE, 'readonly')
      const request = transaction.objectStore(STORE).get(requestId)
      let value: unknown
      request.onsuccess = () => { value = request.result }
      transaction.oncomplete = () => { resolve(value) }
      transaction.onabort = () => { reject(new Error('receipt read failed')) }
    })
    return record === undefined ? ok(undefined) : valid(record) ? ok(record) : errCode('ARCHIVE_CORRUPTED', 'work receipt invalid')
  } catch { return errCode('STORAGE_UNAVAILABLE', 'work receipt could not be read') }
  finally { database?.close() }
}

export async function saveWorkReceipt(receipt: WorkImportReceipt): Promise<Result<undefined>> {
  let database: IDBDatabase | undefined
  try {
    database = await connection()
    await new Promise<void>((resolve, reject) => {
      const transaction = database!.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put(receipt)
      transaction.oncomplete = () => { resolve() }
      transaction.onabort = () => { reject(new Error('receipt write failed')) }
    })
    return ok(undefined)
  } catch { return errCode('WORK_IMPORT_FAILED', 'native history may exist; work receipt could not be saved') }
  finally { database?.close() }
}
