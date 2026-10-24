# 远程控制功能方案（远控 / Remote Control）

> 状态：P0+P1 已实施（2026-10-25；音频转发/剪贴板互通/文件收发/软件级隐私屏/适应-1:1 缩放平移/JPEG 光标自绘均已落地；多显示器选择暂未做，余项见第 7 节）
> 目标：手机 / 局域网浏览器实时看到并操作运行言智的电脑；画面**放大（全屏）后隐藏所有言智按钮**，观感上就像直接坐在那台电脑前操作
> 约束：复用现有 computer-use 能力与插件架构，零新原生依赖，默认关闭，全链路可急停、可审计

---

## 0. 结论摘要

- **可行，且地基已打好**。仓库已有四块关键能力：
  1. `computer-use` 插件已实现 Windows 截屏（GDI CopyFromScreen）+ 鼠标/键盘注入（user32 P/Invoke），零原生依赖（`apps/server/src/plugins/computer-use.ts`）
  2. 插件级 WebSocket 通道已有成熟先例：ops-shell 终端「WS 传按键 + SSE 回退」（`plugin-ws-dispatch.ts` + `ops-shell.ts:2678`），前端 xterm 接法可直接照搬
  3. 局域网访问已就绪：server 监听 `0.0.0.0` 并托管前端静态资源，移动端可一键把桌面节点设为后端（`packages/ui/src/api/client.ts` `mobile_api_base`）
  4. 护栏体系现成：急停（Ctrl+Alt+Esc → `/panic`）、操作黑名单、10 分钟滚动限流、全量审计
- **视频主通道走 WebRTC（业内最流畅方案，Chrome 远程桌面同款）**：被控端是 Electron（Chromium 内核），渲染进程 `getDisplayMedia` 桌面采集 → Chrome 自带 WebRTC 栈完成采集/硬编码/传输/拥塞控制，**零新依赖**。LAN 内 UDP 直连，1080p 可到 20–30fps，端到端延迟几十毫秒。
- **仍需一个常驻 C# 注入代理进程**：鼠标/键盘注入走 user32（Add-Type 编译、stdin 收指令），进程常驻后注入延迟 <10ms；它同时兼任 WebRTC 不可用时的 JPEG 采集回退通道。
- **沉浸模式（本需求核心）**：控制端 `/remote` 页提供「适应窗口 / 1:1 / 全屏」三档；全屏时用 Fullscreen API + 隐藏全部 UI（顶栏/侧栏/工具条），点按屏幕呼出半透明悬浮工具球——观感等同远程桌面原生客户端。
- 总工期：**P0 约 5 天**（可用的远控闭环），**P1 约 5 天**（音频转发 / 文件传输 / 隐私屏 + 体验打磨）。

---

## 1. 产品定义与用户路径

### 1.1 定位

被控端 = 运行言智桌面版的 Windows 电脑；控制端 = 同局域网的手机浏览器 / 言智移动 App / 另一台电脑的浏览器。本质是**内置的 Web 远程桌面**，画面与操作走言智节点的局域网通道，不经过任何第三方服务器。

```
控制端（手机/浏览器）                    被控端（言智桌面节点）
┌─────────────────────┐   WS 帧(JPEG)  ┌──────────────────────────┐
│ /remote 页          │ ←───────────── │ remote-control 插件       │
│ 全屏=隐藏所有按钮    │   JSON(输入)   │  ├ 会话管理/鉴权/护栏/审计 │
│ 悬浮工具球(可呼出)   │ ─────────────→ │  └ 常驻 C# 代理进程       │
└─────────────────────┘                │     ├ GDI 采集→JPEG       │
                                       │     └ user32 注入鼠标键盘  │
                                       └──────────────────────────┘
```

### 1.2 用户路径

1. 桌面端：插件管理开启「远程控制」→ 设置页出现连接地址（复用现有局域网 IP 展示与二维码）
2. 手机：浏览器或言智移动 App 打开 `http://<ip>:<port>/remote`（或从节点发现卡片一键进入）
3. 被控端弹窗确认「允许远控会话」（可勾选"本次会话不再询问"）→ 会话建立
4. 控制端看到实时画面：默认带轻量工具条 → **点放大/双击画面进入全屏，所有按钮消失**，触屏即鼠标、键盘直通
5. 任意时刻：被控端 Ctrl+Alt+Esc 急停（复用现有通道），或控制端点悬浮球「断开」

