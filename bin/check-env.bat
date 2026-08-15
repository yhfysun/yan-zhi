@echo off
setlocal enabledelayedexpansion

:: === Yan-Zhi Environment Check ===
:: Usage: bin\check-env.bat [--quick|--desktop|--mobile|--web|--server]

set SCOPE=%1
if "%SCOPE%"=="" set SCOPE=--all
if "%SCOPE%"=="--quick" set SCOPE=--base
if "%SCOPE%"=="--web"   set SCOPE=--base
if "%SCOPE%"=="--server" set SCOPE=--base

set PASS=0
set WARN=0
set FAIL=0

echo.
echo ============================================================
echo   Yan-Zhi Environment Check
echo   Scope: %SCOPE%
echo ============================================================
echo.

:: ========== Base ==========
echo [1/5] Base Dev Environment
echo.

call :Check "Node.js"   "node --version"
call :Check "pnpm"      "pnpm --version"
call :Check "Git"       "git --version"

where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%i in ('python --version 2^>^&1') do echo   [OK]    Python 3 - %%i
    set /a PASS+=1
) else (
    where python3 >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        for /f "tokens=*" %%i in ('python3 --version 2^>^&1') do echo   [OK]    Python 3 - %%i
        set /a PASS+=1
    ) else (
        echo   [N/A]   Python 3 - not installed (optional)
        set /a WARN+=1
    )
)
echo.

:: ========== Rust / Desktop ==========
if "%SCOPE%"=="--base" goto SKIP_DESKTOP
if "%SCOPE%"=="--mobile" goto SKIP_DESKTOP

echo [2/5] Desktop (Tauri / Rust)
echo.

where rustc >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%i in ('rustc --version 2^>^&1') do echo   [OK]    Rust - %%i
    set /a PASS+=1
) else (
    echo   [MISS]  Rust - not installed
    set /a FAIL+=1
)

where cargo >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%i in ('cargo --version 2^>^&1') do echo   [OK]    Cargo - %%i
    set /a PASS+=1
) else (
    echo   [N/A]   Cargo - not installed
    set /a WARN+=1
)

:: Check MSVC or GNU linker
where link.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   [OK]    MSVC Linker (link.exe) found
    set /a PASS+=1
) else (
    where x86_64-w64-mingw32-gcc >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo   [OK]    MinGW-w64 GCC found
        set /a PASS+=1
    ) else (
        echo   [WARN]  No C/C++ linker found - install VS Build Tools or MinGW-w64
        set /a WARN+=1
    )
)

if exist "%ProgramFiles%\Microsoft Visual Studio\2022" (
    echo   [OK]    Visual Studio 2022 installed
    set /a PASS+=1
) else if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2022" (
    echo   [OK]    Visual Studio 2022 installed
    set /a PASS+=1
) else (
    echo   [N/A]   Visual Studio - not installed
    set /a WARN+=1
)
echo.
goto AFTER_DESKTOP

:SKIP_DESKTOP
echo [2/5] Desktop (Tauri / Rust) - skipped
echo.
:AFTER_DESKTOP

:: ========== Mobile ==========
if "%SCOPE%"=="--base" goto SKIP_MOBILE
if "%SCOPE%"=="--desktop" goto SKIP_MOBILE

echo [3/5] Mobile (Capacitor / Android)
echo.

where javac >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%i in ('javac -version 2^>^&1') do echo   [OK]    JDK - %%i
    set /a PASS+=1
) else (
    echo   [N/A]   JDK - not installed (optional)
    set /a WARN+=1
)

if defined ANDROID_HOME (
    echo   [OK]    Android SDK - !ANDROID_HOME!
    set /a PASS+=1
) else if defined ANDROID_SDK_ROOT (
    echo   [OK]    Android SDK - !ANDROID_SDK_ROOT!
    set /a PASS+=1
) else if exist "%USERPROFILE%\Android\Sdk" (
    echo   [OK]    Android SDK - %USERPROFILE%\Android\Sdk
    set /a PASS+=1
) else (
    echo   [N/A]   Android SDK - not detected
    set /a WARN+=1
)

echo   [N/A]   iOS build requires macOS + Xcode
set /a WARN+=1
echo.
goto AFTER_MOBILE

:SKIP_MOBILE
echo [3/5] Mobile (Capacitor) - skipped
echo.
:AFTER_MOBILE

:: ========== Dependencies ==========
echo [4/5] Project Dependencies
echo.
set "ROOT_DIR=%~dp0.."
if exist "%ROOT_DIR%\node_modules" (
    echo   [OK]    node_modules installed
    set /a PASS+=1
) else (
    echo   [WARN]  node_modules missing - run: pnpm install
    set /a WARN+=1
)
echo.

:: ========== Extra Tools ==========
echo [5/5] Extra Tools
echo.

where pnpm >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   [OK]    pnpm command available
    set /a PASS+=1
) else (
    echo   [WARN]  pnpm command not available
    set /a WARN+=1
)
echo.

:: ========== Summary ==========
echo ============================================================
set /a TOTAL=%PASS%+%WARN%+%FAIL%
echo   Items: %TOTAL% ^| Pass: %PASS% ^| Warn: %WARN% ^| Fail: %FAIL%
echo ============================================================

if %FAIL% GTR 0 (
    echo.
    echo   Some items missing, run: bin\setup-env.bat
    echo.
    exit /b 1
) else if %WARN% GTR 0 (
    echo.
    echo   Some optional items missing, base dev should work.
    echo.
) else (
    echo.
    echo   Environment fully ready!
    echo.
)
exit /b 0

:: ---- Check Helper ----
:Check
set "LABEL=%~1"
set "CMD=%~2"

%CMD% >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%v in ('%CMD% 2^>^&1') do (
        echo   [OK]    %LABEL% - %%v
        goto :CheckDone
    )
) else (
    echo   [MISS]  %LABEL% - not installed
    set /a FAIL+=1
)
:CheckDone
set /a PASS+=1
exit /b
