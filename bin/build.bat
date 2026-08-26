@echo off
setlocal enabledelayedexpansion

:: === Yan-Zhi Build Script ===
:: Usage: bin\build.bat <target>
::   target: desktop | mobile:android | mobile:ios | web | server | all

set TARGET=%1
if "%TARGET%"=="" (
    echo Usage: bin\build.bat ^<target^>
    echo   target: desktop ^| mobile:android ^| mobile:ios ^| web ^| server ^| all
    exit /b 1
)

set "ROOT_DIR=%~dp0.."
cd /d "%ROOT_DIR%"

if "%TARGET%"=="desktop"        call :BuildDesktop
if "%TARGET%"=="mobile:android" call :BuildMobileAndroid
if "%TARGET%"=="mobile:ios"     call :BuildMobileIos
if "%TARGET%"=="web"            call :BuildWeb
if "%TARGET%"=="server"         call :BuildServer
if "%TARGET%"=="all" (
    call :BuildServer
    if !ERRORLEVEL! NEQ 0 exit /b 1
    call :BuildWeb
    if !ERRORLEVEL! NEQ 0 exit /b 1
    call :BuildDesktop
    if !ERRORLEVEL! NEQ 0 exit /b 1
)

echo.
echo All build tasks completed.
exit /b 0

:BuildDesktop
echo.
echo ====== Build Desktop (Electron) ======
echo.
call pnpm build:desktop
if %ERRORLEVEL% NEQ 0 exit /b 1
echo.
echo Build complete
echo   Output: apps\desktop\release\
exit /b 0

:BuildMobileAndroid
echo.
echo ====== Build Mobile Android ======
echo.
where javac >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [ERROR] JDK not installed
    exit /b 1
)
call pnpm build:mobile:android
if %ERRORLEVEL% NEQ 0 exit /b 1
echo.
echo Build complete
echo   APK: apps\mobile\android\app\build\outputs\apk\
exit /b 0

:BuildMobileIos
echo.
echo ====== Build Mobile iOS ======
echo.
echo   [ERROR] iOS build requires macOS + Xcode
exit /b 1

:BuildWeb
echo.
echo ====== Build Web ======
echo.
call pnpm build:web
if %ERRORLEVEL% NEQ 0 exit /b 1
echo.
echo Build complete
echo   Static files: apps\web\dist\
exit /b 0

:BuildServer
echo.
echo ====== Build Server ======
echo.
cd /d "%ROOT_DIR%\apps\server"
call pnpm build
if %ERRORLEVEL% NEQ 0 exit /b 1
echo.
echo Build complete
echo   Output: apps\server\dist\
exit /b 0
