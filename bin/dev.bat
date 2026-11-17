@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Yan-Zhi Dev

:: 清掉 safe-delete shim，避免干扰子进程
set NODE_OPTIONS=
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_CUSTOM_DIR={{ version }}

cd /d "%~dp0.."

:: 解析 node（兼容 fnm / nvm / WorkBuddy 及普通安装）
call "%~dp0resolve-node.bat"
if errorlevel 1 (
    echo [ERROR] 未找到可用的 Node.js 20+
    echo         请安装 Node.js，或确认 fnm / nvm / WorkBuddy 的 Node 已安装。
    pause
    exit /b 1
)

if "%1"=="" (
    "%NODE_BIN%" "%CD%\bin\dev.mjs" desktop %*
) else (
    "%NODE_BIN%" "%CD%\bin\dev.mjs" %*
)

echo.
echo === 已退出 ===
pause
