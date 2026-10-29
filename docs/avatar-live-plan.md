# 直播功能方案（虚拟人 / 宠物 / 游戏）

> 状态：方案评审稿 v2（2026-10-29 修订：并入宠物系统与游戏链路）
> 目标：侧栏常驻虚拟人，能对话、能实时执行任务、能直播；宠物与游戏复用同一条直播管线
> 约束：全本地优先，不依赖云端 API，形象资产自有

---

## 0. 结论摘要

- **不做三套直播，只做一条管线**：`画面合成 → 音频混音 → 编码推流`，主播主体与画面来源都可替换。
- **画面来源四种取法**：自渲染（虚拟人/宠物）、窗口捕获（应用/浏览器）、CDP 帧流、屏幕区域。实录模式直接播应用窗口，最省事也最真实。
- 三种主播形态共用同一套会话、任务、权限、旁白：
  - **虚拟人**（新建）
  - **宠物**（已有 2D 精灵 + 3D/VRM 双渲染，直接接）
  - **游戏**（智能体代玩网页游戏，或宠物自己玩 Worlds）
- **宠物是成本最低的首播验证对象**：渲染、状态机、动作全都有，且不需要口型同步。
- 全本地语音：`sherpa-onnx` 一个运行时包办 TTS + 流式 ASR + VAD（运行时已在仓库里）。
- 总工期：虚拟人本地完整 9–13 天；直播管线 + 宠物直播 9–12 天；游戏直播再 6–9 天。

### 建议的推进顺序（与常规相反）

如果目标是**尽快开播**，先做「宠物直播」而不是「虚拟人」：

| 顺序 | 理由 |
|---|---|
| 1. 宠物主播 | 渲染/状态/动作全现成，无口型依赖，2–3 天可出画面 |
| 2. 直播管线 | 用宠物验证音画同步、推流、垫场，风险集中在管线本身 |
| 3. 虚拟人 | 等管线稳定后再接，避免"形象没调好 + 推流也不稳"两线作战 |
| 4. 游戏直播 | 依赖浏览器帧捕获，不确定性最大，放最后 |

---

## 1. 产品定义

### 1.1 一句话

**直播 = 一个会说话的 Agent，配一张可以换的脸，加上一块可以换的画面。**

脸：虚拟人 / 宠物
画面：虚拟人 / 宠物 / 游戏 / 双人同框
话：现有 Agent 的回复 + 任务旁白
手：现有工具集（受直播模式白名单约束）

### 1.2 四条产品路径

| 路径 | 入口 | 行为 |
|---|---|---|
| 侧栏对话 | 侧栏虚拟人卡片 / 宠物窗 | 打字或说话，即时问答，可执行任务 |
| 全屏演播 | `/avatar` | 大画面、字幕、任务过程可视化 |
| 宠物直播 | 宠物窗菜单「开播」 | 宠物单口 + 玩小游戏 + 观众互动 |
| 游戏直播 | 演播页「代玩开播」 | 智能体玩网页游戏，观众弹幕指挥 |

### 1.3 侧栏落点

- 会话列表顶部：`ChatSidebar.vue` 加常驻虚拟人卡片
- 折叠态：右下角悬浮球，展开为 Dock 小窗（`AvatarDock.vue`）
- 全屏页：`/avatar` 路由
- 宠物仍走既有透明置顶窗，**不合并**——它已经自成体系（独立进程、弹层小窗、IPC 全套）

---

## 2. 统一架构

### 2.1 四层

```
┌─ Performer（主播主体） ─────────────────────────────┐
│  Avatar  │  Pet2D / Pet3D  │  (未来: 双人)          │
└────────────────────────────────────────────────────┘
                     ↓ 统一接口
┌─ SceneSource（画面内容源） ─────────────────────────┐
│  Performer  │  GameFeed（浏览器帧） │  背景 / 循环视频 │
└────────────────────────────────────────────────────┘
                     ↓
┌─ SceneCompositor（布局合成） ────────────────────────┐
│  背景层 + 主体层 + 字幕层 + 弹幕层 + 角标（AIGC/直播中）│
└────────────────────────────────────────────────────┘
                     ↓
┌─ Encoder（编码推流） ────────────────────────────────┐
│  canvas 帧 + PCM 混音 → ffmpeg → RTMP / 本地录制      │
└────────────────────────────────────────────────────┘
```

