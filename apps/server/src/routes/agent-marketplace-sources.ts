// 智能体同源商城源管理 — 只处理 type='agent' 的远程源（通用端点收口到工厂，P6）
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { createMarketplaceSourcesRouter } from './marketplace-sources-factory.js';

export default createMarketplaceSourcesRouter({
  type: 'agent',
  itemPath: 'agents',
  itemIdField: 'agentId',
  saveItem: ({ item: a, sourceId, res }) => {
    const id = uuid(); const now = Date.now();
    db.prepare("INSERT INTO agent (id, name, description, avatar, workflow_json, inputs_schema_json, config_json, is_public, source, remote_source_id, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,0,?,?,1,?,?)").run(id, a.name, a.description || null, a.avatar || null, JSON.stringify(a.workflow || { nodes: [], edges: [] }), a.inputsSchema ? JSON.stringify(a.inputsSchema) : null, a.config ? JSON.stringify(a.config) : null, 'remote', sourceId, now, now);
    res.json({ data: db.prepare('SELECT * FROM agent WHERE id = ?').get(id) });
  },
});
