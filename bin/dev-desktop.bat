@echo off
setlocal enabledelayedexpansion
title Yan-Zhi Desktop

echo ============================================================
echo   Yan-Zhi Desktop Dev Launcher
echo   %date% %time%
echo ============================================================
echo.

:: Step 0: ensure we can see what's happening
echo [0] Initializing...

:: Clear safe-delete shim
set NODE_OPTIONS=

:: cargo/rustc
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
set "CARGO_TARGET_DIR=%USERPROFILE%\yan-zhi-target2"

:: Check rustup
echo     Checking rustup...
where rustup >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=*" %%i in ('rustup show active-toolchain 2^>^&1') do set "TC=%%i"
    echo     Current toolchain: !TC!
    echo !TC! | findstr "msvc" >nul
    if errorlevel 1 (
        echo     Switching to MSVC...
        rustup default stable-x86_64-pc-windows-msvc >nul 2>&1
        if errorlevel 1 (echo     [WARN] Switch failed) else (echo     [OK] Switched)
    ) else (
        echo     [OK] MSVC toolchain active
    )
) else (
    echo     [WARN] rustup not found, skip toolchain check
)

:: Check linker
echo     Checking MSVC linker...
where link.exe >nul 2>&1
if errorlevel 1 (
    echo     [WARN] link.exe not in PATH
    echo            Open "Developer Command Prompt for VS" and retry
) else (
    echo     [OK] link.exe found
)

:: Navigate to project root
cd /d "%~dp0.."
if errorlevel 1 (
    echo [ERROR] Cannot cd to project root: "%~dp0.."
    pause
    exit /b 1
)
echo     Project root: %cd%

:: Check pnpm
echo     Checking pnpm...
where pnpm >nul 2>&1
if %errorlevel%==0 (
    set "PNPM=pnpm"
    echo     [OK] pnpm in PATH
) else if exist "%USERPROFILE%\.workbuddy\binaries\node\workspace\pnpm.cmd" (
    set "PNPM=%USERPROFILE%\.workbuddy\binaries\node\workspace\pnpm.cmd"
    echo     [OK] pnpm found at workspace
) else (
    echo     [ERROR] pnpm not found
    pause
    exit /b 1
)
echo     PNPM = %PNPM%
echo.

echo [1/2] pnpm install...
call %PNPM% install
if errorlevel 1 echo [WARN] pnpm install exit code non-zero (may be harmless^)
echo.

echo [2/2] pnpm tauri:dev...
call %PNPM% --filter @yan-zhi/desktop tauri:dev
if errorlevel 1 (
    echo.
    echo [ERROR] tauri dev failed
)
echo.
echo === Done ===
pause
exit /b 0
