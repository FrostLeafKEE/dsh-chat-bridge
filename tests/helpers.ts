/**
 * Shared test helpers: fixture loading and one-assertion result unwrapping.
 * @module dsh-chat-bridge/tests/helpers
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'
import type { Result } from '../src/shared/errors'

const here = dirname(fileURLToPath(import.meta.url))

/** Absolute path of the fixture directory. */
export const FIXTURES_DIR = join(here, '..', 'fixtures')

/**
 * Read one fixture as text.
 * @param name - file name inside `fixtures/`.
 * @returns the file's UTF-8 text.
 */
export function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8')
}

/**
 * Read one fixture as bytes.
 * @param name - file name inside `fixtures/`.
 * @returns the file's bytes.
 */
export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name)))
}

/**
 * Assert a result succeeded and return its value.
 * @param result - any result.
 * @returns the carried value.
 */
export function expectOk<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`)
  }
  return result.value
}

/**
 * Assert a result failed with a specific code and return the error.
 * @param result - any result.
 * @param code - the expected error code.
 * @returns the carried error.
 */
export function expectErr<T>(result: Result<T>, code: string): { code: string; message: string; path?: string } {
  if (result.ok) throw new Error(`expected failure ${code}, got success`)
  expect(result.error.code).toBe(code)
  return result.error
}
