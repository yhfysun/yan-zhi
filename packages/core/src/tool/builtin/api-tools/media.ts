import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

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
 */
export function registerMediaTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('media', [
    {
      name: 'api_image_generate',
      description:
        '文生图：按文字描述生成一张图片（默认 agnes-image-2.5-flash；也支持其他平台的生图模型，用 model+platformId 指定，先用 list_models 查询）。' +
        'prompt 要具体（主体/场景/风格/构图/光线/质量词），支持中英文。' +
        '可选 images 传入参考图（URL/base64/本机路径，可多张）做图生图/多图合成/构图保留编辑。' +
        '工具返回 {type, url, description} —— 界面已按 url 自动渲染图片预览，' +
        '因此正文里不要贴 JSON、不要贴本机绝对路径、不要复述「本机备份」，也不要重复附图；' +
        '确实需要图文混排说明时才用 markdown ![](url) 引用，且同一张图最多出现一次。',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '画面描述，越具体越好（主体+场景+风格+构图+光线+质量词）' },
          model: { type: 'string', description: '生图模型：默认 agnes-image-2.5-flash；也可传其他平台的生图模型 id 或别名（先用 list_models 按 type=image 查询）' },
          platformId: { type: 'string', description: '可选，指定平台 id（配合 model 使用）；都不传默认走 agnes 平台' },
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
      name: 'media_install_ffmpeg',
      description:
        '下载安装 ffmpeg（媒体合成的依赖：配音混入视频、拼接、烧字幕都需要它）。' +
        '按当前平台从官方静态构建源下载到应用数据目录，一次安装长期可用。' +
        '当 media_compose 报「尚未安装 ffmpeg」时调用本工具；调用前应先用 confirm_user 告知用户即将下载（约 100MB+），征得同意再装。' +
        '已安装时直接返回可用状态（幂等）。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'media_compose',
      description:
        '音视频合成（基于 ffmpeg）：① dub 把配音音频混进视频（默认替换原音轨，keepAudio=true 时与人声混合）；② concat 按顺序拼接多段视频；③ subtitle 把 SRT 字幕烧录进画面。' +
        '输入一律为本机文件绝对路径（前序工具返回的 file 字段）。返回 {type:"video", file, url}。' +
        'concat 要求各段编码参数一致（copy 直拼），不一致会报错——先用同参数生成。未找到 ffmpeg 时会给出明确的放置/配置指引。',
      inputSchema: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['dub', 'concat', 'subtitle'], description: '合成操作' },
          video: { type: 'string', description: 'dub/subtitle：视频文件本机绝对路径' },
          audio: { type: 'string', description: 'dub：配音音频本机绝对路径' },
          keepAudio: { type: 'boolean', description: 'dub 可选，true=配音与原音轨混合（amix），false/缺省=替换原音轨' },
          videos: { type: 'array', items: { type: 'string' }, description: 'concat：按顺序的视频路径列表（≥2）' },
          srt: { type: 'string', description: 'subtitle：SRT 字幕文件本机绝对路径（api_srt_generate 的产出）' },
          output: { type: 'string', description: '可选，输出文件名（如 final.mp4）；不传自动命名' },
        },
        required: ['op'],
      },
    },
  ]);
}
