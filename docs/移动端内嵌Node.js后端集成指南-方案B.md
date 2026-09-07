# 言智移动端内嵌 Node.js 后端集成指南（方案 B）

> 文档版本：v1.0 ｜ 创建时间：2026-09-06 ｜ 状态：代码框架已完成，需在 Android 构建环境中验证

---

## 一、概述

本方案在安卓 APK 内嵌入 Node.js 运行时（nodejs-mobile），启动 `apps/server` 后端服务，监听 `127.0.0.1:3001`，前端 WebView 通过 `http://127.0.0.1:3001/api` 访问后端，实现**完全离线可用**。

### 架构

```
┌─────────────────────────────────────────────────┐
│              Android APK (com.yanzhi.mobile)      │
│                                                     │
│  ┌──────────────┐    ┌────────────────────────┐  │
│  │  WebView      │    │  Node.js 运行时          │  │
│  │  (Capacitor)  │    │  (nodejs-mobile)        │  │
│  │               │    │                          │  │
│  │  Vue 3 前端   │───▶│  apps/server (Express)  │  │
│  │  API_BASE =   │    │  监听 127.0.0.1:3001   │  │
│  │  http://127.0 │    │                          │  │
│  │  .0.1:3001/api│    │  better-sqlite3 (本地DB)│  │
│  └──────────────┘    │  sqlite-vec (向量检索)   │  │
│                        │  LLM 代理 → 外部模型API  │  │
│                        └────────────────────────┘  │
│                                                     │
│  MainActivity → NodeMobileService (启动/管理 Node) │
└─────────────────────────────────────────────────┘
```

### 与方案 A（连远程节点）的区别

| 维度 | 方案 A：连远程节点 | 方案 B：内嵌后端（本方案） |
|---|---|---|
| 离线可用 | ❌ 需网络 | ✅ 完全离线 |
| 工作量 | 0.5~1 天 | 2~4 周（含原生模块编译） |
| APK 体积 | 不变 | +30~80MB（Node 运行时+原生模块） |
| 性能 | 取决于网络 | 本地访问，延迟低 |
| 模型调用 | 后端代理 | 本地后端代理（仍需联网调外部 LLM） |

---

## 二、已完成的代码修改

### 2.1 服务端适配（apps/server）

| 文件 | 修改内容 |
|---|---|
| `src/index.ts` | 1. `browser`/`search` 路由在 `MOBILE_MODE` 时返回 501（禁用 playwright）<br>2. `computer-use` 插件在 `MOBILE_MODE` 时跳过注册<br>3. 监听地址支持 `HOST` 环境变量（默认 127.0.0.1） |
| `src/db.ts` | 无需修改：`sqlite-vec` 加载失败时自动降级为关键词检索；`DATA_DIR` 环境变量可配置数据目录 |

### 2.2 前端适配（packages/ui）

| 文件 | 修改内容 |
|---|---|
| `src/api/client.ts` | 1. 新增 `isCapacitor` 检测<br>2. 移动端 `API_BASE` 默认为 `http://127.0.0.1:3001/api`<br>3. 支持 `localStorage.mobile_api_base` 配置远程后端（方案 A 兼容） |

### 2.3 移动端工程（apps/mobile）

| 文件 | 修改内容 |
|---|---|
| `nodejs/package.json` | 移动端后端依赖清单（移除 playwright、tesseract.js） |
| `nodejs/index.js` | 启动入口：设置环境变量 → 启动 server |
| `scripts/build-mobile-server.cjs` | 构建脚本：编译 server/core/shared → 打包到 nodejs/dist/ |
| `android/app/src/main/java/.../NodeMobileService.java` | Node.js 运行时管理服务（启动/停止/状态） |
| `android/app/src/main/java/.../MainActivity.java` | onCreate 启动 NodeMobileService，onDestroy 停止 |
| `android/app/src/main/AndroidManifest.xml` | 1. 注册 NodeMobileService<br>2. `usesCleartextTraffic="true"`（允许 http://127.0.0.1） |
| `android/app/build.gradle` | 1. nodejs-mobile 依赖占位（三种方式注释说明）<br>2. `copyNodeJsAssets` task：构建前复制 nodejs 工程到 assets/ |

---

## 三、待完成步骤（需在 Android 构建环境中执行）

### 3.1 选择 Node.js 运行时集成方式

#### 方式一：Capacitor-NodeJS 插件（推荐，最简单）

> ⚠️ 需要升级 Capacitor 到 v8+（当前项目为 v6）