### 1.3 「放大后隐藏所有按钮」的准确含义（验收口径）

| 状态 | 表现 |
|---|---|
| 普通模式 | 画面 + 顶部返回/画质条 + 底部操作条（全屏、键盘、剪贴板、缩放） |
| **全屏沉浸模式** | Fullscreen API 全屏 + **顶栏/底栏/工具条全部消失**，仅剩远端画面与一个可拖动半透明悬浮球；点按画面 1 次呼出悬浮球，3 秒无操作自动再隐藏 |
| 观感要求 | 除悬浮球外看不到任何"言智存在"的痕迹；画面支持适应窗口 / 1:1 像素 / 双指缩放；横屏铺满无黑边（画面比例保持，少量 letterbox 可接受） |

---

## 2. 现有基础盘点（不重复造的轮子）

| 能力 | 现状 | 位置 |
|---|---|---|
| 截屏 | PowerShell + System.Drawing CopyFromScreen，单次 300–800ms（仅适合单拍） | `apps/server/src/plugins/computer-use.ts:522` |
| 鼠标/键盘注入 | C# `[CU]::mouse_event` / keybd_event，含双击/滚轮/组合键；危险组合键黑名单 | `computer-use.ts:199-403` |
| 护栏 | 急停 `/panic`（Ctrl+Alt+Esc）、`maxOps` 限流、`allowSelfWindowClick` 自窗口保护、全操作审计 | `computer-use.ts:91-139,440-470` |
| 插件 WS | `ctx.registerWebSocket('/term/ws', ...)`：二进制帧=数据、文本帧=JSON 控制，带 license 校验 | `apps/server/src/plugin-ws-dispatch.ts`、`ops-shell.ts:2678` |
| 前端 WS 接法 | `wsUrl()` 拼地址 + `?license=`，握手失败降级 SSE 的成熟模式 | `packages/ui/src/api/client.ts`、`views/plugin/OpsConsole.vue:1267` |
| 局域网互通 | 0.0.0.0 监听 + 静态托管 + 设置页 IP 展示 + 移动端一键设后端 | `apps/server/src/index.ts:423,473-498`、`packages/ui/src/views/Settings.vue:1295` |
| 全屏事件 | 桌面端窗口 `enter-full-screen/leave-full-screen` 已有处理；无主动 setFullScreen（P0 不需要） | `apps/desktop/main.cjs:1244` |
| UI 布局 | 主布局 `App.vue`；侧栏折叠 `useSidebarState`；**无现成沉浸/zen 模式**（需新建） | `packages/ui/src/App.vue` |

---

## 3. 技术选型

### 3.1 采集与传输：WebRTC 主通道 + JPEG/WS 回退（选定）

业内远程桌面分三层看，流畅度由三层共同决定：

| 层 | 流畅做法 | 业内参照 |
|---|---|---|
| 传输 | **WebRTC（UDP + 拥塞控制 + 抖动缓冲）**；WebSocket 是 TCP，丢包时队头阻塞会卡顿 | Chrome 远程桌面 = WebRTC；RustDesk 网页版 = WebRTC；Parsec / ToDesk / 向日葵 = 私有 UDP 协议；noVNC（浏览器 VNC）= WebSocket，流畅度垫底 |
| 编码 | **H.264/VP9 硬件编码**，同码率画质远超 MJPEG | 上列产品除 noVNC 外全部硬编 |
| 采集 | **DXGI Desktop Duplication**（Windows 标准采集 API，支持独占全屏窗口） | Chromium 的桌面采集内部就是它 |

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **A. Electron 渲染层 `getDisplayMedia` → WebRTC** | Chrome 自带 WebRTC 栈全包（DXGI 采集 + 硬编 + 拥塞控制），**零新依赖**；LAN 内 UDP 直连无需 TURN；1080p 20–30fps、延迟几十 ms | 依赖 Electron 形态（纯 server 部署没有渲染进程）；主进程需加 `setDisplayMediaRequestHandler` 一处 | **主通道** |
| B. 常驻 C# 进程 + JPEG 帧流 + WS | 与插件护栏同栈；不依赖 Electron；实现小 | GDI 软采集 CPU 高；MJPEG 码率大；TCP 卡顿敏感；~15fps 上限 | **回退通道**（纯 server 部署形态 / UDP 被拦截时） |
| C. Node 侧 WebRTC 库（werift 等）收 C# 编码帧 | 不依赖 Electron | C# 侧要自己接 Media Foundation 硬编（COM interop，工程量大）；werift 生态小 | 不选 |

