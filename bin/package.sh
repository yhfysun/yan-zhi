#!/usr/bin/env bash
# ============================================================
# 言智 (Yan-Zhi) 打包入口（与 build.sh 同风格，转发到 scripts/package.cjs）
# 用法: bash bin/package.sh [target] [透传参数...]
#   (无 target)  交互式多选：空格勾选 / ↑↓ 移动 / a 全选 / 回车开始
#   target:
#     lite | basic | pro   桌面单档
#     desktop              桌面三档全出
#     android | mobile     安卓 APK
#     all                  桌面三档 + 安卓
#   透传参数: --dry-run（演练） / --no-verify / --keep-tmp
#   产物统一树: dist-release/desktop/<档>/<版本>/ 与 dist-release/android/<版本>/
# ============================================================
set -euo pipefail

TARGET="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

run() { node "$@"; }

case "${TARGET,,}" in
  "")              run scripts/package.cjs ;;
  lite)            shift; run scripts/package-desktop-lite.cjs "$@" ;;
  basic)           shift; run scripts/package-desktop-basic.cjs "$@" ;;
  pro)             shift; run scripts/package-desktop-pro.cjs "$@" ;;
  desktop)         shift; run scripts/package.cjs desktop "$@" ;;
  android|mobile)  shift; run scripts/package-android.cjs "$@" ;;
  all)             shift; run scripts/package.cjs all "$@" ;;
  *)
    echo "[ERROR] 未知目标: $TARGET"
    echo "  可选: lite / basic / pro / desktop / android / all（无参数 = 交互多选）"
    exit 1
    ;;
esac
