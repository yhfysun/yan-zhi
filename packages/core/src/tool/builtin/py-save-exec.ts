// py_save_exec 内置工具 —— Python 取数的「脚本 + 产物」一步落盘（对标参考包 pySaveAndExecute）。
//
// 与 python_exec 的区别：
//   · python_exec 把 print 结果回给模型（行数据穿上下文，大了浪费 token）；
//   · py_save_exec 让脚本把结果写进数据产物文件，工具只回路径/条数/列名。
//
// 脚本契约：注入 save_data(columns, rows, total=None) —— 调用它即落盘；
// 未调用时尝试把 stdout 当 JSON 兜底（{"columns":[...],"rows":[...]}）。
import fs from 'node:fs';
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { toolError } from '../result';
import { runPythonCode } from './python-runtime';
import { artifactPath, normalizeRows, summarizeEnvelope, type DataEnvelope } from './data-artifact';

const DEFAULT_SIZE = 500;

const PREAMBLE = `# -*- coding: utf-8 -*-
# py_save_exec 注入：save_data(columns, rows, total=None) 把取数结果写成统一数据产物
import os as _os, json as _json, base64 as _b64
_raw = _os.environ.get("YZ_PY_ARGS", "")
try:
    _ARGS = _json.loads(_b64.b64decode(_raw).decode("utf-8")) if _raw else {}
except Exception:
    _ARGS = {}
DATA_OUT = _ARGS.get("dataOut") or ""
DATA_SIZE = int(_ARGS.get("size") or ${DEFAULT_SIZE})

def save_data(columns, rows, total=None, status="success", message=""):
    if not DATA_OUT:
        raise RuntimeError("py_save_exec 未提供输出路径")
    payload = {
        "columns": [str(c) for c in columns],
        "rows": [list(r) for r in rows][:DATA_SIZE],
        "total": (len(rows) if total is None else int(total)),
        "status": status,
        "message": message,
    }
    with open(DATA_OUT, "w", encoding="utf-8") as f:
        _json.dump(payload, f, ensure_ascii=False)
`;

export class PySaveExecTool implements BuiltInTool {
  name = 'py_save_exec';
  description =
    '执行 Python 取数脚本并把结果落成统一数据产物（{columns, rows, total} json），只回 data_path/script_file/条数/列名，数据不进上下文。' +
    '脚本里调用已注入的 save_data(columns, rows, total=None) 即完成落盘（SQL/二次处理都写在脚本里；连库查询用环境里的数据源连接参数或读取已有文件）。' +
    '未调用 save_data 时，把 stdout 作为 JSON 兜底解析。size 控制首屏保留行数（默认 500），total 记全量条数。' +
    '拿到 data_path 后交给 build_chart_dsl 出图。适合结果行数多、或需要 SQL+二次处理的取数。';

  inputSchema = {
    type: 'object',
    properties: {
      script: { type: 'string', description: 'Python 脚本正文（可用 save_data(...) 落盘；不要自己拼输出路径）' },
      name: { type: 'string', description: '产物名（同时用于脚本与数据文件名，如 智能体明细）' },
      size: { type: 'number', description: '首屏保留行数上限（默认 500）' },
      timeout: { type: 'number', description: '超时毫秒（默认 60000，最大 300000）' },
    },
    required: ['script', 'name'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const workspaceDir = (ctx?.workspaceDir || '').trim();
    if (!workspaceDir) return toolError('Error: 没有会话工作目录，无法运行取数脚本');
    const script = String(args.script || '');
    if (!script.trim()) return toolError('Error: script 不能为空');
    const size = Number(args.size);
    const limit = Number.isFinite(size) && size > 0 ? Math.trunc(size) : DEFAULT_SIZE;
    const timeout = Math.min(Number(args.timeout) || 60000, 300000);

    const scriptFile = artifactPath(workspaceDir, String(args.name || 'data'), 'py');
    const outPath = artifactPath(workspaceDir, String(args.name || 'data'), 'json');
    const full = `${PREAMBLE}\n${script}\n`;
    try {
      fs.writeFileSync(scriptFile, full, 'utf-8');
    } catch (e) {
      return toolError(`Error: 脚本落盘失败：${e instanceof Error ? e.message : String(e)}`);
    }

    const run = await runPythonCode(full, { dataOut: outPath, size: limit }, {
      timeout,
      cwd: workspaceDir,
      signal: ctx?.signal,
    });
    const stdout = run.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');

    let raw: unknown = null;
    if (fs.existsSync(outPath)) {
      try { raw = JSON.parse(fs.readFileSync(outPath, 'utf-8')); } catch { /* 交给下方兜底 */ }
    }
    if (!raw) {
      try { raw = JSON.parse(stdout.trim()); } catch { raw = null; }
    }
    if (!raw) {
      return toolError(
        `Error: 脚本没有产出数据（未调用 save_data，stdout 也不是合法 JSON）\nscript_file: ${scriptFile}\n${stdout.slice(0, 1200)}`,
      );
    }

    const obj = raw as Record<string, unknown>;
    const { columns, rows } = normalizeRows({ columns: obj.columns, rows: obj.rows });
    const rawTotal = Number(obj.total);
    const envelope: DataEnvelope = {
      columns,
      rows: rows.slice(0, limit),
      total: Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : rows.length,
      status: obj.status === 'error' ? 'error' : 'success',
      ...(typeof obj.message === 'string' && obj.message ? { message: obj.message } : {}),
      createdAt: Date.now(),
    };
    try {
      fs.writeFileSync(outPath, JSON.stringify(envelope), 'utf-8');
    } catch (e) {
      return toolError(`Error: 数据产物落盘失败：${e instanceof Error ? e.message : String(e)}`);
    }

    const text = summarizeEnvelope(envelope, outPath, scriptFile);
    return {
      content: [{ type: 'text', text: run.isError ? `${text}\n[脚本非零退出]\n${stdout.slice(0, 800)}` : text }],
      ...(run.isError ? { isError: true } : {}),
    };
  }
}