> 选型口径：**哪个流畅用哪个**。WebRTC 三层全占优且在本项目里零依赖成本，唯一代价是主进程加一个采集授权 handler 与信令复用现有 WS——值得。

### 3.2 常驻注入代理进程

`remote-control-agent`：一个由 Node 启动的 PowerShell 进程，`Add-Type` 编译内嵌 C#（与 computer-use 同手法），之后**长驻**，主职是**输入注入**，兼 WebRTC 不可用时的 JPEG 采集回退：

- **stdin**：收 JSON 行指令（输入指令 / 回退模式的采集参数 `{op:"frame",quality,scale}`）
- **stdout**：回退模式输出 JPEG 帧（长度前缀 + 二进制）与事件行（JSON：屏幕分辨率变化）
- 回退采集：目标帧率定时 `CopyFromScreen` →（可选缩放）→ JPEG 编码 → 帧差比对，**无变化不推帧**
- 注入：收到输入指令直接调 user32（进程已热，**注入延迟 <10ms**，比现在每条指令起进程快 20 倍以上）
- 生命周期：首个会话建立时启动，无客户端 60s 自动退出；Node 侧心跳断线即 `kill`

### 3.2 常驻代理进程（本方案唯一的新"硬"件）

`remote-control-agent`：一个由 Node 启动的 PowerShell 进程，`Add-Type` 编译内嵌 C#（与 computer-use 同手法），之后**长驻**：

- **stdin**：收 JSON 行指令（`{op:"click"|…}` 输入指令 / `{op:"frame",quality,scale}` 采集参数）
- **stdout**：输出 JPEG 帧（长度前缀 + 二进制）与事件行（JSON：光标位置、屏幕分辨率变化）
- 采集循环：目标帧率定时 `CopyFromScreen` →（可选缩放）→ JPEG 编码 → 与上一帧哈希比对，**无变化不推帧**；输出前剥离本机光标（客户端自绘，避免双光标）
- 注入：收到输入指令直接调 user32（进程已热，**注入延迟 <10ms**，比现在每条指令起进程快 20 倍以上）
- 生命周期：首个会话建立时启动，无客户端 60s 自动退出；Node 侧心跳断线即 `kill`

> 备选被否：每帧起 PowerShell（现状做法）单帧 300–800ms、CPU 高，5fps 都卡；C# 进程自开 WS 端口则绕过了插件的鉴权/护栏层，不做。

### 3.3 输入映射（触屏 → 鼠标）

| 控制端手势 | 注入行为 |
|---|---|
| 单指点按 | 左键单击（带按下/抬起 40ms 间隔，复用现有 `clickScript` 时序） |
| 长按 | 右键 |
| 按住拖动 | mouse_move + 按下态（复用 drag 逻辑） |
| 双指滑动 / 滚轮区 | mouse wheel |
| 软键盘输入 | **整串发送**（`SendInput` Unicode 或 WM_CHAR 路径），本地输入法组字完成后一次性注入——远控中文输入的关键体验 |
| 物理键盘（电脑浏览器控制端） | 直通映射，Ctrl/Alt 系组合键走现有白名单校验 |

---

## 4. 架构与数据流

### 4.1 模块归属

新建**内置插件 `remote-control`**（形态与 computer-use 一致：manifest + 入口模块，**默认 disabled**），而不是挂在 computer-use 里。理由：

- 权限与生命周期不同：远控是"持续会话"，computer-use 是"单次工具调用"；分开开关、分开审计
- 会话级护栏（确认弹窗、独占、空闲超时）独立演进，不互相牵连
- 共享件（注入脚本构建、黑名单、审计工具函数）从 computer-use 抽到 `plugins/cu-shared.ts` 小公共层，两边引用

### 4.2 数据流

```
控制端浏览器 ◄═══ WebRTC 媒体（LAN UDP 直连，H.264 硬编）═══► 被控端 Electron 渲染层
     │                                                        getDisplayMedia 采集
     │  信令 offer/answer/ICE + 输入指令（复用插件 WS）              │
     ▼                                                            │
[remote-control 插件（Node）：会话状态机/鉴权/护栏/审计] ──stdin JSON──► [C# 注入代理进程 user32]
```

