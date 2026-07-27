#!/usr/bin/env bash
# ============================================================
# 言智 (Yan-Zhi) 环境搭建指引脚本
# 用法: bash bin/setup-env.sh [--desktop|--mobile|--all]
# ============================================================
set -euo pipefail

CYAN='\033[0;36m' YELLOW='\033[1;33m' GREEN='\033[0;32m'
BOLD='\033[1m' NC='\033[0m'

SCOPE="${1:---all}"
OS="$(uname -s)"

echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}  言智 (Yan-Zhi) 环境搭建指引${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "  操作系统: ${OS}"
echo ""

# ========== 基础环境 ==========
echo -e "${BOLD}▸ 基础环境 (必需)${NC}"
echo ""

echo -e "  ${BOLD}1. Node.js >= 20${NC}"
echo "     官方下载: https://nodejs.org"
echo "     推荐使用 nvm-windows / fnm 管理版本"
echo ""

echo -e "  ${BOLD}2. pnpm >= 9${NC}"
echo "     npm install -g pnpm"
echo ""

echo -e "  ${BOLD}3. Git${NC}"
echo "     https://git-scm.com/downloads"
echo ""

echo -e "  ${BOLD}4. 安装项目依赖${NC}"
echo "     pnpm install"
echo ""

# ========== 桌面端 ==========
if [ "$SCOPE" = "--all" ] || [ "$SCOPE" = "--desktop" ]; then
  echo -e "${BOLD}▸ 桌面端 (Tauri / Rust)${NC}"
  echo ""

  echo -e "  ${BOLD}1. Rust 工具链${NC}"
  echo "     curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  echo ""

  if [ "$OS" = "MINGW64_NT"* ] || [ "$OS" = "MSYS_NT"* ] || [ "$OS" = "Windows_NT" ]; then
    echo -e "  ${BOLD}2. Windows Rust 目标 (二选一)${NC}"
    echo "     # MSVC 工具链（需安装 Visual Studio Build Tools）"
    echo "     rustup default stable-x86_64-pc-windows-msvc"
    echo ""
    echo "     # GNU 工具链（需安装 MinGW-w64）"
    echo "     rustup default stable-x86_64-pc-windows-gnu"
    echo ""

    echo -e "  ${BOLD}3. MinGW-w64（GNU 工具链需要）${NC}"
    echo "     从 https://winlibs.com 下载解压，将 bin/ 加入 PATH"
    echo "     或通过 MSYS2: pacman -S mingw-w64-x86_64-gcc"
    echo ""

    echo -e "  ${BOLD}4. Visual Studio Build Tools（MSVC 工具链需要）${NC}"
    echo "     https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022"
    echo "     安装时勾选「C++ 桌面开发」工作负载"
    echo ""

    echo -e "  ${BOLD}5. WebView2 Runtime${NC}"
    echo "     Windows 10/11 通常已预装，否则 Tauri 安装包会自动安装"
    echo "     https://developer.microsoft.com/microsoft-edge/webview2"
    echo ""
  fi

  if [ "$OS" = "Darwin" ]; then
    echo -e "  ${BOLD}2. Xcode Command Line Tools${NC}"
    echo "     xcode-select --install"
    echo ""
  fi

  if [ "$OS" = "Linux" ]; then
    echo -e "  ${BOLD}2. 系统依赖 (Debian/Ubuntu)${NC}"
    echo "     sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev"
    echo "     sudo apt install librsvg2-dev patchelf libssl-dev"
    echo ""
  fi
fi

# ========== 移动端 ==========
if [ "$SCOPE" = "--all" ] || [ "$SCOPE" = "--mobile" ]; then
  echo -e "${BOLD}▸ 移动端 (Capacitor)${NC}"
  echo ""

  echo -e "  ${BOLD}1. Android 构建环境${NC}"
  echo "     - JDK 17: https://adoptium.net"
  echo "     - Android Studio: https://developer.android.com/studio"
  echo "     - 安装后配置 ANDROID_HOME 环境变量"
  echo "     - SDK Manager 安装 Android SDK Platform 34+"
  echo ""

  echo -e "  ${BOLD}2. iOS 构建环境 (仅 macOS)${NC}"
  echo "     - Xcode 15+: https://developer.apple.com/xcode"
  echo "     - CocoaPods: sudo gem install cocoapods"
  echo "     - 在 apps/mobile/ios/App 目录运行: pod install"
  echo ""
fi

# ========== 验证 ==========
echo -e "${BOLD}${CYAN}──────────────────────────────────────────────────────${NC}"
echo ""
echo -e "  环境搭建完成后，运行以下命令验证:"
echo -e "    ${BOLD}bash bin/check-env.sh${NC}"
echo ""
echo -e "  快速启动:"
echo -e "    ${BOLD}pnpm dev          ${NC}# 后端"
echo -e "    ${BOLD}pnpm dev:web      ${NC}# Web 端"
echo ""
