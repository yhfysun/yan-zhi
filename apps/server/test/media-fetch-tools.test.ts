/**
 * 素材下载与竖屏成片链路 —— 守门测试（2026-09-27，用户诉求）。
 *
 * 用户原话：「让大模型下载公开的骑单车、修驴蹄子等这些解压视频，大模型不去下载啊，
 * 让他不用考虑侵权啊，而且视频最后都是竖屏，分辨率一样长视频」。
 *
 * 三件事各自都会**静默失效**，所以每条都要有断言：
 *   ① 工具注册了但没挂到智能体 → 模型看不到它，表现为"不去下载"（不报错）；
 *   ② 提示词没写"去网上找" → 模型只会回"请上传"（不报错，只是做不到）；
 *   ③ 各段规格不同 → concat 直拼报错（报错但看不懂为什么），且竖屏规格无人统一。
 *
 * 判据一律"读源码剥注释后再断言" —— 注释里出现同一个词会让 `.not.toMatch` 假红（踩过）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(SERVER_SRC, p), 'utf8');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

/** 剥掉行注释与块注释（断言源码前必须先做：注释撞词会假红/假绿） */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const EXECUTOR = read('src/mcp/api-tool-executor.ts');
const EXECUTOR_CODE = stripComments(EXECUTOR);
const TASK_MODE_AGENTS = read('src/builtin-task-mode-agents.ts');
const DB = stripComments(read('src/db.ts'));
const MEDIA_TOOL_DEFS = readRepo('packages/core/src/tool/builtin/api-tools/media.ts');
const TASK_TYPES = readRepo('packages/shared/src/utils/task-types.ts');

