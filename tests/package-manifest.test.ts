/**
 * Package manifest and buildable-artifact contract.
 *
 * These are the facts the DSH loader depends on: the bundle patch path, the
 * root loader row, the client declaration, and the exports that point at real
 * built files. A packaging mistake here fails silently at install time, so it is
 * asserted here instead.
 * @module dsh-chat-bridge/tests/package-manifest
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BRIDGE_BUILD } from '../src/shared/import-diagnostics'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  name: string
  version: string
  private?: boolean
  type?: string
  main?: string
  types?: string
  exports?: Record<string, Record<string, string>>
  files?: string[]
  peerDependencies?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  engines?: Record<string, string>
  dsh?: {
    bundle?: { patch?: string }
    client?: { platform?: string; inject?: string[]; external?: string[] }
  }
}

const PATCH_PATH = join(ROOT, 'cordis.patch.yml')

describe('package identity', () => {
  it('declares the package name, version, ESM shape and privacy', () => {
    expect(MANIFEST.name).toBe('dsh-chat-bridge')
    expect(MANIFEST.version).toBe(BRIDGE_BUILD)
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'))
    expect(lock.version).toBe(MANIFEST.version)
    expect(lock.packages[''].version).toBe(MANIFEST.version)
    expect(MANIFEST.type).toBe('module')
    // The name has not been checked against the public registry, so the package
    // must not be publishable by accident.
    expect(MANIFEST.private).toBe(true)
    expect(MANIFEST.engines?.dsh).toBe('0.2.0-rc.2')
  })

  it('keeps the lockfile dependency set free of workspace ranges', () => {
    const sections = [MANIFEST.dependencies, MANIFEST.peerDependencies, MANIFEST.devDependencies]
    for (const section of sections) {
      for (const [name, range] of Object.entries(section ?? {})) {
        expect(range, `${name} must not use a workspace range`).not.toContain('workspace:')
      }
    }
    // The host shares Cordis, so it is a peer dependency as well as a dev one.
    expect(MANIFEST.peerDependencies?.['@deepseek-ai/cordis']).toBeDefined()
    expect(MANIFEST.devDependencies?.['@deepseek-ai/cordis']).toBeDefined()
  })
})

describe('dsh manifest', () => {
  it('points at the bundle patch that exists', () => {
    expect(MANIFEST.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(existsSync(PATCH_PATH)).toBe(true)
  })

  it('inserts one root loader row keyed by the bare package name', () => {
    const patch = readFileSync(PATCH_PATH, 'utf8')
    expect(patch).toContain('- insert:')
    expect(patch).toMatch(/id:\s*dsh-chat-bridge/)
    expect(patch).toMatch(/name:\s*dsh-chat-bridge/)
    // A subpath-only row would leave the client half unattached.
    expect(patch).not.toMatch(/name:\s*dsh-chat-bridge\/client/)
    expect((patch.match(/id:\s*\S+/g) ?? []).length).toBe(1)
  })

  it('declares a web client whose injected rows match the shipped packages', () => {
    expect(MANIFEST.dsh?.client?.platform).toBe('web')
    expect(MANIFEST.dsh?.client?.inject).toEqual([
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-layout',
      '@deepseek-ai/dsh-client-ui-sidebar',
      '@deepseek-ai/dsh-api-session-controller',
      '@deepseek-ai/dsh-api-workspace-controller',
      '@deepseek-ai/dsh-client-ui-workspace',
      '@deepseek-ai/dsh-client-ui-conversation',
      '@deepseek-ai/dsh-api-gateway',
    ])
    // Nothing beyond the shell baseline is requested from the module table.
    expect(MANIFEST.dsh?.client?.external).toBeUndefined()
  })
})

describe('published files', () => {
  it('exports the host and client halves from built paths', () => {
    expect(MANIFEST.exports?.['.']).toEqual({
      types: './lib/types/index.d.ts',
      default: './lib/index.js',
    })
    expect(MANIFEST.exports?.['./client']).toEqual({
      types: './lib/types/client/index.d.ts',
      default: './lib/client.js',
    })
    expect(MANIFEST.main).toBe('lib/index.js')
    expect(MANIFEST.types).toBe('lib/types/index.d.ts')
  })

  it('ships the client bundle', () => {
    expect(MANIFEST.files).toContain('lib/client.js')
  })

  it('ships no source tree, tests, fixtures or node_modules', () => {
    for (const entry of MANIFEST.files ?? []) {
      expect(entry).not.toContain('node_modules')
      expect(entry).not.toContain('src')
      expect(entry).not.toContain('fixtures')
      expect(entry).not.toContain('tests')
    }
  })

  it('ships the license, notices and user docs', () => {
    for (const entry of ['README.md', 'HANDOFF.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'cordis.patch.yml', 'docs/*.md']) {
      expect(MANIFEST.files).toContain(entry)
    }
  })
})
