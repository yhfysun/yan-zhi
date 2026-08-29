@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Yan-Zhi Dev

:: 清掉 safe-delete shim，避免干扰子进程
set NODE_OPTIONS=
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_CUSTOM_DIR={{ version }}

cd /d "%~dp0.."

:: 解析 node
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

if "%1"=="" (
    "%NODE_BIN%" "%CD%\bin\dev.mjs" desktop %*
) else (
    "%NODE_BIN%" "%CD%\bin\dev.mjs" %*
)

echo.
echo === 已退出 ===
pause
