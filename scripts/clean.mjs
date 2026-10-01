/**
 * Remove generated build output so a fresh `npm run build` can be verified from
 * scratch.
 *
 * `lib/` (Host half, Client bundle, emitted declarations) is generated and is
 * deleted. `dist/` holds packed tarballs, which are deliverables: deleting them
 * is the caller's decision, so this script only reports what is there.
 */

import { existsSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const lib = join(root, 'lib')
if (existsSync(lib)) {
  rmSync(lib, { recursive: true, force: true })
  console.log('removed lib/')
} else {
  console.log('lib/ is already absent')
}

const dist = join(root, 'dist')
if (existsSync(dist)) {
  const tarballs = readdirSync(dist).filter(name => name.endsWith('.tgz'))
  const kept = tarballs.length === 0 ? 'no tarballs' : `${tarballs.length} tarball(s): ${tarballs.join(', ')}`
  console.log(`kept dist/ (${kept}) — delete it by hand for a clean pack`)
}