describe('① 下载工具：已实现 + 已注册 + 已挂载', () => {
  it('api-tool-executor 里实现了 media_fetch 与 media_normalize', () => {
    expect(EXECUTOR_CODE).toMatch(/async function mediaFetch\(/);
    expect(EXECUTOR_CODE).toMatch(/async function mediaNormalize\(/);
  });

  it('两个工具都在 SUPPORTED_API_TOOLS 白名单里（不在 → 配置层会把它过滤掉）', () => {
    // 取白名单集合体，避免匹配到别处的同名串
    const start = EXECUTOR_CODE.indexOf('export const SUPPORTED_API_TOOLS');
    expect(start, '找不到 SUPPORTED_API_TOOLS 定义').toBeGreaterThan(-1);
    const body = EXECUTOR_CODE.slice(start, EXECUTOR_CODE.indexOf(']);', start));
    expect(body).toContain("'api_media_fetch'");
    expect(body).toContain("'api_media_normalize'");
  });

  it('两个工具都在 switch 分发里（注册了却无 case → 调用时返回「未实现的 API 工具」）', () => {
    expect(EXECUTOR_CODE).toMatch(/case 'api_media_fetch':/);
    expect(EXECUTOR_CODE).toMatch(/case 'api_media_normalize':/);
  });

  it('media_compose 的 op 认 normalize（一步统一规格）', () => {
    // op 白名单里含 normalize，且走 mediaNormalize
    expect(EXECUTOR_CODE).toMatch(/\['dub', 'concat', 'subtitle', 'normalize'\]/);
    expect(EXECUTOR_CODE).toMatch(/op === 'normalize'\) return mediaNormalize\(/);
  });

  it('core 侧两个工具定义存在（否则模型看不到，工具名也无法解析）', () => {
    expect(MEDIA_TOOL_DEFS).toMatch(/name: 'api_media_fetch'/);
    expect(MEDIA_TOOL_DEFS).toMatch(/name: 'api_media_normalize'/);
  });

  it('★ 默认助手已挂载两个工具（挂载是模型能调到的唯一前提）', () => {
    const start = DB.indexOf('const DEFAULT_AGENT_BUILTIN_TOOLS');
    expect(start, '找不到 DEFAULT_AGENT_BUILTIN_TOOLS').toBeGreaterThan(-1);
    const body = DB.slice(start, DB.indexOf('];', start));
    expect(body).toContain("'api_media_fetch'");
    expect(body).toContain("'api_media_normalize'");
  });

  it('★ 任务模式三个智能体都通过共用常量挂上了（脚本/有声小说/配音）', () => {
    expect(TASK_MODE_AGENTS).toMatch(/const COMMON_MEDIA_FETCH_TOOLS = \['api_media_fetch', 'api_media_normalize', 'media_install_ytdlp'\];/);
    // 引用方：SCRIPT / AUDIOBOOK / DUBBING 三个（短剧导演在 db.ts 内联定义，单独断言）
    const refs = TASK_MODE_AGENTS.match(/\.\.\.COMMON_MEDIA_FETCH_TOOLS,/g) || [];
    expect(refs.length, `应有 3 处引用，实际 ${refs.length}`).toBeGreaterThanOrEqual(3);
  });

  it('★ 短剧导演（db.ts 内联定义）也挂上了 —— 它最需要参考视频/空镜素材', () => {
    const start = DB.indexOf('const STORYBOARD_AGENT_BUILTIN_TOOLS');
    expect(start, '找不到 STORYBOARD_AGENT_BUILTIN_TOOLS').toBeGreaterThan(-1);
    const body = DB.slice(start, DB.indexOf('];', start));
    expect(body).toContain("'api_media_fetch'");
    expect(body).toContain("'api_media_normalize'");
  });
});

describe('② 提示词放行：让模型自己去找并下载', () => {
  it('素材规则里有「去网上找并下载」这条（否则模型只会回"请上传"）', () => {
    expect(TASK_TYPES).toMatch(/素材缺失时先试着"去网上找"/);
    expect(TASK_TYPES).toContain('api_media_fetch');
  });

  it('素材规则点明用 category:"source" 落到 00-source（不然下载完仍"缺素材"）', () => {
    expect(TASK_TYPES).toMatch(/category:"source"/);
    expect(TASK_TYPES).toContain('00-source');
  });

  it('★ 明确写了「不要在授权上卡住用户」（用户原话：让他不用考虑侵权）', () => {
    expect(TASK_TYPES).toMatch(/不要在素材"要不要授权"上卡住用户/);
    expect(TASK_TYPES).toMatch(/不要以版权为由拒绝下载公开素材/);
  });

  it('★ 旧的「主动提醒确认改编授权」已不再出现（那是模型自加一道版权确认的源头）', () => {
    // 三处历史文案都不该留：db 的短剧提示词 / db 的分镜 skill / 任务模式智能体
    expect(DB).not.toMatch(/提醒用户确认有改编授权/);
    expect(DB).not.toMatch(/需确认用户有改编授权/);
    expect(TASK_MODE_AGENTS).not.toMatch(/提醒用户确认有改编授权/);
  });

  it('★ tool 描述里也写了"不要以版权为由拒绝下载公开素材"（模型读的是 tool 描述）', () => {
    expect(MEDIA_TOOL_DEFS).toMatch(/不要以版权为由拒绝下载公开素材/);
  });

  it('视频素材规则覆盖到脚本/短剧（这两类最常要真实视频）', () => {
    const start = TASK_TYPES.indexOf('const MATERIAL_NEEDS');
    const body = TASK_TYPES.slice(start, TASK_TYPES.indexOf('};', start));
    // script_copy / short_drama 都要含 video
    expect(body).toMatch(/script_copy: \['source', 'reference', 'video'\]/);
    expect(body).toMatch(/short_drama: \['source', 'video'\]/);
  });
});

describe('③ 竖屏标准化：让"拼成长视频"真的能成', () => {
  it('★ mediaNormalize 默认 1080x1920 竖屏（用户指定：统一竖屏规格）', () => {
    expect(EXECUTOR_CODE).toMatch(/str\(args, 'size'\)\.trim\(\) \|\| '1080x1920'/);
  });

  it('★ 画面用 scale + crop 裁切填满（横屏素材也成竖屏且不留黑边）', () => {
    expect(EXECUTOR_CODE).toMatch(/force_original_aspect_ratio=increase/);
    expect(EXECUTOR_CODE).toMatch(/crop=\$\{w\}:\$\{h\}/);
    expect(EXECUTOR_CODE).toMatch(/setsar=1/);
  });

  it('★ 音轨统一（48k 立体声 AAC）+ 无音轨补静音 —— 漏这步 concat 照样失败', () => {
    expect(EXECUTOR_CODE).toMatch(/probeMedia/);
    expect(EXECUTOR_CODE).toMatch(/anullsrc=channel_layout=stereo:sample_rate=48000/);
    expect(EXECUTOR_CODE).toMatch(/-c:a', 'aac', '-ar', '48000', '-ac', '2'/);
  });

  it('★★ 补静音必须显式限定时长（anullsrc 是无限源，只靠 -shortest 实测不退出）', () => {
    // 实测：ffmpeg 9.0 下 -f lavfi 输入 + 仅 -shortest → 不报错不退出、产物膨胀（13MB 仍在写）
    expect(EXECUTOR_CODE).toMatch(/hadAudio\.durationSec > 0 \? \['-t', String\(hadAudio\.durationSec\)\]/);
    expect(EXECUTOR_CODE).toMatch(/function probeMedia/);
  });

  it('★ 音频映射是二选一（同时映射原音轨+静音会产出两条音轨，同样是错的）', () => {
    // 有音轨走 -map 0:a:0；无音轨走 lavfi 静音源 -map 1:a:0
    expect(EXECUTOR_CODE).toMatch(/hadAudio\.hasAudio\s*\?\s*\['-map', '0:v:0', '-map', '0:a:0'\]/);
    expect(EXECUTOR_CODE).toMatch(/-map', '1:a:0'/);
  });

  it('★★ 必须显式映射视频流 `-map 0:v:0`（实测：用了 -map 就禁用默认流选择）', () => {
    // 实测踩到：只写 -map 0:a:0 时，输出**只有音频没有画面** —— 命令成功、不报错，
    // 该"成功"极其隐蔽（产物能播放出声音，只是没画面）。两个分支都必须带视频映射。
    const vMaps = EXECUTOR_CODE.match(/-map', '0:v:0'/g) || [];
    expect(vMaps.length, `两个分支各需一处 -map 0:v:0，实际 ${vMaps.length}`).toBeGreaterThanOrEqual(2);
  });

  it('concat 失败时引导去 media_normalize（而不是让模型盲目重试）', () => {
    expect(EXECUTOR_CODE).toMatch(/正解不是反复重试，而是先统一规格/);
    expect(EXECUTOR_CODE).toMatch(/media_normalize \{ videos:/);
  });

  it('有声小说/短剧的步骤里写了"先 normalize 再 concat"', () => {
    // 有声小说：合成导出步；短剧：合成成片步（措辞不同，分别锚定）
    expect(TASK_TYPES).toMatch(/api_media_normalize 统一成 1080x1920 再 concat/);
    expect(TASK_TYPES).toMatch(/api_media_normalize 统一成 1080x1920 竖屏/);
  });

  it('任务模式智能体的提示词也写了竖屏统一规格（模型不读 task-types 也要知道）', () => {
    expect(TASK_MODE_AGENTS).toMatch(/api_media_normalize \{ videos:\[\.\.\.\], size:"1080x1920" \}/);
  });
});

describe('⑤ 无前缀媒体工具的「可执行判定」（修掉的既有严重缺陷）', () => {
  it('★ isApiExecutableTool 存在，且不能只判 api_ 前缀', () => {
    expect(EXECUTOR_CODE).toMatch(/export function isApiExecutableTool\(name: string\): boolean/);
    // 判定必须同时包含「前缀」与「白名单」两个来源
    expect(EXECUTOR_CODE).toMatch(/startsWith\('api_'\) \|\| SUPPORTED_API_TOOLS\.has\(name\)/);
  });

  it('★★ 四处调用点都改用统一判定（任一漏改 → 该通道下工具不可见/不可执行）', () => {
    const LLM = stripComments(read('src/llm-task-manager.ts'));
    const TOOLS_ROUTE = stripComments(read('src/routes/tools.ts'));
    const MCP_INDEX = stripComments(read('src/mcp/index.ts'));

    // ① 执行分发（对话链路）
    expect(LLM).toMatch(/const isApi = isApiExecutableTool\(toolName\)/);
    // ② 暴露给模型的挂载过滤（漏了 → 模型看不到 media_compose）
    expect(LLM).toMatch(/mountedApiTools = \[\.\.\.toolIds, \.\.\.convMounts\.builtinToolIds\]\.filter\(\(n\) => isApiExecutableTool\(n\)\)/);
    // ③ 子智能体/工作流的工具暴露
    expect(LLM).toMatch(/if \(isApiExecutableTool\(name\)\) \{/);
    // ④ 试运行通道
    expect(TOOLS_ROUTE).toMatch(/if \(isApiExecutableTool\(name\)\) \{/);
    // ⑤ MCP 通道（tools/call 与 tools/list 都要）
    expect(MCP_INDEX).toMatch(/const result = isApiExecutableTool\(name\)/);
    expect(MCP_INDEX).toMatch(/if \(!isApiExecutableTool\(tool\.name\)\) continue;/);
  });

  it('★★ 上面四处都不该再残留裸的 startsWith(\'api_\') 分发判定', () => {
    // 回退保护：若有人把某处改回前缀判定，这条会红。
    const LLM = stripComments(read('src/llm-task-manager.ts'));
    const TOOLS_ROUTE = stripComments(read('src/routes/tools.ts'));
    const MCP_INDEX = stripComments(read('src/mcp/index.ts'));
    expect(LLM).not.toMatch(/const isApi = toolName\.startsWith\('api_'\)/);
    expect(TOOLS_ROUTE).not.toMatch(/if \(name\.startsWith\('api_'\)\) \{/);
    expect(MCP_INDEX).not.toMatch(/const result = name\.startsWith\('api_'\)/);
  });

  it('★ media_compose / media_install_ffmpeg 都在 SUPPORTED_API_TOOLS 白名单里', () => {
    const start = EXECUTOR_CODE.indexOf('export const SUPPORTED_API_TOOLS');
    const body = EXECUTOR_CODE.slice(start, EXECUTOR_CODE.indexOf(']);', start));
    expect(body).toContain("'media_compose'");
    expect(body).toContain("'media_install_ffmpeg'");
  });
});

describe('④ 落盘位置：下载到 00-source 而不是散落各处', () => {
  it('category=source 时落空间的 00-source（任务模式素材约定位置）', () => {
    expect(EXECUTOR_CODE).toMatch(/resolveConversationSpaceRoot/);
    expect(EXECUTOR_CODE).toMatch(/path\.join\(root, '00-source'\)/);
  });

  it('文件名过安全清洗（含 .. 或分隔符的名字会被静态路由 404）', () => {
    expect(EXECUTOR_CODE).toMatch(/function safeDownloadName/);
    expect(EXECUTOR_CODE).toMatch(/replace\(\/\\\.\{2,\}\/g, '\.'\)/);
  });

  it('下载体积有上限（防误填超大链接把磁盘打满）', () => {
    expect(EXECUTOR_CODE).toMatch(/MEDIA_FETCH_MAX_BYTES = 2 \* 1024 \* 1024 \* 1024/);
    expect(EXECUTOR_CODE).toMatch(/超过上限/);
  });

  it('下载走既有的 media-fetch 通路（网络差异在这一层被吸收，含代理兜底）', () => {
    // downloadBinary 是 downloadMediaBinary 的薄封装（直连优先 → 本机代理隧道兜底）
    expect(EXECUTOR_CODE).toMatch(/async function downloadBinary\(url: string, timeoutMs = 180000\): Promise<Buffer> \{\s*return downloadMediaBinary\(url, timeoutMs\);/);
    expect(EXECUTOR_CODE).toMatch(/async function mediaFetch\([\s\S]{0,1500}await downloadBinary\(url\)/);
  });
});

describe('⑥ 视频网站解析下载（yt-dlp，2026-09-28 用户诉求下半场）', () => {
  it('media_install_ytdlp 在 SUPPORTED_API_TOOLS 白名单', () => {
    const start = EXECUTOR_CODE.indexOf('export const SUPPORTED_API_TOOLS');
    const body = EXECUTOR_CODE.slice(start, EXECUTOR_CODE.indexOf(']);', start));
    expect(body).toContain("'media_install_ytdlp'");
  });
  it('switch 分发有 case media_install_ytdlp', () => {
    expect(EXECUTOR_CODE).toMatch(/case 'media_install_ytdlp':/);
  });
  it('★ 默认助手挂载了 media_install_ytdlp（模型能调到的前提）', () => {
    const start = DB.indexOf('const DEFAULT_AGENT_BUILTIN_TOOLS');
    expect(start, '找不到 DEFAULT_AGENT_BUILTIN_TOOLS').toBeGreaterThan(-1);
    const body = DB.slice(start, DB.indexOf('];', start));
    expect(body).toContain("'media_install_ytdlp'");
  });
  it('★ 任务模式智能体共用常量挂了 media_install_ytdlp', () => {
    expect(TASK_MODE_AGENTS).toMatch(/const COMMON_MEDIA_FETCH_TOOLS = \['api_media_fetch', 'api_media_normalize', 'media_install_ytdlp'\];/);
  });
  it('★ api_media_fetch 描述支持「页面链接自动解析」+ 有 maxBytes 参数', () => {
    expect(MEDIA_TOOL_DEFS).toMatch(/视频网站页面链接/);
    expect(MEDIA_TOOL_DEFS).toMatch(/自动识别网页并解析下载/);
    expect(MEDIA_TOOL_DEFS).toMatch(/maxBytes/);
  });
  it('★ 提示词放行「直接给页面链接 + YouTube 开关」', () => {
    expect(TASK_TYPES).toMatch(/页面链接/);
    expect(TASK_TYPES).toMatch(/YZ_YTDLP_YOUTUBE=1/);
  });
  it('★ mediaFetch 实现「先直链 → 命中网页自动转 yt-dlp」', () => {
    expect(EXECUTOR_CODE).toMatch(/function looksLikeHtml\(/);
    expect(EXECUTOR_CODE).toMatch(/ytdlpFetch\(url, prefix/);
    expect(EXECUTOR_CODE).toMatch(/isYoutubeHost\(host\) && !youtubeEnabled\(\)/);
  });
  it('ytdlp-runtime 实现了定位/安装/解析与 YouTube 开关', () => {
    const rt = read('src/mcp/ytdlp-runtime.ts');
    expect(rt).toMatch(/export function isYoutubeHost\(/);
    expect(rt).toMatch(/export async function installYtdlp\(/);
    expect(rt).toMatch(/export async function ytdlpFetch\(/);
    expect(rt).toMatch(/export function youtubeEnabled\(/);
  });
});

/**
 * ⑦ 剪辑与特效（media_edit，2026-09-28 用户诉求「有没有视频剪辑工具」）。
 *
 * 同样的静默失效三件套，外加本项目踩过两次的那条：
 *   ① 注册了但没挂到智能体 / 没进白名单 → 模型看不到（不报错）；
 *   ② 没登记进 WRITE_TOOLS → **只读会话里静默可写**（已犯两次，此处硬性守门）；
 *   ③ 没登记进 llm-task-manager 的 MEDIA_TOOLS → 产物落盘了但文件管理里看不到（不报错）；
 *   ④ 没写进提示词 → 模型不知道有这个能力，只会干基础合成。
 */
describe('⑦ 剪辑与特效：media_edit 实现 + 注册 + 挂载 + 权限登记', () => {
  const EXEC = EXECUTOR_CODE;
  // ★ 原文读取（不 stripComments）：本用例钉的就是**注释里的决策记录**（「明确放行」「那就放行啊」），
  //   去注释后这些字串不存在 —— 2026-10-03 修复（此前该断言从未真正生效过）。
  const PERM = read('src/tool-permission.ts');
  const TASK_MGR = stripComments(read('src/llm-task-manager.ts'));

  it('实现了 mediaEdit，且覆盖全部 12 个 op', () => {
    expect(EXEC).toMatch(/async function mediaEdit\(/);
    const ops = [
      'trim', 'speed', 'snapshot', 'transform', 'fade',
      'color', 'transition', 'overlay', 'kenburns',
      'bgsound', 'volume', 'loudnorm',
    ];
    for (const o of ops) {
      expect(EXEC, `缺 op 分支：${o}`).toMatch(new RegExp(`op === '${o}'`));
    }
  });

  it('media_edit 在 SUPPORTED_API_TOOLS 白名单里', () => {
    const start = EXEC.indexOf('export const SUPPORTED_API_TOOLS');
    expect(start, '找不到 SUPPORTED_API_TOOLS 定义').toBeGreaterThan(-1);
    const body = EXEC.slice(start, EXEC.indexOf(']);', start));
    expect(body).toContain("'media_edit'");
  });

  it('media_edit 在 switch 分发里（漏 case → 返回「未实现的 API 工具」）', () => {
    expect(EXEC).toMatch(/case 'media_edit':/);
    expect(EXEC).toMatch(/return await mediaEdit\(args, conversationId\)/);
  });

  it('★ media_edit 对只读会话**放行**（用户 2026-09-29 决策：「那就放行啊」）', () => {
    const start = PERM.indexOf('const WRITE_TOOLS = new Set([');
    expect(start, '找不到 WRITE_TOOLS').toBeGreaterThan(-1);
    const body = PERM.slice(start, PERM.indexOf(']);', start));
    // 与同族一致：媒体生成/加工类工具不拦只读会话（产物是新建素材，不是改用户文件）
    expect(body).not.toContain("'media_edit'");
    // 防回归：同一族都必须保持放行，避免后人只挑一个加回去造成口径不一致
    for (const t of [
      'media_compose', 'api_media_normalize', 'api_media_fetch', 'api_srt_generate',
      'api_tts_speak', 'api_image_generate', 'api_video_generate',
      'media_install_ffmpeg', 'media_install_ytdlp',
    ]) {
      expect(body, `媒体类工具不应被拦只读会话：${t}`).not.toContain(`'${t}'`);
    }
  });

  it('媒体放行是**有意决策**而非漏登记：注释里写明理由（防止后人"顺手加回去"）', () => {
    expect(PERM).toMatch(/明确放行/);
    expect(PERM).toMatch(/那就放行啊/);
    // 仍是写副作用的工具必须保留拦截（校验改动没把清单删空）
    expect(PERM).toMatch(/const WRITE_TOOLS = new Set\(\[[\s\S]*?'file_write'/);
  });

  it('★ media_edit 已登记进 MEDIA_TOOLS（漏登记 = 产物不进文件管理，只在对话里）', () => {
    // ★ 2026-10-03 修复：MEDIA_TOOLS 已随产物登记钩子重构迁移到 services/artifact-hooks.ts
    //   （llm-task-manager.ts:1452 注释可证），扫描目标同步更新。
    expect(stripComments(read('src/services/artifact-hooks.ts'))).toMatch(/const MEDIA_TOOLS = new Set\([[\s\S]*?'media_edit'/);
  });

  it('已挂到有声小说/配音智能体的工具数组 + 默认助手工具数组', () => {
    // 智能体侧：两处 media_install_ffmpeg 同一行都要带 media_edit
    expect(TASK_MODE_AGENTS).toMatch(/'media_compose', 'media_edit', 'media_install_ffmpeg'/);
    // 默认助手（db.ts）两处工具数组
    const start = DB.indexOf('const DEFAULT_AGENT_BUILTIN_TOOLS');
    const body = DB.slice(start, DB.indexOf('];', start));
    expect(body).toContain("'media_edit'");
  });

  it('工具定义注册了 media_edit，且描述了关键 op 与前置条件', () => {
    expect(MEDIA_TOOL_DEFS).toMatch(/name: 'media_edit'/);
    expect(MEDIA_TOOL_DEFS).toMatch(/视频剪辑与特效加工/);
    // transition 必须提示「两段规格一致」（否则用户配完就报错）
    expect(MEDIA_TOOL_DEFS).toMatch(/要求两段规格一致/);
  });

  it('提示词/流程已告知新能力（否则模型不知道能剪辑）', () => {
    expect(TASK_TYPES).toMatch(/media_edit/);
    expect(DB).toMatch(/media_edit/);
  });

  it('字幕样式增强：颜色/描边/位置/安全区 + libass 单位换算', () => {
    expect(MEDIA_TOOL_DEFS).toMatch(/subtitleColor/);
    expect(MEDIA_TOOL_DEFS).toMatch(/subtitlePosition/);
    expect(MEDIA_TOOL_DEFS).toMatch(/safeArea/);
    // ★★ 核心：libass 的 FontSize/MarginV 是「画面高度比例值」（ffmpeg 生成的 ASS 头恒定
    //   PlayResX/Y = 384/288），必须显式换算成像素语义，否则「传 34」会渲染成 170px。
    //   这条断言防的是「有人觉得换算多余又删掉」。
    expect(EXEC).toMatch(/const FS_PER_PX = 384 \/ 1920/);
    expect(EXEC).toMatch(/const MV_PER_PX = 288 \/ 1920/);
    // 默认像素值：2026-10-02 用户反馈「120 仍偏大，一句话顶满」→ 降到 88（≈12 字/行）。
    // ★ 断言的是「默认值走像素语义」这件事本身，具体数字随用户反馈微调 —— 别把它当恒定值。
    expect(EXEC).toMatch(/num\(args, 'subtitleFontSize', 88\)/);
    // drawtext（标题）是绝对像素，与 libass 相反，必须按高度缩放
    expect(EXEC).toMatch(/const pxH = \(px: number\)/);
    // 颜色换算必须走 libass 的 BGR 反序，不能直接拼 RGB
    expect(EXEC).toMatch(/function toAssColor\(/);
    // 提示词不能再教模型传 34（那是 libass 单位，会渲染成超大字幕）
    expect(DB).not.toMatch(/subtitleFontSize=34/);
    expect(TASK_TYPES).not.toMatch(/subtitleFontSize=34/);
  });

  it('易踩坑点已按实测写法处理（atempo 串联 / xfade 超时长 / 侧链 asplit）', () => {
    expect(EXEC).toMatch(/function atempoChain\(/);      // 单 atempo 只吃 0.5~2
    expect(EXEC).toMatch(/offset 必须小于首段时长/);      // 否则 xfade 直接失败
    expect(EXEC).toMatch(/asplit=2/);                    // 同路音频复用必须分流
  });
});