// doyz 内置工具 —— 把项目私有中间文档格式 .doyz 渲染/导出为 Word / PPT / Excel。
// 底层调用随包分发的 python-scripts/doyz/doyz.py（python-docx / python-pptx / openpyxl）。
// 解释器走 python-runtime 桥：prod 用打包 python-build-standalone，dev/缺失回退系统 python。
//
// 产物分类约定（对齐 file_write）：
//   - export / xlsx 的产出文件是最终交付物 → category='deliverable'，经 _meta 落「已交付」段。
//   - init / from-md / add-chart 产出的是可继续编辑的 doyz 源文件 → category='intermediate'，落「中间文件」段。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPythonScript, runPythonScript } from './python-runtime';
import { capToolOutput } from './output-cap';
import * as path from 'path';

const KINDS = ['document', 'presentation', 'spreadsheet'];
const CHART_TYPES = [
  'column', 'column_stacked', 'bar', 'bar_stacked', 'line', 'line_markers',
  'area', 'area_stacked', 'pie', 'doughnut', 'scatter', 'radar',
];

/** 默认输出路径：沿输入文件同目录、去扩展名后按动作拼后缀 */
function defaultOut(file: string, ext: string, suffix = ''): string {
  const base = path.join(path.dirname(file), path.basename(file, path.extname(file)));
  return `${base}${suffix}.${ext}`;
}

export class DoyzTool implements BuiltInTool {
  name = 'doyz';
  description = 'doyz 文档工具：把项目私有的 .doyz 中间文档（JSON，可含原生可编辑图表）导出为 Word / PPT / Excel，或直接从 CSV/JSON 生成 Excel。Word/PPT 图表支持「native 原生可编辑（Office 内可改数据/换类型）」与「image 静态图片」两种模式。依赖随包 Python（离线可用）。action: export(导出 docx/pptx/xlsx) / xlsx(CSV/JSON→Excel) / init(新建 doyz) / from-md(Markdown→doyz) / validate(校验) / add-chart(向 doyz 追加图表)。';

  inputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['export', 'xlsx', 'init', 'from-md', 'validate', 'add-chart'],
        description: '操作类型。export=导出 Office；xlsx=CSV/JSON 直接生成 Excel；init=新建空白 doyz；from-md=Markdown 转 doyz；validate=校验 doyz；add-chart=向已有 doyz 追加图表。',
      },
      // export / validate / add-chart 共用的源文件
      file: { type: 'string', description: '.doyz 源文件路径（export/validate/add-chart 必填）。' },
      // export
      to: { type: 'string', enum: ['docx', 'pptx', 'xlsx'], description: 'export 的目标格式。' },
      chart: { type: 'string', enum: ['native', 'image'], description: 'Word/PPT 图表模式：native=原生可编辑（默认），image=静态图片。' },
      // xlsx
      csv: { type: 'string', description: 'xlsx 动作的 CSV 源文件路径。' },
      json: { type: 'string', description: 'xlsx 动作的 JSON 源文件路径（二维表或多 sheet）。' },
      chart_type: { type: 'string', enum: CHART_TYPES, description: '图表类型（init/xlsx/add-chart 用）。' },
      // init / from-md / xlsx 的输出
      out: { type: 'string', description: '输出文件路径。省略时按源文件同目录自动推导。' },
      // init / from-md
      kind: { type: 'string', enum: KINDS, description: 'init 的文档种类。' },
      title: { type: 'string', description: '标题（init/from-md/xlsx/add-chart 用）。' },
      // init
      categories: { type: 'string', description: 'init 示例图表的类别，逗号分隔，如 "Q1,Q2,Q3,Q4"。' },
      // add-chart
      values: { type: 'string', description: 'add-chart 的系列值，空格分隔的 名称=值列表，如 "营收=120,150 成本=80,90"。' },
      slide: { type: 'number', description: 'add-chart 追加到 PPT 第几页（0 起）。' },
      anchor: { type: 'string', description: 'add-chart 在 Excel 的锚点单元格，如 "H2"。' },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const action = args.action as string;
    const script = getPythonScript('doyz/doyz.py');
    if (!script) {
      return { content: [{ type: 'text', text: 'Error: 未找到 doyz.py 脚本（resources/python-tools 或 packages/core 开发目录）。' }], isError: true };
    }

    const argv: string[] = [action];
    let outPath: string | null = null;
    let outCategory: 'deliverable' | 'intermediate' = 'deliverable';

    try {
      switch (action) {
        case 'export': {
          const file = args.file as string;
          const to = args.to as string;
          if (!file) throw new Error('export 需要 file 参数（.doyz 路径）');
          if (!to) throw new Error('export 需要 to 参数（docx/pptx/xlsx）');
          const chart = (args.chart as string) || 'native';
          argv.push(file, '--to', to, '--chart', chart);
          outPath = (args.out as string) || defaultOut(file, to, chart === 'image' ? '-图片图表' : '');
          argv.push('-o', outPath);
          break;
        }
        case 'xlsx': {
          const csv = args.csv as string;
          const json = args.json as string;
          if (!csv && !json) throw new Error('xlsx 需要 csv 或 json 参数');
          if (csv) argv.push('--csv', csv);
          if (json) argv.push('--json', json);
          if (args.chart_type) argv.push('--chart-type', args.chart_type as string);
          if (args.title) argv.push('--title', args.title as string);
          outPath = (args.out as string) || defaultOut(csv || json, 'xlsx');
          argv.push('-o', outPath);
          break;
        }
        case 'init': {
          const kind = (args.kind as string) || 'document';
          argv.push('--kind', kind);
          if (args.title) argv.push('--title', args.title as string);
          if (args.chart_type) argv.push('--chart-type', args.chart_type as string);
          if (args.categories) argv.push('--categories', args.categories as string);
          outPath = (args.out as string) || defaultOut((args.title as string) || 'document', 'doyz');
          argv.push('-o', outPath);
          outCategory = 'intermediate';
          break;
        }
        case 'from-md': {
          const md = args.md as string;
          if (!md) throw new Error('from-md 需要 md 参数（Markdown 路径）');
          argv.push('--md', md);
          if (args.title) argv.push('--title', args.title as string);
          outPath = (args.out as string) || defaultOut(md, 'doyz');
          argv.push('-o', outPath);
          outCategory = 'intermediate';
          break;
        }
        case 'validate': {
          const file = args.file as string;
          if (!file) throw new Error('validate 需要 file 参数');
          argv.push(file);
          break;
        }
        case 'add-chart': {
          const file = args.file as string;
          if (!file) throw new Error('add-chart 需要 file 参数');
          const chartType = args.chart_type as string;
          const categories = args.categories as string;
          const values = args.values as string;
          if (!chartType) throw new Error('add-chart 需要 chart_type 参数');
          if (!categories) throw new Error('add-chart 需要 categories 参数（逗号分隔）');
          if (!values) throw new Error('add-chart 需要 values 参数（名称=值 空格分隔）');
          argv.push(file, '--chart-type', chartType, '--categories', categories, '--values', ...String(values).split(/\s+/));
          if (args.title) argv.push('--title', args.title as string);
          if (typeof args.slide === 'number') argv.push('--slide', String(args.slide));
          if (args.anchor) argv.push('--anchor', args.anchor as string);
          outPath = file;
          outCategory = 'intermediate';
          break;
        }
        default:
          throw new Error(`未知 action: ${action}（可选 export/xlsx/init/from-md/validate/add-chart）`);
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }

    try {
      const r = await runPythonScript(script, argv, { timeout: 180000 });
      const out = [r.stdout ? capToolOutput(r.stdout) : '', r.stderr ? '[stderr]\n' + capToolOutput(r.stderr) : '']
        .filter(Boolean)
        .join('\n') || '(无输出)';
      if (r.exitCode !== 0) {
        return { content: [{ type: 'text', text: `doyz ${action} 失败（exit ${r.exitCode}）：\n${out}` }], isError: true };
      }
      const meta: Record<string, unknown> = {};
      if (outPath) meta.path = outPath;
      if (outPath) meta.category = outCategory;
      return { content: [{ type: 'text', text: out }], _meta: Object.keys(meta).length ? meta : undefined };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `doyz 执行异常: ${msg}` }], isError: true };
    }
  }
}
