// 管理工具 — 将管理操作注册为 LLM 可调用的内置工具
import type { BuiltInTool } from '../types';
import type { ToolRegistry } from '../registry';
import { GetApiToolsTool } from './get-api-tools';
import { toolError, toolOk } from '../result';

class ListPlatformsTool implements BuiltInTool {
  name = 'list_platforms'; description = '列出所有已配置的模型平台';
  inputSchema = { type: 'object', properties: {}, required: [] };
  constructor(private getDb: () => any) {}
  async execute() {
    try {
      const rows = this.getDb().prepare('SELECT id, name, protocol, api_url, status FROM platform ORDER BY created_at DESC').all();
      return toolOk(JSON.stringify(rows));
    } catch (e: unknown) {
      return toolError(`获取失败: ${e instanceof Error ? e.message : e}`);
    }
  }
}

class ListToolsTool implements BuiltInTool {
  name = 'list_tools'; description = '列出所有可用工具';
  inputSchema = { type: 'object', properties: {}, required: [] };
  async execute() {
    return toolOk('内置工具有: file_read, file_write 等，完整列表请通过 /api/tools/builtin 查询');
  }
}

class EnableTool implements BuiltInTool {
  name = 'enable_tool'; description = '启用指定自定义工具';
  inputSchema = { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] };
  constructor(private getDb: () => any) {}
  async execute(args: Record<string, unknown>) {
    const r = this.getDb().prepare('UPDATE custom_tool SET enabled = 1 WHERE name = ?').run(args.name);
    if (r.changes === 0) return toolError(`工具 "${args.name}" 未找到`);
    return toolOk(`工具 "${args.name}" 已启用`);
  }
}

class DisableTool implements BuiltInTool {
  name = 'disable_tool'; description = '禁用指定自定义工具';
  inputSchema = { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] };
  constructor(private getDb: () => any) {}
  async execute(args: Record<string, unknown>) {
    const r = this.getDb().prepare('UPDATE custom_tool SET enabled = 0 WHERE name = ?').run(args.name);
    if (r.changes === 0) return toolError(`工具 "${args.name}" 未找到`);
    return toolOk(`工具 "${args.name}" 已禁用`);
  }
}

class ListSkillsTool implements BuiltInTool {
  name = 'list_skills'; description = '列出所有已安装的 Skills';
  inputSchema = { type: 'object', properties: {}, required: [] };
  constructor(private getDb: () => any) {}
  async execute() {
    const rows = this.getDb().prepare('SELECT id, name, description, category, enabled FROM skill ORDER BY created_at DESC').all();
    return toolOk(JSON.stringify(rows));
  }
}

class ListAgentsTool implements BuiltInTool {
  name = 'list_agents'; description = '列出所有智能体';
  inputSchema = { type: 'object', properties: {}, required: [] };
  constructor(private getDb: () => any) {}
  async execute() {
    try {
      const rows = this.getDb().prepare('SELECT id, name, description FROM agent ORDER BY created_at DESC').all();
      return toolOk(JSON.stringify(rows));
    } catch { return toolOk('[]'); }
  }
}

class SearchMarketplaceTool implements BuiltInTool {
  name = 'search_marketplace'; description = '搜索商城内容（skill/agent/tool）';
  inputSchema = { type: 'object', properties: { type: { type: 'string' }, query: { type: 'string' } }, required: ['type', 'query'] };
  constructor(private getDb: () => any) {}
  async execute(args: Record<string, unknown>) {
    const db = this.getDb(); const q = `%${args.query}%`;
    if (args.type === 'skill') {
      const rows = db.prepare('SELECT id, name, description, category FROM skill WHERE is_public = 1 AND (name LIKE ? OR description LIKE ?) LIMIT 10').all(q, q);
      return toolOk(JSON.stringify(rows));
    } else if (args.type === 'agent') {
      try {
        const rows = db.prepare('SELECT id, name, description FROM agent WHERE is_public = 1 AND (name LIKE ? OR description LIKE ?) LIMIT 10').all(q, q);
        return toolOk(JSON.stringify(rows));
      } catch { return toolOk('[]'); }
    } else if (args.type === 'tool') {
      const rows = db.prepare('SELECT id, name, description, runtime FROM custom_tool WHERE is_public = 1 AND (name LIKE ? OR description LIKE ?) LIMIT 10').all(q, q);
      return toolOk(JSON.stringify(rows));
    }
    return toolError('不支持的商城类型');
  }
}

export function registerManagementTools(registry: ToolRegistry, getDb: () => any): void {
  registry.register(new ListPlatformsTool(getDb));
  registry.register(new ListToolsTool());
  registry.register(new EnableTool(getDb));
  registry.register(new DisableTool(getDb));
  registry.register(new ListSkillsTool(getDb));
  registry.register(new ListAgentsTool(getDb));
  registry.register(new SearchMarketplaceTool(getDb));
  registry.register(new GetApiToolsTool());
}
