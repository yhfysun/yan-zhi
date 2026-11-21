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

### 症状 C：`libnode.so` 已在 APK 内，仍报 `UnsatisfiedLinkError`

**真实现场（2026-11-17，API 35 x86_64 模拟器）**：

```text
dlopen failed: library "libc++_shared.so" not found:
needed by .../base.apk!/lib/x86_64/libnode.so
at io.capawesome.capacitorjs.plugins.nodejs.Nodejs.<clinit>(Nodejs.java:43)
```

**根因**：`nodejs-mobile` 的 `libnode.so` 是动态链接，`llvm-readelf -d` 明确包含
`NEEDED libc++_shared.so`。只检查 `libnode.so` 是否存在不够；AGP 也不会因为
CMake 导入了预编译 `libnode.so` 就自动把 STL 运行库放进 APK。

**修**：`apply-native-nodejs-shortpath.cjs` 从 NDK 按 ABI 把 `libc++_shared.so`
铺到短路径工程的 `src/main/jniLibs/`；`copy-apk.cjs` 同时检查三个 ABI 的
`libc++_shared.so`，缺失直接拒绝产物。

**无真机时的最小复现/验收**：

```powershell
$sdk="$env:LOCALAPPDATA\Android\Sdk"
$adb="$sdk\platform-tools\adb.exe"

# 首次准备 API 35 x86_64 AVD
& "$sdk\cmdline-tools\latest\bin\android.exe" "--sdk=$sdk" sdk install `
  system-images/android-35/google_apis/x86_64
'no' | & "$sdk\cmdline-tools\latest\bin\avdmanager.bat" create avd `
  -n yanzhi-crash-api35 -k 'system-images;android-35;google_apis;x86_64' -d pixel_5 --force

# 启动并验证：进程必须存活、Activity 必须在前台、内嵌后端必须可访问
& "$sdk\emulator\emulator.exe" -avd yanzhi-crash-api35 -no-window -no-audio `
  -gpu swiftshader_indirect -no-snapshot
& $adb install -r -t dist-release/android/<版本>/app-debug.apk
& $adb shell am start -W -n com.yanzhi.mobile/.MainActivity
& $adb shell pidof com.yanzhi.mobile
& $adb forward tcp:3101 tcp:3001
Invoke-RestMethod http://127.0.0.1:3101/api/health
```

判据不是“窗口出现了”就算过：`pidof` 有值、`topResumedActivity` 是本应用、
`/api/health` 返回 `ok: true`，三项同时成立才算通过。

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
- **体积口径（2026-11-21 实测两条线）**：
  - `package:android`（标准发布口径：5 模式 office/ops/sec/shop/learning，双 ABI arm64-v8a + armeabi-v7a）≈ **279 MB**，构成：双 ABI 原生库 129 MB（libnode.so ×2 = 92 MB）+ 内嵌后端 133 MB + 五模式前端 62 MB。
  - 全 9 模式 + 三 ABI（含 x86_64，`libnode.so` ×3 = 151 MB）≈ 378 MB —— 模拟器/旧机器要装 x86_64 包时才需要。
  - **看到"才两百多 M"不是缺件**：按上面构成核对（关键件 = 两个 ABI 的 `libnode.so`、内嵌后端入口、2245 个前端 JS），`verify-package-artifacts.cjs` 结论 PASS 即可。想省体积只砍 x86_64，别砍 arm64。
- 全新安装的平台列表本来就是空的（内置的是「厂商目录 preset」，不是已配置平台），需要用户自己选一个厂商或填 Key。

---

## 八、⚠️ server/dist 复用陷阱：日志出现「新鲜，可复用（跳过编译）」= 包里可能是旧代码（2026-11-21 血泪）

**铁律**（见 AGENTS.md/项目记忆）：每次 APK 打包必须**从零重建 apps/server**，禁止复用上一次 dist。

**事故经过**：改完服务端（虚拟币行情）和前端（行情返回逐级）后连打两次包，第二次日志出现
`[OK] apps/server/dist 新鲜，可复用（跳过编译）`——打包链按 mtime 判定 dist "新鲜"就跳过了 server 重编译。
真机装上后启动动画/行为还是旧版（用户实报「启动动画又变成数据库初始化」「这是旧包啊，打包没有清理？」）。
前端 vite 是全新构建的，但**内嵌后端 dist 是旧的** → 新接口（如虚拟币）在真机上 404/不存在，且新旧混杂极难排查。

**为什么危险**：mtime 判据只看"dist 比源码新"，**改完源码先打过一次包、之后又改源码再打包**时，如果链路对"源码"的判定有遗漏（比如改动在 workspace 软链包里），就会带着旧 server 出包——校验脚本只验结构完整性，验不出"内容是不是最新"。

**修（打包前强制执行）**：

```powershell
# 打包前无脑全清（宁可多等一分钟编译，不赌 mtime 判据）
$root = 'c:\Users\Administrator\Desktop\github\yan-zhi-master'
@(
  "$root\apps\server\dist",
  "$root\apps\mobile\dist",
  "$root\apps\mobile\nodejs\dist",
  "$root\apps\mobile\android\app\src\main\assets\public",
  "$root\apps\mobile\android\app\build",
  "$root\dist-release\android\0.1.1"
) | ForEach-Object { if (Test-Path $_) { Remove-Item $_ -Recurse -Force } }
```

删完再跑 `pnpm package:android`，日志必须出现「**真编译 server（安卓前置）**」且**没有**「新鲜，可复用（跳过编译）」字样。

**长期修（待办）**：把 `package.cjs` / `build-android-slim.cjs` 里的"新鲜可复用"判断直接删掉，无条件真编译（铁律本来就要求）。

**产物指纹验证（证明包里是最新前端）**：ZIP 内条目时间戳被构建工具归一成 1981（不可用作新鲜度证据），改用**特征串**——在 `apps/mobile/dist/assets/News-*.js` 里 grep 一个"只有最新代码才有"的字符串：

```powershell
# 例：2026-11-21 的特征串（10 色对比配色 / 虚拟币页签 / 逐级返回）
Select-String -Path apps\mobile\dist\assets\News-*.js -Pattern '#1098ad','虚拟币','返回列表' -SimpleMatch
```

三个全命中 = 前端是最新构建（`apps/mobile/dist` 与 APK 内 `assets/public` 由 cap sync 原样拷贝，同源可互证）。每次大改后挑一个**当次新加、且会进产物**的字符串当指纹（类名/文案/常量都行，注意模板变量编译后会拆散，别拿带 `${}` 的整句）。

**服务端指纹同理**：`apps/mobile/nodejs/dist/apps/server/src/services/news-service.js` 里 grep 当次新增的服务端特征（如 `GATE_BASE` / `api.gateio.ws`）。

---

## 九、5 模式发布口径与构建脚本名的关系（别被日志骗）

- `pnpm package:android` 内部跑的是 `build-android-slim.cjs`——**脚本名叫 slim，但按 2026-11-20 拍板的发布口径它选的就是 5 个模式**（office/ops/sec/shop/learning，`select-modes 排除 dev, wf, rpa, clip`），构建完成后 `--restore` 还原全量模式表供日常 dev 用。
- 日志里出现「精简包」字样 ≠ 模式被裁：判据看 `build/build-manifest.json` 的 `modes`/`excludedModes`——发布包必须 `excludedModes` 只含 dev/wf/rpa/clip（或为空），**office/ops/sec/shop/learning 五个绝不能出现在排除列表**。
- `pnpm package:android` 完成后如果日志显示 `已选择 5 个模式: office, ops, sec, shop, learning` + `verify PASS`，即符合发布要求。
