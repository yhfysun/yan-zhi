// 工具发现三件套的 schema 定义（2026-10-22）
//
// ★★★ 为什么需要（真实缺陷，不是设计洁癖）：
//   改造前「查工具」只有 `get_api_tools` 一条路，且它有两个硬伤：
//   ① **不过滤可执行白名单** —— 直接返回注册表全量。模型查到 `music_compose`
//      的完整 schema → 调用 → `isApiExecutableTool()` 为 false → 落到 core registry
//      → 报「内置工具不存在」。这比"查不到"更坏：查不到会换方案，查得到调不动
//      会反复重试烧 token，最后报个莫名其妙错。
//   ② **没有「查详情」入口** —— 模型看到工具名却拿不到参数说明，只能瞎猜。
//   另外 `api_builtin_tool_list` 只硬编码返回 8 条（实际 58 个内置工具），
//   模型问「有哪些文件工具」只能看到 file_read/file_write。
//
// ★ 本模块补的：
//   api_tool_detail —— 单工具完整定义（含自动生成的 example，比只给 schema 好用得多）
//   api_tool_search —— 关键词跨源搜索（不确定该用哪个工具时先搜）
//   （分类浏览/分页由 get_api_tools 重写承担，见 builtin/get-api-tools.ts）
import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerDiscoveryTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('discovery', [
    {
      name: 'api_tool_detail',
      description:
        '查询单个工具的完整定义：完整 description、inputSchema（参数名/类型/是否必填/枚举值）、示例调用、所属分类、来源、以及在哪些模式挂载。' +
        '★ 用法：从 get_api_tools / api_tool_search 看到工具名但不确定怎么传参时，**先调它**再调用目标工具。' +
        '★ 即使目标工具没挂载到当前智能体，也能查到 —— 查到后可直接调用（执行侧只看能力白名单，不看模式挂载）。' +
        '★ 返回里 `executable=false` 表示该工具虽有定义但不可执行（未开放），此时不要重试，换同类工具。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '工具名，如 music_compose / file_read / api_git_log' },
        },
        required: ['name'],
      },
    },
    {
      name: 'api_tool_search',
      description:
        '按关键词搜索全部工具（跨 api / 内置 / 自定义 / MCP 四种来源）。' +
        '★ 不确定该用哪个工具时先搜一次（如「音乐」「下载」「音频」「图片」「git」），' +
        '再对命中项调用 api_tool_detail 查参数。' +
        '★ 匹配工具名 + 分类 + 描述，按相关度排序（精确名 > 名称包含 > 描述包含）。' +
        '★ 工具很多，结果分页返回（默认每页 20）。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '关键词。可中英文，如「音乐」「下载」「语音」「git」' },
          source: {
            type: 'string',
            enum: ['api', 'builtin', 'custom', 'mcp'],
            description: '可选，限定来源。省略则搜全部',
          },
          page: { type: 'integer', description: '页码，默认 1' },
          pageSize: { type: 'integer', description: '每页条数，默认 20，上限 20' },
        },
        required: ['query'],
      },
    },
  ]);
}
