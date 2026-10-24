# 虚拟人直播功能方案

> 状态：方案评审稿
> 目标：侧栏常驻虚拟人，能对话、能实时执行任务、能直播
> 约束：全本地优先，不依赖云端 API，形象资产自有

---

## 0. 结论摘要

- **可行**。仓库已经把最难的三块做完了：任务执行引擎、细粒度事件流、本地 TTS/ffmpeg 运行时。
- **不需要 Live2D**。形象用 three.js 程序化生成（自有版权、零资产、零下载），后续可平滑换成自建 VRM。
- **不需要新执行引擎**。虚拟人是现有 Agent 的「人格外壳」，共用会话、任务、权限、工具。
- 全本地语音链路：`sherpa-onnx` 负责 TTS + 流式 ASR + VAD（同一运行时，零新依赖）。
- 总工期：本地完整虚拟人 9–13 天；加上直播全链路 20–25 天（单人）。

---

## 1. 产品定义与用户路径

### 1.1 定位

虚拟人 = Agent 的语音 + 形象外壳。不是新角色、不是新 Agent、不是新工具集。

```
用户说话 ──→ 同一套 Chat 会话 ──→ 同一套任务执行 ──→ 同一套工具权限
                    │
                    └──→ 输出改为：语音 + 口型 + 表情 + 字幕
```

### 1.2 三条产品路径

| 路径 | 入口 | 行为 |
|---|---|---|
| 侧栏对话 | 侧栏虚拟人卡片 / 悬浮球 | 打字或说话，即时问答，可执行任意任务 |
| 全屏演播 | `/avatar` 路由 | 大画面、字幕、任务过程可视化，适合录制 |
| 直播 | 演播页「开播」 | 接弹幕输入，内容输出到 RTMP |

### 1.3 侧栏落点（现有结构）

- 会话列表顶部：`packages/ui/src/components/chat/ChatSidebar.vue` 加常驻虚拟人卡片
- 折叠态：右下角悬浮球，展开为 Dock 小窗（`AvatarDock.vue`）
- 全屏页：新增路由 `/avatar`（`packages/ui/src/router/index.ts`）
- 桌面顶部导航与移动端底栏**不新增一级入口**，避免导航膨胀

---

## 2. 技术选型（全本地）

| 能力 | 选型 | 现状 | 工作量 |
|---|---|---|---|
| 形象渲染 | three.js 程序化角色 | 已有 `three@0.185` | 新建 |
| 口型驱动 | WebAudio AnalyserNode 振幅 → morph 权重 | 无 | 新建，小 |
| TTS | sherpa-onnx VITS 本地模型 | **已有** `mcp/sherpa-tts.ts` | 加流式取音频 |
| ASR | sherpa-onnx streaming Zipformer | 运行时已有，**模型需新增下载** | 新建，中 |
| VAD | sherpa-onnx 内置 Silero VAD | 同一运行时 | 新建，小 |
| 音频播放 | 现有 `/api/generated/audios` + `<audio>` | **已有** | 无 |
| 事件流 | 现有 WS 任务事件总线 | **已有** `chat-ws.ts` | 复用 |
| 任务启动 | 现有 `llm-task-manager` | **已有** | 复用 |
| 推流 | renderer 出帧+PCM → server → ffmpeg → RTMP | ffmpeg 运行时已有 | 新建，大 |

### 2.1 为什么不用 Edge-TTS

`mcp/edge-tts.ts` 调用的是微软在线接口，需要联网，与「全本地」冲突。降级为「在线可选增强」，默认关闭。

### 2.2 为什么不直接用 whisper.cpp 做对话

现有 `mcp/whisper-runtime.ts` 是文件级识别（整段音频进、整段文本出），没有增量结果，做连续对话延迟不可接受。保留用于「录音转写」场景，对话走 sherpa streaming。

---

## 3. 架构与数据流