### 2.2 Performer 接口

```ts
export type Expression = 'neutral' | 'thinking' | 'happy' | 'confused' | 'surprised'

export interface Performer {
  mount(el: HTMLElement, opts: { width: number; height: number }): Promise<void>
  setSpeaking(on: boolean): void
  /** 无口型的实现（宠物）直接忽略此调用 */
  setMouth(open: number): void
  setExpression(e: Expression): void
  /** 复用宠物已有的工具→动作映射：think/read/search/write/act/tool */
  setActivity(a: PetActivityKind | null): void
  /** 宠物 6 个互动动作；虚拟人映射到自己的动作集 */
  playAction(name: string): void
  resize(w: number, h: number): void
  destroy(): void
}
```

**关键**：`Performer` 是现有 `Pet2D.vue` / `Pet3D.vue` 的超集。宠物适配器只需把 `setSpeaking/setMouth` 丢空、把 `setActivity` 映射到 `PetState`、把 `playAction` 映射到既有六动作，不改宠物内部一行代码。

### 2.3 画面来源：四种取法，各管一段

直播画面不该只有一种来源。**能用现成的就别重建**，按场景选：

| 取法 | 拿到什么 | 优点 | 缺点 |
|---|---|---|---|
| **A. 自渲染** | 虚拟人 / 宠物画布 | 完全可控，可做画中画、字幕、AIGC 标；分辨率固定 | 不能直接"录应用"，布局要自己搭 |
| **B. 窗口捕获**（Electron `desktopCapturer`） | 应用窗口、浏览器窗口、任务页 | 一行 API；观众看到的就是真相；**Windows 下可带系统回环声**（需实测版本支持） | 只能整窗，会把侧栏/路径一起播出去；最小化或被遮挡时画面异常；分辨率随窗口 |
| **C. 浏览器帧流**（CDP `Page.startScreencast`） | 被 agent 操作的那个页面 | 帧级可控、不受遮挡、可后台；与 agent 操作同源 | 只有画面没声音；仅限浏览器内容 |
| **D. 屏幕区域** | 任意桌面区域 | 能录任何应用 | 桌面泄露风险最高；多屏/缩放要处理 |

**默认组合**：

- **"演播"模式** → A：虚拟人/宠物单口，画面可控
- **"实录"模式** → B：直接播应用窗口，看它真实操作任务
- **"游戏"模式** → C：浏览器页面帧流（省资源、不受窗口影响）；需要原声时切 B

三种来源都实现同一个 `SceneSource` 接口，场景模板只负责布局，不关心画面从哪来。

### 2.4 实录模式的两条护栏

窗口捕获会把窗口里的一切播出去，所以必须配「直播工作区」：

1. **开播前切到专用工作区**：隐藏会话列表、设置页、文件路径、凭证面板
2. **可配遮罩**：指定区域打码，用于必须保留但不宜播放的面板

不做这两条，实录模式就是隐私事故的入口——这不是可选项。

### 2.5 为什么四种都要留

**不捕获桌宠小窗，但捕获应用主窗**是两回事：桌宠窗是透明置顶小窗，背景不可控、分辨率随用户拖动变化，做直播画面没有意义；主窗是固定布局、用户自己选的，录它才有价值。


### 2.6 音频

```
TTS 旁白 ──┐
BGM ───────┼──→ AudioMixer ──→ encoder 音轨
游戏原声 ──┘（默认关闭，见 5.2）
```

音频仍然落盘走 `/api/generated/audios`，与现有产物通道一致；直播时由 server 侧把 PCM 混流进 ffmpeg，不经浏览器扬声器。

---

## 3. 场景模板

| 模板 | 布局 | 画面来源 | 适用 |
|---|---|---|---|
| `avatar-full` | 虚拟人全屏 + 字幕 + 角标 | A 自渲染 | 单口问答、讲解 |
| `pet-full` | 宠物居中 + 场景背景 + 字幕 + 弹幕 | A 自渲染 | 宠物单口、逗宠互动 |
| `task-live` | 应用窗口实录 + 主播画中画 + 解说字幕 | B 窗口捕获 | **看智能体真实干活** |
| `game-pip` | 游戏画面主位 + 主播右下画中画 + 解说字幕 | C 帧流 / B 窗口 | 智能体代玩 |
| `duo` | 虚拟人 + 宠物同框 | A 自渲染 | 后续，双角色对话 |

