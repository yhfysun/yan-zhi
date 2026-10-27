// build_chart_dsl 内置工具 —— 把数据产物画成图（对标参考包 build_chart_dsl）。
//
// 输入是 data_path（py_save_exec / data_save 落盘的文件），输出是一份图表定义文件
// （.ychart.json）：图表定义 + 数据文件路径 + 取数口径。前端按定义读数据渲染，
// 数据不回到模型上下文；摘要里只给 chart_file / chart_ref / 条数 / 列名。
import fs from 'node:fs';
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { toolError } from '../result';
import { artifactPath, readDataEnvelope } from './data-artifact';

export const CHART_KINDS = ['line', 'area', 'bar', 'pie', 'scatter', 'table'] as const;
export type ChartDslKind = typeof CHART_KINDS[number];

/** 图表定义文件（前端/看板共用；与 ydash widget 的 spec 字段对齐） */
export interface ChartDsl {
  version: 1;
  title: string;
  kind: ChartDslKind;
  /** 数据产物绝对路径（前端经 workspace-files 读取） */
  dataPath: string;
  columns: string[];
  dim: string;
  measures: string[];
  series?: string;
  topN?: number;
  percent?: boolean;
  total: number;
  createdAt: number;
}

/** 从工具结果文本里解析图表定义（前端拦截用；解析失败返回 null） */
export function parseChartDslMarker(text: string): ChartDsl | null {
  const m = text.match(/\[ychart\]([\s\S]*?)\[\/ychart\]/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]) as ChartDsl;
    return parsed && parsed.dataPath && parsed.kind ? parsed : null;
  } catch {
    return null;
  }
}

function pickColumns(env: { columns: string[] }, x: unknown, y: unknown): { dim: string; measures: string[] } {
  const cols = env.columns;
  const dim = String(x || '').trim() || cols[0] || '';
  const measures = (Array.isArray(y) ? y : y ? [y] : [])
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (!measures.length) {
    const firstOther = cols.find((c) => c !== dim);
    if (firstOther) measures.push(firstOther);
  }
  return { dim, measures };
}

export class BuildChartDslTool implements BuiltInTool {
  name = 'build_chart_dsl';
  description =
    '用数据产物（data_path，来自 py_save_exec / data_save）生成一张图表，返回 chart_file 供前端渲染（数据不进上下文）。' +
    'chart_type：table 明细 / bar 对比 / line 趋势 / pie 占比 / area 面积 / scatter 散点。' +
    'x 为分组维度列名（缺省取第一列），y 为度量列名（可数组，多个度量→多系列；缺省取第二列）。' +
    '一次只出一张图；需要多图看板时对每个 data_path 各调一次，再用 build_dashboard_dsl 组装。';

  inputSchema = {
    type: 'object',
    properties: {
      data_path: { type: 'string', description: '数据产物路径（py_save_exec / data_save 返回的 data_path）' },
      chart_type: { type: 'string', enum: [...CHART_KINDS], description: '图表类型' },
      chart_name: { type: 'string', description: '图表标题（语义化，如 各智能体会话量）' },
      x: { type: 'string', description: 'X 轴/分组列名（缺省第一列）' },
      y: { description: 'Y 轴度量列名（字符串或字符串数组）' },
      series: { type: 'string', description: '第二维度列名（可选，按它拆多系列）' },
      topN: { type: 'number', description: '只保留前 N 个 X 值（可选）' },
      percent: { type: 'boolean', description: '按系列合计换算百分比（可选）' },
    },
    required: ['data_path', 'chart_type', 'chart_name'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    try {
      const workspaceDir = (ctx?.workspaceDir || '').trim();
      if (!workspaceDir) return toolError('Error: 没有会话工作目录，无法生成图表定义');
      const dataPath = String(args.data_path || '').trim();
      const kind = String(args.chart_type || '').trim() as ChartDslKind;
      if (!CHART_KINDS.includes(kind)) {
        return toolError(`Error: chart_type 非法：${kind}（可选 ${CHART_KINDS.join(' / ')}）`);
      }
      const env = readDataEnvelope(dataPath);
      if (!env.columns.length) return toolError('Error: 数据文件没有列定义（columns 为空）');

      const { dim, measures } = pickColumns(env, args.x, args.y);
      if (kind !== 'table' && (!dim || !measures.length)) {
        return toolError('Error: 图表需要 x（维度列）与 y（度量列），或数据至少两列');
      }
      const topN = Number(args.topN);
      const dsl: ChartDsl = {
        version: 1,
        title: String(args.chart_name || '').trim() || '图表',
        kind,
        dataPath,
        columns: env.columns,
        dim,
        measures,
        ...(typeof args.series === 'string' && args.series.trim() ? { series: args.series.trim() } : {}),
        ...(Number.isFinite(topN) && topN > 0 ? { topN: Math.trunc(topN) } : {}),
        ...(args.percent === true ? { percent: true } : {}),
        total: env.total,
        createdAt: Date.now(),
      };

      const chartFile = artifactPath(workspaceDir, String(args.chart_name || 'chart'), 'ychart.json');
      fs.writeFileSync(chartFile, JSON.stringify(dsl), 'utf-8');
      const chartRef = `ch_${chartFile.split(/[\\/]/).pop()!.replace(/\.ychart\.json$/, '')}`;

      const summary = [
        `已生成图表：${dsl.title}（${kind}）`,
        `chart_ref: ${chartRef}`,
        `chart_file: ${chartFile}`,
        `data_path: ${dataPath}`,
        `total: ${dsl.total}`,
        `x: ${dsl.dim} · y: ${dsl.measures.join(', ')}`,
        `[ychart]${JSON.stringify(dsl)}[/ychart]`,
      ].join('\n');
      return { content: [{ type: 'text', text: summary }] };
    } catch (e) {
      return toolError(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