```
┌───────────────────────── Renderer (Vue) ─────────────────────────┐
│                                                                  │
│  麦克风 ──AudioWorklet(16k PCM)──┐                                │
│                                  │                                │
│  AvatarStage ◄── AvatarRenderer ─┼── useLipSync ◄── <audio>       │
│  (three.js)     (接口)           │      振幅                       │
│                                  │                                │
│  useAvatarSession ◄──────────────┴── Cue 队列 / 状态机            │
└──────────────┬───────────────────────────────┬───────────────────┘
               │ WS 二进制 PCM                  │ WS JSON cue
               ▼                               ▲
┌───────────────────────── Server ─────────────┴───────────────────┐
│                                                                  │
│  ws-avatar ──► vad ──► asr-stream ──► session ──► narrator       │
│                                          │                       │
│                                          ├──► llm-task-manager   │
│                                          │      (现有执行引擎)    │
│                                          ├──► tts-stream         │
│                                          └──► cue 下发            │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 两条独立通道

- **上行**：renderer 采集 16kHz/mono/PCM16 → `/ws/avatar` 二进制帧
- **下行**：server 推 `Cue` JSON；音频走 HTTP URL（与现有音频产物一致，可缓存、可重放）

不用一条通道混流，是因为音频文件走 HTTP 可以利用现有 `/api/generated/audios` 的静态服务与浏览器缓存，且断线重连后可直接重播。

### 3.2 为什么不走 chat-ws

现有 `chat-ws.ts` 是任务事件专用协议。在它上面叠二进制音频帧会让两条生命周期的重连语义纠缠。独立 `/ws/avatar` 只做语音会话，任务事件仍由现有 chat-ws 订阅，互不影响。

---

## 4. 形象方案（自有版权）

### 4.1 P0：程序化 three.js 角色

- 基础几何体拼装（头、眼、嘴、身体），材质纯色 + 简单光照
- 支持：嘴开合、眨眼、眉毛、头部轻微摆动、呼吸待机
- 全部由代码生成，**零资产、零下载、零授权**
- 优势：跨平台一致、分辨率无损、渲染性能低
- 定位：证明链路通 + 提供后续所有功能的驱动接口

视觉目标是「能看、能动、口型准」，不是「能上播」。上播前需要换 P3 的正式形象。

### 4.2 P1+：两种升级路径（都自有）

**路径 A — 自建 VRM**
- Blender（免费）+ VRM Add-on 自建角色，导出 `.vrm`
- 放到 `<dataDir>/avatar/` 由用户导入
- three.js 用 `@pixiv/three-vrm` 加载，口型用 blendShape `aa`
- 授权：模型由你自己建模，版权归你

**路径 B — 本地生图 + 分层 2D**
- 用本地生图模型生成角色立绘（自有版权）
- 手动或半自动切成 底图/眼/嘴/发 图层
- canvas 网格变形 + 嘴部贴片切换，实现 Live2D 式效果
- 成本：需要本地生图能力 + 一次性切图

两条路径都接同一个 `AvatarRenderer` 接口，业务层不动。

### 4.3 渲染接口（关键抽象）

```ts
export interface AvatarRenderer {
  mount(el: HTMLElement, opts: { width: number; height: number }): Promise<void>
  setMouth(open: number): void            // 0~1
  setExpression(e: Expression): void
  setSpeaking(on: boolean): void
  resize(w: number, h: number): void
  destroy(): void
}

