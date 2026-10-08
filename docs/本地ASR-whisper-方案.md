# 本地 ASR（whisper.cpp）方案 — 语音转字幕

> 2026-10-08 立项 · 用户已定选型：**本地 whisper.cpp，不要云端 API** · 确认后实施
> 承接 `docs/剪辑模式方案.md` 的 P2 待定项「语音转字幕（whisper.cpp 本地转写，替代/补充按文本生成 SRT）」

## 一、目标与边界

**要做的**：把「已有音频/视频」转成带时间轴的 SRT，供 `media_compose` 的 subtitle 操作烧进视频。
补上当前缺的那一环——现有 `api_srt_generate` 是**按文本生成**（时间轴靠时长累加推算），
**不做语音识别**；剪辑时若素材只有音频（配音/录屏/别人给的成片），就无字幕可用。

**不做**：不接云端 API（用户明确）。不做实时流式转写。不做说话人分离（diarization）。

**为什么必须本地**：隐私（音频不出本机）+ 离线可用 + 无按量计费。

## 二、硬约束（实测，2026-10-08）

| 项 | 实测结果 | 影响 |
|---|---|---|
| GitHub 直连 | `github.com → 000` | ★ 不能假设可用 |
| GitHub 走代理 | `github.com → 200`（需 FlClash 在跑） | 代理未启动时下载必失败 |
| model 托管 | HuggingFace / hf-mirror（`hf-mirror.com` 直连实测 **000**） | 同上，需代理 |
| 本机 whisper | **无**（`which whisper` 空、`/c/APP` 无） | 首次必须获取 |
| 本机 ffmpeg | 已有（`<dataDir>/ffmpeg/ffmpeg.exe`） | ✅ 转码前置环节可复用 |

### ★★ 二进制来源的重大发现（决定 URL 写法）

**whisper.cpp 的正式 release 零二进制资产** —— 实测 `v1.9.5` 的 `assets: []`，
官方自述「Maintenance release… **Nightly build: b5454**」。
二进制只在 **nightly build tag**（形如 `b5454`）上。

**真实资产名（实测 `releases/tags/b5454`，12 个资产）**：

| 资产 | 体积 | 取舍 |
|---|---|---|
| `whisper-bin-x64.zip` | **8MB** | ✅ **默认选它**（CPU 版，无显卡依赖，体积最小） |
| `whisper-blas-bin-x64.zip` | 20MB | 可选：BLAS 加速，CPU 上明显更快 |
| `whisper-bin-win-cuda-12.4.0-x64.zip` | 653MB | ✗ 不选（需 N 卡 + 体积大） |
| `whisper-bin-win-cuda-11.8.0-x64.zip` | 271MB | ✗ 同上 |
| `whisper-bin-Win32.zip` / `-arm64` / `-opencl-adreno-arm64` | 4–5MB | 按架构分派时才用 |

URL 形态：
```
https://github.com/ggml-org/whisper.cpp/releases/download/<nightly-tag>/whisper-bin-x64.zip
```
⚠️ `<nightly-tag>` 是**滚动 tag**，不能写死某个版本（会随 nightly 轮换）。
方案：**运行时查 GitHub API 取最新 nightly tag**（`/releases` 列表里找 `b<数字>` 形态），
查不到（如离线）则退回「让用户手动放置」。

⇒ **结论：不能只做"自动下载"**。网络受限 + tag 滚动 + 正式版无资产，
三重因素叠加下自动下载只能是"尽力而为"，**必须同时给"用户自备"通道**。

## 三、分发策略（用户拍板：两者都做）

照搬 `apps/server/src/mcp/ffmpeg-runtime.ts` 的成熟惯例（**不随包、按需下载、支持手动放置**）：

**解析顺序**（与 ffmpeg 同构）：
```
YZ_WHISPER_PATH（显式）
  > <dataDir>/whisper/whisper-cli[.exe]（下载安装位 = 手动放置位，同一个目录）
  > 随包目录（兼容）
  > PATH
```