```bash
# 1. 升级 Capacitor（需评估 breaking changes）
pnpm --filter @yan-zhi/mobile add @capacitor/core@latest @capacitor/cli@latest @capacitor/android@latest

# 2. 安装 Capacitor-NodeJS 插件
pnpm --filter @yan-zhi/mobile add @capawesome/capacitor-nodejs
npx cap sync android

# 3. 删除手动集成代码（由插件管理）
rm apps/mobile/android/app/src/main/java/com/yanzhi/mobile/NodeMobileService.java
# 恢复 MainActivity.java 为最简版本（参考 git）
```

插件使用方式：
```typescript
import { NodeJs } from '@capawesome/capacitor-nodejs';

// 启动 Node.js
await NodeJs.start({
  entryPoint: 'index.js',
  env: { ANDROID_DATA_DIR: '/data/data/com.yanzhi.mobile/files/yan-zhi-data' }
});
```

#### 方式二：直接集成 nodejs-mobile（不升级 Capacitor）

1. 从 [nodejs-mobile releases](https://github.com/nodejs-mobile/nodejs-mobile/releases) 下载 Android AAR
2. 放入 `apps/mobile/android/app/libs/nodejs-mobile.aar`
3. 在 `app/build.gradle` 中启用：
   ```gradle
   implementation files('libs/nodejs-mobile.aar')
   ```
4. `NodeMobileService.java` 中的反射调用已适配常见 API，如版本不匹配需调整方法名

#### 方式三：从源码编译 nodejs-mobile

适合需要定制 Node.js 版本或功能的场景，参考 [nodejs-mobile 构建文档](https://github.com/nodejs-mobile/nodejs-mobile#building)。

### 3.2 编译 better-sqlite3 for Android

better-sqlite3 是原生模块，需为 Android ABI（arm64-v8a / armeabi-v7a / x86_64）编译。

**方案一：使用 better-sqlite3-nodejs-mobile 预编译**
```bash
cd apps/mobile/nodejs
npm install better-sqlite3-nodejs-mobile
# 在代码中替换 import：
# import Database from 'better-sqlite3' → import Database from 'better-sqlite3-nodejs-mobile'
```

**方案二：从源码交叉编译（需 NDK）**
```bash
# 设置 NDK 路径
export ANDROID_NDK_HOME=/path/to/ndk

# 为 arm64-v8a 编译
cd apps/mobile/nodejs
npm install better-sqlite3 --build-from-source \
  --target_arch=arm64 \
  --target_platform=android \
  --ndk_path=$ANDROID_NDK_HOME
```

**方案三：降级为 sql.js（纯 WASM，最简单但性能低）**
- 修改 `db.ts`，用 sql.js 替代 better-sqlite3
- 需适配 API 差异（sql.js 是异步的，better-sqlite3 是同步的）
- 不推荐：大量代码依赖同步 API

### 3.3 sqlite-vec 处理

sqlite-vec 的 Android 支持目前是 [open issue](https://github.com/asg017/sqlite-vec/issues/68)。

- **当前状态**：`db.ts` 已有降级逻辑——sqlite-vec 加载失败时自动降级为关键词 LIKE 检索
- **影响**：知识库语义检索、向量记忆检索精度下降，但功能可用
- **后续**：sqlite-vec 官方支持 Android 后，直接升级依赖即可

### 3.4 构建移动端后端

```bash
# 1. 编译 server/core/shared 并打包到 nodejs/dist/
node apps/mobile/scripts/build-mobile-server.cjs

# 2. 安装移动端依赖（在 Android 构建环境或交叉编译环境中）
cd apps/mobile/nodejs
npm install --production

# 3. 验证 server 能在本地 Node 中启动（可选，用于快速验证）
node index.js
# 应输出：后端已启动: http://127.0.0.1:3001
```

### 3.5 构建 APK

```bash
# 回到项目根目录
cd ../..

# 构建前端 + 同步原生工程 + 构建 APK
pnpm build:mobile:android

# 产物：dist-release/*.apk
```

---

## 四、验证方法

### 4.1 后端启动验证

安装 APK 后，通过 adb logcat 查看 Node.js 日志：
```bash
adb logcat | grep -E "YanZhiNodeMobile|mobile-server"
```

预期输出：
```
[mobile-server] 数据目录: /data/data/com.yanzhi.mobile/files/yan-zhi-data
[mobile-server] 监听: http://127.0.0.1:3001
后端已启动: http://127.0.0.1:3001
```

### 4.2 API 连通性验证

在 App 内打开聊天，发送消息，确认：
- 对话能正常创建（`/api/conversations`）
- LLM 任务能正常流式返回（`/api/llm/tasks/*/stream`）
- 知识库列表能加载（`/api/kb`）

### 4.3 离线验证

1. 关闭手机 WiFi 和移动数据
2. 打开 App，确认：
   - 本地会话、配置、历史记录可访问（better-sqlite3 本地存储）
   - 知识库可检索（sqlite-vec 或降级关键词检索）
   - 聊天发送消息会失败（需联网调外部 LLM API，属预期）

---

## 五、常见问题

### Q1: better-sqlite3 在 Android 上加载失败怎么办？

**A**: 确认 better-sqlite3 的预编译二进制与 nodejs-mobile 的 Node ABI 版本匹配。可通过以下命令检查：
```bash
node -e "console.log(process.versions.modules)"  # 查看 Node ABI 版本
```
如不匹配，需从源码交叉编译或使用 better-sqlite3-nodejs-mobile 预编译包。

### Q2: 前端报 "Failed to fetch" 怎么办？

**A**: 检查：
1. `adb logcat` 确认后端是否成功启动
2. 确认 `AndroidManifest.xml` 中有 `android:usesCleartextTraffic="true"`
3. 确认 `client.ts` 中 `isCapacitor` 检测正确（`window.Capacitor?.isNativePlatform`）
4. 确认后端监听地址是 `127.0.0.1`（不是 `0.0.0.0` 或 localhost）

### Q3: APK 体积太大怎么办？

**A**: 
- 只打包必要的 ABI（如仅 arm64-v8a，可减少 50%+ 体积）
- 在 `app/build.gradle` 中配置：
  ```gradle
  defaultConfig {
      ndk { abiFilters 'arm64-v8a' }
  }
  ```
- 移除不需要的依赖（如 mysql2、pg 如不用可移除）

### Q4: 后端在应用后台被杀怎么办？

**A**: 将 NodeMobileService 改为前台服务（Foreground Service），在 `AndroidManifest.xml` 中取消 `FOREGROUND_SERVICE` 权限注释，并在 `NodeMobileService.java` 中调用 `startForeground()`。

### Q5: 能否同时支持方案 A（连远程）和方案 B（内嵌）？

**A**: 已支持。`client.ts` 中：
- 未配置 `localStorage.mobile_api_base` 时，使用内嵌本地后端（`http://127.0.0.1:3001`）
- 配置了 `mobile_api_base` 时，使用远程后端
- 可在设置页增加"后端地址"配置项，让用户切换

---

## 六、风险与待验证项

| 风险项 | 严重度 | 说明 |
|---|---|---|
| better-sqlite3 Android 编译 | 高 | 需匹配 nodejs-mobile 的 Node ABI，可能需从源码交叉编译 |
| sqlite-vec Android 支持 | 中 | 官方未支持，已降级为关键词检索，精度下降 |
| Capacitor 版本不匹配 | 中 | 如用 Capacitor-NodeJS 插件需升级到 v8，可能有 breaking changes |
| Node.js 运行时稳定性 | 中 | nodejs-mobile 在 Android 上的长期运行稳定性需验证 |
| 内存占用 | 中 | Node.js 运行时 + better-sqlite3 + Express 约占 50-100MB 内存 |
| 前端等待后端启动 | 低 | 后端启动需 1-3 秒，前端需处理"后端未就绪"状态 |

---

## 七、文件清单

```
apps/mobile/
├── nodejs/                          # 移动端 Node.js 后端工程
│   ├── package.json                 # 移动端依赖（已移除 playwright/tesseract.js）
│   └── index.js                     # 启动入口（设置环境变量 → 启动 server）
├── scripts/
│   └── build-mobile-server.cjs      # 构建脚本（编译 server/core/shared → 打包）
└── android/app/src/main/
    ├── java/com/yanzhi/mobile/
    │   ├── MainActivity.java        # 已修改：启动/停止 NodeMobileService
    │   └── NodeMobileService.java   # 新增：Node.js 运行时管理服务
    ├── AndroidManifest.xml          # 已修改：注册服务 + cleartextTraffic
    └── build.gradle                 # 已修改：nodejs-mobile 依赖 + assets 复制 task

apps/server/src/
└── index.ts                         # 已修改：MOBILE_MODE 条件禁用 + HOST 环境变量

packages/ui/src/api/
└── client.ts                        # 已修改：移动端 API_BASE 指向本地后端
```
