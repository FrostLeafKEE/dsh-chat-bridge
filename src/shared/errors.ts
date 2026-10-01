/**
 * Serializable result and error contract shared by the Host and Client halves.
 *
 * Expected business failures (bad input, missing archive, unavailable storage)
 * are returned as values, never thrown: the UI must be able to show a precise,
 * localized message instead of a raw exception. Exceptions stay reserved for
 * programmer errors.
 *
 * Error payloads are logging-safe by construction: they carry a stable code, a
 * locale key, a short technical description, and at most a *field path*. They
 * never carry the imported text, the original export, or a full input dump.
 *
 * @module dsh-chat-bridge/shared/errors
 */

/**
 * Stable error codes. The first block is the set required by the task
 * brief; the second block lists the additions this implementation needed,
 * documented in `docs/CONTRACTS.md`.
 */
export const ERROR_CODES = [
  // Required by the brief.
  'INPUT_TOO_LARGE',
  'INVALID_JSON',
  'UNSUPPORTED_FORMAT',
  'UNSUPPORTED_VERSION',
  'INVALID_HISTORY',
  'UNSAFE_SOURCE_URL',
  'ARCHIVE_NOT_FOUND',
  'ARCHIVE_CORRUPTED',
  'STORAGE_UNAVAILABLE',
  'STORAGE_QUOTA_EXCEEDED',
  'WEB_CARRIER_NOT_IMPLEMENTED',
  'WORK_IMPORT_NOT_IMPLEMENTED',
  'DESKTOP_REQUIRED',
  'WEB_LOAD_FAILED',
  'WEB_NAVIGATION_BLOCKED',
  'WEB_CAPTURE_UNAVAILABLE',
  'WEB_CAPTURE_UNSUPPORTED',
  'WEB_CAPTURE_EMPTY',
  'WEB_CAPTURE_BUSY',
  'WEB_CAPTURE_DRAFT_PRESENT',
  'WEB_CAPTURE_CHANGED',
  'WEB_CAPTURE_CANCELED',
  'WEB_HISTORY_UNSUPPORTED',
  'WEB_HISTORY_LOAD_FAILED',
  'WEB_HISTORY_TOO_LARGE',
  'WEB_HISTORY_UNAVAILABLE',
  'WORK_IMPORT_FAILED',
  'WORKSPACE_LIST_UNAVAILABLE',
  'WORKSPACE_LIST_TIMEOUT',
  'WORK_HISTORY_SERVICE_UNAVAILABLE',
  'WORK_HISTORY_REQUEST_FAILED',
  'WORK_PRESET_UNAVAILABLE',
  'WORK_DRAFT_NOT_SAVED',
  'WORK_HISTORY_NOT_SAVED',
  'WORK_IMPORT_CANCELED',
  'TRANSFER_PREFERENCES_UNAVAILABLE',
  // Additions (documented; each covers a failure the required set cannot name).
  /** Bytes are not valid UTF-8, or a file read failed before decoding. */
  'INVALID_ENCODING',
  /** A title is empty, too long, or otherwise unusable. */
  'INVALID_TITLE',
  /** The selected file could not be read (permission, removed, unknown error). */
  'FILE_READ_FAILED',
  /** The host layout service is missing or refused the navigation request. */
  'NAVIGATION_UNAVAILABLE',
  /** Any failure with no more specific code; carries no input data. */
  'UNEXPECTED',
] as const

/** One stable error code. */
export type ErrorCode = (typeof ERROR_CODES)[number]

/** A structured, serializable, logging-safe failure. */
export interface ArchiveError {
  /** Stable machine-readable code. */
  code: ErrorCode
  /** Locale key the client resolves through its own dictionary, e.g. `error.INPUT_TOO_LARGE`. */
  messageKey: string
  /**
   * Short technical description for developers and logs. Never contains user
   * content: only field names, limits, and structural facts.
   */
  message: string
  /** Optional location of the offending field, e.g. `messages[3].role`. */
  path?: string
  /** Optional non-content structural detail, e.g. `{ limit: 5000, actual: 5001 }`. */
  detail?: Record<string, string | number | boolean>
}

/** Successful outcome. */
export interface Ok<T> {
  ok: true
  value: T
}

/** Failed outcome. */
export interface Err {
  ok: false
  error: ArchiveError
}

/** Result of an operation that can fail in an expected way. */
export type Result<T> = Ok<T> | Err

/**
 * Build a success result.
 * @param value - the produced value.
 * @returns an {@link Ok} wrapper.
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value }
}

/**
 * Build a failure result.
 * @param code - stable error code.
 * @param messageKey - locale key for the user-facing message.
 * @param message - short technical description (no user content).
 * @param options - optional field path and structural detail.
 * @returns an {@link Err} wrapper.
 */
export function err(
  code: ErrorCode,
  messageKey: string,
  message: string,
  options: { path?: string; detail?: ArchiveError['detail'] } = {},
): Err {
  const error: ArchiveError = { code, messageKey, message }
  if (options.path !== undefined) error.path = options.path
  if (options.detail !== undefined) error.detail = options.detail
  return { ok: false, error }
}

/**
 * Build a failure whose locale key is derived from the code.
 * @param code - stable error code.
 * @param message - short technical description (no user content).
 * @param options - optional field path and structural detail.
 * @returns an {@link Err} wrapper.
 */
export function errCode(
  code: ErrorCode,
  message: string,
  options: { path?: string; detail?: ArchiveError['detail'] } = {},
): Err {
  return err(code, `error.${code}`, message, options)
}

/**
 * Type guard for a successful result.
 * @param result - any result.
 * @returns true when the result carries a value.
 */
export function isOk<T>(result: Result<T>): result is Ok<T> {
  return result.ok
}

/**
 * Unwrap a result, throwing a plain error when it failed. Intended for tests
 * and for call sites that already proved success; UI paths must branch on
 * `result.ok` instead so the message stays localized.
 * @param result - any result.
 * @returns the carried value.
 * @throws {Error} with the code and technical message when the result failed.
 */
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value
  throw new Error(`${result.error.code}: ${result.error.message}`)
}
