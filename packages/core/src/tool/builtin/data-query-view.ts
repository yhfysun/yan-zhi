// data_query_view 内置工具 —— 在聊天里内嵌可交互数据看板
// 注意：实际执行由前端 chat.ts 的 dispatchToolCall 拦截（nestDataViewIntoChat /
//       打开右侧数据浏览面板），此类仅提供 schema 注册，让模型知道工具存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class DataQueryViewTool implements BuiltInTool {
  name = 'data_query_view';
  description =
    '在当前聊天回复里内嵌一个可交互数据看板：给 table（表名）或 base（单条只读 SQL）之一，' +
    '前端用参数化查询取数（不经大模型），渲染明细表格，可切折线/柱/饼/散点、加过滤器、翻页、导出 PNG。' +
    '适合「把数据展示出来」「画个图看看」「做个图表」这类请求；报数/结论仍用正文表格，看板用于交互查看。' +
    '优先传 table（结构简单、字段可探）；复杂聚合再传 base。数据量大时用 filterCols 声明常用过滤列。';
  inputSchema = {
    type: 'object',
    properties: {
      table: { type: 'string', description: '表/视图名（与 base 二选一，优先用它）' },
      base: { type: 'string', description: '大模型产出的单条只读 SELECT（与 table 二选一）；推荐直接传 api_data_query 返回的 sql' },
      datasourceId: { type: 'string', description: '数据源 id；缺省用内置项目库' },
      title: { type: 'string', description: '看板标题（展示给用户）' },
      filterCols: {
        type: 'array',
        items: { type: 'string' },
        description: '默认展开的过滤列（必须是输出列），前端会采样候选值',
      },
    },
  };

  async execute(): Promise<McpCallResult> {
    // 实际执行由前端 dispatchToolCall 拦截，此处仅为占位（正常不会走到）
    return { content: [{ type: 'text', text: 'data_query_view intercepted by chat dispatcher.' }] };
  }
}