**双路获取**：
1. **自动下载**（`whisper_install` 工具）：
   - **先查 nightly tag**：`GET /repos/ggml-org/whisper.cpp/releases`，取第一个 `b<数字>` 形态的 tag
     （★ 不能写死版本：实测 `v1.9.5` 正式版**零资产**，二进制只在 nightly）
   - **再下对应资产**：`whisper-bin-x64.zip`（8MB，CPU 版，默认）
   - **下模型**：从 HuggingFace 取 `ggml-<model>.bin`
   - 下载失败 → **明确报错并给出两种补救**：① 启动代理后重试；② 手动下载放到 `<installDir>`
2. **用户自备**（推荐路径，稳定）：
   - 工具返回的 `installDir` 就是放置目录；用户把 `whisper-cli.exe` 丢进去即生效
   - 与 ffmpeg 的 `installDir()` 注释一致：「用户手动放置也可放这里」

★ **不做「镜像源硬编码」**：GitHub 代理源（ghproxy 类）稳定性不可控、且可能违反使用条款；
   本项目既有约定是"用官方源 + 失败给明确指引"（见 ffmpeg-runtime 的下载源选择注释）。
★ **不静默降级**：下载失败绝不假装成功；必须让用户明确知道"要么开代理，要么手动放"。

## 四、模型选择（用户拍板：轻量 + 可配置）

| 模型 | 体积 | 中文效果 | 用途 |
|---|---|---|---|
| `base` | ~142MB | 一般 | 先跑通链路 / 快速草稿 |
| **`small`** | ~466MB | **明显更好** | **默认**（中文小说/字幕场景） |
| `medium` | ~1.5GB | 最好但慢 | 质量优先时选 |

- 工具暴露 `model` 参数，**默认 `small`**；用户可传 `base`（求快）或 `medium`（求准）。
- 模型同样按需下载到 `<dataDir>/whisper/models/`；**支持用户手动放入**（放同目录即认）。
- ★ 模型文件**不随包**（体积大且各语言通用，随包等于给所有用户塞 1.5GB）。

## 五、工具设计（拟新增 2 个）

### 1. `media_asr_transcribe`（核心：音频 → SRT）
```
入参：
  input    必填  音频/视频路径（视频自动用 ffmpeg 抽音轨）
  model    可选  base | small（默认） | medium
  language 可选  默认 zh
  format   可选  srt（默认） | txt | vtt
  maxSeconds 可选 截断（防长音频跑很久）
返回：
  { type: 'file', file, url, duration, segmentCount, preview }
  ★ 与 api_srt_generate 返回结构一致 → 下游 media_compose 的 subtitle 操作零改动
```
实现要点：
- 视频输入先经 ffmpeg 抽 16kHz 单声道 WAV（whisper.cpp 要求），复用现有 ffmpeg 定位
- 用 `--output-srt` 直接产 SRT（whisper.cpp 原生支持），无需自己写时间轴
- 失败分诊要明确：**工具未装 / 模型未下载 / 网络不可达 / 音频无语音**，四类各自给不同指引
- 超时：长音频按比例放宽（参照 novel_tuiwen 的 30 分钟上限经验）

### 2. `whisper_install`（准备：装二进制 + 模型）
```
入参：
  what   可选  cli（默认） | model | all
  model  可选  下载哪个模型（配合 what=model/all）
返回：
  { ok, message, installDir, binaryPath, modelPath }
  ★ 失败时 message 必须含「手动放置目录」与「需代理」两条指引
```
与 `media_install_ffmpeg` 同形（用户已熟悉的模式，无需学新东西）。

## 六、接入点（改哪里、为什么）

| 位置 | 改动 | 说明 |
|---|---|---|
| `packages/core/src/tool/builtin/api-tools/media.ts` | +2 个工具定义 | 与 `api_srt_generate` / `media_install_ffmpeg` 同族 |
| `apps/server/src/mcp/whisper-runtime.ts`（新） | 二进制/模型定位+下载 | 照 `ffmpeg-runtime.ts` 骨架（纯函数 + 可注入，便于单测） |
| `apps/server/src/mcp/api-tool-executor.ts` | 接 2 个工具的执行 | 与 `media_*` 同处 |
| `apps/server/src/builtin-task-mode-agents.ts`（剪辑师） | `builtin_tool_ids` 补 2 个 | 否则模型看不到工具（★ 三段式：注册→挂载→进 buildToolsForBackend） |
| `skill_video_editing`（剪辑 skill） | 补 ASR 用法与降级说明 | 让模型知道"有音频但没字幕时走这条" |
| `docs/剪辑模式方案.md` | 把 P2 该条标为「已定选型，见本文」 | 收口台账 |

