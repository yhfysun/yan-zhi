// 言智代言官：本体数据链挂载回归（2026-10-26 用户要求）。
// 守住三件事：① list/brief/detail 三件套在挂载里；② 取数前有 preview；③ 提示词写明查询顺序。
import { describe, it, expect } from 'vitest';
import {
  YANZHI_AGENT_BUILTIN_TOOLS,
  YANZHI_AGENT_SYSTEM_PROMPT,
  builtinYanzhiAgentDefs,
} from '../src/builtin-yanzhi-agent';

describe('言智代言官 · 本体数据链', () => {
  it('挂载本体列表 / 基本信息 / 详情三件套', () => {
    for (const t of ['api_ontology_list', 'api_ontology_brief', 'api_ontology_detail']) {
      expect(YANZHI_AGENT_BUILTIN_TOOLS, `缺工具 ${t}`).toContain(t);
    }
  });

  it('挂载取数链（数据源 + 预览 + 取数 + 采样）', () => {
    for (const t of ['api_datasource_list', 'api_ontology_values', 'api_data_preview', 'api_data_query', 'api_data_paginate']) {
      expect(YANZHI_AGENT_BUILTIN_TOOLS, `缺工具 ${t}`).toContain(t);
    }
  });

  it('提示词写明 list → brief → detail → preview → query', () => {
    const p = YANZHI_AGENT_SYSTEM_PROMPT;
    const order = ['api_ontology_list', 'api_ontology_brief', 'api_ontology_detail', 'api_data_preview', 'api_data_query'];
    const positions = order.map((t) => p.indexOf(t));
    expect(positions.every((i) => i >= 0), `提示词缺步骤：${order.filter((_, i) => positions[i] < 0).join(', ')}`).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('内置定义强制同步（代码收敛工具与提示词）', () => {
    expect(builtinYanzhiAgentDefs[0].force_sync).toBe(true);
    expect(String(builtinYanzhiAgentDefs[0].builtin_tool_ids)).toContain('api_ontology_list');
    expect(String(builtinYanzhiAgentDefs[0].skill_ids)).toContain('skill_ontology_query');
  });
});
