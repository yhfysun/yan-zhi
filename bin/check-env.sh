#!/usr/bin/env bash
# ============================================================
# 言智 (Yan-Zhi) 开发/打包环境检测脚本
# 用法: bash bin/check-env.sh [--quick|--desktop|--mobile|--web|--server]
# ============================================================
set -euo pipefail

# ---- 颜色输出 ----
RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m'
CYAN='\033[0;36m' NC='\033[0m' BOLD='\033[1m'

PASS=0; WARN=0; FAIL=0
check() {
  local label="$1" cmd="$2" min_ver="${3:-}"
  local actual=""
  if actual=$(eval "$cmd" 2>/dev/null); then
    if [ -n "$min_ver" ]; then
      local v; v=$(echo "$actual" | grep -oE '[0-9]+(\.[0-9]+)?' | head -1 | cut -d. -f1)
      if [ "${v:-0}" -ge "$min_ver" ] 2>/dev/null; then
        echo -e "  ${GREEN}[OK]${NC}    $label — $actual"
        PASS=$((PASS + 1))
      else
        echo -e "  ${RED}[FAIL]${NC}  $label — $actual (要求 >= $min_ver)"
        FAIL=$((FAIL + 1))
      fi
    else
      echo -e "  ${GREEN}[OK]${NC}    $label — $actual"
      PASS=$((PASS + 1))
    fi
  else
    echo -e "  ${RED}[MISS]${NC}  $label — 未安装"
    FAIL=$((FAIL + 1))
  fi
}

check_optional() {
  local label="$1" cmd="$2"
  local actual=""
  if actual=$(eval "$cmd" 2>/dev/null); then
    echo -e "  ${GREEN}[OK]${NC}    $label — $actual"
    PASS=$((PASS + 1))
  else
    echo -e "  ${YELLOW}[N/A]${NC}  $label — 未安装（可选）"
    WARN=$((WARN + 1))
  fi
}

SCOPE="${1:---all}"
case "$SCOPE" in --quick|--web|--server) SCOPE="--base" ;; esac

echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}  言智 (Yan-Zhi) 环境检测${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "  检测范围: ${SCOPE}"
echo ""

# ========== 基础环境 ==========
echo -e "${BOLD}[1/5] 基础开发环境${NC}"
check "Node.js >= 20"      "node --version" 20
check "pnpm   >= 9"        "pnpm --version"  9
check "Git"                "git --version"
check_optional "Python 3 (node-gyp 编译需要)" "python3 --version 2>/dev/null || python --version 2>/dev/null"
echo ""

# ========== Rust / 桌面端 ==========
if [ "$SCOPE" = "--all" ] || [ "$SCOPE" = "--desktop" ]; then
  echo -e "${BOLD}[2/5] 桌面端 (Tauri / Rust)${NC}"
  check "Rust 工具链"      "rustc --version" 1
  check_optional "cargo"           "cargo --version"

  local rust_target=""; rust_target=$(rustup default 2>/dev/null || echo "unknown")
  echo -e "  当前默认 Rust 目标: ${rust_target}"

  if rustup target list --installed 2>/dev/null | grep -qE "x86_64-pc-windows-(msvc|gnu)"; then
    echo -e "  ${GREEN}[OK]${NC}    Windows Rust 目标已安装"
    PASS=$((PASS + 1))
  else
    echo -e "  ${YELLOW}[N/A]${NC}  未检测到 Windows Rust 目标（非 Windows 平台或需安装）"
    WARN=$((WARN + 1))
  fi

  # MinGW-w64 (GNU toolchain)
  if x86_64-w64-mingw32-gcc --version 2>/dev/null | grep -q .; then
    echo -e "  ${GREEN}[OK]${NC}    MinGW-w64 (GNU 交叉编译)"
    PASS=$((PASS + 1))
  elif gcc --version 2>/dev/null | grep -qi mingw; then
    echo -e "  ${GREEN}[OK]${NC}    MinGW GCC"
    PASS=$((PASS + 1))
  else
    echo -e "  ${YELLOW}[N/A]${NC}  MinGW-w64 — 未安装（MSVC 工具链不需要）"
    WARN=$((WARN + 1))
  fi

  # Visual Studio (MSVC toolchain)
  if [ -d "/c/Program Files/Microsoft Visual Studio" ] 2>/dev/null || \
     [ -d "/c/Program Files (x86)/Microsoft Visual Studio" ] 2>/dev/null; then
    echo -e "  ${GREEN}[OK]${NC}    Visual Studio 已安装"
    PASS=$((PASS + 1))
  else
    echo -e "  ${YELLOW}[N/A]${NC}  Visual Studio — 未安装（GNU 工具链不需要）"
    WARN=$((WARN + 1))
  fi
  echo ""
else
  echo -e "${BOLD}[2/5] 桌面端 (Tauri / Rust)${NC} — 已跳过"
  echo ""
fi

# ========== 移动端 ==========
if [ "$SCOPE" = "--all" ] || [ "$SCOPE" = "--mobile" ]; then
  echo -e "${BOLD}[3/5] 移动端 (Capacitor / Android / iOS)${NC}"

  # Android
  check_optional "Java (JDK >= 17)" "javac -version 2>&1 || java -version 2>&1"
  if [ -n "${ANDROID_HOME:-}" ] || [ -n "${ANDROID_SDK_ROOT:-}" ]; then
    echo -e "  ${GREEN}[OK]${NC}    Android SDK — ${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
    PASS=$((PASS + 1))
  elif [ -d "$HOME/Android/Sdk" ] 2>/dev/null; then
    echo -e "  ${GREEN}[OK]${NC}    Android SDK — \$HOME/Android/Sdk"
    PASS=$((PASS + 1))
  else
    echo -e "  ${YELLOW}[N/A]${NC}  Android SDK — 未检测到"
    WARN=$((WARN + 1))
  fi

  # iOS (macOS only)
  if [ "$(uname -s)" = "Darwin" ]; then
    check_optional "Xcode"  "xcodebuild -version 2>&1 | head -1"
    check_optional "CocoaPods" "pod --version 2>/dev/null"
  else
    echo -e "  ${YELLOW}[N/A]${NC}  iOS 构建需要 macOS + Xcode（当前非 macOS）"
    WARN=$((WARN + 1))
  fi
  echo ""
else
  echo -e "${BOLD}[3/5] 移动端 (Capacitor)${NC} — 已跳过"
  echo ""
fi

# ========== 项目依赖 ==========
echo -e "${BOLD}[4/5] 项目依赖${NC}"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -d "$SCRIPT_DIR/node_modules" ]; then
  echo -e "  ${GREEN}[OK]${NC}    node_modules 已安装"
  PASS=$((PASS + 1))
else
  echo -e "  ${YELLOW}[WARN]${NC} node_modules 未安装 — 请运行 pnpm install"
  WARN=$((WARN + 1))
fi
echo ""

# ========== 磁盘空间 ==========
echo -e "${BOLD}[5/5] 磁盘空间${NC}"
if command -v df &>/dev/null; then
  avail=$(df -h "$SCRIPT_DIR" 2>/dev/null | tail -1 | awk '{print $4}' || echo "未知")
  echo -e "  可用磁盘空间: ${avail}"
fi
echo ""

# ========== 汇总 ==========
echo -e "${BOLD}${CYAN}──────────────────────────────────────────────────────${NC}"
TOTAL=$((PASS + WARN + FAIL))
echo -e "  检测 ${TOTAL} 项 │ ${GREEN}通过 ${PASS}${NC} │ ${YELLOW}警告 ${WARN}${NC} │ ${RED}缺失 ${FAIL}${NC}"
echo -e "${BOLD}${CYAN}──────────────────────────────────────────────────────${NC}"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo -e "  ${RED}存在缺失项，请运行:${NC} ${BOLD}bash bin/setup-env.sh${NC}"
  echo ""
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo ""
  echo -e "  ${YELLOW}存在部分可选缺失项，不影响基础开发。${NC}"
  echo ""
else
  echo ""
  echo -e "  ${GREEN}环境完全就绪！${NC}"
  echo ""
fi
