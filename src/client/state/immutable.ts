/**
 * Tiny immutable-update helpers for the panel state.
 *
 * `exactOptionalPropertyTypes` is on, so "clear this optional field" cannot be
 * written as `{ ...state, field: undefined }`. Removing the key is the honest
 * way to express it, and it keeps the state object's shape meaningful to
 * `useSyncExternalStore` consumers.
 *
 * @module dsh-chat-bridge/client/state/immutable
 */

/**
 * Copy an object without the listed keys.
 * @param value - source object.
 * @param keys - keys to drop from the copy.
 * @returns a shallow copy lacking those keys.
 */
export function withoutKeys<T extends object, K extends keyof T>(value: T, keys: readonly K[]): T {
  const copy = { ...value }
  const mutable = copy as Record<string, unknown>
  for (const key of keys) delete mutable[key as string]
  return copy
}
