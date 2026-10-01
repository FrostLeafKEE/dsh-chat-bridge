# Roadmap / 后续计划

## Shipped in 1.0.0

- Embedded official webpage, Chat/Work navigation and separate local archives.
- Loaded webpage conversation links in the project sidebar: refresh, title search, open and explicit load-more.
- Rendered current-branch capture and one-click native context import after setup.
- Portable package and macOS application-bundled CLI installation helpers.

## Next priorities

1. Real Desktop acceptance of the new history list: account/login changes, folded pinned groups, long paginated lists, reconnects and Windows theme/layout. Mac installation and traffic-light/fullscreen behavior also require a real Mac.
2. Maintain official frontend DOM adapters when website builds change, with verified structure and explicit unsupported states.
3. Evaluate complete current-branch DOM scanning with overlap/gap detection, cancellation and viewport restoration. Do not claim full remote history from a list count or scrolling alone.
4. Context capacity estimation and explicit review/summary options for oversized history, preserving original snapshots.
5. Persistent login only through an officially supported Desktop Browser storage contract, and richer attachment import only through supported/user-supplied content.

No private credential extraction, internal store access or undocumented API synchronization is planned for the current implementation.
