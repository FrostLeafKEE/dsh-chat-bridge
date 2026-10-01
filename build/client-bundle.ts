/**
 * Self-contained tsdown adapter that emits one DSH client bundle in the
 * lazy-CJS factory format.
 *
 * A DSH client artifact is a plain script that runs inside the shell page and
 * only *registers* a factory:
 *
 * ```js
 * window.__ModuleLoader__.load({ id: '<package name>', factory: (require) => {
 *   var module = { exports: {} }; var exports = module.exports
 *   ...bundle body...
 *   return module.exports
 * } })
 * ```
 *
 * Module bodies (and therefore every side effect, including CSS injection)
 * stay lazy until the shell materializes the module and hands it the shared
 * `require`. `require` resolves through the shell's frozen module table, so
 * shared-identity dependencies (React, Cordis, the slot registry) must stay
 * external and everything else must be inlined.
 *
 * The official preset is `packages/client/tsdown.client.ts` inside the
 * Harness monorepo — it is repository-local build tooling, not a published SDK
 * export, so this project cannot import it. This file reimplements the small
 * slice of the contract an external bundle needs (registration wrapper,
 * external table, browser defines, single-chunk output) and deliberately drops
 * the monorepo-only machinery: CSS-modules virtualization, bundle-input
 * isolation gates, tsc sourcemap chaining, HMR chunk rewriters, and the
 * `dsh.client.external` lookup that reads a sibling workspace manifest.
 * Styles are shipped as a plain CSS string from `src/client/styles` instead.
 *
 * @module dsh-chat-bridge/build/client-bundle
 */

import { isBuiltin } from 'node:module'
import type { UserConfig } from 'tsdown'
import { CLIENT_EXTERNALS, isClientExternal } from './platform-externals.ts'

/** Package name stamped into the loader registration and used as the bundle id. */
export const CLIENT_BUNDLE_ID = 'dsh-chat-bridge'

/**
 * Registration prefix for the single entry chunk. `id` must be the bare
 * package name: the loader keys rows and module-table resolution by that
 * name, so a subpath id would leave the client half unattached to the Loader
 * row that the bundle patch inserts.
 * @param id - the bundle's package name.
 * @returns the banner line that opens the factory closure.
 */
export function registrationBanner(id: string = CLIENT_BUNDLE_ID): string {
  return `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`
}

/** Closing line of the factory closure. */
export const REGISTRATION_FOOTER = 'return module.exports; } });'

/** Pre-bundle shim that gives the CJS payload its `module`/`exports` bindings. */
export const REGISTRATION_INTRO = 'var module = { exports: {} }; var exports = module.exports;'

/**
 * Browser defines the CJS output needs. Several React-ecosystem packages read
 * `process.env.NODE_ENV` or `import.meta.env.MODE` at module scope; a CJS
 * browser bundle cannot carry `import.meta`, so both keys are baked in.
 * @param nodeEnv - environment name to bake in.
 * @returns the define map for the client build.
 */
export function clientDefines(nodeEnv = 'production'): Record<string, string> {
  return {
    'process.env.NODE_ENV': JSON.stringify(nodeEnv),
    'import.meta.env.MODE': JSON.stringify(nodeEnv),
    'import.meta.env': JSON.stringify({ MODE: nodeEnv }),
  }
}

/**
 * The client-half tsdown config: one browser CJS artifact at `lib/client.js`
 * that registers exactly one factory.
 * @param nodeEnv - environment name to bake into the browser defines.
 * @returns the tsdown config for the client half.
 */
export function clientBundleConfig(nodeEnv = 'production'): UserConfig {
  return {
    name: `${CLIENT_BUNDLE_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2024',
    // The types ship from lib/types (tsc). A dts pass here would try to wrap
    // the registration banner/footer into a .d.cts and fail to parse.
    dts: false,
    clean: false,
    sourcemap: true,
    fixedExtension: false,
    deps: {
      // A require() the shell module table cannot answer is a guaranteed
      // runtime throw, so the rule is exact: requested rows stay imports,
      // everything else is inlined.
      neverBundle: (specifier: string) => isClientExternal(specifier),
      alwaysBundle: (specifier: string) => !isClientExternal(specifier) && !isBuiltin(specifier),
    },
    define: clientDefines(nodeEnv),
    outputOptions: {
      entryFileNames: 'client.js',
      banner: registrationBanner(),
      footer: REGISTRATION_FOOTER,
      intro: REGISTRATION_INTRO,
    },
  }
}

/**
 * The host-half tsdown config: plain Node ESM at `lib/index.js`.
 *
 * The Host Loader imports the package root, so this artifact must be an
 * ordinary ESM entry. `@deepseek-ai/*` production dependencies stay imports
 * (they exist on disk in a real install); anything else that is not a Node
 * builtin is inlined so the tarball needs no extra runtime dependency.
 * @returns the tsdown config for the host half.
 */
export function hostLibraryConfig(): UserConfig {
  return {
    name: CLIENT_BUNDLE_ID,
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    fixedExtension: false,
    deps: {
      neverBundle: (specifier: string) => specifier.startsWith('@deepseek-ai/'),
      alwaysBundle: (specifier: string) => !specifier.startsWith('@deepseek-ai/') && !isBuiltin(specifier),
    },
  }
}

export { CLIENT_EXTERNALS }
