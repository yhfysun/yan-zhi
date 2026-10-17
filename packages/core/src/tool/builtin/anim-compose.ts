// anim_compose 内置工具 —— 科普动画画面层。
// 底层调用随包分发的 python-scripts/anim_compose/anim_compose.py：
// 模板化场景动画（概念要点 / 流程图 / 左右对比）PIL 逐帧绘制 → ffmpeg 编码 mp4。
// 产物 = deliverable（_meta.path）；需要 Pillow（缺依赖由自愈服务自动安装）。
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { resolveWorkspacePythonScript, runPythonScriptHealing } from './python-runtime';
import { capToolOutput } from './output-cap';
import { resolveToolPath, isAbsolutePath, joinPath } from './fs-walk';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { toolError } from '../result';

export class AnimComposeTool implements BuiltInTool {
  name = 'anim_compose';
  description =
    '科普动画生成：把知识类脚本渲染成模板化动画短视频，7 种场景类型按内容选型——' +
    'concept(要点逐条出现) / process(流程框图逐步推进) / compare(左右对比滑入) / timeline(时间线节点) / ' +
    'stat(大数字强调, 条目格式 "数值|标签") / quote(金句大字卡, 署名放 note 或 items[0]) / qa(问题→答案卡片揭示)。' +
    '每场景自动 edge-tts 旁白配音（voice:"off" 关闭）。产出最终视频（deliverable）。';

  inputSchema = {
    type: 'object',
    properties: {
      script: {
        type: 'string',
        description: '动画脚本 JSON 字符串（title/scenes 必填）：{"title":"标题","aspect":"16:9|9:16","theme":"dark|light","voice":"zh-CN-YunxiNeural","scenes":[{"type":"concept|process|compare|timeline|stat|quote|qa","heading":"小标题","items":["要点"],"left":[],"right":[],"duration":秒}],"outro":"片尾语"}。items 为文本条目；timeline/stat 支持 "标题|描述" 竖线分隔；quote 的引言放 heading、署名放 note。',
      },
      out_name: { type: 'string', description: '成片文件名（不含扩展名）。缺省 anim_<title>.mp4。' },
      out_dir: { type: 'string', description: '输出目录（缺省 <工作目录>/output/）。' },
      bgm: { type: 'string', description: '背景音乐路径（可选，音量 0.12）。' },
    },
    required: ['script'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const ws = ctx?.workspaceDir;
    const script = resolveWorkspacePythonScript('anim_compose/anim_compose.py', ws);
    if (!script) {
      return toolError('Error: 未找到 anim_compose 管线脚本（resources/python-tools 或 packages/core 开发目录）。');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(String(args.script || ''));
    } catch (e: unknown) {
      return toolError(`Error: script 不是合法 JSON：${e instanceof Error ? e.message : e}`);
    }
    if (!parsed?.title || !String(parsed.title).trim()) {
      return toolError('Error: script.title 必填');
    }
    if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
      return toolError('Error: script.scenes 至少一个场景（type: concept / process / compare）');
    }

    const outDirRaw = (typeof args.out_dir === 'string' && args.out_dir.trim())
      ? resolveToolPath(args.out_dir.trim(), ws)
      : (ws ? joinPath(ws, 'output') : path.join(process.env.TEMP || '.', 'anim-output'));
    try { fs.mkdirSync(outDirRaw, { recursive: true }); } catch { /* 出错由 ffmpeg 报 */ }
    const outName = (typeof args.out_name === 'string' && args.out_name.trim())
      ? args.out_name.trim().replace(/[\\/:*?"<>|]/g, '_')
      : 'anim_' + String(parsed.title).trim().replace(/[\\/:*?"<>|]/g, '_');
    const outPath = path.join(outDirRaw, `${outName}.mp4`);

    const jsonPath = path.join(os.tmpdir(), `anim_script_${Date.now().toString(36)}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(parsed, null, 2), 'utf-8');

    const argv = ['--input', jsonPath, '--out', outPath];
    if (typeof args.bgm === 'string' && args.bgm.trim()) {
      const bgm = isAbsolutePath(args.bgm.trim()) ? args.bgm.trim() : resolveToolPath(args.bgm.trim(), ws);
      if (fs.existsSync(bgm)) argv.push('--bgm', bgm);
    }

    try {
      // 动画时长 = 场景数 × 数秒，渲染 + 编码分钟级；给 20min 兜底
      const r = await runPythonScriptHealing(script, argv, { timeout: 1200000, cwd: ws });
      const outParts: string[] = [];
      if (r.repairLog?.length) outParts.push('[自愈] ' + r.repairLog.join('；'));
      if (r.stdout) outParts.push(capToolOutput(r.stdout));
      if (r.stderr) outParts.push('[stderr]\n' + capToolOutput(r.stderr));
      const out = outParts.join('\n') || '(无输出)';
      if (r.exitCode !== 0) {
        return toolError(`anim_compose 渲染失败（exit ${r.exitCode}）：\n${out}`);
      }
      const m = r.stdout.match(/\[anim\]\s+(.+?)\s+\(/);
      const videoPath = m ? m[1].trim() : '';
      const meta: Record<string, unknown> = {};
      if (videoPath) {
        meta.path = videoPath;
        meta.category = 'deliverable';
      }
      const text = videoPath ? `科普动画已生成：${videoPath}\n\n${out}` : out;
      return { content: [{ type: 'text', text }], _meta: Object.keys(meta).length ? meta : undefined };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return toolError(`anim_compose 执行异常: ${msg}`);
    } finally {
      try { fs.unlinkSync(jsonPath); } catch { /* 忽略 */ }
    }
  }
}
