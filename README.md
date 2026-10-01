<p align="center">
  <a href="./README.md"><img src="./assets/lang-zh.svg" alt="简体中文" height="30"></a>
  <a href="./README.en.md"><img src="./assets/lang-en.svg" alt="English" height="30"></a>
</p>

# dsh-chat-bridge

**在 DeepSeek Harness 中无缝切换网页版聊天与工作区，一键把聊天会话导入工作。**

<p align="center">
  <img src="./assets/hero.png" alt="dsh-chat-bridge：网页版聊天与工作区切换、聊天历史一键导入功能示意图" width="100%">
</p>

<p align="center">
  <a href="https://github.com/FrostLeafKEE/dsh-chat-bridge/releases/tag/v1.0.0">下载 v1.0.0</a> ·
  <a href="#安装">安装指南</a> ·
  <a href="./docs/COMPATIBILITY.md">兼容性</a> ·
  <a href="./LICENSE">MIT License</a>
</p>

> 上图是功能介绍插画。插件是独立社区项目，适用于官方 **DeepSeek Harness Desktop 0.2.0-rc.2**。

## 从聊天到工作

你可以先在 DeepSeek 网页端讨论需求、分析问题、整理方案，然后把当前聊天导入工作区，继续处理项目。

| 功能 | 使用体验 |
| --- | --- |
| 聊天 / 工作切换 | 主区域顶部共用切换按钮，进入聊天后可随时返回原工作会话。 |
| 内嵌官方网页 | 在 DSH 内登录 DeepSeek 网页、打开历史对话并继续聊天。 |
| 网页历史侧栏 | 项目列表下面显示已加载网页会话，可搜索标题、点击打开、刷新及加载更多。 |
| 一键转工作 | 核对来源、选择目标工作区并开启快捷转换后，后续点击即可自动导入。 |
| 原生历史上下文 | 问答及来源直接保存到新工作会话中，输入框保持空白，直接提出下一条工作任务。 |
| 独立聊天档案 | 本地档案位于项目会话下方，可搜索、重命名、导出和删除。 |
| 手动导入 | 支持 UTF-8 `.txt`、`.md`、插件历史 JSON 和插件档案 JSON。 |

网页聊天使用官方页面。导入历史只创建会话和保存上下文，不提交任务或调用模型；后续工作请求由 DeepSeek Harness 正常处理。插件不需要修改官方桌面源码或替换 EXE / app.asar。

## 安装

从 [v1.0.0 Release](https://github.com/FrostLeafKEE/dsh-chat-bridge/releases/tag/v1.0.0) 下载适合你的包。

| 平台 | 下载文件 | 状态 |
| --- | --- | --- |
| Windows | `dsh-chat-bridge-1.0.0.tgz` | 此前用户已确认转工作可用；新增网页列表尚待桌面实测。 |
| macOS Apple Silicon / Intel | `dsh-chat-bridge-1.0.0-macos.zip` | 已完成源码适配和打包，尚未实机验证。 |

### Windows

先启动一次官方 DSH 完成初始化，再完全退出，包括托盘后台。在 PowerShell 中运行安装目录自带的 CLI：

```powershell
$dsh = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$package = Join-Path $env:USERPROFILE 'Downloads\dsh-chat-bridge-1.0.0.tgz'
& $dsh plugin --profile desktop add $package
```

自定义安装位置或下载目录时，修改对应路径。安装后重新打开 DSH。升级同样使用 `add` 命令；请使用桌面应用自带 CLI 管理 `desktop` profile。

### macOS

启动一次官方 DSH 完成初始化，按 **⌘Q** 完全退出。解压 ZIP，在终端进入解压目录：

```sh
/bin/bash ./install.command
```

应用不在默认位置时：

```sh
/bin/bash ./install.command --app "/你的目录/DeepSeek Harness.app"
```

安装助手使用所选 `.app` 内置 CLI，无需另装 Node、Python 或 Homebrew。详细说明见 [macOS 安装指南](./docs/MACOS.md)。

## 使用

1. 在新会话上方选择「聊天区」，或点击侧栏下方的「聊天区」。
2. 在内嵌官方网页完成登录，展开网页侧栏；DSH 侧栏「网页会话」会自动显示网页已加载列表，点击即可打开。可搜索标题，点击「从网页加载更多」继续载入。
3. 点击「转为工作」，预览正文、选择已有工作区，确认采集范围及上下文提示。
4. 点击确认后，插件保存来源并创建带历史上下文的工作会话。接着输入工作任务即可，无需再把历史发送一次。
5. 勾选记住目标并开启一键转换后，下次点击「一键转工作」即可完成同样流程；仍可「预览后转换」或在「转换设置」中关闭快捷模式。

「聊天 / 工作」按钮只切换界面。切回聊天时，原工作会话和输入草稿保留；工作历史不会自动上传到网页。侧栏「导入历史」和「档案管理」提供手动导入与导出入口。

## 当前范围

- **网页侧栏读取已加载标题和链接，每 3 秒刷新。** 折叠分组或尚未加载的记录可能缺失；计数是已加载条目数。列表仅在本次运行保留，消息正文仅在明确导入或转换时保存。网页加载失败、登出或结构不支持时会清空列表并提示。

- **采集当前已渲染分支，标记为 partial。** 长对话中尚未渲染的消息、其他分支及附件原文不会自动补全；转换前可预览核对。
- 网页采集限定已核对的前端版本。网页升级、生成中、有未发送草稿或内容变化时，转换会停止并提示处理。
- 首次网页登录由你在官方页面完成。登录仅在本次应用运行期间尽量复用，重启后可能需要重新登录。
- 不读取或复制登录凭据；聊天页面使用隔离网页载体。选择并导入工作会话后，才使用目标工作区的正常能力。
- 本地档案未加密；导入不估算模型上下文容量、不自动缩短正文。超长历史和敏感内容请在转换前核对。
- 当前输入限额为普通文本 5 MiB、完整档案文件 64 MiB、结构化消息 5000 条，超限会拒绝，不静默截断。

全量历史同步、附件正文和跨重启登录复用仍在后续计划中。更多说明见 [数据与接口合同](./docs/CONTRACTS.md)、[原生历史导入](./docs/NATIVE-HISTORY.md) 和 [后续计划](./docs/NEXT-STEPS.md)。网页列表的读取与限制见 [网页历史侧栏](./docs/WEB-HISTORY.md)。

## 卸载

完全退出 DSH 后，Windows 使用：

```powershell
& $dsh plugin --profile desktop remove dsh-chat-bridge
```

macOS 在解压目录使用：

```sh
/bin/bash ./remove.command
```

卸载不会自动删除本地档案或已导入的工作会话，可先在档案管理中导出需要保留的内容。

## 开发

需要 Node `^22.19.0 || >=24.0.0`，使用 npm 和仓库中的单一锁文件。

```sh
git clone https://github.com/FrostLeafKEE/dsh-chat-bridge.git
cd dsh-chat-bridge
npm ci
npm run verify
npm run pack
python scripts/pack-macos.py
```

源码、测试、夹具和打包脚本保留在仓库中；`node_modules/`、`lib/`、缓存及 `dist/` 构建产物不提交。发布包从 GitHub Releases 下载。

v1.0.0 发布前检查：**20 个测试文件 / 191 个用例通过**，类型检查、lint 和构建通过。测试包含合成 DOM 与服务替身，不能代替 Electron 或 macOS 实机验收。详见 [发布检查](./docs/RELEASE-1.0.0.md)。

## 许可与致谢

代码使用 [MIT](./LICENSE) 许可。宿主与公开插件接口来自 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，第三方来源见 [THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES.md)。
