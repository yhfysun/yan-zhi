// data_save 内置工具 —— 任意取数结果的统一落盘口。
//
// 为什么要有：取数方式不限（SQL / JS / Python / 手工计算结果），但下游图表与看板只认
// 同一份数据产物（{columns, rows, total}）。有了它，模型拿到行数据后只需回传一次到文件，
// 图表工具再按文件路径消费 —— 数据不必反复穿过上下文。
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { toolError } from '../result';
import { summarizeEnvelope, writeDataEnvelope } from './data-artifact';

const DEFAULT_SIZE = 500;

export class DataSaveTool implements BuiltInTool {
  name = 'data_save';
  description =
    '把一次取数结果（SQL 行 / js_exec 返回值 / 已算好的二维数组）存成统一数据产物，返回 data_path 供 build_chart_dsl 绘图。' +
    '入参 rows 支持对象数组（[{"a":1}]，列名自动取键）或二维数组（[[1]]，需同序 columns）；columns 可选。' +
    'total 传全量条数（默认取 rows 长度），size 控制首屏保留行数（默认 500）。' +
    '★ 数据只落盘、不进模型上下文：工具只回文件路径、条数与列名。Python 取数请用 py_save_exec（脚本内直接落盘，省一轮）。';

  inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: '产物名（中文/英文均可，用于文件名，如 智能体明细）' },
      columns: { type: 'array', items: { type: 'string' }, description: '列名（rows 为二维数组时按此顺序；对象数组可省略）' },
      rows: { type: 'array', items: {}, description: '行数据：对象数组或二维数组' },
      total: { type: 'number', description: '全量条数（分页截断前）；缺省用 rows 长度' },
      size: { type: 'number', description: '首屏保留行数上限（默认 500）' },
      status: { type: 'string', description: 'success / error（默认 success）' },
      message: { type: 'string', description: '状态详情（可选）' },
    },
    required: ['name', 'rows'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    try {
      const workspaceDir = (ctx?.workspaceDir || '').trim();
      if (!workspaceDir) return toolError('Error: 没有会话工作目录，无法落盘数据文件');
      const size = Number(args.size);
      const { dataPath, envelope } = writeDataEnvelope(
        workspaceDir,
        String(args.name || ''),
        {
          columns: args.columns,
          rows: args.rows,
          total: args.total,
          status: args.status,
          message: args.message,
        },
        Number.isFinite(size) && size > 0 ? size : DEFAULT_SIZE,
      );
      return { content: [{ type: 'text', text: summarizeEnvelope(envelope, dataPath) }] };
    } catch (e) {
      return toolError(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