★ **必须走三段式核验**（本项目硬规则）：注册 `api-tools` + 挂载 `builtin_tool_ids` + 进
`buildToolsForBackend`——**断任一段不报错**，只表现为"模型根本不知道有这个工具"。

## 七、验证计划（不接受"应该没问题"）

1. **单测**（`whisper-runtime` 纯函数）：
   - 解析顺序（env > 安装位 > 随包 > PATH）各分支
   - 平台 → 下载源映射
   - 失败分诊文案（四类必须区分）
2. **工具链三段式核验**：模型实际收到的 tool list 里能看到 2 个新工具
3. **真跑**（本机有 ffmpeg）：
   - 造一段**已知内容的短音频**（用现有 TTS 生成"测试一二三四五"）→ 转写 → 比对文本与时间轴
   - **必须核验时间轴**（不是只看有没有文字）：抽帧烧字验证字幕与语音对齐
4. **变异/反例**：
   - 未装 whisper → 报错文案含手动放置目录（不能只说"失败"）
   - 无语音音频（纯静音）→ 明确报"未检测到语音"，不是空 SRT 静默成功
   - 视频输入 → 自动抽音轨成功

## 八、风险与取舍

| 风险 | 处置 |
|---|---|
| GitHub 下载依赖代理 | **明确报错 + 双手动通道**；不假装能自动搞定 |
| 模型体积大（1.5GB medium） | 默认 small；模型可手动放置；不随包 |
| 首次使用要等下载 | 工具返回进度；`what=all` 一次装齐 |
| 中文识别质量 | 默认 small；文档写明 medium 更准但慢；★ 不承诺"完美"，如实告知 |
| 长音频耗时 | `maxSeconds` 可截断；超时按已产出的部分落盘（不整段丢） |
| whisper.cpp 版本 API 变动 | 锁 `whisper-cli` 的命令行形态（`-m/--output-srt`），不依赖内部函数名 |

## 九、待确认

1. 本方案的工具命名（`media_asr_transcribe` / `whisper_install`）是否合适？
2. 默认模型 `small` 是否接受（首次需下 466MB）？
3. 是否本轮一并做**剪辑 UI 的「语音转字幕」按钮**（现在只有对话/工具栏入口）？

---

## 附：实测证据（2026-10-08，全部走代理实查）

```
# 网络
github.com 直连        → 000（不可达）
github.com 走代理      → 200
hf-mirror.com 直连     → 000

# 版本与资产（走代理查 GitHub API）
GET /repos/ggml-org/whisper.cpp/releases/latest
  → tag_name: v1.9.5   |  assets: []        ★ 正式版零资产
GET /repos/ggml-org/whisper.cpp/releases/tags/b5454
  → assets: 12
      whisper-bin-x64.zip                    8MB   ← 默认选它
      whisper-blas-bin-x64.zip              20MB   ← 可选加速
      whisper-bin-win-cuda-12.4.0-x64.zip  653MB   ← 不选
      whisper-bin-win-cuda-11.8.0-x64.zip  271MB   ← 不选
      whisper-bin-Win32.zip                  5MB
      whisper-bin-win-cpu-arm64.zip          4MB
      whisper-bin-ubuntu-x64.tar.gz          9MB
      whisper-bin-ubuntu-arm64.tar.gz        4MB
      whisper-bin-win-opencl-adreno-arm64.zip 4MB
      whisper-bin-win-cuda-13.4-arm64.zip  277MB
      whisper-blas-bin-Win32.zip            11MB
      （+1）

# 本机
which whisper / whisper-cli  → 无
/c/APP                       → 无 whisper
<dataDir>/ffmpeg/            → ffmpeg.exe + ffprobe.exe（已装）
```

**结论**：方案可行，但**自动下载是"尽力而为"**（依赖代理 + 滚动 tag）；
用户自备通道是**必须的兜底**，不是可选项。