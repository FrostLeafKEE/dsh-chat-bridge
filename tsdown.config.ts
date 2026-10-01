import { defineConfig } from 'tsdown'
import { clientBundleConfig, hostLibraryConfig } from './build/client-bundle.ts'

/**
 * Two artifacts, no code splitting:
 *   - `lib/index.js`  — Host half (ESM, Node).
 *   - `lib/client.js` — Client half (browser CJS, lazy module-loader factory).
 *
 * Declarations are emitted separately by `tsc -p tsconfig.build.json` into
 * `lib/types`, which the package `exports` map points at.
 */
export default defineConfig([
  hostLibraryConfig(),
  clientBundleConfig(process.env.NODE_ENV ?? 'production'),
])
