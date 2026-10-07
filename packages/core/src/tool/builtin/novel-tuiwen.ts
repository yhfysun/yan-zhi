// novel_tuiwen 内置工具 —— 有声小说推文视频生成。
// 底层调用随包分发的 python-scripts/novel_tuiwen/run_pipeline.py（改编 → Edge-TTS 配音 → ffmpeg 合成）。
// 产物：4:3 (1080x1440) mp4，含顶部标题 + libass 字幕 + 配音，可选背景视频（风景/海洋/动物世界等舒缓素材铺底）。
// 产物分类约定（对齐 doyz/file_write）：成片 = deliverable，中间产物留在 workdir（intermediate 语义）。
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { resolveWorkspacePythonScript, runPythonScript } from './python-runtime';
import { capToolOutput } from './output-cap';
import { resolveToolPath, isAbsolutePath, joinPath } from './fs-walk';
import * as path from 'path';
import { toolError } from '../result';

export class NovelTuiwenTool implements BuiltInTool {
  name = 'novel_tuiwen';
  description =
    '有声小说推文视频生成：把小说章节文本自动改编成口播脚本，Edge-TTS 配音，与背景视频（**风景 / 海洋 / 动物世界 / 延时自然**等舒缓、无人声、可循环的素材）合成为 4:3 (1080x1440) mp4，含顶部标题与逐句字幕。chapter 必填（工作目录内的 .txt），bg_video 可选（逗号分隔多个背景视频，自动循环铺满）。产出最终视频（deliverable）。';

  inputSchema = {
    type: 'object',
    properties: {
      chapter: { type: 'string', description: '小说章节文本文件路径（.txt，相对工作目录或绝对路径）。必填。' },
      title: { type: 'string', description: '视频标题（顶部展示 + 文件名），默认取「小说推文」。' },
      bg_video: { type: 'string', description: '背景视频路径，多个用逗号分隔（按顺序轮播，循环铺满全片）。**题材建议：风景 / 海洋 / 动物世界 / 延时自然等舒缓、无人声、可循环的素材**（与口播不抢注意力，也更符合平台调性）；尽量选与故事氛围匹配的（悬疑配暗色/夜景、治愈配明亮自然）。省略则用深色文字占位画面。' },
      aspect: { type: 'string', enum: ['4:3', '9:16', '16:9'], description: '画幅：9:16=抖音竖屏 1080x1920（抖音发布用这个）；4:3=1080x1440（默认）；16:9=横屏 1920x1080。' },
      ending: { type: 'string', description: '结尾引导口播。发抖音必传：搜索别名XX看后续（XX=生效中的别名关键词）。禁止出现原书名。' },
      banner: { type: 'string', description: '视频顶部常驻引导语（发抖音必传：搜「别名」看全文）。书名红线：画面顶部禁原书名，传别名。' },
      voice: { type: 'string', description: 'TTS 音色（Edge-TTS），默认 zh-CN-YunxiNeural（年轻男声）；女声可用 zh-CN-XiaoyiNeural。' },
      out: { type: 'string', description: '输出目录，默认 <工作目录>/output/。' },
      use_llm: { type: 'boolean', description: '用 LLM 做钩子化改编（需环境变量 OPENAI_BASE_URL/OPENAI_API_KEY）。默认规则切分。' },
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

    // 输出目录：默认 <工作目录>/output/；工作目录未知时退到系统临时目录
    const outDirRaw = typeof args.out === 'string' && args.out.trim()
      ? resolveToolPath(args.out.trim(), ws)
      : (ws ? joinPath(ws, 'output') : path.join(process.env.TEMP || '.', 'novel-tuiwen-output'));

    const argv: string[] = ['--input', chapter];
    argv.push('--workdir', path.join(outDirRaw, '.work'));
    if (args.title) argv.push('--title', String(args.title));
    if (args.voice) argv.push('--voice', String(args.voice));
    if (bgVideo) argv.push('--bg-video', bgVideo);
    if (args.use_llm) argv.push('--use-llm');
    if (args.aspect && ['4:3', '9:16', '16:9'].includes(String(args.aspect))) argv.push('--aspect', String(args.aspect));
    if (typeof args.ending === 'string' && args.ending.trim()) argv.push('--ending', args.ending.trim());
    if (typeof args.banner === 'string' && args.banner.trim()) argv.push('--banner', args.banner.trim());
    // 中间产物与成片都收敛到 outDir
    argv.push('--outdir', outDirRaw);

    try {
      // 出片耗时随章节长度增长：第一章实测（6083 字 → 51 段 TTS → 19.5min 成片）TTS+合成 ≈ 12min；
      // 传 30min（runPythonScript 上限同步已提到 30min），ffmpeg 收尾被 kill 会产出缺 moov 的损坏 mp4
      const r = await runPythonScript(script, argv, { timeout: 1800000, cwd: ws });
      const out = [r.stdout ? capToolOutput(r.stdout) : '', r.stderr ? '[stderr]\n' + capToolOutput(r.stderr) : '']
        .filter(Boolean)
        .join('\n') || '(无输出)';
      if (r.exitCode !== 0) {
        // 常见依赖缺失给出可执行的自救指引
        if (/No module named ['"]?edge_tts/.test(r.stderr)) {
          return toolError(
            'Error: 缺少 edge-tts 依赖。请让用户或通过 cmd_exec 执行：\n' +
            'python -m pip install edge-tts -i https://pypi.org/simple\n然后重试 novel_tuiwen。',
          );
        }
        return toolError(`novel_tuiwen 出片失败（exit ${r.exitCode}）：\n${out}`);
      }
      // 从 stdout 提取成片路径：[compose] <path>  (Ns)
      const m = r.stdout.match(/\[compose\]\s+(.+?)\s+\(/);
      const videoPath = m ? m[1].trim() : '';
      const meta: Record<string, unknown> = {};
      if (videoPath) {
        meta.path = videoPath;
        meta.category = 'deliverable';
      }
      const text = videoPath
        ? `成片已生成：${videoPath}\n\n${out}`
        : out;
      return { content: [{ type: 'text', text }], _meta: Object.keys(meta).length ? meta : undefined };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return toolError(`novel_tuiwen 执行异常: ${msg}`);
    }
  }
}
