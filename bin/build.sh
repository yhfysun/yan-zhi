#!/usr/bin/env bash
# ============================================================
# 言智 (Yan-Zhi) 打包/构建脚本
# 用法: bash bin/build.sh <target>
#   target: desktop | mobile:android | mobile:ios | web | server | all
# ============================================================
set -euo pipefail

RED='\033[0;31m' GREEN='\033[0;32m' CYAN='\033[0;36m'
BOLD='\033[1m' NC='\033[0m'

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo -e "${RED}用法: bash bin/build.sh <target>${NC}"
  echo "  target: desktop | mobile:android | mobile:ios | web | server | all"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

build_desktop() {
  echo ""
  echo -e "${BOLD}${CYAN}══════ 打包桌面端 (Tauri) ══════${NC}"
  echo ""
  echo "  检查 Rust 环境..."
  rustc --version || { echo -e "${RED}Rust 未安装，请先运行 bash bin/setup-env.sh --desktop${NC}"; exit 1; }
  rustup target list --installed | grep -qE "x86_64-pc-windows-(msvc|gnu)" || {
    echo -e "${RED}未安装 Windows Rust 目标${NC}"
    echo "  安装: rustup target add x86_64-pc-windows-gnu"
    exit 1
  }
  echo ""
  pnpm build:desktop
  echo ""
  echo -e "${GREEN}打包完成${NC}"
  echo "  产物目录: apps/desktop/src-tauri/target/release/bundle/"
}

build_mobile_android() {
  echo ""
  echo -e "${BOLD}${CYAN}══════ 打包移动端 Android ══════${NC}"
  echo ""
  javac -version 2>&1 || { echo -e "${RED}JDK 未安装${NC}"; exit 1; }
  pnpm build:mobile:android
  echo ""
  echo -e "${GREEN}打包完成${NC}"
  echo "  APK: apps/mobile/android/app/build/outputs/apk/"
}

build_mobile_ios() {
  echo ""
  echo -e "${BOLD}${CYAN}══════ 打包移动端 iOS ══════${NC}"
  echo ""
  if [ "$(uname -s)" != "Darwin" ]; then
    echo -e "${RED}iOS 构建需要 macOS + Xcode${NC}"
    exit 1
  fi
  xcodebuild -version 2>/dev/null || { echo -e "${RED}Xcode 未安装${NC}"; exit 1; }
  pnpm build:mobile:ios
  echo ""
  echo -e "${GREEN}打包完成${NC}"
}

build_web() {
  echo ""
  echo -e "${BOLD}${CYAN}══════ 打包 Web 端 ══════${NC}"
  echo ""
  pnpm build:web
  echo ""
  echo -e "${GREEN}打包完成${NC}"
  echo "  静态文件: apps/web/dist/"
}

build_server() {
  echo ""
  echo -e "${BOLD}${CYAN}══════ 打包服务端 ══════${NC}"
  echo ""
  cd "$SCRIPT_DIR/apps/server"
  pnpm build
  echo ""
  echo -e "${GREEN}打包完成${NC}"
  echo "  产物目录: apps/server/dist/"
}

case "$TARGET" in
  desktop)         build_desktop ;;
  mobile:android)  build_mobile_android ;;
  mobile:ios)      build_mobile_ios ;;
  web)             build_web ;;
  server)          build_server ;;
  all)
    build_server
    build_web
    build_desktop
    ;;
  *)
    echo -e "${RED}未知目标: $TARGET${NC}"
    echo "  可用: desktop | mobile:android | mobile:ios | web | server | all"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}${BOLD}全部构建任务完成。${NC}"
