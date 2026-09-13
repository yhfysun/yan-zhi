# 言智移动端（Android / iOS）

基于 Capacitor 8 + Vue 3 的移动端壳工程。前端 UI 完全复用 `@yan-zhi/ui`，
后端通过 `@capawesome/capacitor-nodejs` 插件把 `apps/server` 的编译产物内嵌进 App，
监听 `127.0.0.1:3001` 供 WebView 调用。

## 目录结构

```
apps/mobile/
├── src/
│   ├── main.ts          入口：装载 @yan-zhi/ui 的 App + router
│   └── platform.ts      Capacitor 平台适配器（SQLite / Filesystem / Preferences）
├── nodejs/              内嵌 Node.js 工程（构建产物在 nodejs/dist/）
│   ├── package.json     运行时依赖（better-sqlite3 / express / ws ...）
│   ├── index.js         启动入口（由 build-mobile-server.cjs 生成，勿手改）
│   └── dist/            server + core + shared 的 tsc 编译产物
├── scripts/
│   ├── build-mobile-server.cjs   搬运 server 编译产物 → nodejs/dist + dist/nodejs
│   └── copy-apk.cjs              把 APK 拷到仓库根 dist-release/
├── android/             Android 原生工程（含 gradle wrapper）
├── capacitor.config.ts  Capacitor 配置（含 Capawesome NodeJS 插件）
└── dist/                vite build 产物（cap sync 源 → assets/public/）
```

## 前置条件

| 依赖 | 版本要求 | 本机位置 |
|---|---|---|
| Node.js | **22+**（pnpm 工具链） | 22.22.2 |
| JDK | **21**（Capacitor 8 插件模块硬性要求，compileSdk=36+AGP 8.13.0 需要 JDK 17+，Capawesome 插件 Java 源/目标都是 21） | `C:\APP\Java\jdk-21.0.12.1+1` |
| Android SDK | **compileSdk 36 / build-tools 36** | `C:\Android\Sdk` |
| Android Gradle Plugin | 8.13.0 | 由 gradle wrapper 拉取 |
| Gradle | 8.14.3 | 由 gradle wrapper 拉取 |

环境变量：

```bash
export ANDROID_HOME=C:\\Android\\Sdk
```

> **JDK 21 是硬要求**：Capacitor 8 的 `@capacitor/filesystem`/`preferences`/`sqlite` 与 `@capawesome/capacitor-nodejs` 插件模块都把 `compileOptions` 设到 `VERSION_21`。如果只装 JDK 17，Gradle 会报 "Cannot find a Java installation matching: {languageVersion=21}" 而失败。
>
> 旧值 `C:\APP\Java\jdk-17.0.11` 仍可作为 `org.gradle.java.installations.paths` 里的 fallback（toolchain 自动探测时使用），但不能作为主 JDK。详见 `android/gradle.properties`。

## 构建

```bash
# 一键构建（vite build → 后端产物 → cap sync → gradle → 拷 APK）
pnpm --filter @yan-zhi/mobile build:android
```

等价的分步命令：

```bash
cd apps/mobile

# 1. 前端构建（产出 dist/）
pnpm run build

# 2. 生成内嵌后端产物
#    复用 apps/server/dist（先确保 server 已 build：pnpm --filter @yan-zhi/server build）
#    产出 nodejs/dist/{apps,packages} 并同步到 dist/nodejs/
pnpm run build:mobile:server

# 3. 同步到原生工程并打包
npx cap sync android
npx cap build android
node ./scripts/copy-apk.cjs
```

产物：`dist-release/app-debug.apk`（debug）或签名后的 release APK。

## 内嵌后端如何工作

1. `apps/server` 用 `tsc` 编译，`rootDir=../..`，因此 `apps/server/dist/` 下同时包含：
   - `apps/server/src/` —— server 自身
   - `packages/core/src/` —— `@yan-zhi/core`
   - `packages/shared/src/` —— `@yan-zhi/shared`
2. `build-mobile-server.cjs` 把这三块搬到 `nodejs/dist/`，并为两个 workspace 包
   在 `nodejs/dist/node_modules/@yan-zhi/{core,shared}` 生成 stub，使 ESM 的
   `import '@yan-zhi/core'` 能解析。
3. 整个 `nodejs/` 同步到 `dist/nodejs/` —— Capacitor 的 `webDir` 是 `dist`，
   Capawesome 插件按 `nodeDir: 'nodejs'` 从 `dist/nodejs/index.js` 启动 Node 运行时。
4. 后端监听 `127.0.0.1:3001`，前端 WebView 通过该地址访问 API。

相关配置见 `capacitor.config.ts`：

```ts
plugins: {
  Nodejs: { nodeDir: 'nodejs', startMode: 'auto' },
}
```

## 已知限制

