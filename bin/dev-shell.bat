@echo off
chcp 65001 >nul
setlocal
title Yan-Zhi Shell Dev

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
echo   Yan-Zhi Shell - remote backend client
echo   示例:
echo     bin\dev-shell.bat --server-url=http://192.168.1.100:3001
echo     bin\dev-shell.bat --host-port=3002
echo ============================================================
echo.

"%NODE_BIN%" "%CD%\bin\dev-shell.mjs" %*
set EXITCODE=%ERRORLEVEL%

echo.
echo === 壳已退出，code=%EXITCODE% ===
echo %cmdcmdline% | findstr /i /c:"%~f0" >nul
if not errorlevel 1 pause
exit /b %EXITCODE%
