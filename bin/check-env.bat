@echo off
:: ============================================================
:: 言智 (Yan-Zhi) 开发/打包环境检测脚本 (Windows CMD)
:: 用法: bin\check-env.bat [--quick|--desktop|--mobile|--web|--server]
:: ============================================================
setlocal enabledelayedexpansion

set SCOPE=%1
if "%SCOPE%"=="" set SCOPE=--all
if "%SCOPE%"=="--quick" set SCOPE=--base
if "%SCOPE%"=="--web"   set SCOPE=--base
if "%SCOPE%"=="--server" set SCOPE=--base

set PASS=0
set WARN=0
set FAIL=0

echo.
echo ============================================================
echo   言智 (Yan-Zhi) 环境检测
echo ============================================================
echo   检测范围: %SCOPE%
echo.

:: ========== 基础环境 ==========
echo [1/5] 基础开发环境
echo.

call :Check "Node.js"   "node --version"   20
call :Check "pnpm"      "pnpm --version"    9
call :Check "Git"       "git --version"

where python >/dev/null 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%i in ('python --version 2^>^&1') do echo   [OK]    Python 3 (node-gyp编译需要) — %%i
    set /a PASS+=1
) else (
    where python3 >/dev/null 2>&1
    if !ERRORLEVEL! EQU 0 (
        for /f "tokens=*" %%i in ('python3 --version 2^>^&1') do echo   [OK]    Python 3 (node-gyp编译需要) — %%i
        set /a PASS+=1
    ) else (
        echo   [N/A]  Python 3 — 未安装（可选）
        set /a WARN+=1
    )
)
echo.

:: ========== Rust / 桌面端 ==========
if "%SCOPE%"=="--base" goto SKIP_DESKTOP
if "%SCOPE%"=="--mobile" goto SKIP_DESKTOP

echo [2/5] 桌面端 (Tauri / Rust)
echo.

where rustc >/dev/null 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%i in ('rustc --version 2^>^&1') do echo   [OK]    Rust 工具链 — %%i
    set /a PASS+=1
) else (
    echo   [MISS]  Rust 工具链 — 未安装
    set /a FAIL+=1
)

where cargo >/dev/null 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%i in ('cargo --version 2^>^&1') do echo   [OK]    cargo — %%i
    set /a PASS+=1
) else (
    echo   [N/A]  cargo — 未安装（可选）
    set /a WARN+=1
)

rustup target list --installed 2>/dev/null | findstr /C:"x86_64-pc-windows" >/dev/null
if %ERRORLEVEL% EQU 0 (
    echo   [OK]    Windows Rust 目标已安装
    set /a PASS+=1
) else (
    echo   [N/A]  未检测到 Windows Rust 目标
    set /a WARN+=1
)

where x86_64-w64-mingw32-gcc >/dev/null 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   [OK]    MinGW-w64 (GNU交叉编译)
    set /a PASS+=1
) else (
    where gcc >/dev/null 2>&1
    if !ERRORLEVEL! EQU 0 (
        gcc --version 2>/dev/null | findstr /I "mingw" >/dev/null
        if !ERRORLEVEL! EQU 0 (
            echo   [OK]    MinGW GCC 已安装
            set /a PASS+=1
        ) else (
            echo   [N/A]  MinGW-w64 — 未安装（MSVC工具链不需要）
            set /a WARN+=1
        )
    ) else (
        echo   [N/A]  MinGW-w64 — 未安装（MSVC工具链不需要）
        set /a WARN+=1
    )
)

if exist "C:\Program Files\Microsoft Visual Studio\2022" (
    echo   [OK]    Visual Studio 2022 已安装
    set /a PASS+=1
) else if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022" (
    echo   [OK]    Visual Studio 2022 已安装
    set /a PASS+=1
) else if exist "C:\Program Files\Microsoft Visual Studio" (
    echo   [OK]    Visual Studio 已安装
    set /a PASS+=1
) else (
    echo   [N/A]  Visual Studio — 未安装（GNU工具链不需要）
    set /a WARN+=1
)
echo.
goto AFTER_DESKTOP

:SKIP_DESKTOP
echo [2/5] 桌面端 (Tauri / Rust) — 已跳过
echo.
:AFTER_DESKTOP

:: ========== 移动端 ==========
if "%SCOPE%"=="--base" goto SKIP_MOBILE
if "%SCOPE%"=="--desktop" goto SKIP_MOBILE

echo [3/5] 移动端 (Capacitor / Android)
echo.

where javac >/dev/null 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%i in ('javac -version 2^>^&1') do echo   [OK]    Java (JDK) — %%i
    set /a PASS+=1
) else (
    echo   [N/A]  JDK — 未安装（可选）
    set /a WARN+=1
)

if defined ANDROID_HOME (
    echo   [OK]    Android SDK — !ANDROID_HOME!
    set /a PASS+=1
) else if defined ANDROID_SDK_ROOT (
    echo   [OK]    Android SDK — !ANDROID_SDK_ROOT!
    set /a PASS+=1
) else if exist "%USERPROFILE%\Android\Sdk" (
    echo   [OK]    Android SDK — %USERPROFILE%\Android\Sdk
    set /a PASS+=1
) else (
    echo   [N/A]  Android SDK — 未检测到
    set /a WARN+=1
)

echo   [N/A]  iOS 构建需要 macOS + Xcode（当前非 macOS）
set /a WARN+=1
echo.
goto AFTER_MOBILE

:SKIP_MOBILE
echo [3/5] 移动端 (Capacitor) — 已跳过
echo.
:AFTER_MOBILE

:: ========== 项目依赖 ==========
echo [4/5] 项目依赖
echo.
set "ROOT_DIR=%~dp0.."
if exist "%ROOT_DIR%\node_modules" (
    echo   [OK]    node_modules 已安装
    set /a PASS+=1
) else (
    echo   [WARN]  node_modules 未安装 — 请运行 pnpm install
    set /a WARN+=1
)
echo.

:: ========== 附加工具 ==========
echo [5/5] 附加工具
echo.

where pnpm >/dev/null 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   [OK]    pnpm 命令可用
    set /a PASS+=1
) else (
    echo   [WARN]  pnpm 命令不可用 — 请检查环境变量
    set /a WARN+=1
)
echo.

:: ========== 汇总 ==========
echo ============================================================
set /a TOTAL=%PASS%+%WARN%+%FAIL%
echo   检测 %TOTAL% 项 ^| 通过 %PASS% ^| 警告 %WARN% ^| 缺失 %FAIL%
echo ============================================================

if %FAIL% GTR 0 (
    echo.
    echo   存在缺失项，请运行: bin\setup-env.bat
    echo.
    exit /b 1
) else if %WARN% GTR 0 (
    echo.
    echo   存在部分可选缺失项，不影响基础开发。
    echo.
) else (
    echo.
    echo   环境完全就绪！
    echo.
)
exit /b 0

:: ---- 检测函数 ----
:Check
set "LABEL=%~1"
set "CMD=%~2"

%CMD% >/dev/null 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%v in ('%CMD% 2^>^&1') do (
        echo   [OK]    %LABEL% — %%v
        goto :CheckDone
    )
) else (
    echo   [MISS]  %LABEL% — 未安装
    set /a FAIL+=1
)
:CheckDone
set /a PASS+=1
exit /b
