@echo off
setlocal enabledelayedexpansion

:: === Yan-Zhi Build Script ===
:: Usage: bin\build.bat <target>
::   target: desktop | desktop:full | desktop:lite | mobile:android | mobile:ios | web | server | all

set TARGET=%1
if "%TARGET%"=="" (
    echo Usage: bin\build.bat ^<target^>
    echo   target: desktop ^| desktop:full ^| desktop:lite ^| mobile:android ^| mobile:ios ^| web ^| server ^| all
    exit /b 1
)

set "ROOT_DIR=%~dp0.."
cd /d "%ROOT_DIR%"

if "%TARGET%"=="desktop"         call :BuildDesktopFull
if "%TARGET%"=="desktop:full"    call :BuildDesktopFull
if "%TARGET%"=="desktop:lite"    call :BuildDesktopLite
if "%TARGET%"=="mobile:android"  call :BuildMobileAndroid
if "%TARGET%"=="mobile:ios"      call :BuildMobileIos
if "%TARGET%"=="web"             call :BuildWeb
if "%TARGET%"=="server"          call :BuildServer
if "%TARGET%"=="all" (
    call :BuildServer
    if !ERRORLEVEL! NEQ 0 exit /b 1
    call :BuildWeb
    if !ERRORLEVEL! NEQ 0 exit /b 1
    call :BuildDesktopFull
    if !ERRORLEVEL! NEQ 0 exit /b 1
)

echo.
echo All build tasks completed.
exit /b 0

:: 桌面端打包前置：内置模型平台已移除，改用 Ollama，无需下载模型/llama-server
:PrepareDesktopResources
echo.
echo ====== Skip model download (use Ollama) ======
echo.
exit /b 0

:BuildDesktopFull
echo.
echo ====== Build Desktop (Electron, full) ======
echo.
call :PrepareDesktopResources
if %ERRORLEVEL% NEQ 0 exit /b 1
call pnpm --filter @yan-zhi/desktop electron:build:full
if %ERRORLEVEL% NEQ 0 exit /b 1
echo.
echo Build complete
echo   Output: apps\desktop\release-full\
exit /b 0

:BuildDesktopLite
echo.
echo ====== Build Desktop (Electron, lite) ======
echo.
call :PrepareDesktopResources
if %ERRORLEVEL% NEQ 0 exit /b 1
call pnpm --filter @yan-zhi/desktop electron:build:lite
if %ERRORLEVEL% NEQ 0 exit /b 1
echo.
echo Build complete
echo   Output: apps\desktop\release-lite\
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
cd /d "%ROOT_DIR%"
echo.
echo Build complete
echo   Output: apps\server\dist\
exit /b 0
