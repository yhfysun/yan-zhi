# === Yan-Zhi Android Build Script (Windows) ===
# 用法: powershell -ExecutionPolicy Bypass -File bin\build-android.ps1 [-Release]
#
# ★★ 组件版本**不在这里写死**。旧版固定装 android-34 / build-tools;34.0.0，
#    而 Cap 8.5.2 模板实测是 compileSdk 36（AGP 8.13.0），装了也编不过 ——
#    现在改成「先 cap add 生成工程，再从 variables.gradle 读真实版本」，
#    与 CI（.github/workflows/build-mobile.yml）同一个口径。
# ★★ NDK 必须装。@capawesome/capacitor-nodejs 有 CMakeLists + externalNativeBuild，
#    是真的编译 native；AGP 8.13 的默认 NDK 是 27.0.12077973。
# ★★ JDK 必须 21+。该插件的 build.gradle 写死 sourceCompatibility VERSION_21，
#    旧版只查「PATH 上有 javac」就放行，于是拿到 jdk-17 → 编译期直接失败。
# ★★ 新版 cmdline-tools（23.x）的 sdkmanager 已是空壳转发 `android sdk`，
#    不再认 `platforms;android-36` 这种分号写法（会报 Package 未找到、静默不装）。
#    下面按「有 android.exe 走新语法，否则走旧 sdkmanager」分流。

# ★ 不能设 Stop：java -version / gradle 都往 stderr 写内容，在 Stop 策略下会被包装成
#   NativeCommandError 直接终止脚本（实测第一步探测 JDK 就挂）。关键步骤一律显式查
#   $LASTEXITCODE / Test-Path，失败时自己 Write-Err + exit 1，不依赖异常传播。
$ErrorActionPreference = "Continue"
$Root = (Resolve-Path "$PSScriptRoot\..").Path
$Mobile = Join-Path $Root "apps\mobile"
$DistRelease = Join-Path $Root "dist-release"
$NdkVersion = "27.0.12077973"

$BuildRelease = $args -contains "-Release"

