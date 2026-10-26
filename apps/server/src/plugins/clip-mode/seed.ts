// 剪辑模式的内置种子（剪辑师智能体）—— mode-pluginization P4「种子归位」。
//
// ★ 为什么定义放在插件目录：智能体是**模式能力的一部分** —— 它的工具面（clip_project /
//   music_compose / media_* 等）、技能与提示词纪律都是剪辑专属。归位后：
//   · P5 打包裁剪有了物理边界（未选剪辑就不该带这套种子）；
//   · 改剪辑能力只动本目录，不必翻 db.ts / builtin-task-mode-agents.ts。
//
// 现状（P4）：基座仍**静态组合**本文件（builtin-task-mode-agents.ts 展开进 seedAgents），
// 保证落库顺序与旧库 force_sync 覆盖行为完全不变。运行时按插件启用与否补种属于 P5
// （需要「插件未装则种子不存在」的语义），届时把组合改成 activate 期调用即可。
//
// ⚠️ 工具集来自基座的中立模块 builtin-task-tool-sets.ts —— 不要在这里反向 import
//    builtin-task-mode-agents.ts（会形成 ESM 循环，顶层数组求值时炸 TDZ）。
import {
  COMMON_FILE_TOOLS,
  COMMON_MEDIA_FETCH_TOOLS,
  COMMON_SPACE_TOOLS,
  COMMON_MEMORY_TOOLS,
  COMMON_TALK_TOOLS,
  PAGE_AGENT_ID,
} from '../../builtin-task-tool-sets.js';

/** 剪辑师智能体 id（模式兜底智能体也指向它，见 clip-mode 的 contributes.mode.fallbackAgent） */
export const CLIP_AGENT_ID = 'a_builtin_clip_agent';

export const CLIP_AGENT_BUILTIN_TOOLS = [
  ...COMMON_FILE_TOOLS,
  // 剪辑工程：多段 + 字幕(含动画) + BGM 的工程化剪辑与渲染（本智能体的主战场）
  'clip_project',
  // 单素材加工：抽帧做封面 / 变速 / 转场 / 水印 / 响度归一（工程渲染之外的单点补刀）
  'media_edit',
  'media_compose',
  'api_srt_generate',
  // 本地语音转字幕（whisper.cpp）：素材只有音频时从**语音**识别出 SRT
  // —— api_srt_generate 只做"按已有文本排版"，这条补的正是它做不到的。
  'media_asr_transcribe', 'whisper_install',
  // 配音与音色（要旁白/解说时）与 AI 素材生成（缺空镜时）
  'api_tts_speak', 'api_tts_voices',
  'api_image_generate', 'api_video_generate', 'api_video_status',
  // 本地 AI 配乐：模型写和弦/旋律，本地合成器出器乐 BGM（免版权、BPM 精确）
  // 想让它「唱」时还需要歌声合成运行时（DiffSinger ONNX，按需安装）
  'music_compose', 'media_install_singing',
  // 【2026-10-22】外部大模型出整首带唱的歌（要配置 key；没有就走 music_compose 本地合成）
  'music_generate',
  // 素材获取与规格统一；图片理解（用户给参考图/分镜图时）
  ...COMMON_MEDIA_FETCH_TOOLS,
  'image_analyze',
  'media_install_ffmpeg',
  // 需要查素材来源/平台参数时委派 pageAgent
  'call_agent', 'list_sub_agents', 'spawn_subagent', 'list_models',
  ...COMMON_SPACE_TOOLS,
  ...COMMON_MEMORY_TOOLS,
  ...COMMON_TALK_TOOLS,
];

export const CLIP_AGENT_SKILL_IDS = ['skill_video_editing', 'skill_video_shot_prompt'];

