// Skill 同源商城源管理 — 只处理 type='skill' 的远程源（通用端点收口到工厂，P6）
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { createMarketplaceSourcesRouter } from './marketplace-sources-factory.js';

export default createMarketplaceSourcesRouter({
  type: 'skill',
  itemPath: 'skills',
  itemIdField: 'skillId',
  saveItem: ({ item: sk, sourceId, userId, res }) => {
    const id = uuid(); const now = Date.now();
    db.prepare('INSERT INTO skill (id, user_id, name, description, triggers_json, body, category, author, enabled, installs, source, remote_source_id, is_public, created_at) VALUES (?,?,?,?,?,?,?,?,1,0,?,?,0,?)').run(id, userId, sk.name, sk.description || null, JSON.stringify(sk.triggers || []), sk.body || '', sk.category || null, sk.author || null, 'remote', sourceId, now);
    res.json({ data: db.prepare('SELECT * FROM skill WHERE id = ?').get(id) });
  },
});
