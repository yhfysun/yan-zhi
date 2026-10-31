// novel_tuiwen 内置工具 —— 有声小说推文视频生成。
// 底层调用随包分发的 python-scripts/novel_tuiwen/run_pipeline.py（改编 → Edge-TTS 配音 → ffmpeg 合成 → 发布文案）。
// 画面结构 v4（2026-10-18 定稿，冻结）：顶部常驻「搜『别名』看全文｜番茄小说」+ 右上角「第N集」常驻角标
// + 中部「第N集」大字（第0帧全显，3s 后淡出）+ 第一镜主要内容首帧全显 + 底部单行字幕；
// kinetic 与背景视频/图片轮播两条渲染路径必须给出同一套首帧信息（见 references/pipeline.md「首帧契约」）。
// 第4步自动落 publish.txt 发布表单文案（标题≤30字 + 五段内容）。
// 产物：4:3 (1080x1440) mp4；成片 = deliverable，中间产物留在 workdir（intermediate 语义）。
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { resolveWorkspacePythonScript, runPythonScriptHealing } from './python-runtime';
import { capToolOutput } from './output-cap';
import { resolveToolPath, isAbsolutePath, joinPath } from './fs-walk';
import * as path from 'path';
import * as fs from 'fs';
import { toolError } from '../result';

export class NovelTuiwenTool implements BuiltInTool {
  name = 'novel_tuiwen';
  description =
    '有声小说推文视频生成：把小说章节文本自动改编成口播脚本，Edge-TTS 配音，' +
    '**动态排版画面**（元素随旁白节奏入场 + 场景交叉淡化 + 底部打字机字幕 + 本地 BGM）合成为 mp4，含顶部标题与集数角标。' +
    'chapter 必填（工作目录内的 .txt）。**优先传 storyboard（分镜 JSON）**——卡片只写关键词、不抄旁白原文；' +
    '不传则按旁白自动生成分镜。也可用 bg_video（风景/海洋等舒缓素材循环铺底）或 images（整图轮播，' +
    '图内已有文字时会与字幕重复）。画面切换、字幕、配音三条时间轴同源（都按真实配音时长），不会不同步。产出最终视频（deliverable）。';