**可视原型**：[docs/prototypes/live-scene-proto.html](prototypes/live-scene-proto.html)
可切换五种场景、竖屏/横屏、模拟说话/思考/工具执行/弹幕。

---

## 4. 三种主体的接入成本

### 4.1 虚拟人（新建）

- three.js 程序化角色，零资产零授权
- 口型用 WebAudio 振幅驱动（与 TTS 引擎解耦）
- 升级路径：自建 VRM（Blender 免费）或本地生图 + 分层 2D，都接同一接口
- 详见 §4.4

### 4.2 宠物（现成，只需适配）

| 现有资产 | 文件 | 直接可用 |
|---|---|---|
| 2D 精灵包（6 只） | `components/pet/Pet2D.vue`、`assets/pet-packs` | 是 |
| 3D/VRM | `components/pet/Pet3D.vue`、`vrmLoader.ts`、`vrmPose.ts` | 是 |
| 六态状态机 | `stores/pet.ts` 的 `PetState` | 是 |
| 工具→动作映射 | `derivePetActivity`（think/read/search/write/act/tool） | 是 |
| 六个互动动作 | 摸摸/招手/张望/打盹/转圈/跳一跳 | 是 |
| 任务派生 | `usePetBridge` | 是（直播页需独立实例，不复用桌宠窗的 IPC） |

**需要新增的只有两件**：`PetPerformer` 适配器（约 100 行）、直播模式下的自主行为循环（§7.3）。

### 4.3 游戏（分两种）

| 类型 | 画面来源 | 难度 | 建议 |
|---|---|---|---|
| 宠物 Worlds 小游戏 | 我们自己的 canvas | 低 | **第一期游戏直播用它** |
| 智能体代玩网页游戏 | 浏览器帧（CDP） | 中高 | 第二期 |

Worlds 目前只有原型（`docs/prototypes/game-mode-proto.html`），未进应用。若直播排期优先，建议先把它落了——它同时解决"宠物有事可做"和"画面可控"两个问题。

### 4.4 虚拟人形象（全本地自有）

- P0：three.js 程序化角色（代码生成，无第三方授权问题）
- 升级 A：Blender 自建 VRM → `<dataDir>/avatar/` 导入，`@pixiv/three-vrm` 加载
- 升级 B：本地生图出立绘 → 分层 → canvas 网格变形
- 不需要 Live2D：其 SDK 与模型属第三方产品，与"全本地自有"目标冲突

---

## 5. 游戏画面接入

### 5.1 两条路，按是否需要原声选

| 走法 | 如何做 | 何时用 |
|---|---|---|
| **窗口捕获**（推荐先做） | Electron `desktopCapturer` 抓浏览器窗口；Windows 可同时取系统回环音频 | 需要游戏原声、或要"所见即所播" |
| **CDP 帧流** | `Page.startScreencast`，playwright 已内置，10–20fps JPEG | 窗口被遮挡也不中断；带宽/性能敏感 |

两者都接 `SceneSource` 接口，切换只改配置。

窗口捕获要点：
- 主进程 `desktopCapturer.getSources({ types: ['window'] })` 拿到源 id，renderer 端 `getUserMedia` 绑定
- 或直接用 `session.setDisplayMediaRequestHandler` 指定源，省掉选源 UI
- **音频约束需实测**：Electron 各版本的 loopback 音频支持与 Windows 声卡驱动有关，B1 阶段必须单独验证

### 5.2 必须提前说清的约束

- CDP 帧流**没有声音**；需要原声就走窗口捕获
- 窗口捕获的音频是**系统回环**，会把当时所有声音一起录进去（包括你的提示音），要么隔离，要么接受
- 这些写进 §9 风险，避免验收时扯皮

### 5.3 每步延迟

直播对节奏敏感，而当前代玩瓶颈是「每步 3 次工具往返」（截图 → 分析 → 点击）。
已有结论：应走 `browser_run_loop`（主进程 30Hz + canvas 像素条件 + 急停三闸），而不是"常驻全自动视觉闭环"。
游戏直播直接复用该方案，不另起一套。

