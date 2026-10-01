/**
 * Module-table specifiers the DSH web shell shares into its frozen module
 * table (`window.__ModuleLoader__`). A dynamic client bundle must keep exactly
 * these specifiers as external `require()` calls and inline everything else.
 *
 * Provenance: this list is a verbatim copy of `PLATFORM_MODULES` and
 * `PRELOADED_CLIENT_EXTERNALS` from the DeepSeek Harness repository at commit
 * 639ed015397290b3745d163aafe02ffee4aa3f84 (release 0.2.0-rc.2):
 *   - packages/client/web/src/platform.ts
 * DeepSeek Harness is MIT licensed; see THIRD_PARTY_NOTICES.md. The file is
 * not imported from the DSH checkout at build time — this project builds
 * standalone, so the list is restated here and must be re-verified against the
 * source when the DSH baseline changes.
 *
 * @module dsh-chat-bridge/build/platform-externals
 */

/** Baseline module-table rows every dynamic client bundle resolves against. */
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
] as const

/** Client-bundle specifiers whose factories the parser preloads before the shell starts. */
export const PRELOADED_CLIENT_EXTERNALS = [
] as const

/**
 * The specifiers this plugin's client half may leave as runtime `require()`
 * calls: the shell baseline plus the package's own `dsh.client.external`
 * declarations. This plugin declares no extra external, so the set is exactly
 * the baseline.
 */
export const CLIENT_EXTERNALS: readonly string[] = [
  ...PLATFORM_MODULES,
  ...PRELOADED_CLIENT_EXTERNALS,
]

/** Whether a specifier resolves through the shell module table instead of being inlined. */
export function isClientExternal(specifier: string): boolean {
  return CLIENT_EXTERNALS.includes(specifier)
}
