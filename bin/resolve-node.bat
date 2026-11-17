@echo off
rem Resolve an installed Node runtime and expose its directory to child commands.
rem This file intentionally does not use setlocal: callers consume NODE_BIN and PATH.

set "NODE_BIN="
set "NODE_DIR="

for /f "delims=" %%N in ('powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0resolve-node.ps1'" 2^>nul') do (
    if not defined NODE_BIN set "NODE_BIN=%%~fN"
)

if not defined NODE_BIN exit /b 1

for %%I in ("%NODE_BIN%") do set "NODE_DIR=%%~dpI"
if defined NODE_DIR set "PATH=%NODE_DIR%;%PATH%"
exit /b 0
