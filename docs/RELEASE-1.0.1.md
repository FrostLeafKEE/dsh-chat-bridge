# v1.0.1 patch release / 补丁版说明

Date / 日期：2026-10-12。Target / 目标宿主：official DeepSeek Harness Desktop 0.2.0-rc.2。

## Changes / 改动

- Cap the entire sidebar chat section at 30vh, including its border/padding. Web conversations and local archives have independent 15vh / 12vh caps, internal scrolling and contained scroll chaining.
- Fix the common archive class overriding the web-list height; preserve three independent CSS variables.
- Align package/lock version, diagnostics and Chinese/English badges at 1.0.1. Preserve recognition of earlier 1.0.0 and alpha.5–12 diagnostics.
- Update bilingual installation instructions and produce the portable tarball, Mac sharing ZIP and SHA256 checksum file.

侧栏限高使用插件自己的样式，不修改宿主布局。没有账号持久化、凭据复制、数据迁移或新增运行依赖。

## Build and package record / 构建与包记录

Executed on 2026-10-12:

- `npm run build` passed declaration compilation and Host/Client bundling at version 1.0.1.
- `npm run pack` produced a portable tarball with 91 entries. Its manifest matches the source, root lock version, diagnostics and bilingual UI badges.
- Package inspection confirmed both runtime entries and declarations are present, including all three height caps and the combined web-list selector. Generated declarations correspond to current source files; cache, credentials, experimental auth-copying code, fixtures, tests, build helpers, source maps and native binaries are excluded.
- The Mac ZIP contains eight entries. Its embedded tarball is byte-identical to the portable package; Bash helpers have LF endings, Unix 0755 metadata and resolved filename/hash placeholders.
- `SHA256SUMS-1.0.1.txt` records SHA256 digests for both artifacts. Artifact checks inspect file contents without installing the plugin or executing it in Desktop.

2026-10-12 已执行构建和包内容检查。便携包含 91 项，Mac ZIP 含 8 项；ZIP 内 tgz 与 Windows 使用的 tgz 完全相同。校验文件随安装包提供，未访问官方安装或日常 profile。

本次未新增或运行测试；历史 v1.0.0 的 191 个用例结果不是本版重新执行的结果。实际 Desktop 小窗口、键盘可达性、其他页脚插件共同存在的布局及 macOS 安装仍待实机确认。

## Files / 文件

- `dsh-chat-bridge-1.0.1.tgz`: portable JavaScript plugin, including Host ESM, Client lazy-CJS and declarations.
- `dsh-chat-bridge-1.0.1-macos.zip`: identical tarball plus app-bundled CLI Bash helpers.
- `SHA256SUMS-1.0.1.txt`: SHA256 digests of both installation artifacts.

## Installation / 安装

Fully quit Desktop, including its tray process, then use its bundled CLI to add the downloaded tarball. Reopen Desktop and confirm the chat badge is v1.0.1. Windows instructions are in the [Chinese](../README.md#安装) and [English](../README.en.md#installation) READMEs. Mac instructions are in [MACOS.md](MACOS.md).

完全退出 Desktop 后，用应用自带 CLI 安装已下载的 tgz，再重新打开。安装助手和本次打包检查不等于已在真实 Desktop 或 Mac 验收。
