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
        '返回 JSON：remoteUrl 为图片公网地址（回复正文请用 markdown ![](remoteUrl) 内嵌展示），' +
        'screenshotUrl/file 为本机备份路径。',
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
        '返回 JSON：remoteUrl/videoUrl 为视频地址（回复正文请给出可点击链接或 markdown 内嵌），file 为本机文件路径。',
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
  ]);
}