function Write-Step($msg) { Write-Host "`n====== $msg ======`n" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  [ERROR] $msg" -ForegroundColor Red }

# ★ 参数不能叫 $home：PowerShell 的 $HOME 是只读常量，绑定即报
#   "Cannot overwrite variable home because it is read-only or constant"。
function Test-JdkHome([string]$jdkHome) {
    return [bool]($jdkHome -and (Test-Path (Join-Path $jdkHome "bin\javac.exe")))
}

function Get-JdkMajor([string]$jdkHome) {
    $line = & (Join-Path $jdkHome "bin\java.exe") -version 2>&1 | Select-Object -First 1
    if ("$line" -match '"(?:1\.)?(\d+)') { return [int]$matches[1] }
    return 0
}

# ── 1. 检查 JDK（要求 21+）──
Write-Step "检查 JDK (>=21)"
$jdkCandidates = @()
if ($env:JAVA_HOME) { $jdkCandidates += $env:JAVA_HOME }
# 项目约定的 JDK 落点：C:\APP\Java\jdk-21*（本机实际目录名是 jdk-21，不是 CI 那种带小版本号的长名）
foreach ($jdkRoot in @("C:\APP\Java")) {
    if (Test-Path $jdkRoot) {
        $jdkCandidates += Get-ChildItem $jdkRoot -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^jdk-?2[1-9]' } |
            Sort-Object Name -Descending |
            ForEach-Object { $_.FullName }
    }
}
$javacCmd = Get-Command javac -ErrorAction SilentlyContinue
if ($javacCmd) { $jdkCandidates += (Split-Path (Split-Path $javacCmd.Source)) }

$javaHome = $null
foreach ($c in ($jdkCandidates | Where-Object { $_ } | Select-Object -Unique)) {
    if (-not (Test-JdkHome $c)) { continue }
    $major = Get-JdkMajor $c
    if ($major -ge 21) { $javaHome = $c; Write-Ok "JDK $major : $c"; break }
    Write-Warn2 "跳过 JDK $major（需 21+）: $c"
}
if (-not $javaHome) {
    Write-Err "未找到 JDK 21+（Capacitor 8 的 nodejs 插件按 Java 21 编译）。"
    Write-Host "  下载: https://learn.microsoft.com/java/openjdk/"
    exit 1
}
$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"

# ── 2. 定位 Android SDK（缺失才下载 command-line tools）──
Write-Step "检查 Android SDK"
$sdkCandidates = @(
    $env:ANDROID_HOME, $env:ANDROID_SDK_ROOT,
    "$env:LOCALAPPDATA\Android\Sdk",
    "C:\Android\Sdk"
) | Where-Object { $_ -and $_.Trim() }
$sdk = $null
foreach ($c in $sdkCandidates) { if (Test-Path (Join-Path $c "platform-tools")) { $sdk = $c; break } }
if (-not $sdk) {
    # 有目录但没 platform-tools 的也算候选落点（只缺组件，不必重下 cmdline-tools）
    foreach ($c in $sdkCandidates) { if (Test-Path $c) { $sdk = $c; break } }
}
if (-not $sdk) { $sdk = "$env:LOCALAPPDATA\Android\Sdk" }

$cmdlineBin = Join-Path $sdk "cmdline-tools\latest\bin"
$androidCli = Join-Path $cmdlineBin "android.exe"
$sdkManager = Join-Path $cmdlineBin "sdkmanager.bat"

if (-not (Test-Path $androidCli) -and -not (Test-Path $sdkManager)) {
    Write-Host "  SDK 未找到，将安装到: $sdk" -ForegroundColor Yellow
    $cmdlineToolsDir = Join-Path $sdk "cmdline-tools\latest"
    New-Item -ItemType Directory -Force -Path $cmdlineToolsDir | Out-Null
    # 11076708 是 2024 年的旧包，只认分号写法且可能不认识 android-36；用当前版本。
    $zipUrl = "https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip"
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

$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
Write-Ok "Android SDK: $sdk"

# 分包安装。新 CLI 用 a/b 形式，旧 sdkmanager 用 a;b 形式。
function Install-SdkPackages([string]$SdkPath, [string[]]$Packages) {
    $binDir = Join-Path $SdkPath "cmdline-tools\latest\bin"
    $cli = Join-Path $binDir "android.exe"
    $mgr = Join-Path $binDir "sdkmanager.bat"
    if (Test-Path $cli) {
        $slash = $Packages | ForEach-Object { $_ -replace ';', '/' }
        & $cli "--sdk=$SdkPath" sdk install @slash 2>&1 | Out-Host
        return ($LASTEXITCODE -eq 0)
    }
    if (Test-Path $mgr) {
        $yes = "y`n" * 20
        foreach ($p in $Packages) {
            Write-Host "    -> $p"
            $yes | & $mgr "--sdk_root=$SdkPath" install $p 2>&1 | Out-Host
        }
        return ($LASTEXITCODE -eq 0)
    }
    Write-Err "既没有 android CLI 也没有 sdkmanager: $binDir"
    return $false
}

# platform-tools 先装：scripts/package.cjs 的前置检查就认这一个判据
if (-not (Test-Path (Join-Path $sdk "platform-tools"))) {
    Write-Host "  安装 platform-tools..."
    [void](Install-SdkPackages $sdk @("platform-tools"))
}
if (-not (Test-Path (Join-Path $sdk "platform-tools"))) {
    Write-Err "platform-tools 安装失败。请手动用 Android Studio 安装。"
    exit 1
}

# ── 3. 生成 Android 原生工程（版本号来自这一步产出的 variables.gradle）──
Write-Step "生成 Android 工程"
Push-Location $Mobile
try {
    if (-not (Test-Path "android")) {
        Write-Host "  首次初始化: cap add android"
        # ★ 不要预建空的 dist：cap 判定「webDir 存在但没有 index.html」会直接失败，
        #   webDir 不存在时只告警。空目录反而把告警变成错误。
        & node "node_modules/@capacitor/cli/bin/capacitor" add android 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { Write-Err "cap add android 失败"; exit 1 }
    } else {
        Write-Ok "已存在 android/ 工程"
    }

    # ── 4. 按工程真实版本补装 SDK 组件 ──
    Write-Step "安装 SDK 组件（按 variables.gradle）"
    $gradleVars = Join-Path (Get-Location) "android\variables.gradle"
    if (-not (Test-Path $gradleVars)) {
        Write-Err "未找到 variables.gradle: $gradleVars"
        exit 1
    }
    $raw = Get-Content $gradleVars -Raw
    $compileSdk = 36
    if ($raw -match 'compileSdkVersion\s*=\s*(\d+)') { $compileSdk = [int]$matches[1] }
    else { Write-Warn2 "variables.gradle 里读不到 compileSdkVersion，按 36 兜底" }
    Write-Ok "compileSdk = $compileSdk"

    $wantPlatform = "platforms\android-$compileSdk"
    $wantBuildTools = "build-tools\$compileSdk.0.0"
    $wantNdk = "ndk\$NdkVersion"

    $missing = @()
    if (-not (Test-Path (Join-Path $sdk $wantPlatform))) { $missing += "platforms;android-$compileSdk" }
    if (-not (Test-Path (Join-Path $sdk $wantBuildTools))) { $missing += "build-tools;$compileSdk.0.0" }
    if (-not (Test-Path (Join-Path $sdk $wantNdk))) { $missing += "ndk;$NdkVersion" }

    if ($missing.Count -gt 0) {
        Write-Host "  缺失组件: $($missing -join ', ')"
        if (-not (Install-SdkPackages $sdk $missing)) { Write-Warn2 "安装命令返回非 0，下面按目录复核" }
    }

    $stillMissing = @()
    if (-not (Test-Path (Join-Path $sdk $wantPlatform))) { $stillMissing += $wantPlatform }
    if (-not (Test-Path (Join-Path $sdk $wantBuildTools))) { $stillMissing += $wantBuildTools }
    if (-not (Test-Path (Join-Path $sdk $wantNdk))) { $stillMissing += $wantNdk }
    if ($stillMissing.Count -gt 0) {
        Write-Err "SDK 组件仍缺失: $($stillMissing -join ', ')"
        Write-Host "  请手动用 Android Studio 的 SDK Manager 安装，或执行："
        Write-Host "  $sdkManager --sdk_root=`"$sdk`" `"platforms;android-$compileSdk`" `"build-tools;$compileSdk.0.0`" `"ndk;$NdkVersion`""
        exit 1
    }
    Write-Ok "SDK 组件齐备"

    # ── 5. 构建 ──
    Write-Step "构建 Android APK (Capacitor)"
    if ($BuildRelease) {
        Write-Host "  Release 构建（需签名配置）..."
        & pnpm exec cap sync android 2>&1 | Out-Host
        & pnpm exec cap build android --release 2>&1 | Out-Host
    } else {
        & pnpm build:android 2>&1 | Out-Host
    }
    if ($LASTEXITCODE -ne 0) { Write-Err "构建失败"; exit 1 }
} finally {
    Pop-Location
}

# ── 6. 确认产物 ──
Write-Step "产物"
if (Test-Path $DistRelease) {
    $apks = Get-ChildItem (Join-Path $DistRelease "*.apk") -Recurse -ErrorAction SilentlyContinue
    if ($apks) {
        foreach ($a in $apks) {
            $sizeMB = [math]::Round($a.Length / 1MB, 1)
            Write-Ok "$($a.Name)  ($sizeMB MB)  $($a.FullName)"
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
