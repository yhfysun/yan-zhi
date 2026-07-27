@echo off
:: ============================================================
:: 言智 (Yan-Zhi) 环境搭建指引 (Windows CMD)
:: 用法: bin\setup-env.bat [--desktop|--mobile|--all]
:: ============================================================
setlocal enabledelayedexpansion

set SCOPE=%1
if "%SCOPE%"=="" set SCOPE=--all

echo.
echo ============================================================
echo   言智 (Yan-Zhi) 环境搭建指引
echo ============================================================
echo   操作系统: Windows
echo.

:: ========== 基础环境 ==========
echo ▸ 基础环境 (必需)
echo.

echo   1. Node.js ^>= 20
echo      官方下载: https://nodejs.org
echo      推荐使用 nvm-windows 管理版本:
echo        https://github.com/coreybutler/nvm-windows
echo.

echo   2. pnpm ^>= 9
echo      安装 Node.js 后运行:
echo        npm install -g pnpm
echo.

echo   3. Git for Windows
echo      https://git-scm.com/download/win
echo      安装后自带 Git Bash，可运行 .sh 脚本
echo.

echo   4. Python 3 (node-gyp 编译需要)
echo      https://www.python.org/downloads/
echo      安装时勾选 "Add Python to PATH"
echo.

echo   5. 安装项目依赖
echo      pnpm install
echo.

:: ========== 桌面端 ==========
if "%SCOPE%"=="--mobile" goto SKIP_DESKTOP

echo ▸ 桌面端 (Tauri / Rust)
echo.

echo   1. Rust 工具链
echo      下载 rustup-init.exe: https://rustup.rs
echo      运行安装程序，默认选项即可
echo.

echo   2. Windows Rust 目标 (二选一)
echo      # MSVC 工具链（推荐，需安装 Visual Studio Build Tools）
echo        rustup default stable-x86_64-pc-windows-msvc
echo.
echo      # GNU 工具链（需安装 MinGW-w64）
echo        rustup default stable-x86_64-pc-windows-gnu
echo.

echo   3. Visual Studio Build Tools 2022 (MSVC工具链需要，推荐)
echo      下载: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
echo      安装时勾选「C++ 桌面开发」工作负载
echo      安装后重启终端
echo.

echo   4. MinGW-w64 (GNU工具链需要，二选一)
echo      方案A: 从 https://winlibs.com 下载，解压后将 bin\ 加入 PATH
echo      方案B: 安装 MSYS2 (https://www.msys2.org) 后运行:
echo        pacman -S mingw-w64-x86_64-gcc
echo.

echo   5. WebView2 Runtime
echo      Windows 10/11 通常已预装，Tauri 安装包会自动安装
echo      https://developer.microsoft.com/microsoft-edge/webview2
echo.

:SKIP_DESKTOP

:: ========== 移动端 ==========
if "%SCOPE%"=="--desktop" goto SKIP_MOBILE

echo ▸ 移动端 (Capacitor)
echo.

echo   1. Android 构建环境
echo      - JDK 17: https://adoptium.net/download
echo        安装后设置环境变量 JAVA_HOME 指向 JDK 目录
echo      - Android Studio: https://developer.android.com/studio
echo        安装后设置环境变量 ANDROID_HOME
echo        默认路径: %%USERPROFILE%%\Android\Sdk
echo      - SDK Manager 安装 Android SDK Platform 34+
echo.

echo   2. iOS 构建环境
echo      需要 macOS + Xcode 15+，Windows 下无法构建 iOS
echo.

:SKIP_MOBILE

:: ========== 验证 ==========
echo ============================================================
echo.
echo   环境搭建完成后，运行以下命令验证:
echo     bin\check-env.bat
echo.
echo   快速启动: (需要 Git Bash 或 MSYS2 终端)
echo     bash bin/check-env.sh
echo.
echo   开发启动:
echo     pnpm dev              # 后端 (http://localhost:3001)
echo     pnpm dev:web          # Web 端 (http://localhost:5176)
echo.
