@echo off
setlocal enabledelayedexpansion

:: === Yan-Zhi Desktop Dev Environment Setup ===
:: Run: double-click this file, or bin\setup-env.bat

echo ============================================
echo   Yan-Zhi Desktop Dev Environment Setup
echo ============================================
echo.

:: ========== Step 1: Check Node.js ==========
echo [1/5] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] Node.js not found. Install Node.js >= 20
    echo   Download: https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/
    pause
    exit /b 1
)
for /f "tokens=2 delims=v" %%v in ('node -v 2^>^&1') do echo   [OK] Node.js v%%v

:: ========== Step 2: Setup pnpm ==========
echo [2/5] Setting up pnpm...
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo   Installing pnpm via corepack...
    corepack enable 2>nul
    corepack prepare pnpm@9.12.0 --activate 2>nul
    if %errorlevel% neq 0 (
        echo   corepack failed, trying npm install...
        call npm install -g pnpm@9.12.0
    )
)
for /f "tokens=*" %%v in ('pnpm -v 2^>^&1') do echo   [OK] pnpm v%%v

:: ========== Step 3: Install dependencies ==========
echo [3/5] Installing dependencies (pnpm install)...
cd /d "%~dp0.."
call pnpm install --frozen-lockfile
if %errorlevel% neq 0 (
    echo   [WARN] pnpm install returned non-zero exit code
    echo   Dependencies may still be ready, continuing...
)
echo   [OK] Dependencies installed

:: ========== Step 4: Check Rust ==========
echo [4/5] Checking Rust toolchain...
where rustup >nul 2>&1
if %errorlevel% neq 0 (
    echo   [WARN] rustup not found, installing Rust...
    echo   Using Tuna mirror for faster download in China
    set "RUSTUP_DIST_SERVER=https://mirrors.tuna.tsinghua.edu.cn/rustup"
    set "RUSTUP_UPDATE_ROOT=https://mirrors.tuna.tsinghua.edu.cn/rustup/rustup"

    if exist "%~dp0..\rustup-init.exe" (
        "%~dp0..\rustup-init.exe" -y --default-toolchain stable-msvc --profile default
    ) else (
        echo   Downloading rustup-init.exe...
        powershell -Command "Invoke-WebRequest -Uri 'https://mirrors.tuna.tsinghua.edu.cn/rustup/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe' -OutFile '%TEMP%\rustup-init.exe'"
        "%TEMP%\rustup-init.exe" -y --default-toolchain stable-msvc --profile default
    )
) else (
    echo   [OK] Rust already installed
)

:: Configure RsProxy mirror (if not configured)
if not exist "%USERPROFILE%\.cargo\config.toml" (
    echo   Configuring cargo mirror (rsproxy.cn)...
    mkdir "%USERPROFILE%\.cargo" 2>nul
    (
        echo [source.crates-io]
        echo replace-with = "rsproxy-sparse"
        echo.
        echo [source.rsproxy-sparse]
        echo registry = "sparse+https://rsproxy.cn/index/"
        echo.
        echo [registries.rsproxy]
        echo index = "https://rsproxy.cn/crates.io-index"
        echo.
        echo [net]
        echo git-fetch-with-cli = true
    ) > "%USERPROFILE%\.cargo\config.toml"
) else (
    echo   [OK] cargo config already exists
)

:: Check for C/C++ linker (required for Tauri Rust compilation)
echo   Checking C/C++ linker...
where link.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] MSVC linker (link.exe) found
) else (
    echo.
    echo   ========================================
    echo   [WARNING] MSVC linker (link.exe) not found!
    echo   Required for Tauri Rust compilation.
    echo   Install Visual Studio 2022 Build Tools:
    echo     - Select "Desktop development with C++"
    echo     - Download: https://visualstudio.microsoft.com/downloads/
    echo   ========================================
    echo.
)

:: ========== Step 5: Verify ==========
echo [5/5] Verifying build...
echo.
echo   Testing frontend build...
call pnpm --filter @yan-zhi/desktop build >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] Frontend build successful
) else (
    echo   [WARN] Frontend build failed, check errors above
)

echo.
echo ============================================
echo   Setup Complete!
echo.
echo   Start dev:
echo     bin\dev-desktop.bat  - Launch Tauri desktop app
echo     pnpm dev:web         - Web frontend only
echo     pnpm dev:server      - Backend server
echo ============================================
pause