- **媒体通道（主）**：被控端 Electron 渲染层 `getDisplayMedia` 拿屏幕流 → `RTCPeerConnection` 推给控制端；信令（SDP/ICE）以 JSON 文本帧走插件 WS。LAN 内 host candidate 直接 UDP 打通，无需 STUN/TURN。采集含光标（Chromium 默认画进帧里），控制端无需自绘光标
- **输入通道**：控制端 WS 文本帧 JSON → 插件层护栏校验（黑名单/限流/自窗口规则）→ stdin 写给 C# 进程 → user32 注入
- **回退通道**：纯 server 部署形态（无 Electron）或 UDP 被拦截时，降级为 C# 代理 JPEG 帧流：WS 二进制帧下发（再退一步 SSE 收帧 + POST 发指令，3fps 保底）。控制端同一套 UI，自动探测走哪条通道

### 4.3 WS 消息契约（`/plugin/remote-control/remote/ws`）

文本帧（JSON，双向）：

| type | 方向 | 字段 | 说明 |
|---|---|---|---|
| `hello` | C→S | `{w,h,dpr,locale}` | 控制端能力声明 |
| `session.pending` | S→C | `{confirmToken}` | 等被控端确认 |
| `session.granted` / `session.denied` | S→C | `{reason?}` | 被控端弹窗结果 |
| `session.ended` | S→C | `{reason}` | 急停/超时/被抢占 |
| `screen.info` | S→C | `{w,h,offsetX,offsetY}` | 屏幕坐标系（沿用截图 offsetX 语义） |
| `cursor` | S→C | `{x,y,visible}` | 回退通道用：客户端按事件自绘光标（WebRTC 采集已把光标画进帧，无需） |
| `input.mouse` | C→S | `{x,y,btn,action}` | 坐标为画面像素坐标，服务端换算屏幕坐标 |
| `input.key` | C→S | `{keys[],text?}` | 组合键或整串文本 |
| `input.wheel` | C→S | `{x,y,delta}` | |
| `set.quality` | C→S | `{fps,scale,quality}` | 画质手动档（WebRTC 拥塞控制为主，此为上限约束） |
| `rtc.offer` | C→S | `{sdp}` | WebRTC 信令，插件层转发给被控端渲染层 |
| `rtc.answer` | S→C | `{sdp}` | 同上 |
| `rtc.ice` | 双向 | `{candidate}` | LAN 内 host candidate 直接打通 |
| `audio.state` | C→S | `{on}` | 请求开启系统声音转发（WebRTC 第二音频轨道） |
| `privacy.on` / `privacy.off` | C→S | — | 被控端物理屏隐私模式（软件级黑屏） |
| `ping/pong` | 双向 | `{t}` | 心跳 |

二进制帧：S→C 仅 JPEG（回退通道）；C→S 无。
**音频不走 WS**：WebRTC 第二条音频轨道（被控端系统声音回采，不含麦克风）。
**文件不走 WS**：HTTP 独立通道（收发复用现有鉴权，见第 5 节），WS 只发通知。

---

## 5. 模块清单与改动点

### 服务端（`apps/server/src/plugins/`）

| 文件 | 内容 | 量级 |
|---|---|---|
| `remote-control.ts`（新） | manifest + 会话状态机 + WS 路由（信令转发/输入）+ SSE/POST 回退 + 文件收发 HTTP 路由 + 隐私屏控制 + 审计 | ~800 行 |
| `remote-control-agent.ts`（新） | 内嵌 C# 源码字符串（输入注入为主 + JPEG 回退采集）+ 进程管理 + 流解析器 | ~700 行 |
| `cu-shared.ts`（新，小） | 从 computer-use 抽出：组合键/应用黑名单与校验（两插件共用一份策略） | ~60 行 |
| `computer-use.ts`（改） | 改引 cu-shared，行为不变，补守门用例 | 小 |
| `license-guard.ts`（改） | 豁免 `/plugin/remote-control/pair` 与 `/plugin/remote-control/session`（控制端无 license，鉴权=配对码/设备令牌） | 小 |
| `index.ts`（改） | 注册内置插件（默认关闭，MOBILE_MODE 跳过） | 小 |

### 前端（`packages/ui/src/`）