- **better-sqlite3 / sqlite-vec ABI**：这两个是原生模块，按宿主 Node 的 ABI 编译。
  Capawesome 插件自带 Node 运行时（v18.20.4，与宿主 Node 22 不同），直接跑会因 ABI 不匹配而加载失败。
  移动端需提供匹配该运行时的预编译包，或改用纯 JS 的 SQLite 实现。
  `apps/server/src/db.ts` 对 sqlite-vec 已有降级逻辑（向量检索 → 关键词检索）。
- **iOS**：`ios/` 目录尚未生成。需要 macOS + Xcode 26 才能构建（Capawesome 当前只支持 SPM，不支持 CocoaPods）。
- **移动端不支持 MCP stdio**：仅支持远程 SSE/HTTP（见 `platform.ts` 注释）。
- **Capawesome Node 限制**：单进程（不支持 child_process）、iOS 无 JIT、Android 每个 ABI 多 50MB Node 运行时、native addon 需 prebuild。详见 [Capawesome 文档](https://github.com/capawesome-team/capacitor-nodejs)。

## 排障

### 1. CMake "object file directory has 243 characters" / "build.ninja still dirty"

**症状**：`ninja: error: manifest 'build.ninja' still dirty after 100 tries`，CMake 警告对象路径超 250 字符上限（Windows 上的 `CMAKE_OBJECT_PATH_MAX`）。

**原因**：Capawesome 插件子项目的 CMake 工作目录深度 = `<项目根>/node_modules/.pnpm/@capawesome+capacitor-nodejs@0.1.1_@capacitor+core@8.5.2/node_modules/@capawesome/capacitor-nodejs/android/.cxx/...`，本机项目根 `C:\Users\Administrator\Desktop\github\yan-zhi-master\` 51 字符 → 总路径 272 > 250。

**解决**：在短路径建 junction，把 Gradle 跑到 junction 下：

```powershell
New-Item -ItemType Junction -Path 'C:\yz' -Target 'C:\Users\Administrator\Desktop\github\yan-zhi-master'
cd C:\yz\apps\mobile\android
.\gradlew.bat assembleDebug
```

CMake 工作目录会自动变成 `C:/yz/node_modules/.pnpm/...`（缩短 45 字符，总路径 ~227，安全）。

> 注意：Gradle daemon 用 `cwd` 解析 projectDir，不会解 junction；AGP 传给 CMake 的 `-S`/`-B` 也是基于 projectDir 字符串，不会重新 canonicalize。本机 node `fs.realpathSync` 会解回真实路径，但 Java/Gradle 内部用的是字符串路径。

### 2. "Cannot find a Java installation matching: {languageVersion=21}"

**症状**：Gradle 启动后立刻报错，找不到 JDK 21。

**原因**：Capacitor 8 插件模块把 `sourceCompatibility` / `targetCompatibility` 设为 `VERSION_21`，Gradle toolchain 找不到 JDK 21。

**解决**：

```powershell
# 1. 装 Temurin JDK 21（清华/Adoptium 镜像）：
Invoke-WebRequest -Uri "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse" -OutFile jdk21.zip
Expand-Archive jdk21.zip -DestinationPath C:\APP\Java

# 2. 在 android/gradle.properties 配：
org.gradle.java.home=C\:\\APP\\Java\\jdk-21.0.12.1+1
org.gradle.java.installations.paths=C\:\\APP\\Java\\jdk-21.0.12.1+1
```

### 3. zip-cache "拒绝访问"（Windows）

**症状**：第一次跑通后，再跑 `assembleDebug` 卡在 `mergeDebugJavaResource` 的 zip-cache 写文件。

**原因**：Windows 上 Gradle daemon 没回收、文件句柄未释放。

**解决**：

```bash
cd C:\yz\apps\mobile\android
.\gradlew.bat --stop
# 删除 build 目录
Remove-Item -Recurse -Force app\build, build
.\gradlew.bat assembleDebug
```

### 4. better-sqlite3 加载失败（ABI 不匹配）

**症状**：APK 装到手机启动后，后端进程起不来，logcat 报 "invalid ELF header" 或 "NODE_MODULE_VERSION mismatch"。

**原因**：`apps/server` 用本机 Node 22 编译 `better-sqlite3`（`NODE_MODULE_VERSION=127`），Capawesome 插件运行时是 Node 18（`NODE_MODULE_VERSION=108`）。

**解决（短期）**：让 `db.ts` 在检测到 `NODE_MODULE_VERSION !== 108` 时跳过 better-sqlite3，回退到 `sqlite3`（异步）或纯 JS 实现。

**解决（长期）**：用 `node-pre-gyp` 给每个移动 ABI 单独下载 prebuild；或上游 `nodejs-mobile` 升级到 Node 22。
