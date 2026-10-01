# AGENTS.md

## Project

Independent plugin for official DeepSeek Harness Desktop 0.2.0-rc.2. Current release is 1.0.0. Source, synthetic tests and distribution helpers build independently of any adjacent Harness checkout. Read README, docs/CONTRACTS.md and HANDOFF.md before changing behavior.

## Boundaries

- Modify this project only. Do not alter upstream Harness source, installed applications, signatures or daily Desktop profiles.
- Web login happens on the official page. Never read/copy cookies, tokens, local/sessionStorage, internal stores, or call private website endpoints.
- Web history mirrors loaded DOM titles/links; it is ephemeral and never claims full account synchronization. Automatic reads are passive. Explicit load-more may scroll only the known website history container.
- Message capture remains frontend-gated, partial and user-triggered. Do not silently discard messages or promote partial to full.
- Native import persists quoted source context through public seed/Session services. No model request or automatic send. Preserve idempotent retries, flush/readback checks, source snapshots and safe diagnostics.
- macOS packaging/source checks do not establish real Mac acceptance. Keep this distinction in user docs.

## Implementation

TypeScript strict, exactOptionalPropertyTypes and noUncheckedIndexedAccess. Clear optional keys with withoutKeys(), not undefined. Expected failures return Result<T>; errors must not include user content, raw exceptions, credentials or arbitrary guest field names.

Core shared/import/storage/adapters code must not depend on React, client dictionaries or client runtime modules. No new production dependencies. Host-shared packages are peers/dev dependencies; no workspace ranges or adjacent-repo imports.

Use public slots for panel/sidebar. Scope native chrome additions to the documented semantic anchors. Every lease, node, listener, observer and timer needs cleanup. Styles live in src/client/styles/index.ts and selectors begin with .dshcb-. Fixtures are synthetic and never shipped in the bundle.

## Checks and docs

When verification is requested, use npm run verify (types, lint, build, tests). npm run pack emits the portable tarball; python scripts/pack-macos.py wraps the existing tarball for Mac. Keep the single lockfile. Version, diagnostics and locale badge must agree.

Update docs/CONTRACTS.md and HANDOFF.md when changing behavior, ports, errors, limits or formats. Record tested facts separately from manual acceptance gaps. Keep tests/, fixtures/, build/, scripts/ and distribution/ in source; ignore generated lib/, dist/, dependencies and caches. Never stage credentials or private research samples.
