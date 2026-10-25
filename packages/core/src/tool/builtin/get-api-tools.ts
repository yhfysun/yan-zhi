// get_api_tools 内置工具 — 工具发现的**总入口**（2026-10-22 重写）
//
// ★★★ 重写原因（原有实现的三个硬伤）：
//   ① **只按代码模块名分组**（agent/git/media…），不是按用户意图。模型搜「语音」时
//      `api_tts_speak` 在 media，`media_install_ffmpeg` 也在 media —— 混在一起；
//      而 `api_git_blame` 归在 git 里，实际它是"代码考古"，该和 code 一起。
//   ② **返回全量不过滤白名单** —— 模型查到 `music_compose` 的 schema，调用却报
//      「内置工具不存在」（不在 SUPPORTED_API_TOOLS），于是反复重试烧 token。
//      → 现在每条带 `executable`，false 的明确标注"未开放，别调"。
//   ③ **没有分页、没有「全部」** —— git 一个模块 26 个工具，一次全吐，把上下文塞满。
//      → 现在 `module='all'` 支持跨分类分页；单类也分页（上限 20）。
//
// ★ 新语义：
//   module='list'（默认） → 分类概览（数量 + 样例），不吐工具详情
//   module='all'          → 全部工具（含内置），可选 keyword 过滤，分页
//   module='<分类>'       → 该分类工具，分页
//
// ★ 为什么把内置工具也并进来：模型不需要知道"这个工具是 api 还是 builtin"，
//   那是实现细节。`source` 字段给需要区分时用。
import type { BuiltInTool, ToolContext } from '../types';
import { toolError, toolOk } from '../result';
import { API_MODULES, getApiToolRegistry, initApiToolRegistry } from './api-tools';
import { TOOL_CATEGORIES, MAX_TOOLS_PER_CATEGORY, categoryOf, groupByCategory, paginate, type ToolSource } from '@yan-zhi/shared';

let _initDone = false;

function ensureInit() {
  if (!_initDone) {
    initApiToolRegistry();
    _initDone = true;
  }
}

interface ToolRow {
  name: string;
  summary: string;
  source: ToolSource;
  executable: boolean;
}

/** 描述取首句，避免清单被长描述撑爆（要详情走 api_tool_detail）。 */
function firstSentence(s: string): string {
  const clean = String(s || '').replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(.{1,60}?)(?:[。；;.\n]|$)/);
  return (m ? m[1] : clean.slice(0, 60)).trim();
}

/**
 * 汇总全部工具（api + builtin + 注入的额外来源）。
 *
 * ★ 可执行性（executable）这里是占位 true —— core 不能反向依赖 server 的
 *   SUPPORTED_API_TOOLS。server 侧在 executeApiTool 里会用真实白名单覆盖。
 *
 * ★ 2026-10-25 全量覆盖（用户要求：工具发现必须能查到系统里**所有**工具）：
 *   getExtra 由 server 注入自定义工具与 MCP 工具清单（core 不直接依赖 DB/MCP），
 *   userId 透传给实现方做数据归属过滤。
 */
function collectTools(
  getBuiltin: () => Array<{ name: string; description?: string }>,
  getExtra: (userId?: string) => Array<{ name: string; description?: string; source: ToolSource }>,
  userId?: string,
): ToolRow[] {
  ensureInit();
  const rows: ToolRow[] = [];
  for (const tools of getApiToolRegistry().values()) {
    for (const t of tools) {
      rows.push({ name: t.name, summary: firstSentence(t.description || ''), source: 'api', executable: true });
    }
  }
  for (const t of getBuiltin()) {
    rows.push({ name: t.name, summary: firstSentence(t.description || ''), source: 'builtin', executable: true });
  }
  for (const t of getExtra(userId)) {
    rows.push({ name: t.name, summary: firstSentence(t.description || ''), source: t.source, executable: true });
  }
  return rows;
}

function num(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
}

export class GetApiToolsTool implements BuiltInTool {
  /**
   * @param getBuiltin 注入内置工具列表读函数（由 server / registry 提供）。
   *   不直接 import getToolRegistry 是为了避免 core 内部循环依赖
   *   （registry ← builtin/index ← 本文件）。
   * @param getExtra 注入自定义/MCP 等额外来源的工具清单（server 侧拼好可调用暴露名）。
   */
  constructor(
    private readonly getBuiltin: () => Array<{ name: string; description?: string }> = () => [],
    private readonly getExtra: (userId?: string) => Array<{ name: string; description?: string; source: ToolSource }> = () => [],
  ) {}

