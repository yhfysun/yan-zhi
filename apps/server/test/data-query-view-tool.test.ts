// data_query_view 内置工具声明回归（2026-10-26）。
// 守住：① 工具真的注册进内置表（漏注册 = 模型看不到，静默消失）；
//       ② schema 有 table/base/title/filterCols 四个入口；③ 数据/代言官智能体已挂载。
import { describe, it, expect } from 'vitest';
import { getToolRegistry } from '@yan-zhi/core';
import { YANZHI_AGENT_BUILTIN_TOOLS } from '../src/builtin-yanzhi-agent';

describe('data_query_view 内置工具', () => {
  it('注册到内置工具表且 schema 完整', () => {
    const tool = getToolRegistry().get('data_query_view');
    expect(tool, '未注册 data_query_view（模型将看不到该工具）').toBeTruthy();
    const props = (tool!.inputSchema as { properties?: Record<string, unknown> }).properties || {};
    for (const k of ['table', 'base', 'datasourceId', 'title', 'filterCols']) {
      expect(props, `schema 缺 ${k}`).toHaveProperty(k);
    }
    expect(tool!.description).toMatch(/看板|图表/);
  });

  it('言智代言官已挂载 data_query_view', () => {
    expect(YANZHI_AGENT_BUILTIN_TOOLS).toContain('data_query_view');
  });
});
