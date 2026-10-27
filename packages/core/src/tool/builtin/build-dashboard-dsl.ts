// build_dashboard_dsl 内置工具 —— 把已生成的图表组装成看板（对标参考包 build_dashboard_dsl）。
//
// 只消费 build_chart_dsl 产出的 .ychart.json（chart_file），不重新取数、不手写内层 DSL。
// 输出 .ydash 看板定义：前端按定义渲染（可勾选存入右侧「看板」面板）。
import fs from 'node:fs';
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { toolError } from '../result';
import { artifactPath } from './data-artifact';
import type { ChartDsl } from './build-chart-dsl';

const MAX_WIDGETS = 24;
const DASH_WIDTH = 12;

interface ChartInput {
  chart_file: string;
  title?: string;
  w?: number;
  h?: number;
}

export interface DashWidget {
  id: string;
  kind: 'chart' | 'table';
  title?: string;
  contract: { mode: 'file'; path: string };
  spec: Record<string, unknown>;
  pos: { x: number; y: number; w: number; h: number };
}

export interface DashFile {
  version: 1;
  title: string;
  description?: string;
  widgets: DashWidget[];
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

/** 12 列网格流式排版：从左到右填满一行再换行（w/h 只用于排版，不留在 widget 上） */
export function autoLayout(widgets: Array<Omit<DashWidget, 'pos'> & { w?: number; h?: number }>): DashWidget[] {
  let x = 0;
  let y = 0;
  let rowH = 0;
  return widgets.map((w, i) => {
    const { w: widthRaw, h: heightRaw, ...rest } = w;
    const width = clamp(widthRaw, 1, DASH_WIDTH, 6);
    const height = clamp(heightRaw, 2, 40, 5);
    if (x + width > DASH_WIDTH) { y += rowH; x = 0; rowH = 0; }
    const pos = { x, y, w: width, h: height };
    x += width;
    rowH = Math.max(rowH, height);
    return { ...rest, id: w.id || `w${i + 1}`, pos } as DashWidget;
  });
}

export class BuildDashboardDslTool implements BuiltInTool {
  name = 'build_dashboard_dsl';
  description =
    '把多张已生成的图（build_chart_dsl 返回的 chart_file）组装成看板，返回 dashboard_file 与前端的 [ydash] 定义（可直接渲染并存进右侧看板）。' +
    '只消费 chart_file，不重新取数；一屏建议 4–9 个组件（硬上限 24）。' +
    '每个组件可给 title/w/h（12 列网格，宽度默认 6、高度默认 5），不给则自动流式排版。' +
    '没有图就不要建看板：先跑取数 → build_chart_dsl 出图，再来组装。';

  inputSchema = {
    type: 'object',
    properties: {
      title: { type: 'string', description: '看板标题（2–20 字）' },
      description: { type: 'string', description: '一句话说明（可选：口径/数据截止日）' },
      charts: {
        type: 'array',
        description: '组件清单（按展示顺序）',
        items: {
          type: 'object',
          properties: {
            chart_file: { type: 'string', description: 'build_chart_dsl 返回的 chart_file' },
            title: { type: 'string', description: '组件标题（缺省用图表标题）' },
            w: { type: 'number', description: '宽度 1–12（默认 6）' },
            h: { type: 'number', description: '高度（行，默认 5）' },
          },
          required: ['chart_file'],
        },
      },
    },
    required: ['title', 'charts'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    try {
      const workspaceDir = (ctx?.workspaceDir || '').trim();
      if (!workspaceDir) return toolError('Error: 没有会话工作目录，无法生成看板');
      const title = String(args.title || '').trim();
      if (!title) return toolError('Error: 缺少看板标题');
      const charts = Array.isArray(args.charts) ? (args.charts as ChartInput[]) : [];
      if (!charts.length) return toolError('Error: charts 不能为空（没有图就不要建看板）');
      if (charts.length > MAX_WIDGETS) return toolError(`Error: 组件超过 ${MAX_WIDGETS} 个，请精简`);

      const base = charts.map((c, i) => {
        const file = String(c?.chart_file || '').trim();
        if (!file) throw new Error(`第 ${i + 1} 个组件缺少 chart_file`);
        if (!fs.existsSync(file)) throw new Error(`chart_file 不存在：${file}`);
        const dsl = JSON.parse(fs.readFileSync(file, 'utf-8')) as ChartDsl;
        if (!dsl?.dataPath || !dsl.kind) throw new Error(`chart_file 不是 build_chart_dsl 的产物：${file}`);
        const isTable = dsl.kind === 'table';
        return {
          id: `w${i + 1}`,
          kind: (isTable ? 'table' : 'chart') as DashWidget['kind'],
          title: String(c?.title || dsl.title || '').trim() || undefined,
          contract: { mode: 'file' as const, path: dsl.dataPath },
          spec: {
            ...(isTable ? {} : { kind: dsl.kind }),
            dim: dsl.dim,
            measure: dsl.measures[0] || '',
            measures: dsl.measures,
            ...(dsl.series ? { series: dsl.series } : {}),
            ...(dsl.topN ? { topN: dsl.topN } : {}),
            ...(dsl.percent ? { percent: true } : {}),
          },
          w: clamp(c?.w, 1, DASH_WIDTH, 6),
          h: clamp(c?.h, 2, 40, 5),
        } as unknown as Omit<DashWidget, 'pos'>;
      });

      const widgets = autoLayout(base);
      const files = [title, ...charts.map((c) => c.chart_file)].join('\n');
      const dash: DashFile = {
        version: 1,
        title,
        ...(typeof args.description === 'string' && args.description.trim() ? { description: args.description.trim() } : {}),
        widgets,
      };
      const dashFile = artifactPath(workspaceDir, title, 'ydash.json');
      fs.writeFileSync(dashFile, JSON.stringify(dash), 'utf-8');

      const summary = [
        `已生成看板：${title}（${widgets.length} 个组件）`,
        `dashboard_file: ${dashFile}`,
        '来源图表：',
        files,
        `[ydash]${JSON.stringify(dash)}[/ydash]`,
      ].join('\n');
      return { content: [{ type: 'text', text: summary }] };
    } catch (e) {
      return toolError(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
