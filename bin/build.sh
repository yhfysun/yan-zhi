#!/usr/bin/env bash
# ============================================================
# 言智 (Yan-Zhi) 打包/构建脚本
# 用法: bash bin/build.sh <target>
#   target: desktop | desktop:full | desktop:lite | mobile:android | mobile:ios | web | server | all
# ============================================================
set -euo pipefail

RED='\033[0;31m' GREEN='\033[0;32m' CYAN='\033[0;36m'
BOLD='\033[1m' NC='\033[0m'

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo -e "${RED}用法: bash bin/build.sh <target>${NC}"
  echo "  target: desktop | desktop:full | desktop:lite | mobile:android | mobile:ios | web | server | all"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

# 桌面端打包前置：内置模型平台已移除，改用 Ollama，无需下载模型/llama-server
prepare_desktop_resources() {
  echo ""
  echo -e "${BOLD}${CYAN}══════ Skip model download (use Ollama) ══════${NC}"
  echo ""
}

build_desktop_full() {
  echo ""
  echo -e "${BOLD}${CYAN}══════ 打包桌面端 Electron (完整版) ══════${NC}"
  echo ""
  prepare_desktop_resources
  pnpm --filter @yan-zhi/desktop electron:build:full
  echo ""
  echo -e "${GREEN}打包完成${NC}"
  echo "  产物目录: apps/desktop/release-full/"
}

build_desktop_lite() {
  echo ""
  echo -e "${BOLD}${CYAN}══════ 打包桌面端 Electron (轻量版) ══════${NC}"
  echo ""
  prepare_desktop_resources
  pnpm --filter @yan-zhi/desktop electron:build:lite
  echo ""
  echo -e "${GREEN}打包完成${NC}"
  echo "  产物目录: apps/desktop/release-lite/"
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
  cd "$SCRIPT_DIR"
  echo ""
  echo -e "${GREEN}打包完成${NC}"
  echo "  产物目录: apps/server/dist/"
}

case "$TARGET" in
  desktop|desktop:full) build_desktop_full ;;
  desktop:lite)         build_desktop_lite ;;
  mobile:android)       build_mobile_android ;;
  mobile:ios)           build_mobile_ios ;;
  web)                  build_web ;;
  server)               build_server ;;
  all)
    build_server
    build_web
    build_desktop_full
    ;;
  *)
    echo -e "${RED}未知目标: $TARGET${NC}"
    echo "  可用: desktop | desktop:full | desktop:lite | mobile:android | mobile:ios | web | server | all"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}${BOLD}全部构建任务完成。${NC}"
