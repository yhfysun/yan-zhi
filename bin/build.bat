@echo off
:: ============================================================
:: 言智 (Yan-Zhi) 打包/构建脚本 (Windows CMD)
:: 用法: bin\build.bat <target>
::   target: desktop | mobile:android | mobile:ios | web | server | all
:: ============================================================
setlocal enabledelayedexpansion

set TARGET=%1
if "%TARGET%"=="" (
    echo 用法: bin\build.bat ^<target^>
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
echo 全部构建任务完成。
exit /b 0

:BuildDesktop
echo.
echo ====== 打包桌面端 (Tauri) ======
echo.
echo   检查 Rust 环境...
where rustc >/dev/null 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [错误] Rust 未安装，请先运行 bin\setup-env.bat --desktop
    exit /b 1
)
rustup target list --installed 2>/dev/null | findstr /C:"x86_64-pc-windows" >/dev/null
if %ERRORLEVEL% NEQ 0 (
    echo   [错误] 未安装 Windows Rust 目标
    echo   安装: rustup target add x86_64-pc-windows-gnu
    exit /b 1
)
echo.
call pnpm build:desktop
if %ERRORLEVEL% NEQ 0 exit /b 1
echo.
echo 打包完成
echo   产物目录: apps\desktop\src-tauri\target\release\bundle\
exit /b 0

:BuildMobileAndroid
echo.
echo ====== 打包移动端 Android ======
echo.
where javac >/dev/null 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [错误] JDK 未安装
    exit /b 1
)
call pnpm build:mobile:android
if %ERRORLEVEL% NEQ 0 exit /b 1
echo.
echo 打包完成
echo   APK: apps\mobile\android\app\build\outputs\apk\
exit /b 0

:BuildMobileIos
echo.
echo ====== 打包移动端 iOS ======
echo.
echo   [错误] iOS 构建需要 macOS + Xcode，Windows 下不支持
exit /b 1

:BuildWeb
echo.
echo ====== 打包 Web 端 ======
echo.
call pnpm build:web
if %ERRORLEVEL% NEQ 0 exit /b 1
echo.
echo 打包完成
echo   静态文件: apps\web\dist\
exit /b 0

:BuildServer
echo.
echo ====== 打包服务端 ======
echo.
cd /d "%ROOT_DIR%\apps\server"
call pnpm build
if %ERRORLEVEL% NEQ 0 exit /b 1
echo.
echo 打包完成
echo   产物目录: apps\server\dist\
exit /b 0
