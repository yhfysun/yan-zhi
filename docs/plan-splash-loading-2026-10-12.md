# 方案：启动加载动画（splash）+ 冷启动空窗期治理

日期：2026-10-12
状态：待拍板

## 一、问题回顾

- 后端健康检查 `60 × 500ms = 30s` 硬上限（`main.cjs:5504`），tsx 冷启动 >30s 时强制 `createWindow()`；
- 窗口先于后端就绪加载 → 前端请求 `ERR_CONNECTION_REFUSED`（license/plugins 拒连），加上前端自身缺口表现为白屏/空数据；
- 用户诉求：「搞个加载的动画？其它应用怎么处理的？workbuddy 这些？安装的时候把后台启动？」

## 二、业界做法调研（本机 WorkBuddy 实测反编译）

WorkBuddy 采用 **独立 splash 窗口**（`app.asar/main/splash/`）：

- `splash.html`：logo + 标题「Preparing Environment」+ 副标题 + **indeterminate 进度条**（30% 宽滑块 `translateX` 循环动画）+ caption（当前步骤文案）；
- 阶段化推送：主进程通过 IPC `splash:update` 推 `{ phase, current, total, title, subtitle, caption }`，splash 经 preload 暴露的 `splashAPI.onUpdate()` 订阅，并 `getLastUpdate()` 立即拉一次防错过已推送状态；
- 三种 phase：`initializing`（无真实进度，滑条动画）/ `migrating`（有 current/total → 真百分比）/ `repairing`（滑条 + 步骤文案）；
- 主窗 ready 后关 splash，splash → 主窗无缝衔接；
- 适配暗色（`prefers-color-scheme`）、可拖拽（`-webkit-app-region: drag`）。

这是 Electron 生态标准做法（VS Code 同类：splash 窗 + `ready-to-show` 门）。**不采用「主窗先加载 loading 页再切真实内容」**：切换瞬间会白闪一次，且 dev 下 1420/5173 与 loading 页跨源，状态传递别扭。

## 三、方案设计（推荐：splash 窗口）

### P0 — splash 窗 + 健康检查门改造

1. **新建 `apps/desktop/splash.html`**（纯静态、零依赖，参考 WorkBuddy 结构做极简版，遵守内部优化无用户侧按钮约束）：
   - 应用 logo + 「正在准备运行环境」标题 + indeterminate 滑条 + caption（当前阶段文案）；
   - 通过 preload 暴露 `splashAPI.onUpdate / getLastUpdate`。
2. **`main.cjs` 改造**（`checkHealth` 之前）：
   - 启动即建 splash 窗（小尺寸、无框、`show:true`）；
   - 阶段推送：`[splash] 正在启动后端服务…` → 健康检查每 10 次重试更新一次文案（如「仍在启动（已等 15 秒）…」）；
   - **健康检查通过 → `createWindow()` → 主窗 `ready-to-show` → `splash.destroy()`**（无缝衔接，不白闪）;
   - **超时改为不强制建窗**：上限调大到 120s（dev tsx 冷启动实测 60s+）；超时后 splash 切换为「启动失败」态（caption 给出 server.log 路径提示），不再把一个必然白屏的窗口丢给用户；
   - dev 模式补充：Vite（1420）与后端（3001）**都**就绪才建窗（现状只查后端，Vite 未起时建窗同样白屏）。
3. **守门测试**（`apps/desktop/test/`，沿用 node --test + 源码契约）：
   - 超时分支不得再调用 `createWindow()`（变异验证：还原强制建窗 → 红）；
   - `splash.destroy()` 必须挂在 `ready-to-show` 之后；
   - splash.html 必须登记进三份 electron-builder `files:`（沿用 `packaged-entry-modules.test.cjs` 模式，漏打包 = 安装版启动即崩）。

### P1（可选，不推荐做）— 安装期后台启动

评估结论：**收益低、副作用多，不建议**：

- 本机实测 >30s 的根源是 **dev 模式 tsx 冷编译**；安装版跑的是编译产物，冷启动主要开销是 db/node-llama-cpp 初始化，量级小得多；
- 安装器 postinstall 拉起后端 → 用户装完不开，后端常驻占内存（本项目 node 进程百 MB 级）+ 开机自启类行为正是用户反感的；
- 若要压缩安装版首启时间，更优路径是 **首启预热**：首次健康检查通过后在后台静默预 init db / 预加载模型，对用户无感知。

## 四、改动清单

| 文件 | 改动 |
|---|---|
| `apps/desktop/splash.html` | 新建（极简启动壳） |
| `apps/desktop/splash-preload.cjs` | 新建（onUpdate/getLastUpdate） |
| `apps/desktop/main.cjs` | splash 窗生命周期 + checkHealth 改门 + 超时不建窗 |
| 三份 `electron-builder*.yml` | `files:` 登记 splash 两文件 |
| `apps/desktop/test/splash-gate.test.cjs` | 新建守门（超时禁建窗 / destroy 时机 / files 登记） |

## 五、风险分级

- **low**：splash 窗新增（独立窗口，不影响主窗任何链路）；
- **medium**：超时从 30s → 120s —— 后端真崩时用户停留 splash 更久，但超时后有明确「启动失败」态兜底，优于现在的静默白屏；
- **low**：dev 双就绪判定（3001+1420）——纯加严，不引入新竞态。

## 六、待确认

1. splash 视觉：极简（logo + 滑条 + 一行文案）是否符合「内部优化不加用户侧元素」口味？默认做极简版。
2. 超时上限 120s 是否合适（可做成常量）。
3. P1「安装期后台启动」确认不做？
