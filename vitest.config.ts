import { defineConfig } from 'vitest/config'

/**
 * Test setup.
 *
 * The suite runs in plain Node: everything under test is either pure data code
 * or storage behind an injectable `IDBFactory` (`fake-indexeddb`). The one
 * exception is the built client bundle, which is executed inside a `node:vm`
 * context with a hand-written stub for `window.__ModuleLoader__`, `document`
 * and the shared module table — no jsdom, no real browser.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // The bundle-protocol test reads the built artifact; `npm test` builds it first.
    testTimeout: 30_000,
  },
})
