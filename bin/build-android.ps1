﻿﻿# === Yan-Zhi Android Build Script (Windows) ===
# 用法: powershell -ExecutionPolicy Bypass -File bin\build-android.ps1 [-Release]
# 需要: JDK 17+（已检测）。Android SDK 缺失时自动下载 command-line tools 并安装最小组件。
# 产物: dist-release\*.apk（由 copy-apk.cjs 拷入）

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot\..").Path
$Mobile = Join-Path $Root "apps\mobile"
$DistRelease = Join-Path $Root "dist-release"

$BuildRelease = $args -contains "-Release"

function Write-Step($msg) { Write-Host "`n====== $msg ======`n" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "  [ERROR] $msg" -ForegroundColor Red }

# 1. 检查 JDK
Write-Step "检查 JDK"
$javaHome = $env:JAVA_HOME
if (-not $javaHome -or -not (Test-Path $javaHome)) {
    $javac = Get-Command javac -ErrorAction SilentlyContinue
    if ($javac) { $javaHome = Split-Path (Split-Path $javac.Source) }
}
if (-not $javaHome -or -not (Test-Path (Join-Path $javaHome "bin\javac.exe"))) {
    Write-Err "未找到 JDK 17+。请安装 JDK 并设置 JAVA_HOME。"
    Write-Host "  下载: https://learn.microsoft.com/java/openjdk/"
    exit 1
}
$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"
$ver = (& java -version 2>&1 | Select-Object -First 1)
Write-Ok "JDK: $ver  ($javaHome)"

# 2. 定位/安装 Android SDK
Write-Step "检查 Android SDK"
$sdkCandidates = @(
    $env:ANDROID_HOME, $env:ANDROID_SDK_ROOT,
    "$env:LOCALAPPDATA\Android\Sdk",
    "C:\Android\Sdk"
) | Where-Object { $_ -and $_.Trim() }
$sdk = $null
foreach ($c in $sdkCandidates) { if (Test-Path (Join-Path $c "platform-tools")) { $sdk = $c; break } }

if (-not $sdk) {
    $sdk = "$env:LOCALAPPDATA\Android\Sdk"
    Write-Host "  SDK 未找到，将安装到: $sdk" -ForegroundColor Yellow
    $cmdlineToolsDir = Join-Path $sdk "cmdline-tools\latest"
    if (-not (Test-Path $cmdlineToolsDir)) {
        New-Item -ItemType Directory -Force -Path $cmdlineToolsDir | Out-Null
        $zipUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
        $zip = Join-Path $env:TEMP "cmdline-tools.zip"
        Write-Host "  下载 command-line tools..."
        try {
            Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
        } catch {
            Write-Err "下载失败: $zipUrl"
            Write-Host "  请手动安装 Android Studio 或 command-line tools:`n  https://developer.android.com/studio#command-line-tools-only"
            exit 1
        }
        Write-Host "  解压..."
        $tmpExtract = Join-Path $env:TEMP "cmdline-tools-extract"
        if (Test-Path $tmpExtract) { Remove-Item $tmpExtract -Recurse -Force }
        Expand-Archive -Path $zip -DestinationPath $tmpExtract -Force
        # 压缩包内顶层是 cmdline-tools/，把它移到 sdk\cmdline-tools\latest
        $inner = Join-Path $tmpExtract "cmdline-tools"
        if (Test-Path $inner) {
            Copy-Item -Path "$inner\*" -Destination $cmdlineToolsDir -Recurse -Force
        } else {
            Copy-Item -Path "$tmpExtract\*" -Destination $cmdlineToolsDir -Recurse -Force
        }
        Remove-Item $zip -Force -ErrorAction SilentlyContinue
        Remove-Item $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue
    }
    $sdkmanager = Join-Path $cmdlineToolsDir "bin\sdkmanager.bat"
    if (-not (Test-Path $sdkmanager)) {
        Write-Err "sdkmanager 未找到: $sdkmanager"
        exit 1
    }
    $env:ANDROID_HOME = $sdk
    $env:ANDROID_SDK_ROOT = $sdk
    Write-Host "  安装 platform-tools / platforms;android-34 / build-tools;34.0.0 ..."
    # 接受 license：yes 管道
    $components = "platform-tools", "platforms;android-34", "build-tools;34.0.0"
    $yes = "y`n" * 20
    foreach ($comp in $components) {
        Write-Host "    -> $comp"
        $yes | & $sdkmanager --sdk_root="$sdk" "install" $comp 2>&1 | Out-Host
    }
    if (-not (Test-Path (Join-Path $sdk "platform-tools"))) {
        Write-Err "SDK 组件安装失败。请手动用 Android Studio 安装。"
        exit 1
    }
    Write-Ok "Android SDK 安装完成: $sdk"
} else {
    Write-Ok "Android SDK: $sdk"
}
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk

# 3. 构建 Mobile
Write-Step "构建 Android APK (Capacitor)"
Push-Location $Mobile

# 首次需 cap add android
if (-not (Test-Path "android")) {
    Write-Host "  首次初始化: cap add android"
    & pnpm exec cap add android 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { Write-Err "cap add android 失败"; Pop-Location; exit 1 }
}

if ($BuildRelease) {
    Write-Host "  Release 构建（需签名配置）..."
    & pnpm exec cap sync android 2>&1 | Out-Host
    & pnpm exec cap build android --release 2>&1 | Out-Host
} else {
    & pnpm build:android 2>&1 | Out-Host
}
$buildOk = $LASTEXITCODE -eq 0
Pop-Location

if (-not $buildOk) { Write-Err "构建失败"; exit 1 }

# 4. 确认产物
Write-Step "产物"
if (Test-Path $DistRelease) {
    $apks = Get-ChildItem (Join-Path $DistRelease "*.apk") -ErrorAction SilentlyContinue
    if ($apks) {
        foreach ($a in $apks) {
            $sizeMB = [math]::Round($a.Length / 1MB, 1)
            Write-Ok "$($a.Name)  ($sizeMB MB)"
        }
        Write-Host "`n  输出目录: $DistRelease" -ForegroundColor Green
    } else {
        Write-Err "dist-release 下未找到 APK，检查 apps\mobile\android\app\build\outputs\apk\"
        exit 1
    }
} else {
    Write-Err "dist-release 目录不存在"
    exit 1
}

Write-Host "`n完成。" -ForegroundColor Green