---

## 6. 模块清单

### 6.1 服务端 `apps/server/src/live/`

| 文件 | 职责 |
|---|---|
| `session.ts` | 直播会话编排：弹幕 → 路由 → 回复/动作 → TTS → cue |
| `broadcast.ts` | 推流生命周期：开播/下播/重连/断流 |
| `compositor.ts` | 场景合成（在 server 侧用 node-canvas 或对接 renderer 帧） |
| `audio-mixer.ts` | TTS + BGM 混音，输出 PCM |
| `encoder.ts` | ffmpeg 封装（复用 `mcp/ffmpeg-runtime.ts`） |
| `danmaku.ts` | 弹幕源接入与限流 |
| `auto-host.ts` | 自主行为循环（垫场/报进度/定时动作） |
| `game-feed.ts` | CDP screencast 帧流 |

### 6.2 服务端 `apps/server/src/avatar/`

同 v1：`session.ts`（语音会话）、`asr-stream.ts`、`vad.ts`、`tts-stream.ts`、`narrator.ts`、`ws-avatar.ts`、`model-packs.ts`。

### 6.3 前端

| 文件 | 职责 |
|---|---|
| `stores/avatar.ts` | 虚拟人状态机与 cue 队列 |
| `stores/live.ts` | 直播状态、场景模板、弹幕缓冲 |
| `composables/avatar/useMic.ts` | 麦克风采集 + WS 上行 |
| `composables/avatar/useLipSync.ts` | 振幅 → 口型 |
| `composables/live/useScene.ts` | 场景合成与布局计算 |
| `composables/live/useCapture.ts` | 窗口/屏幕捕获（`desktopCapturer` + `getUserMedia`） |
| `composables/live/useDanmaku.ts` | 弹幕渲染 |
| `components/avatar/AvatarStage.vue` | 虚拟人宿主 |
| `components/avatar/renderers/procedural.ts` | three.js 实现 |
| `components/avatar/AvatarDock.vue` | 侧栏常驻小窗 |
| `components/live/Performer.ts` | `Performer` 接口与工厂 |
| `components/live/PetPerformer.ts` | 宠物适配器（包装 Pet2D/Pet3D） |
| `components/live/AvatarPerformer.ts` | 虚拟人适配器 |
| `components/live/GameFeed.vue` | 游戏画面源（CDP 帧流） |
| `components/live/CaptureFeed.vue` | 窗口/屏幕捕获画面源 |
| `views/LiveWorkspace.vue` | 直播工作区（实录模式专用布局） |
| `components/live/SceneStage.vue` | 场景合成画布 |
| `components/live/LiveBar.vue` | 开播控制条 |
| `views/Avatar.vue` | 全屏演播页 |

### 6.4 改动点

| 文件 | 改动 |
|---|---|
| `components/chat/ChatSidebar.vue` | 顶部虚拟人卡片 |
| `router/index.ts` | `/avatar` 路由 |
| `views/PetWindow.vue` / `PetPopup.vue` | 菜单加「开播」（走既有 `pet:action` 通用转发，主进程无需改） |
| `apps/desktop/main.cjs` | `session.setDisplayMediaRequestHandler` 指定捕获源；校验 `setPermissionRequestHandler` 授权 |
| `apps/server/src/index.ts` | 挂载 `/ws/avatar` 与 `/api/live/*` |
| `packages/shared/src/utils/` | cue / live 事件类型常量 |

---

## 7. 状态与契约

### 7.1 虚拟人状态机

```
idle ──(VAD 人声)──→ listening ──(ASR final)──→ thinking
  ↑                                                │
  └──(播报结束)── speaking ←──(首句音频就绪)───────┘
                     └──(VAD 人声)──→ 停播 + abort + listening
```

### 7.2 直播状态机

```
offline → starting → live → wrapping → ended
live 子状态：idle（垫场） | talking（播报） | playing（玩游戏） | replying（回弹幕）
```

### 7.3 自主行为循环（直播的核心差异）

直播和问答的区别不是"能不能说话"，而是**没人说话时不能冷场**：

