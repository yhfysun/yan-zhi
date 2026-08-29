@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Yan-Zhi Desktop Dev

set NODE_OPTIONS=
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_CUSTOM_DIR={{ version }}

cd /d "%~dp0.."

set "NODE_BIN=node"
where node >nul 2>&1
if errorlevel 1 (
    if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe" (
        set "NODE_BIN=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe"
    ) else (
        echo [ERROR] 未找到 node
        pause
        exit /b 1
    )
)

echo ============================================================
echo   Yan-Zhi Desktop (Electron) - %date% %time%
echo   参数直通 dev.mjs：--clean 强制清缓存 / --vite-only 只起前端
echo ============================================================
echo.

"%NODE_BIN%" "%CD%\bin\dev.mjs" desktop %*

echo.
echo === 已退出 ===
pause
