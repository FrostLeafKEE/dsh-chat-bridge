# macOS 安装与适配

当前包：**dsh-chat-bridge 1.0.0**。目标宿主：官方 **DeepSeek Harness Desktop 0.2.0-rc.2**。插件为 JavaScript，同一个 tgz 用于 Apple Silicon（arm64）与 Intel（x64）；使用与你的 Mac 对应的官方 Desktop。

本版完成源码适配与分享包构建；尚未在 Mac 实机运行。用户已确认此前 Windows 版本能顺利转工作，这不表示 macOS、重启持久性或后续模型上下文已逐项验收。

## 1. 使用 Mac 分享包

1. 先打开一次官方 DeepSeek Harness，完成初始化，再按 **⌘Q 完全退出**。点击红色关闭按钮只会隐藏窗口，后台仍运行。
2. 解压 `dsh-chat-bridge-1.0.0-macos.zip`，保留里面的所有文件在同一个文件夹。
3. 在终端进入解压目录，运行：

```sh
/bin/bash ./install.command
```

安装助手查找 `/Applications/DeepSeek Harness.app`，其次查找 `~/Applications/DeepSeek Harness.app`。如果应用放在其他位置，显式指定：

```sh
/bin/bash ./install.command --app "/你的目录/DeepSeek Harness.app"
```

路径里有空格时保留双引号。助手先检查应用进程已退出并核对随包 tgz 的 SHA256，然后调用该应用自带的 CLI：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add "$PWD/dsh-chat-bridge-1.0.0.tgz"
```

安装后重新打开 Desktop，在侧栏进入“聊天区”。同一 `.tgz` 也可以直接使用上面的 CLI 命令安装；不需要安装助手。

这些脚本不要求另装 Node、Python 或 Homebrew，不调用 sudo、不自动关闭应用。插件注册交给宿主 CLI 处理；不编辑 `.app`、`app.asar`、应用签名或 profile 配置文件。官方 CLI 可能需要联网安装包依赖；这不涉及模型调用。

## 2. 卸载与查看

完全退出 Desktop 后，在同一目录运行：

```sh
/bin/bash ./remove.command
/bin/bash ./manage-plugin.sh list
```

应用放在其他位置时，两条命令都可追加 `--app "/你的目录/DeepSeek Harness.app"`。卸载助手只执行 `plugin --profile desktop remove dsh-chat-bridge`，不删除本地档案、设置存储或已导入工作会话。档案可在卸载前从插件中导出。

## 3. 本版的平台处理

- 读取宿主提供的 `<html data-platform="darwin">` 和 `data-fullscreen`。普通窗口使用宿主 `--dsh-frame-top-clearance` 给红黄绿按钮及折叠侧栏入口留空间；全屏时恢复普通内边距，退出全屏后恢复安全间距。
- 对话框使用 `--dsh-frame-overlay-top`，保持与宿主窗口控制区的间距。插件控件、输入框和 webview 声明 `no-drag`，避免把点击交给窗口拖动。
- 中文/日文输入法组合输入期间，Esc 由输入法处理，不主动关闭插件对话框。粘贴、复制、文件选择、滚动和网页输入使用 Chromium/宿主原生功能，不重新映射 ⌘C、⌘V、⌘W、⌘Q。
- 网页载体继续使用公开 Desktop Browser lease，原生历史导入沿用已交付的 Host seed/Typert/Workspace/Session 接口。工作区路径来自宿主 registry，在 Mac 上由宿主处理 POSIX 路径，没有 Windows 路径转换。
- 登录仅承诺同次应用运行中的网页分区复用。Windows 的网页登录、档案与工作区不会自动搬到 Mac；手动导出的插件档案可在 Mac 重新导入，目标工作区需要在 Mac 选择。

新会话快捷键仍使用宿主现有规则，进入工作模式；聊天模式下点击“新会话”进入网页新聊天。没有新增覆盖宿主的全局快捷键。

## 4. Mac 实机需要确认的结果

当前工作环境为 Windows，未执行 Mac 安装、启动或模型调用。首次在 Mac 使用时，确认正常加载、登录和网页输入；窗口/全屏/折叠侧栏下的按钮位置；导入后项目中出现工作会话且输入为空。重启持久性、后续工作请求是否包含历史、卸载后恢复继续按 MANUAL-CHECKS 的 H1–H10 核对，当前不标记通过。

若安装失败，先确认运行的是 `.app` 内的 CLI，并已初始化 desktop profile。全局 npm 版 dsh 无权管理 Electron 所有的 desktop profile。宿主版本不满足包的 engines 时，以 CLI 的兼容性错误为准。

## 5. 开发者生成分享包

先构建并生成当前版本的 npm tgz，再使用 Python 3.9+ 的标准库打包：

```sh
npm run build
npm run pack
python3 scripts/pack-macos.py
```

Windows 可使用本地 Python 的实际路径替代 `python3`。Python 仅用于开发打包，Mac 安装不需要它。生成的 ZIP 含同一个 tgz、安装/卸载/管理脚本、本文、SHA256SUMS 及许可证/第三方署名；脚本强制 LF，并在 ZIP 中记录 Unix 0755 权限。打包脚本拒绝版本不匹配、符号链接或原生二进制的 tgz，不安装或修改任何 profile。
