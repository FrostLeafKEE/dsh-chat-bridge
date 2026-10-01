#!/bin/bash
# Release placeholders are replaced by scripts/pack-macos.py; no external runtime is needed.
set -euo pipefail

usage() {
  printf '%s\n' '用法：manage-plugin.sh install|remove|list [--app "/路径/DeepSeek Harness.app"]'
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

action=${1:-install}
if [[ $# -gt 0 ]]; then shift; fi
case "$action" in
  install|remove|list) ;;
  -h|--help) usage; exit 0 ;;
  *) usage; fail '不支持此操作。' ;;
esac

app_bundle=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      [[ $# -ge 2 && -n "$2" ]] || fail '--app 后需要应用路径。'
      app_bundle=$2
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) usage; fail '不支持此参数。' ;;
  esac
done

[[ "$(/usr/bin/uname -s)" == Darwin ]] || fail '这个安装助手仅用于 macOS；Windows 请使用桌面版自带 dsh.cmd。'
script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
if [[ -z "$app_bundle" ]]; then
  for candidate in '/Applications/DeepSeek Harness.app' "$HOME/Applications/DeepSeek Harness.app"; do
    if [[ -x "$candidate/Contents/Resources/runtime/cli/bin/dsh" ]]; then
      app_bundle=$candidate
      break
    fi
  done
fi
[[ -n "$app_bundle" && -d "$app_bundle" ]] || fail '找不到 DeepSeek Harness.app。请先安装官方桌面版；其他位置请使用 --app 指定。'
app_bundle=$(CDPATH= cd -- "$app_bundle" && pwd -P)
cli="$app_bundle/Contents/Resources/runtime/cli/bin/dsh"
[[ -x "$cli" ]] || fail '此应用没有可执行的内置 dsh CLI，无法管理 desktop 插件。'

# Closing a macOS window leaves the app and Host alive. Never quit or kill it for the user.
app_executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app_bundle/Contents/Info.plist")
[[ -n "$app_executable" && "$app_executable" != -* && "$app_executable" != */* ]] || fail '无法识别应用的进程名称。'
# pgrep treats its input as a regex; escape only the name read from the app's public metadata.
process_pattern=$(printf '%s' "$app_executable" | /usr/bin/sed 's/[][\\.^$*+?(){}|]/\\&/g')
if /usr/bin/pgrep -x "$process_pattern" >/dev/null; then
  fail 'DeepSeek Harness 仍在运行。请按 ⌘Q 完全退出后重新执行；关闭窗口不会退出应用。'
else
  scan_status=$?
  [[ "$scan_status" -eq 1 ]] || fail '无法检查应用是否退出；本次没有执行插件操作。'
fi

case "$action" in
  install)
    package_file="$script_dir/__PLUGIN_TARBALL__"
    [[ -f "$package_file" ]] || fail '安装包缺失，请完整解压 ZIP，保持脚本和 tgz 在同一个文件夹。'
    package_hash=$(/usr/bin/shasum -a 256 < "$package_file")
    [[ "${package_hash%% *}" == '__PLUGIN_SHA256__' ]] || fail '安装包校验失败，请重新取得完整发布包。'
    "$cli" plugin --profile desktop add "$package_file"
    printf '%s\n' '聊天区插件已安装。重新打开 DeepSeek Harness 后使用。'
    ;;
  remove)
    "$cli" plugin --profile desktop remove dsh-chat-bridge
    printf '%s\n' '插件已卸载。本地档案和已导入的工作会话不会由此脚本删除。'
    ;;
  list) "$cli" plugin --profile desktop list ;;
esac
