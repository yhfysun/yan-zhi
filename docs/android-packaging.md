# 安卓 APK 打包注意事项（换机器照这个走）

> 2026-10-26 首次在本机打通安卓打包时踩的全部坑。每条都写了「为什么」，换机器/重建工程后按顺序核对即可。
>
> 入口命令：`node scripts/package.cjs android`（产物 `dist-release/android/<版本>/app-debug.apk`）

---

## 一、环境前置（缺一项就打不出包）

| 项 | 要求 | 为什么 |
|---|---|---|
| JDK | **21+** | Capacitor 8 的 `@capawesome/capacitor-nodejs` 在 `build.gradle` 里写死 `sourceCompatibility VERSION_21`；用 17 会在 gradle 编译期失败，报错还跟 JDK 无关 |
| Android SDK | `platform-tools` + `platforms;android-36` + `build-tools;36.0.0` + `ndk;27.0.12077973` | 版本**不能写死猜**：从 `cap add android` 生成的 `variables.gradle` 里读 `compileSdkVersion`（当前 36）；NDK 是 AGP 8.13 默认版本，`capacitor-nodejs` 有 CMake 真编 native |
| Node | ≥ 20 | `package.cjs` 前置检查 |
| pnpm | 与 `package.json` 的 `packageManager` 一致（当前 11.20.0） | 版本不一致时 pnpm 每次跑脚本前都想 purge `node_modules`，非交互下直接中止 |

### 装 SDK（Windows，无 Android Studio）

```bash
# 下载 command-line tools（当前版本 16111833）
curl -L -o cmdline-tools.zip https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip
# 解压到 %LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\
# 装组件（新 CLI 用斜杠，不接受旧的分号写法）
android.exe --sdk=%LOCALAPPDATA%\Android\Sdk sdk install platform-tools platforms/android-36 build-tools/36.0.0 ndk/27.0.12077973
```

装到 `%LOCALAPPDATA%\Android\Sdk` 即可，`package.cjs` 会自动识别，不需要设 `ANDROID_HOME`。

> ⚠️ 新版 cmdline-tools 的 `sdkmanager` 已退化成转发壳：`platforms;android-36` 这种旧写法会被**静默忽略**（只报 Package 未找到，退出码仍是 0）。要用 `android sdk install platforms/android-36`。

---

## 二、国内网络（两处会卡）

1. **gradle 发行包**：`services.gradle.org` 会 307 跳到 `github.com/gradle/gradle-distributions`，国内直连 GitHub 不通 → 报 `Downloading ... failed: timeout`。
   `package.cjs` 的 `ensureGradleWrapper()` 会探测一次，不通就自动把 `distributionUrl` 换成腾讯镜像，并把 `networkTimeout` 提到 120s。
2. **electron 二进制**：`electron` 的 postinstall 从 GitHub 下载。`.npmrc` 里的 `electron_mirror=https://npmmirror.com/mirrors/electron/` 生效需要走 `pnpm rebuild electron`；手工兜底：
   ```bash
   ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node node_modules/.pnpm/electron@*/node_modules/electron/install.js
   ```

---

## 三、pnpm 11 的 allowBuilds（重装依赖后必查）

pnpm 10+ **默认不执行依赖的安装脚本**，清单在 `pnpm-workspace.yaml` 的 `allowBuilds`。漏掉的后果很隐蔽：

| 包 | 漏了会怎样 |
|---|---|
| `electron` | `pnpm dev` 报「未找到 Electron 二进制」（包在，`dist/` 是空的） |
| `better-sqlite3` | 安装期 `ERR_PNPM_IGNORED_BUILDS` 退出 1；实际运行靠包内 `prebuilds/` 的 N-API 二进制，仍可用 |
| `esbuild` / `ssh2` / `cpu-features` 等 | 原生模块功能缺失 |

> pnpm 可能自己在 yaml 里写一行占位符 `包名: set this to true or false`，改成 `包名: true` 再 `pnpm install` 一次。

---

## 四、构建链路顺序（`package.cjs` 的 buildAndroid）

```
⓪ 首次 cap add android（仅当 android/ 不存在）
⓪.5 gradle wrapper 换源
①  gen-android-icons（写入 android/app/src/main/res）
②  vite build（生成 dist，含 index.html）
②.5 apply-native-sms.cjs
②.6 apply-native-permissions.cjs   ← 明文流量 + CAMERA
③  编译 server/dist + build-mobile-server.cjs（内嵌 node 后端）
④  cap sync android
⑤  gradle assembleDebug（Windows 走 C:\yz junction 短路径）
⑥  拷 APK → dist-release/android/<版本>/
```

