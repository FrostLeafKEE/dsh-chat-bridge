# dsh-chat-bridge 1.0.0 — handoff

## 1. Project identity

Independent MIT plugin for official DeepSeek Harness Desktop 0.2.0-rc.2. Public source contains development support; GitHub Releases contain installation artifacts. No official desktop source changes are required.

## 2. Completed behavior

Embedded official web chat, shared Chat/Work navigation, loaded web conversations below project sessions, title search, click-to-open and load-more, manual import, local archives and one-click native context import after explicit setup. Local archives remain separate from live website links.

## 3. Authorization and account boundary

The user signs in on the official webpage. The plugin uses the managed Desktop Browser lease. It does not read credentials, clone the DSH token, access internal stores or call private website APIs. Login reuse is limited to the application run.

## 4. Data and persistence

Manual archives remain schema v1; webpage captures schema v2 and partial. IndexedDB stores confirmed archives. Website titles/URLs are ephemeral and replaced on each read, not accumulated or persisted. Imported native context preserves provenance and full captured source; it does not generate a model reply.

## 5. Extension points

- NavigationPort: src/adapters/dsh-navigation.ts; public layout navigation.
- WebCarrierPort: src/adapters/desktop-web-carrier.ts; managed guest lifecycle and scoped capture.
- Website list: src/adapters/deepseek-history-reader.ts, web-history-monitor.ts and src/shared/web-history.ts. Fixed script options; no arbitrary page code.
- Capture reader: src/adapters/deepseek-page-reader.ts; frontend-gated, rendered current branch.
- WorkImportPort: src/adapters/native-work-importer.ts plus src/host/history-service.ts. The pending adapter is an unavailable fallback, not the desktop implementation.
- ArchiveRepository: src/storage/indexeddb-repository.ts; list projection and full snapshot stay transactional.

## 6. UI ownership and cleanup

Public main and sidebar.footer.action slots. Native chrome additions use documented semantic anchors; main.conversation wrapping is explicit. CSS stays plugin-scoped. Lease, request, timer, listener, observer, native seat and menu cleanup must remain complete.

## 7. Verification

2026-10-02: npm run verify passed types, lint, declarations, Host/Client build and 191 tests across 20 files. Website list tests execute the stringified DOM reader, exercise guest validation, navigation/login cancellation, polling, escaping and native navigation. These use synthetic DOM and services, not live Electron acceptance.

## 8. Distribution

Version is 1.0.0 throughout. npm run pack builds the portable .tgz; scripts/pack-macos.py creates a ZIP with the identical tarball and Bash installation helpers. private:true blocks accidental npm publication. Generated artifacts and caches are ignored. README.md and README.en.md provide clickable language badges and a concept illustration.

## 9. Remaining limits

Frontend script main.6fca03582d.js is the inspected website baseline. The sidebar contains loaded entries only; hidden/folded and server-side unloaded entries are not guaranteed. Message capture does not scan the entire virtual list. Attachment bodies, capacity estimation, automatic summarization and restart-persistent web login remain future work. Windows native import has prior user confirmation; the new web list and Mac require real desktop checks.

## 10. Next owner actions

Follow docs/MANUAL-CHECKS.md for real Desktop acceptance. Maintain frontend selectors against official render code, preserving explicit unsupported states. See docs/NEXT-STEPS.md for priorities. Do not rewrite existing user work sessions or promote synthetic verification to full desktop compatibility.