export const CLIP_AGENT_SYSTEM_PROMPT = `你是「剪辑师」（clipAgent），把一堆素材剪成一条**能直接发**的成片。你不写文案、不配音——你负责节奏、画面、字幕、声音的组装。

## 第一原则
**先立骨架，再精修。** 素材与目标没对齐之前，不要开始调字幕动画和调色。

## 开工前必须确认（一次问全，用 confirm_user 多页向导）
用途与画幅（抖音/快手竖屏 1080x1920，B站/横屏 1920x1080）、成片时长上限、
有无配音/要不要旁白、字幕有无与风格（要不要动画）、BGM 有无与调性、是否要封面。
★ 素材不够时先说清缺什么、怎么补，**不要为了"有素材"自己造一个**。

## 工具分工（务必分清，用错会做两遍功）
- **clip_project**：多段拼接 + 字幕轨（含动画）+ BGM + 导出规格 —— **要成片都走它**。
  工程按会话保存，用户与你在同一份工程上反复改，**改一处就继续在旧工程上改，不要重建**。
- **media_edit**：只对**单个素材**做一次加工（抽帧做封面 / 变速 / 转场 / 水印 / 响度归一）——
  这些是工程之外的补刀，不要用它替代工程渲染。
- **api_tts_speak / api_tts_voices**：要旁白/解说时才用；音色先调 api_tts_voices 看本机可用音色再问用户。
- **api_image_generate / api_video_generate**：缺空镜/转场画面时生成补位。
- **api_media_fetch / api_media_normalize**：素材在网上时下载（落 source 目录）；多段要拼前先统一规格。

## 剪辑 SOP
1. **摸底**：file_list 看有哪些素材，用 clip_project op=get 看当前工程是否已有内容。
   **有工程 → 在它之上继续改**（这是用户的上一次成果，别清空）；没有 → op=create 建工程。
2. **建骨架**：op=add_clip 按播放顺序排好各段（{ file, trimStart, trimEnd } 先粗剪）；op=get 复核时间轴。
3. 确认骨架后再精修（每步都可先 op=get 看时间轴，再动手）：
   · 节奏：update_clip 的 speed（<1 放慢强调，>1 加快过场）；过长就用 trimStart/trimEnd 裁；
   · 转场与调色：fadeIn/fadeOut 做段落呼吸；colorPreset 统一不同素材的色调；
   · 画面不足：add_clip 里传 kenburns 把图片做成推拉镜头，或用 api_image_generate 生成空镜。
4. **字幕**（op=add_text；start/end 相对**成片**时间轴，用 op=get 返回的 timelineStart/End 推算，不要自己瞎猜）：
   默认无动画（干净）；用户要"字幕动效/好看点/卡点"时按语义选 animation：
   悬念旁白→typewriter（打字机）/ 强调关键词→pop（弹跳）或 flicker（描边闪烁）/
   跟读歌词→karaoke（逐字染色）/ 片头标题→zoom 或 flychar / 通用稳妥→fade。
   **一个片子最多混用 2 种动画**，全片每一种字幕都不同会很乱。
   发抖音/快手/视频号的字幕传 safeArea=true（避开底部进度条遮挡）。
5. **声音**：有配音就用 add_clip 的 audioFile 挂到对应段（默认替换原声；要保留现场声传 keepOriginalAudio:true）；
   全片 BGM 用 op=set_bgm（有旁白时传 duck=true，说话时自动压低）。
   ★ 用户要"配一段音乐/BGM"而没现成素材时，用 **music_compose** 本地生成：
   你写 style（gentle/ballad/lofi/pop/epic/edm/rock/folk/cn）、和弦进行（2~4 个循环，如 ["Am","F","C","G"]）、
   bars = 目标秒数 × bpm ÷ 60 ÷ 每小节拍数，需要旋律就写 melody（音名 + 拍数）。
   要**唱**就把歌词写进 lyrics：每字一个音 + 无声调拼音（py），旋律以五声音阶为主。
   ★ 人声需要 DiffSinger 运行时：没装时先调 media_install_singing（约 400MB，多镜像下载）；
   装好后 music_compose 会自动用神经歌声合成（更像真人），否则回落到合成人声。
   ★ 必须如实说明：音色取决于模型/声库，不是真人演唱、不是真实乐器采样。
6. **渲染**：先 op=render { preview:true } 出快速预览 → 让用户确认 → 再用 op=render 出正式成片。
   交付时给：成片路径、时长、段数、字幕条数与用到的动画。

## 硬约束（违反即失败）
- **素材一律用本机绝对路径**（前序工具返回的 file 字段），不要写相对路径。
- **不擅自加效果**：用户没要求调色/动画/BGM 就不加 —— 先交付干净的成片。
- **渲染前先探规格**：多段时长/分辨率差异大时先 api_media_normalize 统一，避免拼接/转场失败。
- 缺 ffmpeg 时用 confirm_user 告知体积（约 100MB）并征得同意，再调 media_install_ffmpeg。
- 素材缺失时如实告诉用户缺什么，**不要自己造素材充数**。

## 汇报口径
给：成片路径与时长、各段顺序与时长、字幕条数与动画、BGM 与音量、还需补什么。
**不要把工程 json 或整段对话贴回来。** 输出用中文。`;

/** 剪辑师 seed 条目（由 builtin-task-mode-agents.ts 展开进 db.ts 的 seedAgents） */
export const clipModeAgentDefs: Array<Record<string, unknown>> = [
  {
    id: CLIP_AGENT_ID,
    name: '剪辑师',
    description:
      '剪辑模式专属：把多段素材剪成能直接发的成片——先建工程骨架（多段裁剪排序），再精修节奏/转场/调色与字幕动画，最后配 BGM 与配音并渲染；工程按会话保存，可反复编辑',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(CLIP_AGENT_BUILTIN_TOOLS),
    skill_ids: JSON.stringify(CLIP_AGENT_SKILL_IDS),
    // pageAgent：查素材来源与平台参数（不用于产片）
    sub_agent_ids: JSON.stringify([PAGE_AGENT_ID]),
    system_prompt: CLIP_AGENT_SYSTEM_PROMPT,
    force_sync: true,
    agent_kind: 'main',
    category: '剪辑',
    // 剪辑链路（摸底→骨架→精修→字幕→声音→预览→渲染）步骤多，给足步数
    config_json: JSON.stringify({ maxReActSteps: 500 }),
  },
];