export type Expression = 'neutral' | 'thinking' | 'happy' | 'confused' | 'surprised'
```

先实现 `procedural.ts`，`vrm.ts` / `layered.ts` 后续补，随时可切。

---

## 5. 模块清单

### 5.1 服务端 `apps/server/src/avatar/`

| 文件 | 职责 |
|---|---|
| `session.ts` | 会话编排：ASR final → 起任务 → 订阅事件 → 旁白 → TTS → 下发 cue |
| `asr-stream.ts` | sherpa streaming recognizer，按 session 生命周期管理 |
| `vad.ts` | Silero VAD，输出语音起止与「用户开始说话」事件 |
| `tts-stream.ts` | 分句 + 增量取音频 + 落盘 + 返回 URL |
| `narrator.ts` | 任务事件 → 播报话术（模板优先，必要时小模型润色） |
| `ws-avatar.ts` | `/ws/avatar` 上行二进制、下行 cue |
| `routes.ts` | 模型状态、音色列表、演播控制 |
| `model-packs.ts` | ASR 模型清单/下载（复用 `services/tts-packs.ts` 的模式） |

**复用点**：`apps/server/src/services/im.ts:752` 的 `createTask` 就是「非 UI 入口起一轮任务」的现成范式，语音输入走同一条路。

### 5.2 前端 `packages/ui/src/`

| 文件 | 职责 |
|---|---|
| `stores/avatar.ts` | 状态机、cue 队列、播报优先级 |
| `composables/avatar/useMic.ts` | getUserMedia + AudioWorklet 降采样 + WS 发送 |
| `composables/avatar/useLipSync.ts` | AnalyserNode → 口型值 |
| `composables/avatar/useAvatarSession.ts` | cue 消费、打断、字幕 |
| `components/avatar/AvatarStage.vue` | 渲染宿主 + 画布尺寸管理 |
| `components/avatar/renderers/types.ts` | `AvatarRenderer` 接口 |
| `components/avatar/renderers/procedural.ts` | P0 three.js 实现 |
| `components/avatar/AvatarDock.vue` | 侧栏常驻小窗 |
| `views/Avatar.vue` | 全屏演播页 |

### 5.3 改动点（现有文件）

| 文件 | 改动 |
|---|---|
| `packages/ui/src/components/chat/ChatSidebar.vue` | 顶部加虚拟人卡片 |
| `packages/ui/src/router/index.ts` | 注册 `/avatar` |
| `packages/ui/src/views/chat.css` | Dock / 舞台样式 |
| `apps/server/src/index.ts` | 挂载 `/ws/avatar` 升级与路由 |
| `packages/shared/src/utils/` | 增加 avatar cue 类型与事件名常量 |

---

## 6. 事件与状态契约

### 6.1 状态机

```
idle ──(VAD 检测到人声)──→ listening ──(ASR final)──→ thinking
  ↑                                                      │
  └──(播报结束)── speaking ←──(首句音频就绪)────────────┘
                     │
                     └──(VAD 再次检测到人声)──→ 停播 + abort + listening
```

### 6.2 Cue 契约

```ts
type Cue =
  | { id: string; kind: 'speak';    text: string; audioUrl: string; durationMs: number; source: CueSource }
  | { id: string; kind: 'caption';  text: string }
  | { id: string; kind: 'expression'; expr: Expression }

