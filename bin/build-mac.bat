@echo off
setlocal
echo === Build macOS (trigger CI + download artifact) ===
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0build-mac.ps1" %*
echo.
pause