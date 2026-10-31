import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';
import { COLOR_EFFECTS, FX_EFFECTS, TRANSITIONS, AUDIO_EFFECTS, MASK_SHAPES, MASK_KEYS, effectIds, effectCatalogText, fxParamCatalogText, TEXT_ANIMATIONS, blendModeIds, blendCatalogText } from '@yan-zhi/shared';

/**
 * 效果清单从 @yan-zhi/shared 的效果库**自动生成**（单一真相源）。
 *
 * ★★★ 为什么必须这样（2026-10-07）：效果库此前散在三处 ——
 *   实现（api-tool-executor 的 COLOR_PRESETS）、schema enum（本文件手写）、
 *   字幕动画（subtitle-style）。三份手工清单必然漂移，症状是
 *   「模型传了某预设但实现不认」或「实现了但模型不知道有」——都不报错。
 *   商用剪辑软件的效果面板能用，前提就是「一份注册表驱动 UI + 参数校验 + 渲染」。
 *   → 现在新增一个滤镜**只改 shared/utils/clip-effects.ts 一处**。
 */
const COLOR_IDS = effectIds(COLOR_EFFECTS);
const FX_IDS = effectIds(FX_EFFECTS);
const TRANSITION_IDS = effectIds(TRANSITIONS);
const AUDIO_FX_IDS = effectIds(AUDIO_EFFECTS);
const MASK_SHAPE_IDS = effectIds(MASK_SHAPES);
const MASK_KEY_IDS = effectIds(MASK_KEYS);
const TEXT_ANIM_IDS = effectIds(TEXT_ANIMATIONS);
const BLEND_IDS = blendModeIds();

/**
 * AI 媒体生成工具（文生图 / 图生图 / 文生视频 / 图生视频）—— agnes 平台媒体模型的直接调用通道。
 *
 * 背景：agnes 平台目录里 seed 了 type=image/video 的模型（agnes-image-2.5-flash 等），
 * 但对话管道只认 type=llm；这些工具补上「模型目录有名字、管道无通路」的缺口。
 *
 * 端点实测（2026-09-15，Base=apihub.agnes-ai.com）：
 * - 文生图：POST /v1/images/generations（OpenAI 标准，同步返回图片 URL）
 *   · size 实测有效：'1K'→1024²、'2K'→2048²，任意 '宽x高' 会映射到最近支持的档位/宽高比
 * - 图生图/多图合成：POST /v1/images/edits（multipart）。端点存在但上游曾返回 503——
 *   工具按参数透传实现，平台侧开放后零改动可用；不可用时返回原始报错。
 * - 文生视频：POST /v1/videos {model, prompt, mode:'text', seconds, size} → 异步任务
 *   GET /v1/videos/{taskId} 轮询；完成态视频地址在 metadata.url。
 *   注意：mode 实测只接受 'text'（text2video/t2v/image/keyframes/i2v 等全部 invalid mode），
 *   first_frame 字段名已被接口识别但路由未开放——图生视频/关键帧参数按透传实现，
 *   平台开放后零改动可用；当前调用会得到明确的「暂未开放」提示。
 *   任务归属提交它的那把 key：轮询/查询必须用同一把 key（换 key 报 task_not_exist）。
 *
 * 执行在 apps/server/src/mcp/api-tool-executor.ts：
 * - 平台路由：默认 agnes；传 model（模型 id/别名）或 platformId 可路由到任意已配置平台
 *   （OpenAI 兼容 /v1/images/generations、/v1/videos 端点），key 池按 platform_api_key 通用加载。
 * - agnes 专有约定（mode:'text'、first_frame/last_frame 字段）只对 agnes 平台发送。
 *
 * 另外提供两条**素材获取/规格统一**工具（不依赖生成平台，纯本机链路）：
 * - media_fetch：把公开的素材直链下载到本机（任务模式可落 00-source）；
 * - media_normalize：统一分辨率/帧率/编码（默认 1080x1920 竖屏），是 concat 拼接的前置步。
 */
