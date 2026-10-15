# Electron 33 → 44 升级方案（2026-10-15）

> **触发点**：dev 终端 DevTools 噪音（`Request Autofill.enable failed` / `Unknown VE context: language-mismatch`）。
> **官方修复**：electron#49292（main，2026-01-12 合入）+ backport #49359，**v40.1.0 起生效**（release note: "DevTools errors are no longer printed to console"）。
> 40/41 已 EOL（支持窗口 = 最新 3 个大版本）⇒ 直接目标 **44.7.x 最新 stable**。
>
> **本文件只出方案、不动代码**；确认 §7 后开干。

---

## 1. 版本决策

| 项 | 当前 | 目标 | 说明 |
|---|---|---|---|
| Electron | 33.4.11（package.json `^33.0.0`） | **44.7.x**（44.0.0 = Chromium 152 / Node 24.18.1 / V8 15.2） | 支持窗口内、拿满安全更新；顺带消噪音 |
| better-sqlite3 | 11.10.0 | 按 §3-R1 结论（大概率需升 12.x） | 预编译 ABI 是硬门槛 |
| electron-builder | 25.x | 默认不动，报错再升 | 25 支持新 Electron |
| @electron/rebuild | 4.2.0 | 默认不动 | 仅 node-gyp 兜底路径用 |

**为什么不选 40.1.0**：刚好是修复版本，但已 EOL，升完立刻欠安全更新。
**为什么不选 42/43**：与 44 同在支持窗口，breaking 面几乎相同，一步到位。

## 2. 顺带收益（非目标，记录在案）

- ✅ Autofill / VE context 终端噪音消失（v40.1.0+）
- ✅ tsx 兼容修复（v41+ #51947 "Fixed running under tsx import transpilation"）——家用 PC dev 模式 tsx 问题可能一并解决，升级后复测
- ✅ Chromium 130→152 / Node 20→24.18 安全更新

## 3. 影响面审计（已基于本仓代码逐项 grep 核实）

### R1（high）原生绑定链——唯一枢纽

- `apps/desktop/scripts/fix-sqlite-binding.cjs:13` 写死 `const electronVersion = '33.4.11'`：
  postinstall 经 prebuild-install 拉 electron ABI 预编译，**这是全仓唯一需要改版本号的地方**。
- better-sqlite3 11.10.0 预编译最高到 electron-v130（Electron 33）；Electron 44 需 Chromium 152 对应 ABI。
  **执行动作**：查 better-sqlite3 releases 的 electron-v152 预编译覆盖 →
  ① 有则只改目标版本号；② 无则升 better-sqlite3 到有预编译的最新版；
  ③ 仍无则退回 node-gyp 源码编译（需 MSVC + 联网拉 headers，受限网络下 high）。
- server 侧同一份 better-sqlite3（server 跑在 ELECTRON_RUN_AS_NODE 下、同一 ABI，fix 脚本注释已明确共用）；
  打包链路 `runtime/server-runtime/node_modules` 需一并验证。

### R2（high）webview 引擎——现役默认引擎跑在 deprecated 标签上

- `main.cjs:766 / 1640` **`webviewTag: true`**；`main.cjs:204` **`BROWSER_ENGINE_DEFAULT = 'webview'`**
  ⇒ 内置浏览器每个 tab = 渲染层一个 `<webview>`，**这是现役主引擎，不是遗留分支**。
- Electron 官方对 `<webview>` 的定级："undergoing dramatic architectural changes"、**"不保证未来版本可用"**。
- `main.cjs:841` 的 **`will-attach-webview` 是关键安全钩子**（剥 nodeIntegration / contextIsolation / preload、
  禁 nodeIntegrationInWorker、disableDialogs）——v44 是否仍触发**未验证**；若静默失效，全部 guest 安全加固落空。
- 项目内已有一批 webview 专项修复（截图 surface / popup 重定向 / LRU 逐出 / 空闲回收 / 滚动条注入 /
  pageAgent），均有守卫测试锚定（`browser-screenshot-surface.test.cjs` / `url-guard.test.cjs` / `navigate-reuse-tab.test.cjs`）。
- **⇒ 升级后必须整链真跑回归，不能只跑单测。**

### R3（medium）中间版本 breaking changes（v34–v43）

已核：v40（PDF WebContents / cookie change cause / Windows 通知 actions）、v41（PDF 不再独立 WebContents /
cookie cause 显式化 / showHiddenFiles Linux 移除）、v44（见下表）。
**待办**：逐版过 electronjs.org breaking-changes + 各版 release notes 的 Behavior Changed 段，
对照 main.cjs / preload.cjs / browser-preload.cjs / snip-preload.cjs grep 审计（P0 第 3 步，不允许跳过）。

### v44 已核实 breaking changes 对照

| v44 变更 | 本仓情况 | 风险 |
|---|---|---|
| clipboard 不再暴露给渲染进程（#52508） | 渲染层未直连：main.cjs ipcMain.handle + preload 走 invoke | low |
| 移除 ia32 / armv7l 构建（#52326） | 构建目标 nsis 默认 x64；`pack-helpers.cjs` 的 `win-ia32-unpacked` 仅输出目录枚举；执行时确认 build-all-editions 不传 arch | low |
| macOS 12 弃支持（#51967） | CI runner / 目标用户需 ≥ macOS 13；发布说明标注 | low |
| `setLoginItemSettings` openAsHidden 移除（#52667） | 全仓未使用 | none |
| ANGLE 静态链接、libEGL/libGLESv2 不再分发（#52288） | 无手动加载这两个库的代码 | none |
| net.request Sec-Fetch-Dest/Mode 校验（#52216） | 不涉及主进程 net 文档请求 | none |

