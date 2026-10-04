// 用户工具钩子 CRUD（P2-7 P2a）—— 设置页管理 deny/confirm 规则。
// 鉴权与归属口径与 scheduled-tasks 相同：authMiddleware + 全部按 user_id 过滤。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { createUserHook, deleteUserHook, listUserHooks, updateUserHook, validateUserHook } from '../services/user-hooks.js';

const router = Router();
router.use(authMiddleware);

// GET /api/user-hooks —— 当前用户的规则列表
router.get('/', (req: Request, res: Response) => {
  res.json({ data: listUserHooks(req.user!.userId) });
});

// POST /api/user-hooks —— 新建
router.post('/', (req: Request, res: Response) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const invalid = validateUserHook(body);
  if (invalid) return res.status(400).json({ error: invalid });
  const action = body.action === 'confirm' ? 'confirm' : 'deny';
  const hook = createUserHook(req.user!.userId, {
    name: String(body.name),
    tool: String(body.tool ?? '*'),
    pattern: typeof body.pattern === 'string' && body.pattern.trim() ? body.pattern.trim() : null,
    action,
    enabled: body.enabled !== false,
  });
  res.json({ data: hook });
});

// PUT /api/user-hooks/:id —— 更新（名称/工具/匹配串/动作/启停）
router.put('/:id', (req: Request, res: Response) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const merged = {
    name: body.name,
    tool: body.tool,
    pattern: body.pattern,
    action: body.action,
  };
  // 局部更新时用现值补全校验（避免 PUT 只改 enabled 却被校验卡住）
  const existing = listUserHooks(req.user!.userId).find((h) => h.id === req.params.id);
  if (!existing) return res.status(404).json({ error: '规则不存在' });
  const invalid = validateUserHook({
    name: merged.name ?? existing.name,
    tool: merged.tool ?? existing.tool,
    action: merged.action ?? existing.action,
    pattern: merged.pattern ?? existing.pattern,
  });
  if (invalid) return res.status(400).json({ error: invalid });
  const hook = updateUserHook(req.user!.userId, req.params.id, {
    name: body.name !== undefined ? String(body.name) : undefined,
    tool: body.tool !== undefined ? String(body.tool) : undefined,
    pattern: body.pattern !== undefined ? (typeof body.pattern === 'string' && body.pattern.trim() ? body.pattern.trim() : null) : undefined,
    action: body.action !== undefined ? (body.action === 'confirm' ? 'confirm' : 'deny') : undefined,
    enabled: body.enabled !== undefined ? !!body.enabled : undefined,
  });
  if (!hook) return res.status(404).json({ error: '规则不存在' });
  res.json({ data: hook });
});

// DELETE /api/user-hooks/:id
router.delete('/:id', (req: Request, res: Response) => {
  const ok = deleteUserHook(req.user!.userId, req.params.id);
  if (!ok) return res.status(404).json({ error: '规则不存在' });
  res.json({ ok: true });
});

export default router;
