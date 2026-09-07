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

rem 清理 yan-zhi 残留进程（只杀命令行含 yan-zhi 的 electron/node，不误杀其它应用）
echo [cleanup] 正在清理 yan-zhi 残留进程...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -match 'electron|node|tsx|vite') -and ($_.CommandLine -match 'yan-zhi|yan_zhi|yanzhi|apps.DEdesktop|apps.DEserver') } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Write-Output ('  killed PID=' + $_.ProcessId + ' ' + $_.Name) } catch { } }"
echo [cleanup] 完成
echo.

"%NODE_BIN%" "%CD%\bin\dev.mjs" desktop %*

echo.
echo === 已退出 ===
pause