  name = 'get_api_tools';
  description =
    '查询工具清单（工具发现的总入口，覆盖系统全量工具：api / 内置 / 自定义 / MCP）。三种用法：' +
    '① module="list"（默认）→ 列出所有分类及各自工具数量，**先看这个**；' +
    '② module="all" → 一次列出全部工具（可按 keyword 过滤，分页）；' +
    '③ module="<分类名>" → 该分类的工具（分页，每页最多 20）。' +
    '★ 手头没有合适工具时先查这里，再对感兴趣的工具调 api_tool_detail 看参数。' +
    '★ 返回里 executable=false 表示该工具未开放（调用会失败），不要去调它。' +
    '★ 查到的 api/内置工具即使没挂载到当前智能体也能直接调用；custom_/mcp_ 前缀的工具需挂载后调用。';
  inputSchema = {
    type: 'object',
    properties: {
      module: {
        type: 'string',
        description:
          `'list'（默认，列分类概览）| 'all'（全部工具，分页）| 具体分类名。` +
          `可用分类：${TOOL_CATEGORIES.join(', ')}`,
      },
      page: { type: 'integer', description: '页码，默认 1' },
      pageSize: {
        type: 'integer',
        description: `每页条数，默认 ${MAX_TOOLS_PER_CATEGORY}，上限也是 ${MAX_TOOLS_PER_CATEGORY}`,
      },
      keyword: { type: 'string', description: '可选，按工具名/描述过滤（module=all 时最有用）' },
    },
    required: [],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext) {
    const module = String(args.module ?? 'list').trim() || 'list';
    const page = num(args.page, 1);
    const pageSize = num(args.pageSize, MAX_TOOLS_PER_CATEGORY);
    const keyword = String(args.keyword ?? '').trim().toLowerCase();

    const all = collectTools(this.getBuiltin, this.getExtra, ctx?.userId);

    // ── 分类概览 ──
    if (module === 'list') {
      const groups = groupByCategory(all);
      return toolOk(
        JSON.stringify({
          categories: groups.map((g) => ({
            category: g.category,
            count: g.tools.length,
            sample: g.tools.slice(0, 3).map((t) => t.name),
          })),
          totalTools: all.length,
          hint:
            '调用 get_api_tools({ module: "<分类名>" }) 看该类工具；' +
            '或 module="all" 看全部；对具体工具用 api_tool_detail 查参数。',
        }),
      );
    }

    // ── 全部 / 指定分类 ──
    let filtered: ToolRow[];
    if (module === 'all') {
      filtered = all;
    } else if ((TOOL_CATEGORIES as readonly string[]).includes(module)) {
      filtered = all.filter((t) => categoryOf(t.name) === module);
      if (!filtered.length) {
        return toolError(
          JSON.stringify({ error: `分类 "${module}" 下没有工具`, categories: TOOL_CATEGORIES }),
        );
      }
    } else if ((API_MODULES as readonly string[]).includes(module)) {
      // 向后兼容：老调用方传的是**代码模块名**（如 'git'、'media'）。
      // 这些模块已被拆成多个用户意图分类，这里做映射，避免老提示词失效。
      const legacyMap: Record<string, string[]> = {
        git: ['git-read', 'git-write', 'git-advanced'],
        media: ['media-image', 'media-video', 'media-audio', 'media-compose', 'media-install'],
      };
      const cats = legacyMap[module];
      if (!cats) return toolOk(JSON.stringify({ module, error: '该模块已拆分，请用分类名', categories: TOOL_CATEGORIES }));
      filtered = all.filter((t) => cats.includes(categoryOf(t.name) ?? ''));
    } else {
      return toolError(
        JSON.stringify({ error: `未知分类或模块 "${module}"`, categories: TOOL_CATEGORIES }),
      );
    }

    if (keyword) {
      filtered = filtered.filter(
        (t) => t.name.toLowerCase().includes(keyword) || t.summary.toLowerCase().includes(keyword),
      );
    }

    const pg = paginate(filtered, page, pageSize);
    return toolOk(
      JSON.stringify({
        module,
        ...(keyword ? { keyword } : {}),
        page: pg.page,
        pageSize: pg.pageSize,
        total: pg.total,
        totalPages: pg.totalPages,
        tools: pg.items.map((t) => ({
          name: t.name,
          summary: t.summary,
          source: t.source,
          executable: t.executable,
        })),
        ...(pg.totalPages > pg.page ? { hint: `还有第 ${pg.page + 1} 页，传 page=${pg.page + 1}` } : {}),
      }),
    );
  }
}
