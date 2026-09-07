import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { getToolRegistry } from '@yan-zhi/core';

const router = Router();
router.use(authMiddleware);

// GET /api/tools
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const rows = db.prepare('SELECT * FROM custom_tool WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  res.json({ data: rows });
});

// POST /api/tools
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, description, category, inputSchema, outputSchema, runtime, entry, code, dependencies, timeout, env } = req.body || {};
  if (!name || !inputSchema || !code || !entry) {
    res.status(400).json({ error: 'name, inputSchema, code, entry 为必填项' }); return;
  }
  // 工具名合法性校验（A6）：仅允许字母/数字/下划线/连字符，长度 1-64；禁止保留前缀
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
    res.status(400).json({ error: '工具名只能包含字母、数字、下划线、连字符，长度 1-64' }); return;
  }
  if (name.startsWith('mcp_') || name.startsWith('custom_')) {
    res.status(400).json({ error: '工具名不能以 mcp_ 或 custom_ 开头（保留前缀）' }); return;
  }
  const existing = db.prepare('SELECT id FROM custom_tool WHERE name = ? AND user_id = ?').get(name, userId);
  if (existing) { res.status(409).json({ error: `工具 "${name}" 已存在` }); return; }

  const id = uuid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO custom_tool (id, user_id, name, description, category, input_schema_json, output_schema_json,
     runtime, entry, code, dependencies_json, timeout, env_json, enabled, source, is_public, updated_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,'local',?,?,?)`,
  ).run(id, userId, name, description || null, category || '其他', JSON.stringify(inputSchema),
    outputSchema ? JSON.stringify(outputSchema) : null, runtime || 'node', entry, code,
    dependencies ? JSON.stringify(dependencies) : null, timeout || 30000,
    env ? JSON.stringify(env) : null, req.body.isPublic ? 1 : 0, now, now);
  const row = db.prepare('SELECT * FROM custom_tool WHERE id = ?').get(id);
  res.json({ data: row });
});

// PATCH /api/tools/:id
router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tid = req.params.id;
  const existing = db.prepare('SELECT * FROM custom_tool WHERE id = ? AND user_id = ?').get(tid, userId) as any;
  if (!existing) { res.status(404).json({ error: '工具不存在' }); return; }
  const sets: string[] = []; const vals: any[] = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); vals.push(req.body.name); }
  if (req.body.description !== undefined) { sets.push('description = ?'); vals.push(req.body.description); }
  if (req.body.code !== undefined) { sets.push('code = ?'); vals.push(req.body.code); }
  if (req.body.entry !== undefined) { sets.push('entry = ?'); vals.push(req.body.entry); }
  if (req.body.inputSchema !== undefined) { sets.push('input_schema_json = ?'); vals.push(JSON.stringify(req.body.inputSchema)); }
  if (req.body.enabled !== undefined) { sets.push('enabled = ?'); vals.push(req.body.enabled ? 1 : 0); }
  if (req.body.timeout !== undefined) { sets.push('timeout = ?'); vals.push(req.body.timeout); }
  if (req.body.dependencies !== undefined) { sets.push('dependencies_json = ?'); vals.push(JSON.stringify(req.body.dependencies)); }
  if (req.body.isPublic !== undefined) { sets.push('is_public = ?'); vals.push(req.body.isPublic ? 1 : 0); }
  if (req.body.category !== undefined) { sets.push('category = ?'); vals.push(req.body.category || '其他'); }
  sets.push('updated_at = ?'); vals.push(Date.now());
  if (sets.length === 0) { res.json({ data: existing }); return; }
  vals.push(tid);
  db.prepare(`UPDATE custom_tool SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ data: db.prepare('SELECT * FROM custom_tool WHERE id = ?').get(tid) });
});

// DELETE /api/tools/:id
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tid = req.params.id;
  if (!db.prepare('SELECT id FROM custom_tool WHERE id = ? AND user_id = ?').get(tid, userId)) {
    res.status(404).json({ error: '工具不存在' }); return;
  }
  db.prepare('DELETE FROM custom_tool WHERE id = ?').run(tid);
  res.json({ ok: true });
});

