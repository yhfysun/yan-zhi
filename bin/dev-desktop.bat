@echo off
setlocal enabledelayedexpansion
title Yan-Zhi Desktop

echo ============================================================
echo   Yan-Zhi Desktop Dev Launcher (Electron)
echo   %date% %time%
echo ============================================================
echo.

:: Step 0: ensure we can see what's happening
echo [0] Initializing...

:: Clear safe-delete shim
set NODE_OPTIONS=

:: Electron 国内镜像（避免 postinstall 下载卡住）
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_CUSTOM_DIR={{ version }}

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
    echo [ERROR] pnpm not found
    pause
    exit /b 1
)
echo     PNPM = %PNPM%
echo.

echo [1/3] pnpm install...
call %PNPM% install
if errorlevel 1 echo [WARN] pnpm install exit code non-zero (may be harmless^)
echo.

echo [2/3] Backend server will be started by Electron main process (ABI compatible)
echo.

echo [3/3] Starting Electron desktop (electron:dev)...
call %PNPM% --filter @yan-zhi/desktop electron:dev
if errorlevel 1 (
    echo.
    echo [ERROR] electron:dev failed
)
echo.
echo === Done ===
pause
exit /b 0
