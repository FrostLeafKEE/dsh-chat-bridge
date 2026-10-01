# v1.0.0 release review

Date: **2026-10-02**. Target: official DeepSeek Harness Desktop **0.2.0-rc.2**.

## Features and fixes

- Loaded webpage history links now appear below project sessions, with title search, opening, three-second refresh and explicit load-more. Separate collapsible local archives preserve the large web canvas.
- Added frontend-gated DOM list extraction, independent guest validation, cancellable single-reader monitor and cleanup/navigation/login guards. No credentials, stores or private endpoints.
- Native history context import remains direct, with an empty composer and no model request. Same-position Chat/Work switch supports native main.conversation wrapping.
- Release review fixes retain edited import titles, check file sizes before reading, ignore late file reads, lock busy edits, release failed/stale web leases and keep Modal initial Shift+Tab focus inside.
- Chinese/English READMEs use clickable language badges and a generated concept banner. Public source keeps tests and packaging support; generated products/caches are excluded from Git.

## Automated verification

`npm run verify` passed **191 tests across 20 files**, type checking, lint with zero errors/warnings, declarations and Host/Client builds. Guest scripts execute in synthetic DOM tests. Native services/storage are simulated to check orchestration and failure handling.

Package and ZIP audits verify version/file lists, portable contents, identical tarball bytes inside the Mac ZIP, LF executable Bash launchers and SHA256 checksums. The actual artifact hashes are distributed in `SHA256SUMS-1.0.0.txt` in GitHub Releases.

## Scope

Version/lock/diagnostics/UI agree at 1.0.0. No new production dependency or archive migration. Manual schema v1, webpage schema v2 and earlier receipt formats remain readable. private:true prevents accidental npm registry publication; installation artifacts are distributed through GitHub Releases.

Windows native import has earlier user confirmation. The new website sidebar, final Desktop layout, restart persistence and Mac installation are not certified by these automated checks. Use [manual checks](MANUAL-CHECKS.md). No daily profile or official installation was changed by this release task.

Website lists cover loaded entries only; captures remain partial and frontend-specific. Login reuse is limited to the application run. Attachment content, capacity estimates, summaries and complete remote-history synchronization remain future work.
