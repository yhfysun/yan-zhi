# bin/ — 开发环境与打包脚本

本目录包含「言智 (Yan-Zhi)」研发过程中所用到的开发环境检测、搭建指引和打包构建脚本。

## 脚本说明

每个功能提供两套脚本 — `.sh`（Bash：Git Bash / MSYS2 / WSL / Linux / macOS）和 `.bat`（Windows CMD / PowerShell 直接运行）：

| 功能 | .sh (Bash) | .bat (Windows CMD) |
|------|------------|-------------------|
| 环境检测 | `check-env.sh` | `check-env.bat` |
| 搭建指引 | `setup-env.sh` | `setup-env.bat` |
| 打包构建 | `build.sh` | `build.bat` |

### Windows 用户

优先使用 `.bat`，双击或在 CMD/PowerShell 中直接运行：

```cmd
bin\check-env.bat              REM 环境检测
bin\setup-env.bat              REM 搭建指引
bin\build.bat desktop          REM 打包桌面端
```

如果安装了 Git for Windows，也可以在 Git Bash 中使用 `.sh` 脚本。

### macOS / Linux 用户

使用 `.sh` 脚本即可：

```bash
bash bin/check-env.sh
bash bin/setup-env.sh
bash bin/build.sh web
```

### check-env — 环境检测

运行后自动扫描并给出 PASS / WARN / MISS 结果：

- **基础**：Node.js (>=20)、pnpm (>=9)、Git、Python 3
- **桌面端**：Rust 工具链、Windows 目标、MinGW-w64、Visual Studio
- **移动端**：JDK、Android SDK、Xcode / CocoaPods (macOS)
- **项目**：node_modules 状态

**.sh 参数：**

```bash
bash bin/check-env.sh              # 全量检测
bash bin/check-env.sh --quick      # 仅基础环境
bash bin/check-env.sh --desktop    # 基础 + 桌面端
bash bin/check-env.sh --mobile     # 基础 + 移动端
bash bin/check-env.sh --web        # 仅基础
bash bin/check-env.sh --server     # 仅基础
```

**.bat 参数：**

```cmd
bin\check-env.bat                  REM 全量检测
bin\check-env.bat --quick          REM 仅基础
bin\check-env.bat --desktop        REM 基础 + 桌面端
bin\check-env.bat --mobile         REM 基础 + 移动端
```

当检测到必要工具缺失时，脚本会提示运行 `setup-env`。

### setup-env — 环境搭建指引

根据指定的目标平台输出分步安装指令和下载链接，不自动安装。

**.sh 参数：**

```bash
bash bin/setup-env.sh              # 所有平台
bash bin/setup-env.sh --desktop    # 仅桌面端 (Tauri/Rust)
bash bin/setup-env.sh --mobile     # 仅移动端 (Capacitor)
```

**.bat 参数：**

```cmd
bin\setup-env.bat                  REM 所有平台
bin\setup-env.bat --desktop        REM 仅桌面端
bin\setup-env.bat --mobile         REM 仅移动端
```

### build — 统一打包构建

打包前自动检查关键依赖，失败时给出明确错误信息，然后调用 `pnpm build:*`。

**.sh 参数：**

```bash
bash bin/build.sh desktop         # 桌面端 (Tauri -> .exe/.msi)
bash bin/build.sh mobile:android  # Android APK
bash bin/build.sh mobile:ios      # iOS IPA (需 macOS)
bash bin/build.sh web             # Web 端 -> apps/web/dist/
bash bin/build.sh server          # 服务端 -> apps/server/dist/
bash bin/build.sh all             # server -> web -> desktop 依次
```

**.bat 参数：**

```cmd
bin\build.bat desktop             REM 桌面端
bin\build.bat mobile:android      REM Android APK
bin\build.bat web                 REM Web 端
bin\build.bat server              REM 服务端
bin\build.bat all                 REM 全量打包
```

## 项目各端构建产物位置

| 端            | 产物路径 |
|---------------|---------|
| 桌面端 (Tauri) | `apps/desktop/src-tauri/target/release/bundle/` |
| Web 端         | `apps/web/dist/` |
| 服务端         | `apps/server/dist/` |
| Android       | `apps/mobile/android/app/build/outputs/apk/` |
| iOS           | Xcode Archive（通过 Xcode 打开 `apps/mobile/ios/App` 导出） |

## 各端打包前提

### 桌面端 (Tauri)

- Rust 工具链（MSVC 或 GNU），`rust-version = "1.70"`
- Windows 目标：`x86_64-pc-windows-msvc` 或 `x86_64-pc-windows-gnu`
- GNU 工具链 -> MinGW-w64；MSVC 工具链 -> Visual Studio Build Tools 2022
- 安装包会引导用户安装 WebView2 Runtime（若缺失）

### 移动端 (Capacitor)

- Android：JDK 17 + Android SDK Platform 34+ + `ANDROID_HOME`
- iOS：macOS + Xcode 15+ + CocoaPods

### Web / 服务端

- 仅需基础环境（Node.js 20+、pnpm 9+）

## 完整流程示例

**Windows (CMD/PowerShell)：**

```cmd
:: 1. 首次克隆项目后
bin\check-env.bat
bin\setup-env.bat

:: 2. 安装依赖
pnpm install

:: 3. 开发
pnpm dev                REM 后端 (http://localhost:3001)
pnpm dev:web            REM Web 端 (http://localhost:5176)

:: 4. 打包
bin\build.bat web
bin\build.bat desktop
```

**Git Bash / macOS / Linux：**

```bash
# 1. 首次克隆项目后
bash bin/check-env.sh
bash bin/setup-env.sh

# 2. 安装依赖
pnpm install

# 3. 开发
pnpm dev                 # 后端
pnpm dev:web             # Web 端

# 4. 打包
bash bin/build.sh web
bash bin/build.sh desktop
```

## 项目环境依赖速查

| 目标 | Node | pnpm | Rust | Java/GCC | 其他 |
|------|------|------|------|----------|------|
| Web 端 | >=20 | >=9 | -- | -- | -- |
| 服务端 | >=20 | >=9 | -- | Python 3 (node-gyp) | -- |
| 桌面端 | >=20 | >=9 | >=1.70 | MinGW-w64 或 VS Build Tools | WebView2 |
| Android | >=20 | >=9 | -- | JDK 17 + Android SDK | Capacitor CLI |
| iOS | >=20 | >=9 | -- | Xcode 15+ | CocoaPods |
