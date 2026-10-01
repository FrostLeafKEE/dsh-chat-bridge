# Integration overview

Current release: **1.0.0**. Target: official Desktop **0.2.0-rc.2**.

## Architecture

Client lazy-CJS factory registers through the DSH module loader. The Host ESM half exposes the scoped history service through Typert. Client activation mounts that remote namespace before dynamic lookup; a service created by apply() is not a top-level injection dependency.

The client registers a keyed main panel and a sidebar footer entry. A managed isolated Browser guest hosts the official DeepSeek webpage. Website titles and URLs feed the ephemeral sidebar monitor; explicit rendered-message capture feeds local archives; a confirmed archive and workspace feed the native importer.

Native import checks the registry, constructs a closed import turn/step with quoted source context, persists the Session, flushes it, and reads the stored result back before returning a receipt. It creates no model/tool/usage events and leaves the composer empty. Retries of one request reuse the same native ID.

## Verification evidence

`npm run verify` on 2026-10-02: **20 test files / 191 tests**, type checking, lint and builds passed. Tests include synthetic DOM and service doubles. Earlier Windows native-import usability was confirmed by the user.

New website sidebar, final theme/layout, restart behavior and macOS installation were not inspected in a real Desktop during this release task. Follow [manual checks](MANUAL-CHECKS.md); do not infer these results from unit tests.

## Independent build

No source checkout, workspace: range, global CLI or monorepo build preset is required. Runtime dependencies come from the host's frozen shared module table. Local generated paths and credentials are excluded from Git and package file lists.
