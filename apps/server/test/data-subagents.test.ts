// 数据线子智能体种子：data-explorer 只探查、report-writer 只编排，取数留在主智能体。
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';

process.env.DATA_DIR = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-data-subagents-'));

interface AgentRow {
  id: string;
  agent_kind: string | null;
  builtin_tool_ids: string | null;
  sub_agent_ids: string | null;
  system_prompt: string | null;
}

let db: typeof import('../src/db.js')['db'];

beforeAll(async () => {
  ({ db } = await import('../src/db.js'));
});

function agent(id: string): AgentRow {
  const row = db.prepare('SELECT id, agent_kind, builtin_tool_ids, sub_agent_ids, system_prompt FROM agent WHERE id = ?').get(id) as AgentRow | undefined;
  if (!row) throw new Error(`缺智能体 ${id}`);
  return row;
}

function tools(row: AgentRow): string[] {
  try { return JSON.parse(row.builtin_tool_ids || '[]'); } catch { return []; }
}

describe('数据线子智能体', () => {
  it('主数据智能体挂 call_agent 并声明两个子体', () => {
    const main = agent('a_builtin_data_agent');
    expect(tools(main)).toContain('call_agent');
    expect(tools(main)).toContain('list_sub_agents');
    expect(JSON.parse(main.sub_agent_ids || '[]')).toEqual([
      'a_builtin_data_explorer_agent',
      'a_builtin_data_report_agent',
    ]);
  });

  it('提示词放开子智能体且有边界（取数仍自己做）', () => {
    const prompt = agent('a_builtin_data_agent').system_prompt || '';
    expect(prompt).toContain('a_builtin_data_explorer_agent');
    expect(prompt).toContain('a_builtin_data_report_agent');
    expect(prompt).toContain('取数永远自己做');
    expect(prompt).not.toContain('你没有子智能体');
  });

  it('data-explorer 只挂本体检索，不挂取数/写文件', () => {
    const row = agent('a_builtin_data_explorer_agent');
    expect(row.agent_kind).toBe('sub');
    const t = tools(row);
    expect(t).toContain('api_ontology_detail');
    expect(t).not.toContain('api_data_query');
    expect(t).not.toContain('api_data_preview');
    expect(t).not.toContain('file_write');
  });

  it('report-writer 只挂文件读写，不挂取数', () => {
    const row = agent('a_builtin_data_report_agent');
    expect(row.agent_kind).toBe('sub');
    const t = tools(row);
    expect(t).toEqual(expect.arrayContaining(['file_read', 'file_write']));
    expect(t).not.toContain('api_data_query');
    expect(t).not.toContain('api_ontology_search');
  });

  it('report-writer 首选 document 围栏（可直接导出 Word）', () => {
    const prompt = agent('a_builtin_data_report_agent').system_prompt || '';
    expect(prompt).toContain('document 围栏');
    expect(prompt).toContain('导出 Word');
    expect(prompt).toContain('不要生成 HTML');
  });
});