几条不能动顺序的原因：

- **不要预建空的 `apps/mobile/dist`**。cap 的判据是「webDir 存在就必须有 index.html，否则抛错」；webDir 不存在时只告警。空目录反而把告警变成失败。
- **原生补丁必须在 `cap sync` 之前**：sync 会重铺 `android/` 下的生成文件。
- **`android/` 是 cap 生成目录且被 gitignore**：任何手改都会在重建后丢失，所以补丁必须写在脚本里（`apps/mobile/scripts/apply-native-*.cjs`），不要直接改生成物。

---

## 五、两个「看起来数据丢了」的经典症状

### 症状 A：列表全空、界面停在骨架屏

**根因**：WebView 起源是 `https://localhost`，页面要访问内嵌后端 `http://127.0.0.1:3001`。targetSdk 36 下 Android 默认**禁止明文 HTTP**，请求被 `ERR_CLEARTEXT_NOT_PERMITTED` 拦掉 → WebView 里 `fetch` 直接 `Failed to fetch` → 骨架屏永远不消失。

**核对**：

```bash
# 清单里必须有这两项
grep -E "usesCleartextTraffic|permission.CAMERA" apps/mobile/android/app/src/main/AndroidManifest.xml
```

**修**：`apps/mobile/scripts/apply-native-permissions.cjs`（幂等）负责补 `android:usesCleartextTraffic="true"` + `CAMERA` + `uses-feature camera required=false`。
**注意**：这个脚本早就存在，但 `package.cjs` 的链路曾经**没调用它**（只有 `apps/mobile` 自己的 `build:android` 调）。现在已在 `②.6` 补上。

> 为什么不用 HTTPS：后端是手机进程内的 node-mobile，只监听回环，流量不出设备。上自签名证书需要配 CA 白名单 + 证书轮换，收益极低。真正要加密的是落盘数据，不是回环传输。

### 症状 B：手机日志 `SQLite 文件不存在: .../data.db`

**根因**：移动端 better-sqlite3 的 ABI 与 nodejs-mobile 不匹配，实际跑的是 sql.js（WASM 内存库）。内存库落盘有 250ms 防抖 + 5s 周期兜底，**进程刚起来时 `data.db` 还没生成**，而 `connector.ts` 用 `fs.existsSync` 判断存在性 → 把「尚未落盘」误判成「文件不存在」→ 内置本体（ontology）每次启动都生成失败。

**修**：`sqlite-driver.ts` 导出 `flushSqliteInstances()`，`connector.ts` 在判断前先刷一次盘。桌面用 better-sqlite3（文件库）永远复现不出来。

---

## 六、真机验证方法

```bash
ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe

# 1) 无线调试：首次需在手机「无线调试 → 使用配对码配对」里拿码
adb pair <手机IP>:<配对端口> <6位码>
adb mdns services                       # 找 _adb-tls-connect._tcp 的地址
adb connect <手机IP>:<端口>
adb devices -l

# 2) 装包
adb install -r -t dist-release/android/<版本>/app-debug.apk

# 3) 看内嵌后端日志（只认这个 tag，系统日志会刷屏）
adb logcat -s NodejsPlugin

# 4) 直接问后端（把手机 3001 转发到本机）
adb forward tcp:3001 tcp:3001
curl http://127.0.0.1:3001/api/agents
curl http://127.0.0.1:3001/api/platforms

# 5) 查 WebView 内部（debug 包含 devtools）
adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
curl http://127.0.0.1:9222/json/list
# 之后可用 CDP 的 Runtime.evaluate 在页面里跑 fetch 验证连通性
```

**判读要点**：

- `后端已启动: http://127.0.0.1:3001` = 后端起来了；没有这行就是启动失败（外层 try/catch 故意不 exit，防闪退，所以 App 壳仍能打开）。
- 后端起来了但界面空 → 查 WebView 侧（明文流量 / CORS / 请求卡住），而不是查数据。
- `[ontology] [ensureBuiltin] ds=言智项目库 tables=N` = 本体生成正常。

---

## 七、版本与产物

- APK 路径：`dist-release/android/<版本>/app-debug.apk`
- 包体积参考：约 184–186 MB，其中 `libnode.so` 三个 ABI 约占 151 MB（armeabi-v7a / arm64-v8a / x86_64 各一份）。
  想减体积：只保留 `arm64-v8a`（现代手机基本都支持），能降到 ~90 MB。
- 全新安装的平台列表本来就是空的（内置的是「厂商目录 preset」，不是已配置平台），需要用户自己选一个厂商或填 Key。
