# Compatibility

| Component | Baseline / status |
| --- | --- |
| Plugin | 1.0.0 |
| DeepSeek Harness Desktop | 0.2.0-rc.2 |
| Referenced upstream commit | 639ed015397290b3745d163aafe02ffee4aa3f84 |
| Node for development | ^22.19.0 or >=24.0.0 |
| Official web frontend | main.6fca03582d.js |
| Windows native import | Earlier versions confirmed usable by the user |
| New webpage sidebar | Synthetic regression checks passed; real Desktop acceptance pending |
| macOS arm64 / x64 | Portable plugin and app-bundled CLI helpers; real Mac acceptance pending |

The plugin has no architecture-specific runtime binaries. The Mac package contains the same tarball as Windows. Desktop theme tokens and Mac safe frame insets are read, not overwritten.

Client loading depends on the official lazy-CJS protocol, public slots and frozen platform module table. Native chrome additions traverse main → main.conversation → data-phase; unknown or ambiguous layouts disable those additions. Public Chat/sidebar entry remains the fallback.

Website parsing is frontend-gated. An updated script or unsupported DOM shows an explicit unavailable state rather than guessed selectors. A loaded sidebar is not a complete account export. Website sign-in is separate from DSH sign-in and currently reused only within the application run.

See [contracts](CONTRACTS.md), [website sidebar](WEB-HISTORY.md), [capture](PAGE-CAPTURE.md) and [Mac installation](MACOS.md).
