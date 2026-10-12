# Changelog

## Unreleased

- Cap the sidebar chat section at 30vh, its web list at 15vh and local archives at 12vh, with internal scrolling and overridable CSS variables.
- Fix the shared archive class overriding the web list height; keep the outer border and padding inside the section height limit.
- Desktop layout acceptance for this source change is pending; the published package remains v1.0.0.

## 1.0.0 — 2026-10-02

- Official DeepSeek web chat inside DeepSeek Harness, with same-position Chat/Work navigation.
- Web conversation sidebar with loaded titles, search, click-to-open, refresh and explicit load-more.
- One-click native work-context import after scope/destination setup; source snapshot preserved and input empty.
- Local archive import, preview, deduplication, rename, deletion and export.
- macOS frame adaptation and portable installation bundle.
- Fixed edited import titles, pre-read size gates, late/busy import races, failed/stale guest lease cleanup and Modal focus.
- Bilingual README, language buttons, concept illustration and downloadable packages.

Compatibility: Desktop 0.2.0-rc.2. Website list/capture are frontend-gated and limited to loaded/rendered data. Real Mac and new history-list acceptance remain pending.
