// demo_compose 内置工具 —— 演示视频后期合成。
// 底层调用随包分发的 python-scripts/demo_compose/compose_demo.py：
// screen_record 的原始录像 + 演示脚本 JSON → 顶部标题条 + 步骤字幕 + 片尾卡的成片 mp4。
// 产物 = deliverable（_meta.path），对齐 novel_tuiwen 的登记口径。
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { resolveWorkspacePythonScript, runPythonScriptHealing } from './python-runtime';
import { capToolOutput } from './output-cap';
import { resolveToolPath, isAbsolutePath, joinPath } from './fs-walk';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { toolError } from '../result';

export class DemoComposeTool implements BuiltInTool {
  name = 'demo_compose';
  description =
    '演示视频后期合成：把 screen_record 录的原始窗口录像加工成可发布的演示成片——' +
    '顶部标题条 + 底部步骤字幕（按时间点）+ 片尾语，可选背景音乐。' +
    'script 参数是演示脚本 JSON 字符串：{"title":"标题","banner":"顶部文案(可选)","steps":[{"t":秒,"text":"字幕"}],"outro":"片尾语(可选)"}。' +
    'steps 的 t 是该步骤在录像里出现的秒数（可先用 ffprobe/估算，宁略早勿晚）。产出最终视频（deliverable）。';

  inputSchema = {
    type: 'object',
    properties: {
      raw: { type: 'string', description: 'screen_record 录制的原始录像路径（stop 回执里的 outPath）。必填。' },
      script: { type: 'string', description: '演示脚本 JSON 字符串（title 必填；steps 时间点字幕；banner/outro 可选）。必填。' },
      out_name: { type: 'string', description: '成片文件名（不含扩展名）。缺省 demo_<title>.mp4。' },
      bgm: { type: 'string', description: '背景音乐路径（可选，音量 0.12 混入）。' },
    },
    required: ['raw', 'script'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const ws = ctx?.workspaceDir;
    const script = resolveWorkspacePythonScript('demo_compose/compose_demo.py', ws);
    if (!script) {
      return toolError('Error: 未找到 demo_compose 管线脚本（resources/python-tools 或 packages/core 开发目录）。');
    }

    const rawRaw = typeof args.raw === 'string' ? args.raw.trim() : '';
    if (!rawRaw) return toolError('Error: raw 必填（screen_record stop 回执里的录像路径）');
    const raw = isAbsolutePath(rawRaw) ? rawRaw : resolveToolPath(rawRaw, ws);
    if (!fs.existsSync(raw)) return toolError(`Error: 原始录像不存在: ${raw}`);

    // 脚本 JSON：字符串直接落临时文件（模型不必先 file_write）
    let parsed: any;
    try {
      parsed = JSON.parse(String(args.script || ''));
    } catch (e: unknown) {
      return toolError(`Error: script 不是合法 JSON：${e instanceof Error ? e.message : e}`);
    }
    if (!parsed?.title || !String(parsed.title).trim()) {
      return toolError('Error: script.title 必填（成片标题条与文件名）');
    }

    const jsonPath = path.join(os.tmpdir(), `demo_script_${Date.now().toString(36)}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(parsed, null, 2), 'utf-8');

    const outName = (typeof args.out_name === 'string' && args.out_name.trim())
      ? args.out_name.trim().replace(/[\\/:*?"<>|]/g, '_')
      : 'demo_' + String(parsed.title).trim().replace(/[\\/:*?"<>|]/g, '_');
    const outPath = path.join(path.dirname(raw), `${outName}.mp4`);

    const argv = ['--input', jsonPath, '--raw', raw, '--out', outPath];
    if (typeof args.bgm === 'string' && args.bgm.trim()) {
      const bgm = isAbsolutePath(args.bgm.trim()) ? args.bgm.trim() : resolveToolPath(args.bgm.trim(), ws);
      if (fs.existsSync(bgm)) argv.push('--bgm', bgm);
    }

    try {
      // 录像一般 ≤10min，合成 1-3 分钟量级；给 20min 兜底
      const r = await runPythonScriptHealing(script, argv, { timeout: 1200000, cwd: ws });
      const outParts: string[] = [];
      if (r.repairLog?.length) outParts.push('[自愈] ' + r.repairLog.join('；'));
      if (r.stdout) outParts.push(capToolOutput(r.stdout));
      if (r.stderr) outParts.push('[stderr]\n' + capToolOutput(r.stderr));
      const out = outParts.join('\n') || '(无输出)';
      if (r.exitCode !== 0) {
        return toolError(`demo_compose 合成失败（exit ${r.exitCode}）：\n${out}`);
      }
      const m = r.stdout.match(/\[demo\]\s+(.+?)\s+\(/);
      const videoPath = m ? m[1].trim() : '';
      const meta: Record<string, unknown> = {};
      if (videoPath) {
        meta.path = videoPath;
        meta.category = 'deliverable';
      }
      const text = videoPath
        ? `演示成片已生成：${videoPath}\n\n${out}`
        : out;
      return { content: [{ type: 'text', text }], _meta: Object.keys(meta).length ? meta : undefined };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return toolError(`demo_compose 执行异常: ${msg}`);
    } finally {
      try { fs.unlinkSync(jsonPath); } catch { /* 忽略 */ }
    }
  }
}
