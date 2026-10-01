# Desktop acceptance checklist

Current version **1.0.0**, target Desktop **0.2.0-rc.2**. Automated checks passed 191 tests across 20 files, types, lint and builds on 2026-10-02. These are synthetic, not live Desktop acceptance.

Earlier Windows native import has user confirmation. The individual checks below are **not executed in this release task**; record platform, host/plugin version and observed results when executing them.

## Web history

- W1: Sign in on the embedded official page, expand its sidebar; loaded titles appear below DSH project sessions and separately from local archives.
- W2: Click a title while in Chat and while in Work; the correct existing webpage conversation opens without a sent message or work import.
- W3: Search loaded titles; show additional loaded rows, then use load-more for server-side pagination. Verify no full-history count is claimed.
- W4: Rename/delete a conversation in the webpage; wait for refresh and verify the DSH list follows the displayed website.
- W5: Sign out, change account and sign back in. Titles clear during login/navigation/loading and come from the current displayed list afterward.
- W6: Collapse webpage sidebar/pinned groups or enter multi-select. Verify explicit guidance/unsupported state; no guessed URLs.
- W7: Disconnect network or use an unsupported frontend build; errors appear without stale writable links or leaked raw errors.
- W8: Repeated Chat/Work navigation, reload and plugin disable release subscriptions/timers/leases, preserve work draft and never restore another mount's stale result.

## Native import and archives

- N1: Short multi-turn conversation with fenced code survives preview/archive/native import. The native composer stays empty and import creates no model request.
- N2: New work task can use imported quoted history. Reopen the native session after restarting and confirm persistence.
- N3: Long/virtualized conversation clearly says partial; compare captured count/range instead of assuming all messages were read.
- N4: Missing workspace, list timeout and interrupted save show a safe stage; repeated same request does not duplicate the session.
- N5: Manual text/Markdown/plugin JSON, UTF-8 validation, file size gates, edited title, cancel, duplicate imports, export/reimport, rename and delete behave as documented.

## Layout and platforms

- L1: Chat/Work control stays in the same position on hero and existing work pages; sidebar wide/rail, search and local-archive details remain usable.
- L2: Light/dark theme, English/Chinese, keyboard focus/Escape/Tab, narrow windows and long titles.
- M1: Install/update/list/remove using the selected official Mac .app CLI; same tarball digest, no app-signature modifications.
- M2: Mac window/fullscreen safe inset, traffic lights, Apple Silicon and Intel hosts, process quit/reopen.
- U1: Disable/uninstall removes plugin UI and listeners while existing source archives/native sessions remain independently recoverable.
