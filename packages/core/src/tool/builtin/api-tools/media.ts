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
        '当 media_compose 报「尚未安装 ffmpeg」时调用本工具。' +
        '★ 安装体积策略：不超过 50MB 的依赖会被静默安装；ffmpeg 约 100MB，超过阈值，**调用前应先用 confirm_user 告知用户**（含体积与用途），征得同意再装。' +
        '已安装时直接返回可用状态（幂等）。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_media_fetch',
      description:
        '下载网络上的公开素材到本机。支持两类地址：' +
        '① **文件直链**（.mp4/.webm/.jpg 等）—— 直接取回；' +
        '② **视频网站页面链接**（YouTube / B站 / 抖音 / 西瓜等）—— 工具自动识别网页并解析下载，' +
        '国内站默认可用，YouTube 需设置环境变量 YZ_YTDLP_YOUTUBE=1 并配置代理。' +
        '用途：用户要「找骑车、修驴蹄子、切肥皂这类解压视频」或任何公开素材时，' +
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
        '音视频合成（基于 ffmpeg）：① dub 把配音音频混进视频（默认替换原音轨，keepAudio=true 时与人声混合）；② concat 按顺序拼接多段视频；③ subtitle 把 SRT 字幕烧录进画面（可顺带在顶部叠加标题、并控制字幕字号）。' +
        '输入一律为本机文件绝对路径（前序工具返回的 file 字段）。返回 {type:"video", file, url}。' +
        'concat 要求各段编码参数一致（copy 直拼），不一致会报错——先用同参数生成。未找到 ffmpeg 时会给出明确的放置/配置指引。' +
        '★ subtitle 推荐参数：title 传「项目名称」做顶部常驻标题（整数中文也支持），subtitleFontSize 传 32~38（竖屏 1080 宽下默认 34，避免默认字号过大压住画面）。',
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
          subtitleFontSize: { type: 'number', description: 'subtitle 可选：字幕字号（像素，以 1920 高成片为基准），默认 120（1080 宽下约 9 字/行）；要更小传 100，更大传 140' },
          titleFontSize: { type: 'number', description: 'subtitle 可选：标题字号（像素，基准同上），默认 140；不传用默认' },
          subtitleColor: { type: 'string', description: 'subtitle 可选：字幕颜色，十六进制如 "#FFD700"（默认白色）' },
          subtitleOutlineColor: { type: 'string', description: 'subtitle 可选：字幕描边颜色，默认黑色（浅色画面上加深描边更清晰）' },
          subtitleOutline: { type: 'number', description: 'subtitle 可选：描边宽度（像素，基准同上），默认 12；0 即无描边' },
          subtitlePosition: { type: 'string', enum: ['bottom', 'center', 'top'], description: 'subtitle 可选：字幕位置，默认 bottom 底部' },
          subtitleMarginV: { type: 'number', description: 'subtitle 可选：字幕垂直边距（像素，基准同上）；不传按位置给默认（底部 200，顶部 260）' },
          safeArea: { type: 'boolean', description: 'subtitle 可选：true=竖屏短视频安全区，字幕上抬到画面上方约 78% 处，避开底部进度条/账号信息遮挡（抖音/快手/视频号必开）' },
          titleColor: { type: 'string', description: 'subtitle 可选：标题颜色，十六进制如 "#FFFFFF"，默认白色' },
          titleFade: { type: 'number', description: 'subtitle 可选：标题淡入秒数，默认 0（立即显示）' },
          output: { type: 'string', description: '可选，输出文件名（如 final.mp4）；不传自动命名' },
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
        '**color** 调色 { video, preset:"warm|cool|bw|vintage|vivid|film|fade" 或 brightness/contrast/saturation/gamma/hue }；' +
        '**transition** 两段间转场 { video, video2, type, duration }（要求两段规格一致，先用 api_media_normalize）；' +
        '**overlay** 画中画/贴图/水印 { video, overlay, position, opacity, overlayWidth|overlayScale, margin }；' +
        '**kenburns** 静态图片做推拉运镜成视频 { image, duration, size, direction }；' +
        '**bgsound** 加背景音乐并压低原声 { video, audio, volume, duck, fadeOut }；' +
        '**volume** 音量调整 { media, db|factor }；' +
        '**loudnorm** 响度归一 { media, target }（多段拼接后音量忽大忽小，用它拉平）。' +
        '输入一律为本机绝对路径（前序工具返回的 file 字段）；返回 {type, url, file}。未找到 ffmpeg 时会给出安装指引。',
      inputSchema: {
        type: 'object',
        properties: {
          op: {
            type: 'string',
            enum: [
              'trim', 'speed', 'snapshot', 'transform', 'fade',
              'color', 'transition', 'overlay', 'kenburns',
              'bgsound', 'volume', 'loudnorm',
            ],
            description: '加工操作（一次一个）',
          },
          video: { type: 'string', description: '主视频本机绝对路径（trim/speed/snapshot/transform/fade/color/transition/overlay/bgsound）' },
          video2: { type: 'string', description: 'transition：第二段视频本机绝对路径' },
          media: { type: 'string', description: 'volume/loudnorm：音频或视频本机绝对路径' },
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
          preset: { type: 'string', enum: ['warm', 'cool', 'bw', 'vintage', 'vivid', 'film', 'fade'], description: 'color：调色预设' },
          brightness: { type: 'number', description: 'color：亮度，-1~1（0 不变）' },
          contrast: { type: 'number', description: 'color：对比度，0~3（1 不变）' },
          saturation: { type: 'number', description: 'color：饱和度，0~3（1 不变，0 即黑白）' },
          gamma: { type: 'number', description: 'color：伽马，0.1~3（1 不变）' },
          hue: { type: 'number', description: 'color：色相偏移角度，-180~180' },
          type: { type: 'string', description: 'transition：转场类型（fade/dissolve/wipeleft/slideleft/circleopen/pixelize/zoomin 等），默认 fade' },
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