| 文件 | 内容 | 量级 |
|---|---|---|
| `views/RemoteControl.vue`（新） | WebRTC 播放（视频+音频轨道）+ 三档缩放 + **沉浸模式** + 悬浮球（键盘/音频/隐私屏/文件开关） + 手势映射 + 拖拽投送 + WS 客户端（照搬 OpsConsole 的 wsUrl/降级模式） | ~1000 行 |
| `router/index.ts`（改） | 新增 `/remote` 路由（无侧栏壳的独立全屏页，同 `/avatar` 思路） | 小 |
| `components/RemoteControlPrompt.vue`（新） | 被控端确认弹窗（桌面端 Web UI 内） | ~100 行 |
| `views/Settings.vue`（改） | 局域网访问 tab 增加「远程控制」入口卡片（连接地址 + 插件开关状态 + 接收目录选择） | 小 |
| `stores/settings.ts`（改） | 急停快捷键处理扩展：远控会话存在时一并断开 | 小 |

### 桌面端（`apps/desktop/`）

| 改动 | 内容 | 量级 |
|---|---|---|
| `main.cjs`（改） | `setDisplayMediaRequestHandler`：授权渲染层桌面/系统声音采集（P0 必须，~20 行） | 小 |
| `main.cjs`（改） | **隐私屏**：会话期间创建全黑置顶窗（点击穿透 `WS_EX_TRANSPARENT`，注入输入照常作用于下层真实窗口），会话结束自动销毁；复用现有截图框选全屏窗的做法（`main.cjs:7483` 先例） | ~60 行 |
| 托盘（P1 可选） | 远控中状态角标 + 一键断开 | 小 |

---

## 6. 安全与护栏（评审重点）

1. **默认关闭**：插件默认 disabled，与 computer-use 同策略；开启时 manifest 权限声明 `desktop-input + remote-session`
2. **被控端确认**：每个新会话必须在被控端 Web UI 弹窗确认（"设备 xxx 请求远控"），可配置白名单设备跳过；拒绝即断
3. **鉴权**：WS 走 `plugin-ws-dispatch` 现有 license 校验；局域网外网段（非 RFC1918 目标）默认拒绝连接
4. **独占会话**：同一时刻仅 1 个控制端，第二个连接返回占用提示——避免多端操作打架
5. **急停贯通**：Ctrl+Alt+Esc（现有 globalShortcut → `/panic`）同时冻结 computer-use 并**杀掉代理进程、断开所有远控 WS**；控制端收到 `session.ended`
6. **审计**：会话建立/结束/每次输入注入均写 `plugin-audit`（会话级一条 + 输入节流聚合，避免审计爆炸）
7. **黑名单沿用**：Win 键组合、Alt+F4、Ctrl+Alt+Del 等组合键黑名单直接复用；自窗口保护保留（远控场景可单独配置 `allowSelfWindowClick`，默认仍禁）
8. **限流**：输入指令 10 分钟滚动窗口上限（复用 maxOps 思路，远控默认 2000/10min，触顶降级为只读观看）
9. **空闲超时**：控制端无输入且心跳正常但画面无变化 30 分钟 → 自动结束会话
10. **明示原则**：远控会话期间，被控端桌面右下角显示系统级小提示（Electron 通知），不静默
11. **文件通道护栏**：接收目录限定（默认「下载/远控接收」，可选空间目录，复用 `path-guard` 越界校验）、单文件大小上限、全量审计；收发均要求会话已建立
12. **音频边界**：只转发系统声音回采，**不采集麦克风**（杜绝窃听面）；开关动作进审计
13. **隐私屏明示**：开启后被控端物理屏被全黑置顶层覆盖（点击穿透，不影响远控操作），托盘显示「远控中」角标，会话结束自动销毁恢复；开启/关闭进审计

---

## 7. 分期计划与验收

### P0：可用闭环（约 5 天）

- WebRTC 主通道：被控端渲染层 `getDisplayMedia`（视频+系统声音轨道）+ 主进程授权 handler + 插件层信令转发
- 常驻 C# 注入代理进程（输入注入 + JPEG 回退采集）
- 插件：会话状态机、WS（信令+输入）、确认弹窗、急停贯通、审计
- 前端 `/remote`：适应窗口观看 + 点按/长按/拖动/滚轮 + 软键盘整串输入
- **沉浸模式**：全屏隐藏所有按钮 + 悬浮球呼出/自动隐藏 + 移动端横屏适配
- 守门用例：WS 协议收发、坐标换算、黑名单/限流、会话状态机单测

