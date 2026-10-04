// 同源商城工具源管理 — 只处理 type='tool' 的远程源（通用端点收口到工厂，P6）
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { createMarketplaceSourcesRouter } from './marketplace-sources-factory.js';

export default createMarketplaceSourcesRouter({
  type: 'tool',
  itemPath: 'tools',
  itemIdField: 'toolId',
  saveItem: ({ item: t, sourceId, userId, res }) => {
    // 重名兜底：远程工具与本地同名时加 _remote 后缀（skill/agent 走各自表的唯一性约束）
    let name = t.name;
    if (db.prepare('SELECT id FROM custom_tool WHERE name = ? AND user_id = ?').get(name, userId)) name = `${t.name}_remote`;
    const id = uuid(); const now = Date.now();
    db.prepare(
      `INSERT INTO custom_tool (id, user_id, name, description, input_schema_json, output_schema_json,
       runtime, entry, code, dependencies_json, timeout, env_json, enabled, source, remote_source_id, is_public, updated_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,'remote',?,0,?,?)`,
    ).run(id, userId, name, t.description || null, JSON.stringify(t.inputSchema || {}),
      t.outputSchema ? JSON.stringify(t.outputSchema) : null, t.runtime || 'node', t.entry, t.code,
      t.dependencies ? JSON.stringify(t.dependencies) : null, t.timeout || 30000, null, sourceId, now, now);
    res.json({ data: db.prepare('SELECT * FROM custom_tool WHERE id = ?').get(id) });
  },
});