type CueSource = 'reply' | 'narration' | 'filler'
```

### 6.3 播报优先级

| 级别 | 来源 | 可丢弃 | 可打断 |
|---|---|---|---|
| 1 | `reply`（正文回答） | 否 | 仅用户开口 |
| 2 | `narration`（任务旁白） | 是 | 是 |
| 3 | `filler`（垫场话术） | 是 | 是 |

任务跑得快时旁白会被自然丢弃，不会堵住正文。这是必须的——否则工具连发十个事件，虚拟人会把过时进度念完才回答问题。

### 6.4 旁白映射（示例）

| 事件 | 话术 |
|---|---|
| `tool:start` (browser) | 「我打开页面看一下。」 |
| `tool:start` (file) | 「我读一下这个文件。」 |
| `tool:result` (error) | 「这一步没成功，我换个方法。」 |
| `task:completed` | 用正文结果总结 |

模板优先，命中不了才调用模型润色，避免每轮多一次推理。

---

## 7. 分期计划与验收

### P0 面板（4–6 天）

范围：程序化形象 + 文本对话 + TTS 播报 + 口型 + 字幕 + 侧栏入口

验收：
- [ ] 侧栏点开虚拟人，能打字对话并执行工具任务
- [ ] 回答有语音、口型跟着音频动、字幕同步
- [ ] 关闭面板后任务继续执行，重开能接上
- [ ] 无联网也能跑（除模型下载外）

### P1 语音（5–7 天）

范围：麦克风采集 + 流式 ASR + VAD + 打断

验收：
- [ ] 免打字连续对话，识别延迟 < 1.5s（说话结束到首个回应）
- [ ] 虚拟人说话时用户一开口，立即停播
- [ ] 静音环境无自激（自己的声音不触发录音）

### P2 旁白（3–4 天）

范围：任务事件 → 话术、工具执行表情、进度字幕

验收：
- [ ] 执行浏览器任务全程「边做边说」，不念过时内容
- [ ] 出错时表情与话术一致，不假装成功
- [ ] 长任务有阶段提示，不冷场

### P3 直播（6–10 天）

范围：演播页 + 出帧/音频 → ffmpeg → RTMP + 垫场

前置：2 小时技术验证，确认「canvas 出帧 + PCM 入 ffmpeg」的延迟与画质，再定最终管线。

验收：
- [ ] 本地录制 1080x1920 流畅，音画同步无明显漂移
- [ ] RTMP 推流稳定 30 分钟不断
- [ ] 断流自动重连，虚拟人有提示
- [ ] 无人时自动垫场

### P4 升级（5–8 天）

范围：VRM/分层形象 + 弹幕 + 直播模式权限

验收：
- [ ] 导入自建 VRM 后口型/表情正常
- [ ] 弹幕能触发对话并回复
- [ ] 直播模式下越权工具被拒绝且有口头说明

---

## 8. 风险与边界

### 8.1 安全（上线前必须做）

直播观众输入不可信，必须实现「直播模式」：

- 工具白名单：只读 + 查询类；写文件、执行命令、装软件一律拒绝
- 拒绝时**口头说明**而非静默失败（观众能看到行为）
- 弹幕输入长度限制 + 注入检测（「忽略之前所有指令」类）
- 每轮工具调用记录留档，可回放

### 8.2 平台合规

- 抖音等对无人直播有限制，AIGC 内容需标识
- 第一期先做本地录制验证效果，再谈正式开播
- 推流码等凭证走现有 keyring，不落明文

### 8.3 技术不确定项

| 项 | 风险 | 应对 |
|---|---|---|
| 推流音画同步 | 高 | P3 前置 spike，不行就退化为本地录制 |
| ASR 模型体积 | 中 | 按需下载（约 100–200MB），复用 tts-packs 的镜像/代理链路 |
| sherpa TTS 中文自然度 | 中 | 多音色包可切换，必要时接本地模型层 `/v1/audio/speech` |
| 程序化形象观感 | 中 | 只用于 P0–P2；上播前换 VRM 或分层 2D |
| 自有声音 | 低 | 暂无需求，后续可用本地声音克隆 |

---

## 9. 明确不做

- 不接云端数字人（腾讯云/火山/硅基智能）
- 不做唇形 viseme 精修（P0–P2 用振幅驱动足够）
- 不做多虚拟人/多角色
- 不改任务执行引擎与工具协议
- 不在 P0–P2 阶段提前为推流做设计

---

## 10. 第一版交付物

1. `/avatar` 页面与侧栏 Dock
2. 程序化 three.js 虚拟人（口型/眨眼/表情）
3. 全本地 TTS 播报 + 字幕
4. 任务事件旁白
5. 全本地流式 ASR + 打断
6. 直播页与推流（P3）

---

## 附：与现有代码的对应关系

| 现有能力 | 文件 | 本方案如何使用 |
|---|---|---|
| 任务事件总线 | `apps/server/src/llm-task-manager.ts:598/1834` | 旁白与状态机的唯一事件源 |
| WS 传输 | `apps/server/src/chat-ws.ts` | 任务事件沿用；语音另开 `/ws/avatar` |
| 前端订阅 | `packages/ui/src/utils/chat-ws.ts` | 复用重连与续传逻辑 |
| 起任务 | `apps/server/src/services/im.ts:752` | 语音输入注入会话的范式 |
| 本地 TTS | `apps/server/src/mcp/sherpa-tts.ts` | 主引擎 |
| TTS 模型管理 | `apps/server/src/services/tts-packs.ts` | ASR 模型下载照此实现 |
| 音频产物 | `apps/server/src/index.ts:287` | 播报音频 URL |
| 音频播放 | `packages/ui/src/components/media/AudioPlayer.vue` | 播放与互斥参考 |
| ffmpeg | `apps/server/src/mcp/ffmpeg-runtime.ts` | 推流编码 |
| 凭证 | `packages/ui/src/stores/platform.ts` + keyring | 直播凭证 |
| 导航 | `WebTopBar.vue:232` / `SideNav.vue:273` | 不新增，走侧栏 |