**验收**：手机浏览器连桌面节点 → 确认后 20–30fps 流畅观看、点击体感 <100ms → 全屏后除悬浮球无任何言智 UI → Ctrl+Alt+Esc 一键断流杀进程 → 审计可查会话记录。

### P1：体验与增强（约 5 天）

- **音频转发**：系统声音 WebRTC 第二轨道（悬浮球开关，不含麦克风）——P1 首项，成本最低
- **文件传输**：控制端拖拽/文件选择 → HTTP 通道落入被控端接收目录（复用 path-guard）；反向从被控端选文件 → 控制端浏览器下载
- **隐私屏（软件级）**：会话期间被控端全黑置顶点击穿透层 + 托盘「远控中」角标
- 1:1 像素模式 + 双指缩放/平移；多显示器选择
- 剪贴板互通（纯文本 JSON 消息）；1:1 模式下虚拟鼠标指针
- 会话历史面板（插件管理页「记录」入口，仿 computer-use 审计）

### P2（可选，暂不承诺）

- 跨公网访问（中继/TURN，另立方案）
- 驱动级硬隐私屏（虚拟显示驱动 / DPMS 断信号，物理屏彻底无输出）
- 文件传输升级 WebRTC DataChannel 直传（HTTP 通道够用时不必做）
- macOS 被控端（现有 computer-use 的 macOS 基础支持可复用，但注入与采集需另做，不建议同期）

---

## 8. 风险与边界

| 风险 | 对策 |
|---|---|
| CPU 占用（仅回退通道：GDI 软采集） | 帧差跳帧 + 无变化不推帧；画质参数可调；空闲 60s 杀进程；主通道 WebRTC 走硬编，CPU 占用低 |
| UAC/锁屏安全桌面采集不到、注入无效 | 明确不做（第三方远控同样需要服务级驱动）；文档写清边界 |
| 中文输入逐键乱序 | 强制整串发送路径，软键盘与物理键盘统一 |
| 回退通道 GDI 采集黑屏（独占全屏场景） | 仅影响回退通道；主通道 WebRTC 走 Chromium 内置 DXGI 采集，独占全屏也能采 |
| 移动端浏览器全屏 API 差异（iOS Safari 不支持 Element.requestFullscreen） | iOS 降级为"伪全屏"（隐藏 UI 铺满视口 + 横屏提示），体验达标但地址栏仍在 |
| 被控端无人确认导致"连上但黑等" | pending 状态 30s 超时自动拒绝并提示 |
| 隐私屏黑层被本机使用者误认为死机 | 黑层角标显示「远控中」，托盘一键断开；仅会话期间存在，结束自动恢复 |
| 大文件传输占满带宽影响画面 | 接收限速（默认 10MB/s 可配）；传输时画质自动降档 |

---

## 9. 明确不做（第一版）

- 不做跨公网直连/中继（P2 另立方案）
- 不做多控制端协同（保持单控制端独占）
- 不做被控端录屏取证回放（审计日志已覆盖操作溯源）
- 不做绕过确认弹窗的"静默远控"模式（白名单设备也需在设置页显式添加）
- 不采集麦克风（音频仅系统声音回采，见护栏 12）
- 不做驱动级硬隐私屏与 UAC/锁屏穿透（需内核驱动，P2 评估）

---

## 附：与现有代码的对应关系

| 现有件 | 复用方式 |
|---|---|
| `apps/server/src/plugins/computer-use.ts:199-403` 注入脚本 | 抽到 `cu-shared.ts` 共用 |
| `apps/server/src/plugins/computer-use.ts:91-139` 护栏（panic/限流/黑名单） | 同上；急停端点扩展杀代理进程 |
| `apps/server/src/plugin-ws-dispatch.ts` 插件 WS 分发 | 直接注册 `/remote/ws` |
| `apps/server/src/plugins/ops-shell.ts:2678` 终端 WS + `OpsConsole.vue:1267` 前端接法 | 帧协议与降级模式照搬 |
| `apps/server/src/index.ts:423,473` 0.0.0.0 + 静态托管 | 无需改动，控制端页面即由节点托管 |
| `packages/ui/src/api/client.ts` `wsUrl()` + `mobile_api_base` | 控制端地址解析直接复用 |
| `packages/ui/src/views/Settings.vue:1295` 局域网 IP 展示 | 远控入口卡片复用同一 IP 数据 |
| `apps/desktop/main.cjs` 急停 globalShortcut | 不改，/panic 语义扩展 |