  inputSchema = {
    type: 'object',
    properties: {
      chapter: { type: 'string', description: '小说章节文本文件路径（.txt，相对工作目录或绝对路径）。必填。' },
      title: { type: 'string', description: '视频标题（顶部展示 + 文件名），默认取「小说推文」。' },
      bg_video: { type: 'string', description: '背景视频路径，多个用逗号分隔（按顺序轮播，循环铺满全片）。**题材建议：风景 / 海洋 / 动物世界 / 延时自然等舒缓、无人声、可循环的素材**（与口播不抢注意力，也更符合平台调性）；尽量选与故事氛围匹配的（悬疑配暗色/夜景、治愈配明亮自然）。省略则用深色文字占位画面。' },
      images: { type: 'string', description: '图片路径，多个用逗号分隔（按顺序）。**图片轮播模式：图文成品 / 轮播图文做口播视频时用它**——每张图覆盖若干整句，切图边界与字幕、配音同源（都来自真实配音时长），不会出现画面/字幕/配音不同步。传了 images 就不要再传 bg_video（bg_video 优先）。图片按等比缩放居中补底，不裁剪图内文字。**注意：图文卡片里已经写了口播原文时会与底部字幕重复，这种素材应改用 storyboard。**' },
      storyboard: {
        type: 'string',
        description:
          '分镜 JSON（字符串）：走**动态排版引擎**——元素随旁白节奏逐条入场、场景间交叉淡化、底部打字机字幕、进度条。' +
          '这是默认的新画面模式，画质和节奏远好于图片轮播。结构：{"scenes":[' +
          '{"type":"hook","seg":0,"kicker":"期数或别名","title":"第一行\\n第二行","highlight":"强调行","sub":"补充说明"},' +
          '{"type":"statement","seg":1,"title":"...","highlight":"...","note":"..."},' +
          '{"type":"points","seg":2,"title":"...","points":["① ...","② ...","③ ..."]},' +
          '{"type":"steps","seg":3,"title":"就三步","items":["给资料","出大纲","写文案"]},' +
          '{"type":"stat","seg":5,"value":"3","label":"行，是每页的天花板","sub":"..."},' +
          '{"type":"quote","seg":1,"text":"最耗时的\\n其实不是排版","by":"—"},' +
          '{"type":"compare","seg":6,"title":"踩过的都翻过车","left":{"head":"坑","items":["..."]},"right":{"head":"做法","items":["..."]}},' +
          '{"type":"warning","seg":6,"title":"三个坑","points":["..."]},' +
          '{"type":"code","seg":5,"title":"...","code":"=SUMIFS(...)","note":"..."},' +
          '{"type":"table","seg":4,"title":"...","columns":["区域","金额"],"rows":[["华东","45600"]]},' +
          '{"type":"cta","seg":7,"title":"...","button":"评论区说说","note":"..."}]}。' +
          'seg=第几段旁白（0 起，对应 segments 下标；hook 也是第 0 段）；一段旁白可拆成多个场景，时长按 w 比例分。' +
          '**卡片只写关键词/短句，不要抄旁白原文**（字幕另行逐字打出，抄原文会变成同一句话看两遍）。' +
          '文案里用 [方括号] 标出要染成强调色的词。顶层可加 "theme":"dark|light"。' +
          '省略则按旁白自动生成分镜。',
      },
      visual: {
        type: 'string',
        enum: ['auto', 'kinetic', 'images', 'bg_video'],
        description: '画面模式：auto（默认；有 storyboard 或没有背景素材时走 kinetic，否则沿用 bg_video/images）/ kinetic / images / bg_video。',
      },
      bg_images: {
        type: 'string',
        description:
          '动态排版的**素材底图层**（可省略；默认不加底图）。省略/不传 = 纯版式背景（渐变+网格），' +
          '图文、知识口播、数据讲解类内容用这个最清楚，**不要为了「有画面」硬挂风景视频**。' +
          '传逗号分隔的图片路径，或 auto（只扫 <工作目录>/00-source/images、02-work/images 这两个图片库目录）。' +
          '★ 只有素材和选题**明确同题**时才传（例如悬疑小说配暗色雾林、治愈故事配海边）；' +
          '不确定就不传，素材不搭配比没有素材更扣分。',
      },
      bgm_level: { type: 'number', description: '背景音乐音量（0~1，默认 0.20）。觉得音乐太抢就调到 0.12。' },
      subtitle_style: {
        type: 'string',
        enum: ['typewriter', 'ticker'],
        description:
          '字幕样式：typewriter（默认）=逐句打字机，按标点+虚词断句、定点阅读；' +
          'ticker=整句单行从右往左平移，永不断句但需要跟着字移动视线。' +
          '长句多、断句总不理想时用 ticker；追求平台主流观感用 typewriter。',
      },
      aspect: { type: 'string', enum: ['4:3', '9:16', '16:9'], description: '画幅：9:16=抖音竖屏 1080x1920（抖音发布用这个）；4:3=1080x1440（默认）；16:9=横屏 1920x1080。' },
      ending: { type: 'string', description: '结尾引导口播。发抖音必传：搜索别名XX看后续（XX=生效中的别名关键词）。禁止出现原书名。' },
      banner: { type: 'string', description: '视频顶部常驻引导语（覆盖自动生成的标题条）。书名红线：画面顶部禁原书名，传别名。' },
      alias: { type: 'string', description: '生效中的别名关键词。自动拼顶部常驻标题条「搜『别名』看全文｜番茄小说」并进发布文案标题（发抖音必传）。书名红线：画面与文案均禁原书名，只推别名。' },
      chapter_num: { type: 'string', description: '第几集（如 3）。首帧即全显「第N集」大字（保持3秒后淡出）+ 右上角常驻角标，并决定成片文件名（别名_第N集.mp4）与发布文案；**系列视频必须显式传**，缺省从文件名数字推断（不可靠）。' },
      tags: { type: 'string', description: '发布内容自定义话题标签，缺省 "#小说 #推文 <别名>"。' },
      no_publish_copy: { type: 'boolean', description: '跳过生成 publish.txt 发布文案（默认生成到 <outdir>/.work/publish.txt）。' },
      voice: { type: 'string', description: 'TTS 音色（Edge-TTS），默认 zh-CN-YunjianNeural（云健，厚实讲故事感）；女声可用 zh-CN-XiaoyiNeural，年轻男声可用 zh-CN-YunxiaNeural。换音色会自动作废旧分段配音重合成。' },
      rate: { type: 'string', description: '配音语速：默认 "+15%"（短视频口播偏快，完播率更好）；传 "0" 回原速，也可传 1.15（倍率）或 15（百分比）。语速变了会自动作废旧分段配音重合成。' },
      out: { type: 'string', description: '输出目录，默认 <工作目录>/output/。' },
      use_llm: { type: 'boolean', description: '用 LLM 做钩子化改编（需环境变量 OPENAI_BASE_URL/OPENAI_API_KEY）。默认规则切分。' },
      ambience: { type: 'string', description: '环境音：auto（默认，按剧情情绪自动选）/ none / pad_soft / room / wind / rain / hum / space / fire。音量很低且会被旁白自动闪避，不会盖过配音。' },
      sfx: { type: 'string', enum: ['auto', 'none'], description: '高能点缀音效：auto=只在开头和高能句点缀（最多 5 个，间隔≥6s）；none=不加。默认 auto。' },
      bgm: { type: 'string', description: '背景音乐：auto（默认，优先用 <工作目录>/00-source/bgm/ 里的音频，没有就本地合成一段免版权器乐）/ none / 音频文件路径。' },
      verbatim: { type: 'boolean', description: '通用口播模式：true 时按原稿逐段口播，不改写、不加钩子、不加小说默认结尾；未传 aspect 时默认 9:16。做非小说推文的抖音口播视频时传 true。' },
      out_name: { type: 'string', description: '成片文件名（不含路径，可省 .mp4）。缺省按「别名_第N集.mp4」或标题命名。' },
      tts_concurrency: { type: 'number', description: 'TTS 并发路数（1-16）。默认取「设置 → 小说推文并发」；网络好可调高提速，频繁 403/超时则调低。' },
      compose_concurrency: { type: 'number', description: '合成并行编码段数（1-8）。1 = 关闭分段、整片单次编码；默认取设置（0 = 按 CPU 自动）。' },
    },
    required: ['chapter'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    // ★ 输入路径统一基于工作目录解析（对齐 doyz 2026-09-30 修正）
    const ws = ctx?.workspaceDir;
    // 副本模式（2026-10-07）：脚本同步到 <工作目录>/.yan-zhi/tools/novel_tuiwen/ 后从副本跑，
    // 任务内对管线的修改落在副本上，不再污染包内源码
    const script = resolveWorkspacePythonScript('novel_tuiwen/run_pipeline.py', ws);
    if (!script) {
      return toolError('Error: 未找到 novel_tuiwen 管线脚本（resources/python-tools 或 packages/core 开发目录）。');
    }

    const rp = (v: unknown) =>
      typeof v === 'string' && v.trim() ? resolveToolPath(v.trim(), ws) : v;
    const chapter = rp(args.chapter) as string;
    if (!chapter) return toolError('Error: chapter 必填（小说章节 .txt 路径）');

    const bgVideo = typeof args.bg_video === 'string' && args.bg_video.trim()
      ? args.bg_video.split(',').map((s) => s.trim()).filter(Boolean)
        .map((p) => (isAbsolutePath(p) ? p : resolveToolPath(p, ws)))
        .join(',')
      : '';

    // 图片轮播素材（图文成品 → 口播视频）：与 bg_video 一样按顺序、相对工作目录解析
    const images = typeof args.images === 'string' && args.images.trim()
      ? args.images.split(',').map((s) => s.trim()).filter(Boolean)
        .map((p) => (isAbsolutePath(p) ? p : resolveToolPath(p, ws)))
        .join(',')
      : '';

    // 输出目录：默认 <工作目录>/output/；工作目录未知时退到系统临时目录
    const outDirRaw = typeof args.out === 'string' && args.out.trim()
      ? resolveToolPath(args.out.trim(), ws)
      : (ws ? joinPath(ws, 'output') : path.join(process.env.TEMP || '.', 'novel-tuiwen-output'));

    // 分镜（动态排版画面）：模型传 JSON → 落盘到工作目录再传路径，避免超长命令行把参数截断
    let storyboardPath = '';
    if (typeof args.storyboard === 'string' && args.storyboard.trim()) {
      try {
        const sb = JSON.parse(args.storyboard);
        const sbDir = path.join(outDirRaw, '.work');
        fs.mkdirSync(sbDir, { recursive: true });
        storyboardPath = path.join(sbDir, 'storyboard.json');
        fs.writeFileSync(storyboardPath, JSON.stringify(sb, null, 1), 'utf-8');
      } catch (e) {
        return toolError(`Error: storyboard 不是合法 JSON（${(e as Error).message}）`);
      }
    }

    const argv: string[] = ['--input', chapter];
    argv.push('--workdir', path.join(outDirRaw, '.work'));
    if (args.title) argv.push('--title', String(args.title));
    if (args.voice) argv.push('--voice', String(args.voice));
    if (bgVideo) argv.push('--bg-video', bgVideo);
    if (images) argv.push('--images', images);
    if (storyboardPath) argv.push('--storyboard', storyboardPath);
    if (typeof args.visual === 'string'
      && ['auto', 'kinetic', 'images', 'bg_video'].includes(args.visual)) {
      argv.push('--visual', args.visual);
    }
    if (typeof args.bgm_level === 'number' && Number.isFinite(args.bgm_level)) {
      argv.push('--bgm-level', String(Math.max(0, Math.min(1, args.bgm_level))));
    }
    // 素材底图：auto/none 原样传；显式路径按工作目录解析
    if (typeof args.subtitle_style === 'string'
      && ['typewriter', 'ticker'].includes(args.subtitle_style)) {
      argv.push('--subtitle-style', args.subtitle_style);
    }
    if (typeof args.bg_images === 'string' && args.bg_images.trim()) {
      const raw = args.bg_images.trim();
      const resolved = (raw === 'auto' || raw === 'none')
        ? raw
        : raw.split(',').map((s) => s.trim()).filter(Boolean)
          .map((p) => (isAbsolutePath(p) ? p : resolveToolPath(p, ws))).join(',');
      argv.push('--bg-images', resolved);
    }
    if (typeof args.rate === 'string' && args.rate.trim()) argv.push('--rate', args.rate.trim());
    if (args.use_llm) argv.push('--use-llm');
    if (args.verbatim === true) argv.push('--verbatim');
    if (typeof args.ambience === 'string' && args.ambience.trim()) argv.push('--ambience', args.ambience.trim());
    if (args.sfx === 'none' || args.sfx === 'auto') argv.push('--sfx', args.sfx);
    if (typeof args.bgm === 'string' && args.bgm.trim()) {
      const b = args.bgm.trim();
      argv.push('--bgm', b === 'auto' || b === 'none' ? b : resolveToolPath(b, ws));
    } else {
      argv.push('--bgm', 'auto');
    }
    if (typeof args.out_name === 'string' && args.out_name.trim()) {
      argv.push('--out-name', args.out_name.trim());
    }
    if (args.aspect && ['4:3', '9:16', '16:9'].includes(String(args.aspect))) {
      argv.push('--aspect', String(args.aspect));
    } else if (args.verbatim === true) {
      argv.push('--aspect', '9:16');
    }
    if (typeof args.ending === 'string' && args.ending.trim()) argv.push('--ending', args.ending.trim());
    if (typeof args.banner === 'string' && args.banner.trim()) argv.push('--banner', args.banner.trim());
    // 标题条/集数（2026-10-12 画面v3）：alias→顶部常驻「搜『别名』看全文｜番茄小说」；
    // chapter_num→「第N集」大字前3秒 + 文件名第N集 + 发布文案
    if (typeof args.alias === 'string' && args.alias.trim()) argv.push('--alias', args.alias.trim());
    if (typeof args.chapter_num === 'string' && args.chapter_num.trim()) argv.push('--chapter', args.chapter_num.trim());
    if (typeof args.tags === 'string' && args.tags.trim()) argv.push('--tags', args.tags.trim());
    if (args.no_publish_copy === true) argv.push('--no-publish-copy');
    // 中间产物与成片都收敛到 outDir
    argv.push('--outdir', outDirRaw);

    // 并发：工具入参（模型可传）> 页面设置（ctx.env）> 脚本默认
    const env: Record<string, string> = { ...(ctx?.env || {}) };
    const clampInt = (v: unknown, lo: number, hi: number): number | null => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, Math.round(n))) : null;
    };
    const ttsN = clampInt(args.tts_concurrency, 1, 16);
    if (ttsN) env.YZ_TTS_CONCURRENCY = String(ttsN);
    const composeN = clampInt(args.compose_concurrency, 1, 8);
    if (composeN) env.YZ_COMPOSE_CONCURRENCY = String(composeN);

    try {
      // 出片耗时随章节长度增长：第一章实测（6083 字 → 51 段 TTS → 19.5min 成片）TTS+合成 ≈ 12min；
      // 传 30min（runPythonScript 上限同步已提到 30min），ffmpeg 收尾被 kill 会产出缺 moov 的损坏 mp4
      // ★ 2026-10-14：改用**自愈执行** —— 缺依赖 / edge-tts 403 / 代理问题会自动修复并重跑一次
      //   （自愈能力由 server 注入，见 services/python-self-heal.ts）。
      const r = await runPythonScriptHealing(script, argv, {
        timeout: 1800000, cwd: ws, signal: ctx?.signal,
        ...(Object.keys(env).length ? { env } : {}),
      });
      const outParts: string[] = [];
      if (r.repairLog?.length) outParts.push('[自愈] ' + r.repairLog.join('；'));
      if (r.stdout) outParts.push(capToolOutput(r.stdout));
      if (r.stderr) outParts.push('[stderr]\n' + capToolOutput(r.stderr));
      const out = outParts.join('\n') || '(无输出)';
      if (r.exitCode !== 0) {
        // 常见依赖缺失 / 端点拒绝给出可执行的自救指引
        if (/No module named ['"]?edge_tts/.test(r.stderr)) {
          return toolError(
            'Error: 缺少 edge-tts 依赖。请让用户或通过 cmd_exec 执行：\n' +
            'python -m pip install edge-tts\n' +
            '（若本机 pip 走系统代理并报 ProxyError，追加：--proxy http://127.0.0.1:7890，端口按实际代理改）\n' +
            '然后重试 novel_tuiwen。',
          );
        }
        // ★ 2026-10-14：edge-tts 端点 403（微软 WebSocket 握手拒绝）通常是 **edge-tts 版本过旧**、
        //   内置 Sec-MS-GEC 令牌已被轮换 —— 升级即修（实测 7.2.8→7.3.1 复通）。此前落到通用失败 dump。
        if (/edge[-_]tts/.test(r.stderr) && /403|Handshake|Invalid response status/.test(r.stderr)) {
          return toolError(
            'Error: edge-tts 被微软端点拒绝（403）——通常是 edge-tts 版本过旧、内置令牌已被轮换。\n' +
            '自助修复（请用与本管线相同的 Python）：\n' +
            'python -m pip install --upgrade edge-tts\n' +
            '（若本机 pip 走系统代理并报 ProxyError，追加：--proxy http://127.0.0.1:7890，端口按实际代理改）\n' +
            '装好后重试 novel_tuiwen。\n\n' + out,
          );
        }
        return toolError(`novel_tuiwen 出片失败（exit ${r.exitCode}）：\n${out}`);
      }
      // 从 stdout 提取成片路径：[compose] <path>  (Ns)
      const m = r.stdout.match(/\[compose\]\s+(.+?)\s+\(/);
      const videoPath = m ? m[1].trim() : '';
      // 发布文案路径（run_pipeline 第4步）：[publish_copy] <path>
      const pm = r.stdout.match(/\[publish_copy\]\s+(.+)/);
      const publishPath = pm ? pm[1].trim() : '';
      const meta: Record<string, unknown> = {};
      if (videoPath) {
        meta.path = videoPath;
        meta.category = 'deliverable';
      }
      if (publishPath) meta.publishCopy = publishPath;
      const text = videoPath
        ? `成片已生成：${videoPath}${publishPath ? `\n发布文案（表单标题+内容）：${publishPath}` : ''}\n\n${out}`
        : out;
      return { content: [{ type: 'text', text }], _meta: Object.keys(meta).length ? meta : undefined };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return toolError(`novel_tuiwen 执行异常: ${msg}`);
    }
  }
}
