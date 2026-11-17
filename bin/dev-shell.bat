@echo off
chcp 65001 >nul
setlocal
title Yan-Zhi Shell Dev

set NODE_OPTIONS=
cd /d "%~dp0.."

call "%~dp0resolve-node.bat"
if errorlevel 1 (
  echo [ERROR] 未找到可用的 Node.js 20+
  pause
  exit /b 1
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
