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
│   └── index.js         启动入口（由 build-mobile-server.cjs 生成，勿手改）
├── scripts/
│   ├── build-mobile-server.cjs   搬运 server 编译产物 → nodejs/dist + dist/nodejs
│   └── copy-apk.cjs              把 APK 拷到仓库根 dist-release/
├── android/             Android 原生工程
└── dist/                vite build 产物（cap sync 源）
```

## 前置条件

| 依赖 | 版本要求 | 本机位置 |
|---|---|---|
| Node.js | **22+**（Capacitor 8 硬性要求） | 22.22.2 |
| JDK | 17+ | `C:\APP\Java\jdk-17.0.11` |
| Android SDK | **compileSdk 36 / build-tools 36** | `C:\Android\Sdk` |
| Android Gradle Plugin | 8.13.0 | 由 gradle wrapper 拉取 |
| Gradle | 8.14.3 | 由 gradle wrapper 拉取 |

环境变量：

```bash
export ANDROID_HOME=C:\\Android\\Sdk
export JAVA_HOME=C:\\APP\\Java\\jdk-17.0.11
```

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
  Capawesome 插件自带 Node 运行时（版本与宿主不同），直接跑会因 ABI 不匹配而加载失败。
  移动端需提供匹配该运行时的预编译包，或改用纯 JS 的 SQLite 实现。
  `apps/server/src/db.ts` 对 sqlite-vec 已有降级逻辑（向量检索 → 关键词检索）。
- **iOS**：`ios/` 目录尚未生成。需要 macOS + Xcode 26 才能构建。
- **移动端不支持 MCP stdio**：仅支持远程 SSE/HTTP（见 `platform.ts` 注释）。
