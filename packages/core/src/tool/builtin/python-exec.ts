// python_exec 内置工具 —— 执行 Python 代码。
// 解释器：prod 用打包的 python-build-standalone，dev/缺失回退系统 python。
// 依赖已在构建期预烤进 site-packages（离线可用），运行期不再 pip。
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { findPython, runPythonCode } from './python-runtime';
import { resolveToolPath } from './fs-walk';
import { toolError } from '../result';

export class PythonExecTool implements BuiltInTool {
  name = 'python_exec';
  description = '直接执行 Python 代码。解释器优先用应用内置打包 Python（离线可用），缺失时回退系统 Python。常用于数据处理、文档生成（PPT/Word/Excel/PDF）、科学计算、爬虫、授权范围内的网络安全侦察等。入参通过环境变量 YZ_PY_ARGS（base64 JSON）传入，结果打印到 stdout。默认在会话工作目录下执行。';

  inputSchema = {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Python code to execute。从 os.environ["YZ_PY_ARGS"] 读取 base64(JSON) 入参，结果 print 到 stdout' },
      cwd: { type: 'string', description: 'Working directory. Defaults to the session workspace. Relative paths are resolved against the workspace.' },
      timeout: { type: 'number', description: 'Timeout in ms (default 30000, max 300000)' },
    },
    required: ['code'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const code = args.code as string;
    const timeout = Math.min((args.timeout as number) || 30000, 300000);
    if (!code) return toolError('Error: code is required');

    // ★ cwd 默认取工作目录（2026-10-19，与 cmd_exec 同口径）：此前省略时 Python
    //   继承桌面主进程目录，`open("out.json","w")` 会落到启动目录/安装目录。
    const workspaceDir = (ctx?.workspaceDir || '').trim();
    const rawCwd = typeof args.cwd === 'string' ? args.cwd.trim() : '';
    const cwd = rawCwd ? resolveToolPath(rawCwd, workspaceDir) : (workspaceDir || undefined);

    // 探测解释器（打包优先 / 系统回退），给出友好提示
    try {
      await findPython();
    } catch (e) {
      return toolError(`Error: ${(e as Error).message}`);
    }

    return runPythonCode(code, args || {}, { timeout, cwd, signal: ctx?.signal });
  }
}