| 触发 | 行为 |
|---|---|
| 空闲 > 20s | 随机待机动作 + 一句垫场话术 |
| 空闲 > 60s | 开一局 Worlds，边玩边说 |
| 任务事件 | 旁白播报（优先级低于正文回复） |
| 弹幕到达 | 入队，按优先级播报；同时可触发动作 |
| 定时 5min | 报一次当前进度 / 提醒关注 |

所有话术走 `filler` 低优先级，可被正文打断。

### 7.4 Cue 契约

```ts
type Cue =
  | { id: string; kind: 'speak';      text: string; audioUrl: string; durationMs: number; source: CueSource }
  | { id: string; kind: 'caption';    text: string }
  | { id: string; kind: 'expression'; expr: Expression }
  | { id: string; kind: 'action';     name: string }

type CueSource = 'reply' | 'narration' | 'filler' | 'danmaku'
```

优先级：`reply` > `danmaku` > `narration` > `filler`。旁白可丢，正文不可丢。

### 7.5 弹幕路由

| 弹幕类型 | 判定 | 去向 |
|---|---|---|
| 提问 | 默认 | 进会话 → Agent 回复 → 语音播报 |
| 指令 | 匹配键序语法（复用 `gamePlan.ts` 的 `parseKeySequence`） | 限流后注入游戏按键 |
| 互动 | 匹配动作词（摸摸/转圈…） | `Performer.playAction` |
| 其他 | 兜底 | 低优先级播报或忽略 |

---

## 8. 分期计划

### 线 A：虚拟人（9–13 天）

| 阶段 | 内容 | 验收 | 工期 |
|---|---|---|---|
| A0 | 面板 + 程序化形象 + TTS + 口型 + 字幕 | 侧栏对话可用，执行任务正常 | 4–6 天 |
| A1 | 流式 ASR + VAD + 打断 | 连续对话，开口即停 | 5–7 天 |
| A2 | 任务旁白 + 表情 | 边做边说，不念过时内容 | 3–4 天 |

### 线 B：直播管线（9–12 天）

| 阶段 | 内容 | 验收 | 工期 |
|---|---|---|---|
| B0 | `Performer` 抽象 + 宠物适配器 | 宠物可在演播页出现并按状态动 | 2–3 天 |
| B1 | 场景合成 + 窗口捕获 + 本地录制 | 五种模板可切换；实录模式能播应用窗口；录 1080×1920 流畅 | 4–5 天 |
| B2 | 推流 + 垫场 + 断流重连 | RTMP 稳定 30 分钟，无人自动垫场 | 4–5 天 |
| B3 | 虚拟人接入场景 | 虚拟人可在五种模板中作为主播 | 1–2 天 |

### 线 C：游戏直播（6–9 天）

| 阶段 | 内容 | 验收 | 工期 |
|---|---|---|---|
| C0 | Worlds 落进应用 | 宠物能自己玩一局，画面可进场景 | 3–5 天 |
| C1 | CDP 帧流接入 | 代玩画面 ≤200ms 延迟进合成 | 2–3 天 |
| C2 | 弹幕指挥 + 解说 | 弹幕按键被正确执行且限流 | 2–3 天 |

### 线 D：安全与运营（3–5 天，与 B/C 并行）

- 直播模式工具白名单
- 弹幕注入检测与限流
- AIGC 标识、画面隐私过滤
- 直播日志与回放

---

## 9. 风险与边界

### 9.1 安全（必须做）

- **工具白名单**：直播模式只读 + 查询；写文件/执行命令/装软件一律拒绝
- **拒绝要口头说明**，不能静默失败（观众能看到行为）
- **弹幕注入检测**：长度限制 + "忽略之前所有指令"类模式识别
- **游戏按键白名单**：只允许方向/确认类键，禁止退出、充值、删除
- **限流**：单观众按键指令 ≤ N 次/分钟

### 9.2 隐私

- 实录模式必须运行在**直播工作区**：会话列表、文件路径、凭证页一律不出现
- 捕获源只允许选**本应用窗口或指定浏览器窗口**，不允许整屏（整屏作为最后手段，需二次确认）
- 场景渲染进程不读会话列表、文件路径、凭证
- 弹幕里出现的个人信息不回显
- 开播前显示一次「将要广播的窗口预览」，确认后才开始推流

