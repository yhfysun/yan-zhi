@echo off
setlocal enabledelayedexpansion

:: ============================================================
:: Yan-Zhi package entry (same style as build.bat, forwards to scripts\package.cjs)
:: Usage: bin\package.bat [target] [extra args...]
::   (no target)  interactive multi-select: SPACE toggles / arrows move / a = all / ENTER starts
::   target:
::     lite | basic | pro   desktop single edition
::     desktop              all three desktop editions
::     android | mobile     Android APK
::     all                  three desktop editions + Android
::   extra args: --dry-run / --no-verify / --keep-tmp
::   Output tree: dist-release\desktop\<edition>\<version>\ and dist-release\android\<version>\
::   NOTE: keep this file ASCII-only (cmd parses comments with the OEM codepage)
:: ============================================================

set ROOT=%~dp0..
set TARGET=%1

if "%TARGET%"=="" goto :Interactive
if /i "%TARGET%"=="lite"   goto :Lite
if /i "%TARGET%"=="basic"  goto :Basic
if /i "%TARGET%"=="pro"    goto :Pro
if /i "%TARGET%"=="desktop" goto :Desktop
if /i "%TARGET%"=="android" goto :Android
if /i "%TARGET%"=="mobile"  goto :Android
if /i "%TARGET%"=="all"     goto :All

echo [ERROR] unknown target: %TARGET%
echo   valid: lite / basic / pro / desktop / android / all  (no arg = interactive multi-select)
exit /b 1

:Interactive
node "%ROOT%\scripts\package.cjs"
goto :End

:Lite
shift
node "%ROOT%\scripts\package-desktop-lite.cjs" %1 %2 %3 %4
goto :End

:Basic
shift
node "%ROOT%\scripts\package-desktop-basic.cjs" %1 %2 %3 %4
goto :End

:Pro
shift
node "%ROOT%\scripts\package-desktop-pro.cjs" %1 %2 %3 %4
goto :End

:Desktop
shift
node "%ROOT%\scripts\package.cjs" desktop %1 %2 %3 %4
goto :End

:Android
shift
node "%ROOT%\scripts\package-android.cjs" %1 %2 %3 %4
goto :End

:All
shift
node "%ROOT%\scripts\package.cjs" all %1 %2 %3 %4
goto :End

:End
exit /b %ERRORLEVEL%
