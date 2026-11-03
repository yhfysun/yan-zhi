@echo off
chcp 65001 >nul
setlocal
title Yan-Zhi Backend Dev

set NODE_OPTIONS=
cd /d "%~dp0.."

set "NODE_BIN=node"
where node >nul 2>&1
if errorlevel 1 (
  if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe" (
    set "NODE_BIN=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe"
  ) else (
    echo [ERROR] 未找到 Node.js
    pause
    exit /b 1
  )
)

echo ============================================================
echo   Yan-Zhi Backend only
echo   参数直通: --no-install --no-plugin-sync 等
echo ============================================================
echo.

"%NODE_BIN%" "%CD%\bin\dev-backend.mjs" %*
set EXITCODE=%ERRORLEVEL%

echo.
echo === 后端已退出，code=%EXITCODE% ===
echo %cmdcmdline% | findstr /i /c:"%~f0" >nul
if not errorlevel 1 pause
exit /b %EXITCODE%