### 已核实低风险项（无需动作）

- ✅ guardNavigation（will-navigate + will-frame-navigate，main.cjs:5106）——均为稳定 API，33→44 语义不变
- ✅ setWindowOpenHandler（主帧 / guest / session 三处）——稳定 API
- ✅ webPreferences 显式 nodeIntegration:false / contextIsolation:true——与各版本默认一致，无漂移
- ✅ sqlite-vec 0.1.9——平台二进制（optionalDependencies 按 OS×arch 分发）= N-API，**免重编**；仍须 smoke
- ✅ globalShortcut / safeStorage / Tray——稳定
- ⚠️ desktopCapturer——v39 起 macOS 走 CoreAudio Tap，仅影响 macOS 录屏源枚举，执行时验证截图功能

## 4. 实施步骤（每步带验收判据）

### P0 准备（不动代码）

1. 锁目标补丁号：`electron@44.7.x` 取执行时最新（当前约 44.7.2），记入 commit 说明
2. 逐版过 breaking changes 33→44 清单（§3-R3）
3. 查 better-sqlite3 releases 的 electron ABI 预编译覆盖（定 R1 走 ①/②/③ 哪条）
4. 验证 `will-attach-webview` 在 v44 的状态（electron 仓库 changelog / source）；若已移除 → 提前设计替代方案
5. 确认 build-all-editions.cjs / electron-build.cjs 无 ia32 传参

### P1 依赖升级

1. `apps/desktop/package.json`：electron → 44.7.x（按 P0-3 同步 better-sqlite3）
2. `fix-sqlite-binding.cjs:13`：`33.4.11` → 目标版本
3. `pnpm install`（postinstall 自动拉新 ABI 预编译）
4. **验收**：经 `ELECTRON_RUN_AS_NODE=1` 真跑——better-sqlite3 建表/插查 + sqlite-vec `load_extension` 向量检索，全过

### P2 代码适配（按 P0 结论，预计 ≤3 处）

- will-attach-webview 替代方案（若确认失效）
- 其余 breaking change 命中项（预期 0–2 处）

### P3 验证（按用户视角真跑）

1. 类型：shared / core / server `tsc --noEmit` + ui `vue-tsc` 全绿
2. server 测试全量（基线：158 文件 / 2528 通过 / 0 失败）+ 桌面端 `node --test`
3. dev 模式：`pnpm electron:dev` → netstat 见 **1420 + 3001**；终端**不再出现** Autofill / VE context 两条噪音（本次升级的原始验收判据）
4. **webview 引擎整链回归**（R2）：新建/关闭 tab、guest 注册时序、导航、guardNavigation 拦截（含 iframe 子帧）、
   window.open/target=_blank 转应用内新标签、截图（面板可见/收起两种状态）、滚动条注入、pageAgent、Playwright 鼠标键盘模拟、LRU 逐出与空闲回收
5. 家用 PC dev 模式 tsx 兼容复测（顺带收益 #51947）
6. 打包 basic 档 + 安装版验证：`grep -c '44\.7' app.asar`（防"改了没发布"）；安装版 sqlite 读写真跑

### P4 收口

1. 三份 electron-builder yml：无写死版本号，预期零改；仅在有版本/架构字段时同步
2. CI：确认 build-desktop.yml 的 electron 缓存键失效（有 cache 的话）
3. 提交：**hunk 精确拆**（工作区常混并行会话在途文件），`git log --oneline -5` 逐提交复核
4. 记忆：结果写入 `.workbuddy/memory/2026-10-15.md`

## 5. 风险汇总

| 风险 | 级别 | 缓解 |
|---|---|---|
| better-sqlite3 无 v152 预编译 → MSVC 源码编译 / 联网拉 headers | **high** | P0-3 先查；必要时先升到"有预编译的最高 Electron 大版本"再评估 |
| webview 引擎回归（deprecated 标签 + will-attach-webview 未验证 + N 个专项修复） | **high** | P0-4 先验证；P3-4 整链真跑 + 既有守卫测试兜底 |
| 11 个大版本 breaking change 漏核 | medium | P0-2 逐版清单 + grep 对照，结论写进 commit 说明 |
| 打包链路回归（postinstall / ABI / asar） | medium | P3-6 安装版真跑 + grep 版本号 |
| macOS 12 用户无法运行新包 | low | 发布说明标注；旧安装包仍可用 |

## 6. 回滚

- 代码：`git revert` 对应提交（hunk 精确，勿整文件）
- 依赖：还原 package.json + pnpm-lock.yaml 后 `pnpm install`，postinstall 自动回拉 v130 预编译
- 无 schema / 数据迁移 ⇒ 回滚无损

## 7. 待确认（确认后开干）

1. 目标锁 **44.7.x 最新补丁**？（备选：42.x 同窗口更小跨步）
2. better-sqlite3 若必须升级，允许顺带升到 12.x 吗？
3. 打包验证只跑 basic 档，还是 full 也跑？
4. webview 引擎回归是否安排一轮完整人工验收（R2 是最大不确定面）？