export function registerMediaTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('media', [
    {
      name: 'api_image_generate',
      description:
        '文生图：按文字描述生成一张图片（默认 agnes-image-2.5-flash；也支持其他平台的生图模型，用 model+platformId 指定，先用 list_models 查询）。' +
        'prompt 要具体（主体/场景/风格/构图/光线/质量词），支持中英文。' +
        '可选 images 传入参考图（URL/base64/本机路径，可多张）做图生图/多图合成/构图保留编辑。' +
        '★ 按平台自动选通道：标准平台（agnes 等 OpenAI 兼容）走 /v1/images/generations；' +
        '百炼（DashScope）走其原生端点（自动区分同步/异步），无需额外参数。' +
        '百炼推荐模型：qwen-image-3.0-pro（旗舰，中英文字渲染最强，适合封面/海报）、' +
        'wan2.7-image-pro（高质量，支持 4096×4096/品牌色/角色一致性）、wan2.7-image（平衡）、' +
        'z-image-turbo（快速低成本，写实人像/产品图）。' +
        '工具返回 {type, url, description} —— 界面已按 url 自动渲染图片预览，' +
        '因此正文里不要贴 JSON、不要贴本机绝对路径、不要复述「本机备份」，也不要重复附图；' +
        '确实需要图文混排说明时才用 markdown ![](url) 引用，且同一张图最多出现一次。',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '画面描述，越具体越好（主体+场景+风格+构图+光线+质量词）' },
          model: { type: 'string', description: '生图模型：默认 agnes-image-2.5-flash；也可传其他平台的生图模型 id 或别名（先用 list_models 按 type=image 查询）。百炼（DashScope）平台推荐 qwen-image-3.0-pro / wan2.7-image-pro / wan2.7-image / z-image-turbo' },
          platformId: { type: 'string', description: '可选，指定平台 id（配合 model 使用）；都不传默认走 agnes 平台。传百炼平台 id 时自动走其原生图像生成端点' },
          size: { type: 'string', description: '尺寸档位 "1K"/"2K"/"3K"/"4K" 或 宽x高（如 2048x1152，平台映射到最近支持的档位）；不传默认 1024x1024' },
          images: {
            type: 'array', items: { type: 'string' },
            description: '可选，参考图列表（URL / dataURL / base64 / 本机文件路径）。传入后走图生图/多图合成/构图保留编辑通道（平台上游暂未开放时会返回原始报错）',
          },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'api_video_generate',
      description:
        '文生视频：按文字描述生成一段短视频（默认 agnes-video-2.5-flash，5 秒 720P；也支持其他平台的视频模型，用 model+platformId 指定）。' +
        'prompt 描述镜头内容与运镜（场景运动控制通过提示词实现）。为异步任务，工具内部轮询直到出片（通常 1-5 分钟）。' +
        '可选 firstFrame/lastFrame 传入首/尾帧参考图做图生视频/关键帧动画（平台 API 当前仅开放文生视频，' +
        '传入帧会得到明确的「暂未开放」提示，平台开放后自动生效）。' +
        '工具返回 {type, url, description} —— 界面会把视频折叠成一行文件名入口，正文只需一句话说明运镜与时长，' +
        '不要贴 JSON、不要贴本机绝对路径。',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '视频内容与运镜描述' },
          model: { type: 'string', description: '视频模型：默认 agnes-video-2.5-flash；也可传其他平台的视频模型 id 或别名（先用 list_models 按 type=video 查询）' },
          platformId: { type: 'string', description: '可选，指定平台 id（配合 model 使用）；都不传默认走 agnes 平台' },
          seconds: { type: 'string', description: '时长（秒），默认 "5"' },
          size: { type: 'string', description: '分辨率，默认 "720P"，可选 "1080P"' },
          firstFrame: { type: 'string', description: '可选，首帧参考图（URL/dataURL/base64/本机路径），图生视频用' },
          lastFrame: { type: 'string', description: '可选，尾帧参考图（URL/dataURL/base64/本机路径），关键帧动画用' },
          waitMinutes: { type: 'number', description: '最长等待出片的分钟数，默认 8，最大 10' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'api_video_status',
      description: '查询文生视频任务的状态（api_video_generate 内部已轮询；仅用于超时后补查任务结果）',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'api_video_generate 返回的 taskId' },
          platformId: { type: 'string', description: '可选，提交任务时用的平台 id；不传则逐个平台试' },
        },
        required: ['taskId'],
      },
    },
    {
      name: 'api_tts_speak',
      description:
        '文字转语音：把一段文本合成为语音文件，返回 {type:"audio", file, url}。' +
        '三层引擎（自动按序尝试、失败自动降级，返回里带 engine 来源）：' +
        '① 模型层（传 model+platformId 点名，或用库中 audio 型模型）；' +
        '② **Edge 在线合成**（默认层，免费无需 Key，中文普通话 6 个音色、另有方言与港台，质量高）；' +
        '③ 系统本地语音（离线兜底，Windows WinRT/OneCore 或 SAPI、macOS say）。' +
        '多角色场景传 character（角色名）：按角色名推断性别并分配对应性别音色（男主→男声、女主→女声），' +
        '同一角色跨多次调用锁定同一音色、不同角色尽量不同。也可用 voice 显式指定。' +
        '适合分镜台词配音、朗读长文。单次 ≤ 5000 字，过长分段；不做声音克隆（合规红线）。',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要合成的文本（台词/旁白）' },
          character: { type: 'string', description: '可选，角色名（如"男主"/"女主"/"旁白"/"少年"/"爷爷"）。传入后自动按角色名推断性别并分配对应性别音色，同一角色锁定同一音色。多角色短剧强烈建议传它' },
          voice: { type: 'string', description: '可选，显式音色（优先级最高）。Edge 音色名形如 zh-CN-YunxiNeural（用 api_tts_voices 查询）；系统音色名形如 Microsoft Huihui；模型层为 alloy/echo 等' },
          model: { type: 'string', description: '可选，TTS 模型（如 tts-1）；传了就走模型层' },
          platformId: { type: 'string', description: '可选，指定平台 id（配合 model 使用）' },
          rate: { type: 'number', description: '可选，语速 -10~10，0 为正常（各层会自动折算为对应格式）' },
        },
        required: ['text'],
      },
    },
    {
      name: 'api_tts_voices',
      description:
        '列出可用音色，返回三层各自的能力：' +
        '**edge**（Edge 在线，默认层）——中文普通话 6 个音色（4 男 2 女风格各异），另有辽宁/陕西方言与港台音色，质量高；' +
        '**system**（本机离线兜底）——真实枚举系统已装音色（含性别与容量评估）；' +
        '**model**（模型层音色名）。' +
        '做多角色配音前调用它可了解有哪些声音；也可用于排查「传了 voice 却没生效」。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'media_install_singing',
      description:
        '安装/检查本地歌声合成运行时（DiffSinger ONNX，无需 GPU/torch）。' +
        'action=install 会：同步内置推理代码 → pip 装依赖（清华/阿里镜像回退）→ 下载模型（256MB，按 gh-proxy / ghfast / GitHub 顺序回退，支持断点续传）→ 解压自检。' +
        'action=status 只检查是否就绪。action=import 用本地已下载的 model.zip（zipPath）离线导入。' +
        '★ 首次安装需下载约 400MB；失败会给出可操作的下一步，不会静默卡住。',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['install', 'status', 'import'], description: '默认 install' },
          zipPath: { type: 'string', description: 'action=import 时的本地 model.zip 路径' },
        },
        required: [],
      },
    },
    {
      name: 'music_compose',
      description:
        '本地合成一段器乐配乐（AI 作曲）：**你负责写乐谱决定**（调性/和弦进行/旋律/风格/鼓型），' +
        '工具负责配器与音频合成，输出 m4a（返回 {type:"audio", file, url}）。完全本地、免版权、BPM 精确，可直接当卡点 BGM。' +
        '★ 边界：不能生成人声演唱，音色是合成器（不是真实乐器采样）。' +
        '用法：给视频配 BGM 时先算小节数（bars ≈ 时长秒 × bpm / 60 / 每小节拍数），' +
        '给 2~4 个和弦循环（如 ["Am","F","C","G"]），要旋律就写 melody（音名如 "C5" + 拍数）。' +
        '同一 seed 得到同一版编曲；要换一版就换 seed。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '曲名（用于文件名）' },
          bpm: { type: 'number', description: '每分钟拍数 60~180（默认 96）' },
          beatsPerBar: { type: 'number', description: '每小节拍数 3/4/6（默认 4）' },
          bars: { type: 'number', description: '总小节数 1~64（默认 8）' },
          style: { type: 'string', enum: ['gentle', 'ballad', 'lofi', 'pop', 'epic', 'edm', 'rock', 'folk', 'cn'], description: '风格：gentle 温柔 / ballad 钢琴抒情 / lofi 慵懒 / pop 流行 / epic 史诗 / edm 电子 / rock 摇滚（失真吉他+声学鼓）/ folk 民谣（指弹吉他）/ cn 国风（古筝+笛子+二胡）' },
          chords: {
            type: 'array',
            items: { type: 'string' },
            description: '每小节一个和弦符号（循环使用），如 ["C","G","Am","F"]；支持 Am / F#m7 / Bb / Gsus4 / D7',
          },
          drums: { type: 'string', enum: ['none', 'ballad', 'pop', 'rock', 'edm', 'lofi'], description: '鼓型；不传按风格自动选' },
          melody: {
            type: 'array',
            description: '主旋律（可选）：{start: 起始拍, len: 时值拍, pitch: "C5" 或 MIDI}',
            items: {
              type: 'object',
              properties: {
                start: { type: 'number', description: '起始拍（相对整段开头，0 开始）' },
                len: { type: 'number', description: '时值（拍）' },
                pitch: { type: 'string', description: '音名如 C5 / F#5（也接受 MIDI 数字）' },
              },
              required: ['start', 'len', 'pitch'],
            },
          },
          seed: { type: 'number', description: '随机种子（同种子同编曲）' },
          lyrics: {
            type: 'array',
            description: '歌词演唱（可选）：每字一个音 + **拼音**（无声调，如 yue/shang/wo）。装了 DiffSinger 运行时走神经歌声合成（更像真人）；未安装时回落到本地合成人声（机器人音色），可用 media_install_singing 安装。',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: '歌词字/词' },
                py: { type: 'string', description: '拼音（无声调，必要时带 -n/-ng 尾，如 yue / shang / wo）' },
                start: { type: 'number', description: '起始拍' },
                len: { type: 'number', description: '时值（拍）' },
                pitch: { type: 'string', description: '音名如 C4 / E5' },
              },
              required: ['text', 'py', 'start', 'len', 'pitch'],
            },
          },
          instruments: {
            type: 'object',
            description: '覆盖声部乐器（可选）：keys/pad/bass/lead 可设为 piano|epiano|organ|strings|erhu|dizi|guitar|guzheng|pipa|dist_guitar|ebass|synth_bass|synth_pad|synth_lead',
          },
          vocalVoice: { type: 'string', description: '演唱音色（可选）：zh-CN-XiaoxiaoNeural 女声（默认）/ zh-CN-YunxiNeural 男声 / zh-CN-XiaoyiNeural 等 Edge 音色；连不上 Edge 会自动回落本地合成人声' },
        },
        required: [],
      },
    },
    {
      name: 'music_generate',
      description:
        '用外部音乐大模型生成**整首歌**（人声演唱 + 伴奏），输出 m4a/mp3（返回 {type:"audio", file, url}）。' +
        '适合"要好听的人声演唱"，旋律由模型决定、不可逐音符控制。' +
        '★ 与 music_compose 并存：需要精确和弦/BPM/卡点用 music_compose；要自然的人声演唱用 music_generate。' +
        '★ 前置条件：本机 new-api 网关里要配好 Suno 渠道（否则会返回"网关里没有 Suno 通道"）。' +
        '歌词用 \\n 分段，可用 [Verse]/[Chorus] 这类标签引导结构。',
      inputSchema: {
        type: 'object',
        properties: {
          lyrics: { type: 'string', description: '整首歌词（中文即可），用 \\n 分段；可含 [Verse]/[Chorus] 结构标签' },
          style: { type: 'string', description: '风格描述，如「国风 古筝 女声 抒情 慢速 80bpm」' },
          title: { type: 'string', description: '曲名（也用于文件名）' },
          instrumental: { type: 'boolean', description: '只要伴奏、不要人声（默认 false）' },
          gender: { type: 'string', enum: ['female', 'male'], description: '演唱性别（默认 female；阿里/火山/MiniMax 支持）' },
          mv: { type: 'string', description: 'Suno 模型版本，默认 chirp-v3-5；可选 chirp-v4 等（取决于渠道支持）' },
        },
        required: ['lyrics'],
      },
    },
    {
      name: 'api_sfx',
      description:
        '音效库：列出 / 搜索 / 合成单个音效（ffmpeg 现场合成，完全免版权）。' +
        '分类含 转场(whoosh/riser/impact)、提示(ding/notify)、节奏(hit/heartbeat)、氛围(rain/wind/hum/pad_soft) 等。' +
        '★ 只能做音效与氛围垫，**不能做旋律 BGM**（合成器做不出编曲，BGM 用 music_compose）。' +
        '给视频加音效时：先 list/search 选 id，再 render 拿到文件，交给 media_edit / clip_project 合入。',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'search', 'render'], description: 'list=按分类列出全部；search=关键词搜索；render=合成一个音效文件' },
          query: { type: 'string', description: 'search 的关键词（匹配 id/label/desc/group），如「转场」「心跳」「雨」' },
          id: { type: 'string', description: 'render 的音效 id（先用 list/search 取得）' },
        },
        required: ['action'],
      },
    },
    {
      name: 'api_srt_generate',
      description:
        '生成 SRT 字幕文件：把台词/旁白条目编成字幕。cues 每条 {text, duration}（时长按顺序累加推算时间轴）或 {start, end, text}（显式秒）。' +
        '返回 {type:"file", file, url}。分镜表每镜自带时长 → 时间轴纯计算生成，无需语音识别。' +
        '生成的 SRT 可交给 media_compose 的 subtitle 操作烧进视频。',
      inputSchema: {
        type: 'object',
        properties: {
          cues: {
            type: 'array',
            description: '字幕条目，按播放顺序',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: '台词/旁白文本' },
                duration: { type: 'number', description: '持续秒数（不传 start/end 时用，缺省 3）' },
                start: { type: 'number', description: '可选，显式起始秒' },
                end: { type: 'number', description: '可选，显式结束秒' },
              },
              required: ['text'],
            },
          },
        },
        required: ['cues'],
      },
    },
    {
      name: 'media_asr_transcribe',
      description:
        '语音转字幕（本地 whisper.cpp，**不上传云端**）：把音频/视频里的语音识别成带时间轴的 SRT。' +
        '用途：素材只有音频（配音/录屏/别人给的成片）时生成字幕 —— 这是 api_srt_generate 做不到的' +
        '（那个是「按已有文本排版」，时间轴靠时长推算，**不做语音识别**）。' +
        '输入视频会自动只取音轨并用 ffmpeg 转 16kHz 单声道。' +
        '返回 {type:"file", file, url, segmentCount} —— 结构与 api_srt_generate 一致，' +
        '可直接交给 media_compose 的 subtitle 操作烧进视频。' +
        '★ 依赖 whisper.cpp 与模型：未安装时先调用 whisper_install（会自动查最新 nightly 版本）。' +
        '★ 中文场景默认模型 small（识别质量明显好于 base）；求快可传 base，求准可传 medium（更慢）。' +
        '★ 首次使用需下载模型（small 约 466MB）；若下载失败按报错里的指引操作（开代理或手动放置）。',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string', description: '音频或视频文件路径（相对工作目录或绝对路径）。视频会自动只取音轨' },
          model: { type: 'string', enum: ['base', 'small', 'medium'], description: '识别模型：base(142MB,快) / small(466MB,推荐) / medium(1.5GB,最准但慢)。默认 small' },
          language: { type: 'string', description: '语言代码，默认 zh（中文）。英文 en，自动检测 auto' },
          maxSeconds: { type: 'number', description: '可选，只转写前 N 秒（长音频试跑或截断用）' },
          out: { type: 'string', description: '可选，SRT 输出目录；默认会话交付目录' },
        },
        required: ['input'],
      },
    },
    {
      name: 'whisper_install',
      description:
        '安装本地语音识别（whisper.cpp 二进制 + 模型）。' +
        '二进制按当前平台从官方 **nightly build** 下载（正式 release 没有二进制资产）；' +
        '模型从 HuggingFace 下载（官方源不可达时自动试镜像）。一次安装长期可用。' +
        '当 media_asr_transcribe 报「尚未安装 whisper.cpp」或「缺少模型」时调用本工具。' +
        '★ 体积策略：二进制约 8MB（CPU 版）；模型 base 142MB / small 466MB / medium 1.5GB —— ' +
        '模型超过 50MB 阈值，**建议先用 confirm_user 告知用户体积**再装。' +
        '★ 失败不会静默：报错里会给出「启动代理后重试」与「手动下载后放入哪个目录」两条指引。' +
        '已安装时直接返回可用状态（幂等）。',
      inputSchema: {
        type: 'object',
        properties: {
          what: { type: 'string', enum: ['cli', 'model', 'all'], description: '装什么：cli=只要可执行文件 / model=只要模型 / all=都要（默认 cli）' },
          model: { type: 'string', enum: ['base', 'small', 'medium'], description: '配合 what=model/all：下载哪个模型，默认 small' },
        },
        required: [],
      },
    },
    {
      name: 'media_install_ffmpeg',
      description:
        '下载安装 ffmpeg（媒体合成的依赖：配音混入视频、拼接、烧字幕都需要它）。' +
        '按当前平台从官方静态构建源下载到应用数据目录，一次安装长期可用。' +
        '当 media_compose 报「尚未安装 ffmpeg」时调用本工具。' +
        '★ 安装体积策略：不超过 50MB 的依赖会被静默安装；ffmpeg 约 100MB，超过阈值，**调用前应先用 confirm_user 告知用户**（含体积与用途），征得同意再装。' +
        '已安装时直接返回可用状态（幂等）。' +
        '★ 新代码优先用 install_resource({resource:"ffmpeg"}) —— 它会自动弹确认卡，不用手动 confirm_user。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      // ★ 2026-10-22：统一安装入口。此前 ffmpeg / yt-dlp / whisper / DiffSinger / 语音包
      //   各有各的工具（语音包甚至没有工具），确认一律写在描述里当"建议"，模型可以不理。
      //   收敛成一个工具 + 强制确认卡，新增资源不用再加工具。
      name: 'install_resource',
      description:
        '下载并安装本地资源（可选：ffmpeg / yt-dlp / whisper 语音识别 / DiffSinger 歌声引擎 / 本地语音包）。' +
        '★ 调用后会**自动弹出确认卡**（体积 / 来源 / 落地目录 / 预计耗时），用户批准才开始下载 —— ' +
        '所以你不需要再手动 confirm_user，直接把用户意图转成一次调用即可。' +
        '★ 已安装时幂等返回状态，不弹确认、不重复下载。' +
        '★ 下载源按「国内优先（ModelScope / hf-mirror / gh-proxy / 清华源）→ 国外 → 多点冗余」自动降级，失败会自动换源。' +
        '★ 用法：先 action="list" 看有哪些资源和是否已装，再 action="install" 装需要的那个。' +
        '★ 用户拒绝后不要重试 —— 直接告诉他可以在「设置」里自行安装。',
      inputSchema: {
        type: 'object',
        properties: {
          resource: {
            type: 'string',
            description: '资源 id：ffmpeg / ytdlp / whisper / diffsinger / tts-pack。先调 action="list" 获取',
          },
          action: {
            type: 'string',
            enum: ['list', 'status', 'install'],
            description: 'list=列出全部资源及安装状态（默认）；status=查单个；install=下载安装',
          },
          variant: {
            type: 'string',
            description: '可选变体：whisper 的 base/small/medium，语音包的 pack id',
          },
        },
        required: [],
      },
    },
    {
      // ★ 2026-10-22：本地 AI 写歌。与既有两条路的关系不是替代：
      //   music_compose  本地合成器，和弦/BPM 精确，**不能唱**
      //   music_generate 外部大模型，人声自然但**要 key、要钱、要联网**
      //   music_sing     ← 本工具：本地模型，**给词就唱**，不上传歌词、不花钱
      name: 'music_sing',
      description:
        '本地 AI 写歌：给歌词（可带 [verse]/[chorus] 分段）+ 风格描述，直接生成**带人声演唱**的完整歌曲，' +
        '不需要曲谱、不需要配置任何 API key、歌词不会上传。' +
        '★ 与另外两个音乐工具的区别：music_compose 只能出器乐（合成器，不能唱）；' +
        'music_generate 要外部 key 且要联网；本工具纯本地推理。' +
        '★ 首次使用需先安装运行时（约 8.9GB）：先调 install_resource({resource:"acestep",action:"status"}) 查，' +
        '没装再 action="install"（会弹确认卡）。' +
        '★ 性能参考：RTX 3050 6GB 上，20 秒歌约 27 秒、60 秒歌约 80 秒。' +
        '★ 提示：歌词用 [verse]/[chorus] 标注段落会让主副歌对比更明显；' +
        'vocal_forward=true（默认）会压低配器密度让人声更清楚 —— 实测人声频段占比从 1.2% 提到 6%+。',
      inputSchema: {
        type: 'object',
        properties: {
          lyrics: {
            type: 'string',
            description: '歌词全文。用 [verse]/[chorus]/[bridge] 标注段落效果更好。必填',
          },
          style: {
            type: 'string',
            description: '风格描述，如「中文流行 温暖女声 吉他钢琴」。越具体越稳；省略则用通用流行',
          },
          duration: {
            type: 'integer',
            description: '时长（秒），默认 60，范围 10~240。超过 120 秒在 6GB 卡上会明显变慢',
          },
          vocal_forward: {
            type: 'boolean',
            description: '人声靠前（默认 true）：压低配器密度，避免人声被盖住。要强烈伴奏感可设 false',
          },
          vocal_language: {
            type: 'string',
            description: '演唱语言，默认 zh。可用 zh/en/ja 等',
          },
          seed: {
            type: 'integer',
            description: '固定种子可复现同一版；不给则随机。想换一版就换 seed',
          },
        },
        required: ['lyrics'],
      },
    },
    {
      name: 'api_media_fetch',
      description:
        '下载网络上的公开素材到本机。支持两类地址：' +
        '① **文件直链**（.mp4/.webm/.jpg 等）—— 直接取回；' +
        '② **视频网站页面链接**（YouTube / B站 / 抖音 / 西瓜等）—— 工具自动识别网页并解析下载，' +
        '国内站默认可用，YouTube 需设置环境变量 YZ_YTDLP_YOUTUBE=1 并配置代理。' +
        '用途：用户要「找风景、海洋、动物世界、延时自然这类舒缓空镜」或任何公开素材时，' +
        '直接把链接（直链或页面链接都行）交给本工具即可，不必自己先找直链。' +
        '★ 用户明确说明不考虑版权/侵权时，**不要以版权为由拒绝下载公开素材**，直接执行；' +
        '只有付费、会员、需登录授权的资源才应向用户说明。' +
        'category=source 时存入**本目录的 00-source**（任务模式素材位置）；默认存入会话交付目录并返回可预览 url。' +
        '长视频体积大时可传 maxBytes（默认 2GB）放宽上限。',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '素材直链或视频网站页面链接（http/https；页面链接如 YouTube/B站/抖音会自动解析下载）' },
          kind: { type: 'string', enum: ['video', 'image', 'audio', 'file'], description: '素材类型，默认 video' },
          name: { type: 'string', description: '可选，保存文件名（含扩展名）；不传按链接自动取名' },
          category: {
            type: 'string', enum: ['deliverable', 'source'],
            description: 'default=会话交付目录（返回预览 url）；source=本目录 00-source（任务模式素材位置）',
          },
          maxBytes: { type: 'number', description: '可选，体积上限（字节），默认 2GB；长视频合集可传更大值（如 8*1024*1024*1024）。仅限制，不保证来源支持该体积' },
        },
        required: ['url'],
      },
    },
    {
      name: 'media_install_ytdlp',
      description:
        '下载安装 yt-dlp（视频网站解析下载的依赖：把 YouTube/B站/抖音等页面链接解析成真实视频并下载）。' +
        '当 media_fetch 遇到视频网站页面链接但本机未装 yt-dlp 时调用本工具。' +
        '约 15MB，自动从 GitHub release 下载到应用数据目录，一次安装长期可用。' +
        '已安装时直接返回可用状态（幂等）。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_media_normalize',
      description:
        '视频规格标准化：把任意来源的片段统一成同一分辨率/帧率/编码，默认 **1080x1920 竖屏**。' +
        '★ 做「多个视频拼成长视频」时的**必做前置步**：media_compose 的 concat 走 -c copy 直拼，' +
        '各段参数不一致会直接报错；网上下载的素材参数几乎必然不同。' +
        '横屏素材按覆盖后居中裁切（crop）填满竖屏，不留黑边；无音轨的片段自动补静音，保证流布局一致。' +
        '返回 files[].file（各段已标准化路径），直接拿去 op=concat 即可。',
      inputSchema: {
        type: 'object',
        properties: {
          videos: { type: 'array', items: { type: 'string' }, description: '要标准化的视频本机绝对路径列表' },
          size: { type: 'string', description: '目标分辨率 "宽x高"，默认 "1080x1920"（竖屏）' },
          fps: { type: 'number', description: '目标帧率，默认 30' },
          prefix: { type: 'string', description: '可选，输出文件名前缀；不传自动命名' },
        },
        required: ['videos'],
      },
    },
    {
      name: 'media_compose',
      description:
        '音视频合成（基于 ffmpeg）：① dub 把配音音频混进视频（默认替换原音轨，keepAudio=true 时与人声混合）；② concat 按顺序拼接多段视频；③ subtitle 把 SRT 字幕烧录进画面（可顺带在顶部叠加标题、并控制字幕字号，支持 subtitleAnimation 八种动画预设：淡入/弹跳/缩放/滑动/打字机/卡拉OK/闪烁/逐字飞入）。' +
        '输入一律为本机文件绝对路径（前序工具返回的 file 字段）。返回 {type:"video", file, url}。' +
        'concat 要求各段编码参数一致（copy 直拼），不一致会报错——先用同参数生成。未找到 ffmpeg 时会给出明确的放置/配置指引。' +
        '★ subtitle 推荐参数：title 传「项目名称」做顶部常驻标题（长标题默认 auto 自适应缩字，绝不溢出；要滚动传 titleFit="scroll"）；subtitleFontSize 不要显式传（默认 88px≈12 字/行，已合适；显式传小值如 34 反而会把 libass 单位当像素放大成巨字）。',
      inputSchema: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['dub', 'concat', 'subtitle'], description: '合成操作' },
          video: { type: 'string', description: 'dub/subtitle：视频文件本机绝对路径' },
          audio: { type: 'string', description: 'dub：配音音频本机绝对路径' },
          keepAudio: { type: 'boolean', description: 'dub 可选，true=配音与原音轨混合（amix），false/缺省=替换原音轨' },
          videos: { type: 'array', items: { type: 'string' }, description: 'concat：按顺序的视频路径列表（≥2）' },
          srt: { type: 'string', description: 'subtitle：SRT 字幕文件本机绝对路径（api_srt_generate 的产出）' },
          title: { type: 'string', description: 'subtitle 可选：在画面顶部叠加的标题文字（建议填项目名称），整片常驻；不传则不叠加。中文会自动使用系统中文字体渲染' },
          subtitleFontSize: { type: 'number', description: 'subtitle 可选：字幕字号（像素，以 1920 高成片为基准），默认 88（1080 宽下约 12 字/行，长句自动换行）；一般不要传' },
          titleFontSize: { type: 'number', description: 'subtitle 可选：标题字号（像素，基准同上），默认 140；超宽标题在 titleFit=auto 下会自动缩小，无需手调' },
          titleFit: { type: 'string', enum: ['auto', 'scroll', 'fixed'], description: 'subtitle 可选：标题超宽处置。auto（默认）=估宽超画面 92% 自动缩字号完整显示；scroll=从右向左跑马灯滚动（任何长度都完整可读）；fixed=居中不缩放（仅短标题）' },
          titleScrollSpeed: { type: 'number', description: 'subtitle 可选：titleFit=scroll 时的滚动速度（像素/秒，1920 高基准），默认 120' },
          subtitleColor: { type: 'string', description: 'subtitle 可选：字幕颜色，十六进制如 "#FFD700"（默认白色）' },
          subtitleOutlineColor: { type: 'string', description: 'subtitle 可选：字幕描边颜色，默认黑色（浅色画面上加深描边更清晰）' },
          subtitleOutline: { type: 'number', description: 'subtitle 可选：描边宽度（像素，基准同上），默认 12；0 即无描边' },
          subtitlePosition: { type: 'string', enum: ['bottom', 'center', 'top'], description: 'subtitle 可选：字幕位置，默认 bottom 底部' },
          subtitleMarginV: { type: 'number', description: 'subtitle 可选：字幕垂直边距（像素，基准同上）；不传按位置给默认（底部 200，顶部 260）' },
          safeArea: { type: 'boolean', description: 'subtitle 可选：true=竖屏短视频安全区，字幕上抬到画面上方约 78% 处，避开底部进度条/账号信息遮挡（抖音/快手/视频号必开）' },
          subtitleAnimation: { type: 'string', enum: TEXT_ANIM_IDS, description: 'subtitle 可选：字幕动画预设。fade=淡入淡出（通用最稳）；pop=弹跳入场（卡点感）；zoom=缩放入场（强调）；slide=滑动入场；typewriter=打字机逐字出现（旁白感）；karaoke=卡拉OK逐字染色；flicker=描边闪烁（强调关键词）；flychar=逐字飞入（活泼）。不传=无动画。用户要「字幕动效/动画/好看点」时选一个贴合语义的预设' },
          subtitleSlideDirection: { type: 'string', enum: ['left', 'right', 'up', 'down'], description: 'subtitle 可选：仅 subtitleAnimation=slide 时生效，滑入方向（right=从右侧滑入，默认）' },
          titleColor: { type: 'string', description: 'subtitle 可选：标题颜色，十六进制如 "#FFFFFF"，默认白色' },
          titleFade: { type: 'number', description: 'subtitle 可选：标题淡入秒数，默认 0（立即显示）' },
          output: { type: 'string', description: '可选，输出文件名（如 final.mp4）；不传自动命名' },
        },
        required: ['op'],
      },
    },
    {
      name: 'clip_project',
      description:
        '剪辑工程（剪辑模式的唯一入口）：把「多段素材 + 字幕（可带动画）+ BGM」组织成一份可反复编辑的工程，再一次性渲染成片。' +
        '★ 与 media_edit 的分工：**要成片**（多段拼接、字幕轨道、BGM、导出规格）用本工具；' +
        '只对**单个素材**做一次加工（抽帧/变速/转场/水印）仍用 media_edit。' +
        '工程按会话保存（.clipproj.json），UI 时间轴与你可反复编辑同一份，不必每次从头重建。' +
        'op 一览：' +
        '**create** 建工程/改元信息 { name, size, fps, quality }；' +
        '**get** 读工程（默认返回紧凑摘要：各段 index/id/时间轴起止/时长 + 字幕；summaryOnly=true 时只给摘要）；' +
        '**set_output** 改导出规格 { size:"1080x1920", fps }；' +
        '**add_clip** 追加素材 { clips:[{ file, label?, trimStart?, trimEnd?, speed?, colorPreset?, colorStrength?, adjust?, fx?, fxParams?, fadeIn?, fadeOut?, kenburns?, mask?, transition?, crop?, keyframes?, rotate?, flip?, reverse?, audioFile?, keepOriginalAudio?, volume? }] }（可一次多段，顺序即播放顺序）——★ 每段支持画面裁剪 crop、蒙版 mask（形状/色键）、转场 transition、关键帧运镜 keyframes、方向 rotate/flip/reverse、调色强度与手动调节；' +
        '**update_clip** 改某段 { id 或 index, patch:{...同 add_clip 字段} }；**remove_clip** { id|index }；**move_clip** { id|index, to }；**clear_clips**；' +
        '**add_text** 加字幕 { texts:[{ text, start, end, animation?, slideDirection?, fontSizePx?, color?, outlineColor?, outlinePx?, backColor?, position?, safeArea?, transform?, keyframes? }] }（start/end 相对**成片**时间轴，可先用 get 看各段起止）；' +
        '★ 文字要**运动**（滑入/放大/旋转/边飘边淡入）用 transform（静态）或 keyframes（t 为层内 0~1，如 [{t:0,x:0.35,scale:0.6},{t:1,x:0,scale:1.1,ease:"out"}]）；有变换时不再套 animation 预设；' +
        '**update_text** { id|index, patch }；**remove_text** { id|index }；**clear_texts**；' +
        '**set_bgm** { file, volume, duck }（duck=true 说话时自动压低，适合带旁白的成片）/ **clear_bgm**；' +
        '**beat_cut** 一键卡点 { everyNth?, beatTransition?, beatTransitionDuration?, minPiece? }（分析 BGM 节拍，在每个拍点切开；' +
        'beatTransition 给切点后一段挂转场，不给 = 硬切；everyNth=2 表示隔一拍切一次；minPiece 默认 0.4 秒 —— 太短的碎片不切）。' +
        '★ 节拍不明显会直接拒绝（不会硬凑点）；曲线变速段会被跳过。切完段数会变，字幕要重新排。' +
        '**set_audio_fx** 整片音效链 { fx:[...] }（按顺序串联，最多 4 个；空数组=清除。如 ["denoise","loudnorm"]）；' +
        '**add_overlay** 画中画 { file, start, end, pos?, scale?, blend?, x?, y?, rotation?, opacity?, keyframes? }（start/end 相对成片；pos 可选 topleft/top/topright/left/center/right/bottomleft/bottom/bottomright，scale 相对素材尺寸 0.05~1 默认 0.35；' +
        'blend 混合模式 = 「画中画怎么和下层画面合成」，缺省 normal=普通覆盖：' + blendCatalogText() + '；' +
        'x/y=中心偏移（-0.5~0.5，设置后覆盖 pos）、rotation=旋转角度、opacity=不透明度；' +
        'keyframes 做画中画动画 [{t:0,x:0.3,scale:0.8},{t:1,x:0,scale:1.1,ease:"out"}]（t 为层内 0~1，滑入/放大这样写）；' +
        '**update_overlay** { id|index, patch }（patch 传 null 可清除对应字段）；**remove_overlay** { id|index }；' +
        '**add_audio** 定时音频层 { audios:[{ file, start, end, volume?, fadeIn?, fadeOut?, trimStart? }] }' +
        '（start/end 相对成片 —— 转场"唰"声就放一条 0.5~1 秒的；**两段 BGM 无缝接**就放两条首尾相接的；' +
        '与 set_bgm 的区别：bgm 是整片铺底、音频层是定时的）；**update_audio** { id|index, patch }；**remove_audio** { id|index }；**clear_audios**；' +
        '**add_tts** 文字转配音 { text, start?, voice?, character?, rate?, volume?, subtitle?, fadeIn?, fadeOut? }' +
        '（本地 TTS 合成后作为**定时音频层**放进时间轴，时长按实测自动对齐；start 缺省接在上一段配音之后；subtitle=true 同时加一条等长字幕）；' +
        '**配方**（把一组 op 存成模板）：**list_recipes** 看清单（内置 + 自建，带参数说明）；' +
        '**apply_recipe** { recipe, params? } 一键套用（任一步失败即停并指出第几步）；' +
        '**save_recipe** { recipe, name, description?, params?, steps:[{op,args}] } 存成自建配方（步骤里可用 "{{参数名}}" 占位）；' +
        '**delete_recipe** { recipe }；' +
        '**贴纸**：**add_sticker** { stickers:[{ sticker?, file?, start, end, scale?, x?, y?, rotation?, opacity?, keyframes? }] }' +
        '（`sticker` 用内置贴纸库 id（new/hot/重点/箭头/对勾/星星），`file` 用用户导入的 PNG/WebP；两者二选一，给了 sticker 会自动生成 PNG；' +
        'scale 是宽度占画面宽度比例，缺省 0.3）；**update_sticker** { id|index, patch }；**remove_sticker**；**clear_stickers**；' +
        '**render** 渲染成片 { output?, preview?, quality? }（preview=true 出快速预览档，确认后再正式渲染；非预览档会自动顺带导出一张封面 jpg）。' +
        '★ subtitleAnimation 可选：' + effectCatalogText(TEXT_ANIMATIONS) + '（用户要「字幕动效」时选贴合语义的一个）。' +
        '输入一律为本机绝对路径（前序工具返回的 file 字段）。渲染返回 {type:"video", file, url}。',
      inputSchema: {
        type: 'object',
        properties: {
          op: {
            type: 'string',
            enum: [
              'create', 'get', 'set_output',
              'add_clip', 'update_clip', 'remove_clip', 'move_clip', 'clear_clips',
              'add_text', 'update_text', 'remove_text', 'clear_texts',
              'set_bgm', 'clear_bgm', 'set_audio_fx', 'beat_cut',
              'add_overlay', 'update_overlay', 'remove_overlay', 'render',
              'add_audio', 'update_audio', 'remove_audio', 'clear_audios', 'add_tts',
              'list_recipes', 'apply_recipe', 'save_recipe', 'delete_recipe',
              'add_sticker', 'update_sticker', 'remove_sticker', 'clear_stickers',
            ],
            description: '工程操作',
          },
          name: { type: 'string', description: 'create：工程名；save_recipe：配方显示名' },
          recipe: { type: 'string', description: 'apply_recipe/save_recipe/delete_recipe：配方 id（小写字母/数字/连字符，如 "punch-in"；先用 list_recipes 看内置清单）' },
          description: { type: 'string', description: 'save_recipe：配方说明（给人看的一句话）' },
          steps: {
            type: 'array',
            description: 'save_recipe：配方步骤，按顺序执行。每步 { op, args }，args 里可用 "{{参数名}}" 占位（引用下方 params 定义）；op 只能是剪辑工程编辑类（add_clip/update_clip/add_text/add_audio/set_bgm 等）',
            items: {
              type: 'object',
              properties: {
                op: { type: 'string', description: '工程 op（如 add_text / update_clip / add_audio / set_bgm）' },
                args: { type: 'object', description: '该 op 的参数（与直接调用时一致；可含 "{{参数名}}" 占位）' },
              },
              required: ['op'],
            },
          },
          params: { type: 'object', description: 'apply_recipe：参数取值 { 参数名: 值 }；不传则全用默认值（必填项没给会报错并说明缺哪个）' },
          paramDefs: {
            type: 'array',
            description: 'save_recipe：参数定义（配方需要调用方传什么）。key 与 steps 里的 "{{key}}" 对应',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', description: '参数名（字母/数字/下划线）' },
                label: { type: 'string', description: '给人看的标签' },
                type: { type: 'string', enum: ['string', 'number', 'boolean'], description: '参数类型' },
                required: { type: 'boolean', description: 'true=套用时不传就报错' },
                default: { description: '默认值（string/number/boolean）' },
                desc: { type: 'string', description: '补充说明' },
              },
              required: ['key'],
            },
          },
          size: { type: 'string', description: 'create/set_output：导出规格，形如 "1080x1920"（默认竖屏）/ "1920x1080"（横屏）' },
          fps: { type: 'number', description: 'create/set_output：帧率，默认 30' },
          quality: { type: 'string', enum: ['low', 'std', 'high'], description: '导出质量档：low=省流（crf28，音轨128k）/ std=推荐（crf21，192k）/ high=高清（crf18，256k）。create/set_output 设工程默认档，render 传则只覆盖本次' },
          clips: {
            type: 'array',
            description: 'add_clip：素材数组，按数组顺序首尾相接',
            items: {
              type: 'object',
              properties: {
                file: { type: 'string', description: '素材本机绝对路径（视频；图片则配 kenburns 做运镜）' },
                label: { type: 'string', description: '时间轴显示名（默认取文件名）' },
                trimStart: { type: 'number', description: '裁剪起点（秒，相对该素材）；不传=从 0 开始' },
                trimEnd: { type: 'number', description: '裁剪终点（秒）；不传=到素材结尾' },
                speed: { type: 'number', description: '变速倍数 0.25~4（>1 加快，<1 放慢）；不传=不变。与 speedCurve 互斥' },
                speedCurve: {
                  type: 'array',
                  description: '曲线变速：按**源时间比例**给倍速，渲染时量化成 8 个恒定倍速切片再拼接（音画同一套边界）。'
                    + '例：慢动作爆点 [{t:0,speed:1},{t:0.5,speed:0.4},{t:1,speed:1}]；快进过场 [{t:0,speed:3},{t:1,speed:3}] 等价于恒定倍速、不必用曲线。'
                    + '★ 与 speed 互斥（有曲线时忽略 speed）；总时长会变，加完要重新 op=get 再排字幕',
                  items: {
                    type: 'object',
                    properties: {
                      t: { type: 'number', description: '源时间比例 0~1' },
                      speed: { type: 'number', description: '该处倍速 0.25~4' },
                    },
                    required: ['t', 'speed'],
                  },
                },
                colorPreset: { type: 'string', enum: COLOR_IDS, description: `调色/滤镜预设（可选：${effectCatalogText(COLOR_EFFECTS, ['none'])}）` },
                colorStrength: { type: 'number', description: '调色预设强度 0~1（缺省 1 = 全量）。0.3~0.5 适合"轻微色调"、不想一眼看出滤镜时' },
                adjust: {
                  type: 'object',
                  description: '手动调节（在预设之上叠加，全部缺省 = 不变）。适合"预设套不出想要的亮度/冷暖"时微调',
                  properties: {
                    brightness: { type: 'number', description: '亮度 -0.5~0.5（0=不变）' },
                    contrast: { type: 'number', description: '对比度 0.5~1.8（1=不变）' },
                    saturation: { type: 'number', description: '饱和度 0~2.5（1=不变，0=黑白）' },
                    temperature: { type: 'number', description: '色温 -1~1（正=偏暖，负=偏冷；0=不变）' },
                    sharpness: { type: 'number', description: '锐化 0~1（0=不锐化）' },
                    vignette: { type: 'number', description: '暗角 0~1（0=无暗角）' },
                  },
                },
                fx: { type: 'string', enum: FX_IDS, description: `动态特效（可选：${effectCatalogText(FX_EFFECTS)}）。与 colorPreset 可叠加：先调色、再上结构类特效` },
                fxParams: {
                  type: 'object',
                  description: `动态特效参数（只传你想改的键，缺省用默认值）。可调键：${fxParamCatalogText()}`,
                },
                fadeIn: { type: 'number', description: '该段画面淡入秒数' },
                fadeOut: { type: 'number', description: '该段画面淡出秒数' },
                kenburns: { type: 'object', description: '图片素材运镜：{ direction:"in"|"out", duration }' },
                mask: {
                  type: 'object',
                  description: '蒙版：只显示画面的一部分。{ shape?, scale? 0.05~1, offsetX?/offsetY? -0.5~0.5, feather? 0~200, key? }。shape=' + effectCatalogText(MASK_SHAPES, ['none']) + '；key=' + effectCatalogText(MASK_KEYS) + '。★ shape 与 key 互斥，同时给时 key 优先',
                  properties: {
                    shape: { type: 'string', enum: MASK_SHAPE_IDS, description: '形状蒙版（与 key 二选一）' },
                    key: { type: 'string', enum: MASK_KEY_IDS, description: '色键抠像（与 shape 二选一，优先）' },
                    scale: { type: 'number', description: '形状内缩比例 0.05~1（1=铺满画面，越小蒙版越小）' },
                    offsetX: { type: 'number', description: '蒙版中心水平偏移 -0.5~0.5' },
                    offsetY: { type: 'number', description: '蒙版中心垂直偏移 -0.5~0.5' },
                    feather: { type: 'number', description: '边缘羽化像素 0~200（0=硬边）' },
                  },
                },
                transition: {
                  type: 'object',
                  description: '与**前一段**之间的转场（挂在后一段上，语义="我进来时怎么出现"；第 1 段无效）。type=' + effectCatalogText(TRANSITIONS) + '。★ 时长不能超过任一段时长的一半，否则黑屏/报错',
                  properties: {
                    type: { type: 'string', enum: TRANSITION_IDS },
                    duration: { type: 'number', description: '转场时长（秒）0.1~5，默认 0.8' },
                  },
                  required: ['type'],
                },
                audioFile: { type: 'string', description: '该段配音音频绝对路径（替换原声；keepOriginalAudio=true 则与原声混音）' },
                keepOriginalAudio: { type: 'boolean', description: 'true=配音与原声混音，false/缺省=配音替换原声' },
                volume: { type: 'number', description: '该段音量倍数（1=不变）' },
                rotate: { type: 'number', enum: [90, 180, 270], description: '顺时针旋转角度。★ 旋转在规格化之前做，转 90/270 后画面会被按工程画幅大幅裁切（多半要同时改 set_output）' },
                flip: { type: 'string', enum: ['h', 'v', 'both'], description: '镜像翻转：h=左右　v=上下　both=两者' },
                reverse: { type: 'boolean', description: '倒放该段（画面与音轨一起倒）。★ 单段最长 10 秒：ffmpeg 的 reverse 会把整段帧读进内存，超长会拒绝渲染' },
                crop: { type: 'object', description: '画面裁剪（裁子区域后回填画幅不变形）：{ x, y, w, h } 均为比例 0~1（如裁掉左侧 10% 黑边 { x:0.1, w:0.9 }）' },
                keyframes: {
                  type: 'array',
                  description: '关键帧运镜/透明度：t 为段内位置 0~1（不是秒）；点之间按 ease 过渡。★ 要给起点锚（如 {t:0,scale:1}）才有"从原尺寸推近"的效果，只给一个点等于全程常量',
                  items: {
                    type: 'object',
                    properties: {
                      t: { type: 'number', description: '段内位置 0~1' },
                      scale: { type: 'number', description: '画面缩放 1~3（1=原尺寸）' },
                      offsetX: { type: 'number', description: '水平位移 -0.5~0.5（需配合 scale>1 才有余量）' },
                      offsetY: { type: 'number', description: '垂直位移 -0.5~0.5' },
                      opacity: { type: 'number', description: '透明度 0~1（垫黑底合成；要做淡出请同时给起点 opacity:1）' },
                      ease: {
                        type: 'string',
                        enum: ['linear', 'in', 'out', 'inout', 'bezier'],
                        description: '到**下一个关键帧**的缓动：linear=匀速（机械感）；in=缓慢起步；out=缓慢收住；inout=两头都缓（推荐，运镜最自然）；bezier=自定义',
                      },
                      bezier: {
                        type: 'array',
                        items: { type: 'number' },
                        description: 'ease=bezier 的控制点 [x1,y1,x2,y2]，与 CSS cubic-bezier 同义',
                      },
                    },
                    required: ['t'],
                  },
                },
              },
              required: ['file'],
            },
          },
          texts: {
            type: 'array',
            description: 'add_text：字幕数组；start/end 相对**成片**时间轴（可先用 get 看各段时间轴起止）',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: '字幕文本' },
                start: { type: 'number', description: '起始秒（相对成片）' },
                end: { type: 'number', description: '结束秒（相对成片，必须 > start）' },
                animation: { type: 'string', enum: TEXT_ANIM_IDS, description: '字幕动画预设（不传=无动画）' },
                slideDirection: { type: 'string', enum: ['left', 'right', 'up', 'down'], description: 'animation=slide 时的滑入方向（默认 right）' },
                fontSizePx: { type: 'number', description: '字号（像素，1920 高基准），默认 88' },
                color: { type: 'string', description: '字幕颜色 #RRGGBB，默认白色' },
                outlineColor: { type: 'string', description: '描边色 #RRGGBB，默认黑色' },
                outlinePx: { type: 'number', description: '描边宽度（像素，1920 高基准）0~60，默认 12；0=无描边' },
                backColor: { type: 'string', description: '背景底板色 #RRGGBBAA（A=不透明度，如 "#000000B3"）；不填=无底板' },
                position: { type: 'string', enum: ['bottom', 'center', 'top'], description: '字幕位置，默认 bottom' },
                safeArea: { type: 'boolean', description: 'true=竖屏安全区（字幕上抬，避开抖音/快手底部进度条）' },
                transform: {
                  type: 'object',
                  description: '文字层变换：x/y 是**相对画面宽高的中心偏移**（-0.5~0.5，0=居中）、scale 字号倍数、rotation 角度（正=顺时针）、opacity 0~1。★ 一旦有变换，该条不再套文字动画预设；没有变换的字幕渲染路径完全不变',
                  properties: {
                    x: { type: 'number', description: '水平中心偏移 -0.5~0.5（0=居中）' },
                    y: { type: 'number', description: '垂直中心偏移 -0.5~0.5（0=居中）' },
                    scale: { type: 'number', description: '字号倍数 0.05~5（1=原字号）' },
                    rotation: { type: 'number', description: '旋转角度（度，-180~180，正=顺时针）' },
                    opacity: { type: 'number', description: '不透明度 0~1（0=全透明）' },
                  },
                },
                keyframes: {
                  type: 'array',
                  description: '文字层变换关键帧（做"滑入 + 放大"这类文字运动）：t 为**层内** 0~1 比例（层的时间范围 = start~end），每点给 x/y/scale/rotation/opacity 中任意几项；ease 为到下一个点的过渡曲线。例：[{t:0,x:0.35,scale:0.6},{t:1,x:0,scale:1.1,ease:"out"}]',
                  items: {
                    type: 'object',
                    properties: {
                      t: { type: 'number', description: '层内时间比例 0~1' },
                      x: { type: 'number', description: '水平中心偏移 -0.5~0.5' },
                      y: { type: 'number', description: '垂直中心偏移 -0.5~0.5' },
                      scale: { type: 'number', description: '字号倍数（1=原字号）' },
                      rotation: { type: 'number', description: '旋转角度（度）' },
                      opacity: { type: 'number', description: '不透明度 0~1' },
                      ease: { type: 'string', enum: ['linear', 'in', 'out', 'inout', 'bezier'], description: '到下一个关键帧的过渡曲线' },
                    },
                    required: ['t'],
                  },
                },
              },
              required: ['text', 'start', 'end'],
            },
          },
          id: { type: 'string', description: 'update/remove/move：目标片段或字幕 id（与 index 二选一）' },
          index: { type: 'number', description: 'update/remove/move：目标序号（从 1 开始，与 id 二选一）' },
          patch: { type: 'object', description: 'update_clip/update_text：要修改的字段（其余保持不变）。update_clip 接受 clips[] 项的全部字段（含 crop / mask / transition / keyframes）；update_text 接受 texts[] 项的全部字段（含 transform / keyframes）；传 mask:null、transition:null、transform:null、keyframes:[] 表示清除' },
          to: { type: 'number', description: 'move_clip：目标位置（1 基）' },
          file: { type: 'string', description: 'set_bgm：BGM 音频绝对路径（首次必填，之后可只调音量）；add_overlay：画中画素材绝对路径' },
          overlays: {
            type: 'array',
            description: 'add_overlay：画中画数组（可一次多层，后叠的在上层）',
            items: {
              type: 'object',
              properties: {
                file: { type: 'string', description: '画中画素材（视频/图片）绝对路径' },
                start: { type: 'number', description: '起始秒（相对成片）' },
                end: { type: 'number', description: '结束秒（必须 > start）' },
                pos: { type: 'string', enum: ['topleft', 'top', 'topright', 'left', 'center', 'right', 'bottomleft', 'bottom', 'bottomright'], description: '锚点方位，默认 bottomright' },
                scale: { type: 'number', description: '叠加画面宽度比例（0.05~1，默认 0.35）' },
                blend: { type: 'string', enum: BLEND_IDS, description: '混合模式（与下层画面的合成方式）：screen=提亮叠影（双重曝光/光斑）、multiply=压暗叠影（压字/烟雾）、overlay=对比增强、softlight=柔光、add=加法提亮（火焰/粒子）、darken=变暗、lighten=变亮；缺省 normal=普通覆盖' },
                x: { type: 'number', description: '水平中心偏移（相对画面宽度，-0.5~0.5，0=居中）；设置后覆盖 pos 九宫格' },
                y: { type: 'number', description: '垂直中心偏移（相对画面高度，-0.5~0.5，0=居中）；设置后覆盖 pos 九宫格' },
                rotation: { type: 'number', description: '旋转角度（度，-180~180，正=顺时针）' },
                opacity: { type: 'number', description: '不透明度 0~1，缺省 1（水印常 0.5~0.7）' },
                keyframes: {
                  type: 'array',
                  description: '变换关键帧（做滑入/放大等画中画动画）：t 为层内 0~1 比例，每点给 x/y/scale/rotation/opacity 中的任意几项；ease 为到下一个点的过渡曲线（linear/in/out/inout/bezier）',
                  items: {
                    type: 'object',
                    properties: {
                      t: { type: 'number', description: '层内时间比例 0~1' },
                      x: { type: 'number', description: '水平中心偏移 -0.5~0.5' },
                      y: { type: 'number', description: '垂直中心偏移 -0.5~0.5' },
                      scale: { type: 'number', description: '相对基准尺寸的倍数（1=原尺寸）' },
                      rotation: { type: 'number', description: '旋转角度（度）' },
                      opacity: { type: 'number', description: '不透明度 0~1' },
                      ease: { type: 'string', enum: ['linear', 'in', 'out', 'inout', 'bezier'], description: '到下一个关键帧的过渡曲线' },
                    },
                    required: ['t'],
                  },
                },
              },
              required: ['file', 'start', 'end'],
            },
          },
          audios: {
            type: 'array',
            description: 'add_audio：定时音频层数组（音效 / 第二段 BGM）。start/end 相对成片时间轴；' +
              '转场"唰"声 = 一条 0.5~1 秒；两段 BGM 无缝接 = 两条首尾相接（如前一条 0~30s、后一条 30~end）',
            items: {
              type: 'object',
              properties: {
                file: { type: 'string', description: '音频素材绝对路径（mp3/m4a/wav/aac/flac）' },
                start: { type: 'number', description: '起始秒（相对成片）' },
                end: { type: 'number', description: '结束秒（必须 > start）' },
                volume: { type: 'number', description: '音量倍数 0~2，默认 1（BGM 段常用 0.2~0.4；音效 0.6~1）' },
                fadeIn: { type: 'number', description: '淡入秒（从段首起，不超过段长）' },
                fadeOut: { type: 'number', description: '淡出秒（到段尾止，不超过段长）' },
                trimStart: { type: 'number', description: '从素材的第几秒开始取（默认 0）' },
              },
              required: ['file', 'start', 'end'],
            },
          },
          text: { type: 'string', description: 'add_tts：要读出来的台词/旁白（与 texts 数组里的 text 是两回事）' },
          start: { type: 'number', description: 'add_tts：配音放到成片的第几秒；**不传=接在最后一条音频层之后**（多句连续调用自然首尾相接）' },
          voice: { type: 'string', description: 'add_tts：显式音色（Edge 形如 zh-CN-YunxiNeural，用 api_tts_voices 查；留空按 character 自动分配）' },
          character: { type: 'string', description: 'add_tts：角色名（如"旁白"/"男主"），同角色锁定同一音色' },
          rate: { type: 'number', description: 'add_tts：语速 -10~10，0 为正常' },
          subtitle: { type: 'boolean', description: 'add_tts：true=同时加一条**与配音等长**的字幕（省掉先配音再猜时间轴）' },
          stickers: {
            type: 'array',
            description: 'add_sticker：贴纸数组。sticker=内置贴纸库 id（badge-new / badge-hot / badge-focus / arrow-right / check / star），file=用户导入的本地 PNG/WebP；两者二选一（给 sticker 会自动生成 PNG 文件）',
            items: {
              type: 'object',
              properties: {
                sticker: { type: 'string', enum: ['badge-new', 'badge-hot', 'badge-focus', 'arrow-right', 'check', 'star'], description: '内置贴纸 id（免版权，程序化生成）' },
                file: { type: 'string', description: '用户导入的贴纸文件绝对路径（PNG/WebP，需带透明）' },
                start: { type: 'number', description: '起始秒（相对成片）' },
                end: { type: 'number', description: '结束秒（必须 > start）' },
                scale: { type: 'number', description: '宽度占画面宽度的比例 0.02~1，默认 0.3' },
                x: { type: 'number', description: '水平中心偏移 -0.5~0.5（0=居中）' },
                y: { type: 'number', description: '垂直中心偏移 -0.5~0.5（0=居中）' },
                rotation: { type: 'number', description: '旋转角度（度，正=顺时针）' },
                opacity: { type: 'number', description: '不透明度 0~1' },
                keyframes: {
                  type: 'array',
                  description: '贴纸变换关键帧（t 为层内 0~1）：[{t:0,scale:0.2},{t:1,scale:0.5,ease:"out"}] 这类"弹出/放大"',
                  items: {
                    type: 'object',
                    properties: {
                      t: { type: 'number', description: '层内时间比例 0~1' },
                      x: { type: 'number' }, y: { type: 'number' },
                      scale: { type: 'number' }, rotation: { type: 'number' }, opacity: { type: 'number' },
                      ease: { type: 'string', enum: ['linear', 'in', 'out', 'inout', 'bezier'] },
                    },
                    required: ['t'],
                  },
                },
              },
              required: ['start', 'end'],
            },
          },
          volume: { type: 'number', description: 'set_bgm：BGM 音量 0~1，默认 0.25；add_tts/add_audio 也接受 volume（音频层音量 0~2）' },
          duck: { type: 'boolean', description: 'set_bgm：true=说话时自动压低 BGM（侧链压缩），适合带旁白的成片' },
          everyNth: { type: 'number', description: 'beat_cut：每 N 个拍点切一次（1=每拍，2=隔一拍）。默认 1' },
          beatTransition: { type: 'string', enum: TRANSITION_IDS, description: `beat_cut：切点处给后一段挂的转场（不给=硬切）。卡点常用 fade / fadeblack / whiteflash 这类短转场` },
          beatTransitionDuration: { type: 'number', description: 'beat_cut：转场时长（秒），默认 0.15。卡点要短，超过 0.4 会变"软"' },
          minPiece: { type: 'number', description: 'beat_cut：太短的片不切（秒），默认 0.4' },
          fx: {
            type: 'array',
            items: { type: 'string', enum: AUDIO_FX_IDS.filter((id) => id !== 'none') },
            description: `set_audio_fx：整片音效链（按数组顺序串联，最多 4 个；传空数组=清除）。可选：${effectCatalogText(AUDIO_EFFECTS, ['none'])}。口播常用 ["denoise","loudnorm"]；多段拼接后音量不齐用 ["loudnorm"]`,
          },
          summaryOnly: { type: 'boolean', description: 'get：true 只返回紧凑摘要（默认即摘要）' },
          output: { type: 'string', description: 'render：输出文件名（如 final.mp4）；不传自动命名' },
          preview: { type: 'boolean', description: 'render：true=快速预览档（低码率，用于快速确认），确认后再正式渲染' },
        },
        required: ['op'],
      },
    },
    {
      name: 'clip_jianying',
      description:
        '剪映剪辑模式：检测本机剪映专业版，并把当前会话的剪辑工程导出为**剪映草稿**（draft_content.json），' +
        '用户在剪映里继续剪、预览、导出。它与 clip_project（应用内剪辑）是并列的第二种剪辑方式：' +
        '用户说「用剪映剪 / 在剪映里剪 / 导出到剪映」时走本工具。' +
        'op 一览：' +
        '**detect** 检测安装与草稿目录（先调它，不要假设用户装了剪映）；' +
        '**export** 把当前会话工程导出成草稿 { name?, draftRoot?, open? }（草稿名默认取工程名；同名自动加序号，绝不覆盖）；' +
        '**list** 列出剪映草稿目录里已有的草稿 { draftRoot?, limit? }；' +
        '**open** 启动本机检测到的剪映（不接受自定义可执行文件；检测不到就不要启动）。' +
        '**find_export** 扫描剪映刚导出的成片 { sinceMinutes?, nameHint? }（剪映导出完成后用它把文件找回来，交给发布链路）。' +
        '★ 草稿携带：素材/裁剪/变速/音量/字幕（含字幕动画）/BGM/分段配音/画中画，并把调色预设/结构特效/蒙版/色键/转场/关键帧/kenburns/淡入淡出映射为剪映资源（观感近似，参数可能用剪映默认）。' +
        '手动调节/曲线变速/整片音效链/BGM 闪避不迁移；没有免费对应项的预设/特效/蒙版会逐项写进 warnings。' +
        '★ 导出不改变应用内工程；用户在剪映里导出的成片可以再带回来继续处理。',
      inputSchema: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['detect', 'export', 'find_export', 'list', 'open'], description: '剪映操作' },
          name: { type: 'string', description: 'export：草稿名（默认取工程名；同名自动加序号，不覆盖）' },
          draftRoot: { type: 'string', description: 'export/list：剪映草稿根目录（缺省自动检测；可在剪映「全局设置 → 草稿位置」查看）' },
          open: { type: 'boolean', description: 'export：true=导出后顺便启动剪映' },
          sinceMinutes: { type: 'number', description: 'find_export：只找最近 N 分钟内修改的视频，默认 120' },
          nameHint: { type: 'string', description: 'find_export：按草稿名/文件名过滤（剪映导出的文件名通常就是草稿名）' },
          limit: { type: 'number', description: 'list/find_export：最多返回几条，默认 20' },
        },
        required: ['op'],
      },
    },
    {
      name: 'media_edit',
      description:
        '视频剪辑与特效加工（基于 ffmpeg）：对素材做**加工**，与 media_compose 的「组装」互补。' +
        'op 一览（按需点名，一次只做一个）：' +
        '**trim** 裁剪取片段 { video, start, end|duration }；' +
        '**speed** 变速/慢动作 { video, factor }（>1 加快，<1 放慢；音轨自动同步变速）；' +
        '**snapshot** 抽帧成图 { video, time }；' +
        '**transform** 翻转/旋转/裁切 { video, ops:["hflip"|"vflip"|"rotate90"|"rotate180"|"rotate270"] , cropW, cropH, cropX, cropY }；' +
        '**fade** 画面与声音淡入淡出 { video, fadeIn, fadeOut }；' +
        '**color** 调色/滤镜（28 种预设：人像/电影/复古/风格化）{ video, preset }，也可自定义 brightness/contrast/saturation/gamma/hue；' +
        '**audio_fx** 音频效果（降噪/变声/混响/电话音等）{ media, preset }；' +
        '**transition** 两段间转场 { video, video2, type, duration }（要求两段规格一致，先用 api_media_normalize）；' +
        '**overlay** 画中画/贴图/水印 { video, overlay, position, opacity, overlayWidth|overlayScale, margin }；' +
        '**kenburns** 静态图片做推拉运镜成视频 { image, duration, size, direction }；' +
        '**bgsound** 加背景音乐并压低原声 { video, audio, volume, duck, fadeOut }；' +
        '**volume** 音量调整 { media, db|factor }；' +
        '**loudnorm** 响度归一 { media, target }（多段拼接后音量忽大忽小，用它拉平）；' +
        '**convert** 格式转换 { media, to }（图片 png/jpg/webp/bmp/tiff/gif；音频 mp3/wav/m4a/aac/flac/ogg；视频 mp4/mkv/mov/webm/avi；视频转音频即抽音轨，视频转图片取第一帧）。' +
        '输入一律为本机绝对路径（前序工具返回的 file 字段）；返回 {type, url, file}。未找到 ffmpeg 时会给出安装指引。',
      inputSchema: {
        type: 'object',
        properties: {
          op: {
            type: 'string',
            enum: [
              'trim', 'speed', 'snapshot', 'transform', 'fade',
              'color', 'transition', 'overlay', 'kenburns',
              'bgsound', 'volume', 'loudnorm', 'audio_fx', 'convert',
            ],
            description: '加工操作（一次一个）',
          },
          video: { type: 'string', description: '主视频本机绝对路径（trim/speed/snapshot/transform/fade/color/transition/overlay/bgsound）' },
          video2: { type: 'string', description: 'transition：第二段视频本机绝对路径' },
          media: { type: 'string', description: 'volume/loudnorm/audio_fx/convert：音频或视频本机绝对路径' },
          to: {
            type: 'string',
            description: 'convert：目标格式（不带点）。png/jpg/jpeg/webp/bmp/tiff/gif / mp3/wav/m4a/aac/flac/ogg / mp4/mkv/mov/webm/avi',
          },
          image: { type: 'string', description: 'kenburns：静态图片本机绝对路径（png/jpg/webp/bmp）' },
          overlay: { type: 'string', description: 'overlay：叠加的图片/视频本机绝对路径（水印、贴图、画中画）' },
          audio: { type: 'string', description: 'bgsound：背景音乐本机绝对路径' },
          start: { type: 'string', description: 'trim：起始时间，支持秒数或 "MM:SS"/"HH:MM:SS"，默认 0' },
          end: { type: 'string', description: 'trim：结束时间（同格式）；与 duration 二选一，都不给则到片尾' },
          duration: { type: 'number', description: 'trim/transition/kenburns：时长（秒）。trim 里与 end 二选一；transition 默认 0.8；kenburns 默认 6' },
          time: { type: 'string', description: 'snapshot：抽帧时间点（秒数或 "MM:SS"）' },
          factor: { type: 'number', description: 'speed：速度倍数 0.25~4（>1 加快、<1 放慢）；volume：音量倍数' },
          db: { type: 'number', description: 'volume：分贝增益（如 -6 降低、3 提升）' },
          ops: {
            type: 'array', items: { type: 'string' },
            description: 'transform：变换列表，可组合 ["hflip","rotate90"]；可选 hflip/vflip/mirror/rotate90/rotate180/rotate270',
          },
          cropW: { type: 'number', description: 'transform：画面裁切宽度（与 cropH 一起用）' },
          cropH: { type: 'number', description: 'transform：画面裁切高度' },
          cropX: { type: 'number', description: 'transform：裁切起点 X，默认 0' },
          cropY: { type: 'number', description: 'transform：裁切起点 Y，默认 0' },
          fadeIn: { type: 'number', description: 'fade 默认 1：画面与声音淡入秒数；bgsound 默认 0.5：BGM 淡入' },
          fadeOut: { type: 'number', description: 'fade 默认 1：淡出秒数；bgsound 默认 1.5：BGM 片尾淡出' },
          preset: { type: 'string', enum: COLOR_IDS, description: `color/audio_fx：预设名。color 可选 ${effectCatalogText(COLOR_EFFECTS, ['none'])}；audio_fx 可选 ${effectCatalogText(AUDIO_EFFECTS, ['none'])}` },
          brightness: { type: 'number', description: 'color：亮度，-1~1（0 不变）' },
          contrast: { type: 'number', description: 'color：对比度，0~3（1 不变）' },
          saturation: { type: 'number', description: 'color：饱和度，0~3（1 不变，0 即黑白）' },
          gamma: { type: 'number', description: 'color：伽马，0.1~3（1 不变）' },
          hue: { type: 'number', description: 'color：色相偏移角度，-180~180' },
          type: { type: 'string', enum: TRANSITION_IDS, description: `transition：转场类型。可选 ${effectCatalogText(TRANSITIONS)}` },
          position: { type: 'string', enum: ['tl', 'tr', 'bl', 'br', 'center', 'top', 'bottom'], description: 'overlay：叠加位置，默认 br（右下角）' },
          opacity: { type: 'number', description: 'overlay：叠加不透明度 0.05~1，默认 1（水印常用 0.5~0.7）' },
          overlayWidth: { type: 'number', description: 'overlay：叠加层宽度（像素，高度按比例）；不传图片按 overlayScale 缩放' },
          overlayScale: { type: 'number', description: 'overlay：叠加层相对基准视频宽度比例，默认 0.18（图片时生效）' },
          margin: { type: 'number', description: 'overlay：距边缘像素，默认 24' },
          direction: { type: 'string', enum: ['in', 'out'], description: 'kenburns：in 向内推近（默认）/ out 向外拉远' },
          size: { type: 'string', description: 'kenburns：输出分辨率，默认 "1080x1920"（竖屏）' },
          fps: { type: 'number', description: 'kenburns：输出帧率，默认 30' },
          duck: { type: 'boolean', description: 'bgsound：true=说话时自动压低 BGM（侧链压缩），默认 false' },
          volume: { type: 'number', description: 'bgsound：BGM 音量比例 0~1，默认 0.25' },
          target: { type: 'number', description: 'loudnorm：目标响度 LUFS，默认 -16（短视频常用）' },
          truePeak: { type: 'number', description: 'loudnorm：真峰值上限 dBTP，默认 -1.5' },
          lra: { type: 'number', description: 'loudnorm：响度范围，默认 11' },
          output: { type: 'string', description: '可选，输出文件名（如 clip1.mp4）；不传自动命名' },
        },
        required: ['op'],
      },
    },
  ]);
}