### 9.3 技术不确定项

| 项 | 风险 | 应对 |
|---|---|---|
| 音画同步 | 高 | B1 先用本地录制验证，漂移可量化再上推流 |
| 窗口捕获兼容性 | 中 | Windows GPU 捕获在部分驱动上异常；B1 做多机验证，失败退 CDP 帧流 |
| 回环音频可用性 | 中 | 各 Electron 版本/声卡差异大；不可用时降级为 TTS 解说 |
| 捕获帧率 | 中 | 窗口捕获默认 30fps，动态降到 15fps 控 CPU；低于 10fps 提示用户 |
| CDP 帧率/画质 | 中 | 帧率可调；低于 10fps 时降级为静态截图 + 解说 |
| ASR 模型体积 | 中 | 按需下载（100–200MB），复用 `tts-packs.ts` 的镜像/代理链路 |
| sherpa TTS 自然度 | 中 | 多音色包切换，必要时接本地模型层 `/v1/audio/speech` |
| 程序化形象观感 | 中 | 只用于前期；上播前换 VRM 或分层 2D |
| 宠物自主玩游戏的可靠性 | 中 | Worlds 是我们自己的 canvas，比网页游戏可控得多 |

### 9.4 平台合规

- 抖音等对无人直播有限制，AIGC 内容需标识
- 第一期先做本地录制验证，再谈正式开播
- 推流码走 keyring，不落明文

---

## 10. 明确不做

- 不接云端数字人（腾讯云/火山/硅基智能）
- 不做 Live2D（第三方授权与"全本地自有"冲突）
- 不做整屏长期录制（整屏只作最后手段，单次需确认）
- 不做多主播/多路推流
- 不改任务执行引擎与工具协议

---

## 11. 现有代码对应表

| 现有能力 | 文件 | 本方案如何使用 |
|---|---|---|
| 任务事件总线 | `apps/server/src/llm-task-manager.ts:598/1834` | 旁白与状态机唯一事件源 |
| WS 传输 | `apps/server/src/chat-ws.ts` | 任务事件沿用；语音另开 `/ws/avatar` |
| 起任务 | `apps/server/src/services/im.ts:752` | 语音/弹幕输入注入会话的范式 |
| 本地 TTS | `apps/server/src/mcp/sherpa-tts.ts` | 主引擎 |
| TTS 模型管理 | `apps/server/src/services/tts-packs.ts` | ASR 模型下载照此实现 |
| 音频产物 | `apps/server/src/index.ts:287` | 播报音频 URL |
| ffmpeg | `apps/server/src/mcp/ffmpeg-runtime.ts` | 编码推流 |
| 宠物 2D | `packages/ui/src/components/pet/Pet2D.vue` | `PetPerformer` 底层 |
| 宠物 3D/VRM | `packages/ui/src/components/pet/Pet3D.vue` | 同上 |
| 宠物状态机 | `packages/ui/src/stores/pet.ts` | `PetState` + `derivePetActivity` |
| 宠物动作 | 串口菜单六动作（半圆菜单实现） | `playAction` |
| 宠物桥接 | `packages/ui/src/composables/usePetBridge.ts` | 直播页派生状态参考 |
| 窗口捕获 | `apps/desktop/main.cjs`（Electron 主进程） | 实录模式画面源 |
| 游戏键序 | `packages/ui/src/utils/gamePlan.ts` | 弹幕指令解析 |
| 游戏执行条 | `packages/ui/src/components/browser/GameControlBar.vue` | 代玩控制 |
| 游戏方案 | `docs/智能体代玩游戏-方案-2026-10-28.md` | C1 直接复用 `browser_run_loop` |
| 凭证 | `packages/ui/src/stores/platform.ts` + keyring | 直播凭证 |

---

## 12. 第一版交付物

1. `/avatar` 页面与侧栏 Dock
2. 程序化虚拟人（口型/眨眼/表情）+ 全本地 TTS + 字幕
3. 全本地流式 ASR + 打断
4. 任务事件旁白
5. `Performer` 抽象 + 宠物主播
6. 场景合成 + 本地录制 + RTMP 推流
7. 弹幕路由与直播模式白名单