// POST /api/tools/:id/execute — 执行自定义工具（服务端 node:vm 沙箱）
router.post('/:id/execute', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tid = req.params.id;
  const t = db.prepare('SELECT * FROM custom_tool WHERE id = ? AND user_id = ?').get(tid, userId) as any;
  if (!t) { res.status(404).json({ error: '工具不存在' }); return; }
  if (!t.enabled) { res.status(400).json({ error: '工具未启用' }); return; }
  const args = (req.body && req.body.args) || {};
  try {
    const { runInSandbox } = await import('@yan-zhi/core');
    const result = await runInSandbox(t.code, t.entry, args, { timeout: t.timeout || 30000 });
    res.json({ data: result });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '工具执行失败' });
  }
});

// GET /api/tools/builtin — 列出内置工具（含完整 inputSchema + outputSchema）
// 从 ToolRegistry 动态生成，与 packages/core 注册的内置工具自动同步，避免硬编码脱节。
router.get('/builtin', (_req: Request, res: Response) => {
  const textOut = { type: 'object', properties: { content: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, text: { type: 'string' } } } }, isError: { type: 'boolean' } } };
  const tools = getToolRegistry().list().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema || textOut,
  }));
  res.json({ data: tools });
});

// POST /api/tools/install — 从远程商城安装工具
router.post('/install', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { remoteSourceId, toolId } = req.body || {};
  if (!remoteSourceId || !toolId) { res.status(400).json({ error: 'remoteSourceId 和 toolId 为必填项' }); return; }
  const source = db.prepare('SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ?').get(remoteSourceId, userId) as any;
  if (!source) { res.status(404).json({ error: '远程源不存在' }); return; }
  const baseUrl = source.base_url.replace(/\/$/, '');
  fetch(`${baseUrl}/api/marketplace/tools/${encodeURIComponent(toolId)}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success || !data.data) throw new Error('远程工具不存在');
      const t = data.data;
      const id = uuid();
      const now = Date.now();
      db.prepare(
        `INSERT INTO custom_tool (id, user_id, name, description, category, input_schema_json, output_schema_json,
         runtime, entry, code, dependencies_json, timeout, env_json, enabled, source, remote_source_id, is_public, updated_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,'remote',?,0,?,?)`,
      ).run(id, userId, t.name, t.description || null, t.category || '其他', JSON.stringify(t.inputSchema || {}),
        t.outputSchema ? JSON.stringify(t.outputSchema) : null, t.runtime || 'node', t.entry, t.code,
        t.dependencies ? JSON.stringify(t.dependencies) : null, t.timeout || 30000, null, remoteSourceId, now, now);
      res.json({ data: db.prepare('SELECT * FROM custom_tool WHERE id = ?').get(id) });
    })
    .catch((err: Error) => res.status(500).json({ error: err.message }));
});

// POST /api/tools/ocr — 图片 OCR 文字识别（image_analyze 工具的降级路径）
// body: { image?: string(base64), path?: string, lang?: string }
// 优先 image base64，其次 path 读文件；lang 默认 chi_sim+eng（中英文）
router.post('/ocr', async (req: Request, res: Response) => {
  try {
    const { image, path: imgPath, lang } = req.body || {};
    let buffer: Buffer | null = null;
    if (typeof image === 'string' && image.length > 0) {
      buffer = Buffer.from(image, 'base64');
    } else if (typeof imgPath === 'string' && imgPath.length > 0) {
      const { readFile } = await import('node:fs/promises');
      buffer = await readFile(imgPath);
    }
    if (!buffer) {
      res.status(400).json({ error: '需提供 image(base64) 或 path 参数' });
      return;
    }
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker(lang || 'chi_sim+eng', 1, { logger: () => {} });
    try {
      const { data } = await worker.recognize(buffer);
      res.json({ data: { text: data.text || '', confidence: data.confidence } });
    } finally {
      await worker.terminate();
    }
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'OCR 识别失败' });
  }
});

export default router;
