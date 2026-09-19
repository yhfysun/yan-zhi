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
- **桌面端**：Python 3、Visual Studio Build Tools 2022（用于编译 better-sqlite3 / sqlite-vec 原生模块）
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
  bash bin/setup-env.sh --desktop    # 仅桌面端 (Electron)
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

**桌面端版本档**：`lite`（阉割版，仅办公）/ `basic`（基础版）/ `pro`（高级版）。
`desktop` 与 `desktop:all` 等价，**一次打出三档包，产物统一落在 `dist-release/`**，
靠文件名后缀区分（`-lite` / `-basic` / `-pro`）。

> 三档会各跑一次 electron-builder（约 3 分钟/档），不是「编一次复用三个壳」——
> 因为 `edition.json` 是**打进 app.asar 内部**的，档位属编译期固化。
> 详情见 `apps/desktop/scripts/build-all-editions.cjs` 头部注释。

**.sh 参数：**

```bash
bash bin/build.sh desktop         # 桌面端三档全出 (lite + basic + pro)
bash bin/build.sh desktop:all     # 同上（显式）
bash bin/build.sh desktop:lite    # 只出阉割版
bash bin/build.sh desktop:basic   # 只出基础版
bash bin/build.sh desktop:pro     # 只出高级版
bash bin/build.sh desktop:full    # 同 desktop:basic（历史命令，保留兼容）
bash bin/build.sh mobile:android  # Android APK
bash bin/build.sh mobile:ios      # iOS IPA (需 macOS)
bash bin/build.sh web             # Web 端 -> apps/web/dist/
bash bin/build.sh server          # 服务端 -> apps/server/dist/
bash bin/build.sh all             # server -> web -> desktop:all 依次
```

**.bat 参数：**

```cmd
bin\build.bat desktop             REM 桌面端三档全出
bin\build.bat desktop:all         REM 同上（显式）
bin\build.bat desktop:lite        REM 只出阉割版
bin\build.bat desktop:basic       REM 只出基础版
bin\build.bat desktop:pro         REM 只出高级版
bin\build.bat desktop:full        REM 同 desktop:basic（历史命令，保留兼容）
bin\build.bat mobile:android      REM Android APK
bin\build.bat web                 REM Web 端
bin\build.bat server              REM 服务端
bin\build.bat all                 REM 全量打包 (server -> web -> desktop:all)
```

**输出目录散落怎么办**：默认所有桌面端产物都在 `dist-release/`。
若该目录里的 `win-unpacked` 被残留进程 / 杀软扫描占用导致无法清理，
脚本会**明确报错并给出处置步骤**（不会自动改到别的目录）。
此时可换目录或改成逐档独立目录：

```bash
# 换统一输出目录
YZ_ALL_OUT_DIR=dist-release-new pnpm build:desktop:all

# 每档独立目录（dist-release-lite/ basic/ pro/）
node apps/desktop/scripts/build-all-editions.cjs --separate
```

## 项目各端构建产物位置

| 端                  | 产物路径 |
|---------------------|---------|
| 桌面端 (Electron)    | `dist-release/`（安装包名带档位后缀 `-lite` / `-basic` / `-pro`，另含免安装版 `win-unpacked/`） |
| Web 端              | `apps/web/dist/` |
| 服务端              | `apps/server/dist/` |
| Android            | `apps/mobile/android/app/build/outputs/apk/` |
| iOS                | Xcode Archive（通过 Xcode 打开 `apps/mobile/ios/App` 导出） |

## 各端打包前提

### 桌面端 (Electron)

- Node.js 20+、pnpm 9+
- Python 3 + Visual Studio Build Tools 2022（用于编译 better-sqlite3 / sqlite-vec 原生模块；`postinstall` 会按 Electron ABI 自动 rebuild）
- 内置模型引擎已改为 **Ollama**，打包不再下载 qwen / llama-server
- 可选：内置 Python 运行时（`apps/desktop/resources/python`，由 `node scripts/build-python-runtime.mjs` 生成，
  体积大、不入库）。**缺失不影响出包**，但成品会回退系统 python 且随包 Python 脚本缺失
- Electron 自带运行时，无需用户额外安装 WebView2

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

| 目标 | Node | pnpm | Java/GCC | 其他 |
|------|------|------|----------|------|
| Web 端 | >=20 | >=9 | -- | -- |
| 服务端 | >=20 | >=9 | Python 3 (node-gyp) | -- |
| 桌面端 | >=20 | >=9 | VS Build Tools 2022 | Python 3 (原生模块编译) |
| Android | >=20 | >=9 | JDK 17 + Android SDK | Capacitor CLI |
| iOS | >=20 | >=9 | Xcode 15+ | CocoaPods |
