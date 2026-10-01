/**
 * Small structural guards shared by the JSON parsers.
 *
 * The rules they enforce are the task brief's: field types are checked rather
 * than coerced, unknown fields are reported instead of silently dropped, and
 * every failure carries the field path so the UI can point at the problem.
 *
 * @module dsh-chat-bridge/import/guard
 */

import { errCode, ok, type Result } from '../shared/errors'

/**
 * Whether a value is a plain JSON object (not an array, not null).
 * @param value - candidate value.
 * @returns true for a plain object.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Report any key that this schema does not support.
 *
 * Strictness here is deliberate: a manual history with unknown fields is
 * rejected rather than accepted, so an import can never quietly lose data the
 * user thought was there.
 * @param value - the object to inspect.
 * @param allowed - the field names this schema defines.
 * @param path - field path used in the error.
 * @returns success when every key is known, else `INVALID_HISTORY` naming the key.
 */
export function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): Result<undefined> {
  const known = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      return errCode('INVALID_HISTORY', 'unsupported field in input', {
        path: path === '' ? key : `${path}.${key}`,
        detail: { field: key },
      })
    }
  }
  return ok(undefined)
}

/**
 * Read an optional string field. A present-but-wrong type is an error; an
 * absent field yields `undefined`.
 * @param value - the raw field value.
 * @param path - field path used in the error.
 * @returns the string, `undefined`, or `INVALID_HISTORY`.
 */
export function optionalString(value: unknown, path: string): Result<string | undefined> {
  if (value === undefined) return ok(undefined)
  if (typeof value !== 'string') {
    return errCode('INVALID_HISTORY', 'field must be a string', { path, detail: { actual: typeof value } })
  }
  return ok(value)
}

/**
 * Read a required, non-empty string field.
 * @param value - the raw field value.
 * @param path - field path used in the error.
 * @param maxLength - optional code-point ceiling.
 * @returns the string or `INVALID_HISTORY`.
 */
export function requiredString(value: unknown, path: string, maxLength?: number): Result<string> {
  if (typeof value !== 'string') {
    return errCode('INVALID_HISTORY', 'field is required and must be a string', {
      path,
      detail: { actual: typeof value },
    })
  }
  if (value === '') {
    return errCode('INVALID_HISTORY', 'field is required and must not be empty', { path })
  }
  if (maxLength !== undefined && [...value].length > maxLength) {
    return errCode('INVALID_HISTORY', 'field exceeds the configured length limit', {
      path,
      detail: { limit: maxLength },
    })
  }
  return ok(value)
}

/**
 * Read an optional non-negative integer field.
 * @param value - the raw field value.
 * @param path - field path used in the error.
 * @returns the number, `undefined`, or `INVALID_HISTORY`.
 */
export function optionalNonNegativeInteger(value: unknown, path: string): Result<number | undefined> {
  if (value === undefined) return ok(undefined)
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return errCode('INVALID_HISTORY', 'field must be a non-negative integer', { path })
  }
  return ok(value)
}

/**
 * Read an optional ISO-8601 timestamp field.
 *
 * The source's own time is preserved as written; a missing time stays missing
 * and is never replaced with the local import time.
 * @param value - the raw field value.
 * @param path - field path used in the error.
 * @returns the original string, `undefined`, or `INVALID_HISTORY`.
 */
export function optionalIsoTimestamp(value: unknown, path: string): Result<string | undefined> {
  if (value === undefined) return ok(undefined)
  if (typeof value !== 'string') {
    return errCode('INVALID_HISTORY', 'timestamp field must be a string', { path })
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return errCode('INVALID_HISTORY', 'timestamp field is not a valid ISO-8601 instant', { path })
  }
  return ok(value)
}

/**
 * Read an optional array field.
 * @param value - the raw field value.
 * @param path - field path used in the error.
 * @returns the array, `undefined`, or `INVALID_HISTORY`.
 */
export function optionalArray(value: unknown, path: string): Result<unknown[] | undefined> {
  if (value === undefined) return ok(undefined)
  if (!Array.isArray(value)) {
    return errCode('INVALID_HISTORY', 'field must be an array', { path, detail: { actual: typeof value } })
  }
  return ok(value)
}

/**
 * Read a required array field.
 * @param value - the raw field value.
 * @param path - field path used in the error.
 * @returns the array or `INVALID_HISTORY`.
 */
export function requiredArray(value: unknown, path: string): Result<unknown[]> {
  if (!Array.isArray(value)) {
    return errCode('INVALID_HISTORY', 'field is required and must be an array', {
      path,
      detail: { actual: typeof value },
    })
  }
  return ok(value)
}
