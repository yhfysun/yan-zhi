// 自定义文档类型工具（api_document_type_list）：声明 / 可执行 / 已挂载 / skill 有指引。
// 这三处任何一处漏掉，表现都是「模型看不到用户自建的模板」。
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';

process.env.DATA_DIR = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-doctype-tool-'));

interface Decl { name: string; description?: string; inputSchema?: { properties?: Record<string, unknown> } }
let declared: Decl[];
let isApiExecutableTool: typeof import('../src/mcp/api-tool-executor.js')['isApiExecutableTool'];
let db: typeof import('../src/db.js')['db'];

beforeAll(async () => {
  const { registerDataTools } = await import('../../packages/core/src/tool/builtin/api-tools/data');
  const registry = new Map<string, Decl[]>();
  registerDataTools(registry as never);
  declared = registry.get('data') || [];
  ({ isApiExecutableTool } = await import('../src/mcp/api-tool-executor.js'));
  ({ db } = await import('../src/db.js'));
}, 60_000);

function tool(): Decl | undefined {
  return declared.find((t) => t.name === 'api_document_type_list');
}

describe('api_document_type_list', () => {
  it('在 data 模块里声明，schema 只有 keyword', () => {
    const t = tool();
    expect(t, '未声明 api_document_type_list（模型将看不到自定义文档类型）').toBeTruthy();
    expect(Object.keys(t!.inputSchema?.properties || {})).toEqual(['keyword']);
    expect(t!.description).toMatch(/自定义/);
  });

  it('在执行白名单里（isApiExecutableTool）', () => {
    expect(isApiExecutableTool('api_document_type_list')).toBe(true);
  });

  it('数据助手已挂载', () => {
    const row = db
      .prepare("SELECT builtin_tool_ids FROM agent WHERE id = 'a_builtin_data_agent'")
      .get() as { builtin_tool_ids: string } | undefined;
    expect(row, '缺数据助手').toBeTruthy();
    expect(JSON.parse(row!.builtin_tool_ids || '[]')).toContain('api_document_type_list');
  });

  it('skill_document_type 写明自定义类型流程', () => {
    const row = db
      .prepare("SELECT body FROM skill WHERE id = 'skill_document_type'")
      .get() as { body: string } | undefined;
    expect(row, '缺 skill_document_type').toBeTruthy();
    expect(row!.body).toContain('api_document_type_list');
    expect(row!.body).toContain('自定义类型');
  });
});
