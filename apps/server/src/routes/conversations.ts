import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db, MESSAGE_LIST_COLS, clearMessageSummaries } from '../db.js';
import { normalizePermissionMode } from '../tool-permission.js';
import { writeTaskPlanFile } from '../services/task-plan-file.js';
import { WF_TOOL_PREFIX, MAX_WF_TOOLS_PER_CONVERSATION } from '../services/workflow-tool-registry.js';
import { clearAuthorization } from '../services/path-guard.js';

const router = Router();
router.use(authMiddleware);

// GET /api/conversations[?mode=wf]
//
// mode 传了 → 只回该模式的会话（会话按模式隔离，用户拍板 2026-09-18）；
// 不传 → 回全部（管理类/统计类调用仍需要全量，不能强制过滤）。
//
// ★ 为什么过滤放在后端而不是前端：前端过滤只是"看不见"，会话仍会被其它
//   按 conversations 循环的逻辑（批量删除、导出、计数）扫到，容易出现
//   "删了别的模式的会话"这类越界操作。DB 层收口才是真隔离。
//
// 存量会话在迁移时统一归 'office'（db.ts 的 ALTER + UPDATE），
// 所以这里不需要再兜 NULL —— 若真出现 NULL，用 mode IS ? 会漏，
// 因此显式把 NULL 视为 office。
//
// ★ 任务规划是单会话的（用户拍板 2026-10-05）：这里**不再**从工作目录 plan.md
//   向无计划会话播种旧规划（原 seedPlanRows 已删）。跨会话"找到之前的任务记录"
//   由模型侧完成 —— llm-task-manager 的 loadTaskPlan 文件回退仍会把 plan.md 回注
//   进提示词，模型据此自行 task_plan **重新规划**，而不是复用旧计划对象。
const VALID_MODES = new Set(['office', 'dev', 'ops', 'sec', 'wf']);

router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const mode = typeof req.query.mode === 'string' ? req.query.mode : '';
  // 非法 mode 视为「不过滤」而不是「查不到」：前端传错值时不该让用户看到空列表
  if (mode && VALID_MODES.has(mode)) {
    const rows = db.prepare(
      `SELECT * FROM conversation
       WHERE user_id = ? AND COALESCE(NULLIF(mode, ''), 'office') = ?
       ORDER BY pinned DESC, updated_at DESC`,
    ).all(userId, mode);
    res.json({ data: rows });
    return;
  }
  const rows = db.prepare(
    'SELECT * FROM conversation WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC',
  ).all(userId);
  res.json({ data: rows });
});

// POST /api/conversations
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { title, platformId, modelId, agentId, spaceId, permissionMode, mode } = req.body || {};
  if (!title) { res.status(400).json({ error: '标题为必填项' }); return; }
  const id = uuid();
  const now = Date.now();
  // 未指定智能体时默认绑定 a_default_assistant，确保子智能体/工具挂载生效
  let resolvedAgentId = agentId || null;
  if (!resolvedAgentId) {
    const def = db.prepare("SELECT 1 FROM agent WHERE id = 'a_default_assistant' AND (user_id = ? OR is_public = 1)").get(userId);
    if (def) resolvedAgentId = 'a_default_assistant';
  }
  db.prepare(
    'INSERT INTO conversation (id, user_id, title, agent_id, platform_id, model_id, space_id, mcp_servers_json, skill_ids_json, pinned, permission_mode, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, userId, title, resolvedAgentId, platformId || null, modelId || null, spaceId || null, '[]', '[]', 0, normalizePermissionMode(permissionMode),
    // 归属模式：前端建会话时带上当前模式；缺省 office（与存量迁移口径一致）
    VALID_MODES.has(String(mode)) ? String(mode) : 'office', now, now);
  const row = db.prepare('SELECT * FROM conversation WHERE id = ?').get(id);
  res.json({ data: row });
});

// PATCH /api/conversations/:id
router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const existing = db.prepare('SELECT * FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId) as any;
  if (!existing) { res.status(404).json({ error: '会话不存在' }); return; }

  const sets: string[] = [];
  const vals: any[] = [];
  const bodyFields: Record<string, string> = { title: 'title', platformId: 'platform_id', modelId: 'model_id', systemPrompt: 'system_prompt', agentId: 'agent_id' };
  for (const [key, col] of Object.entries(bodyFields)) {
    if (req.body[key] !== undefined) { sets.push(`${col} = ?`); vals.push(req.body[key]); }
  }
  // spaceId：支持移动会话到空间（传 null/空字符串归"未归类"）
  if (req.body.spaceId !== undefined) {
    sets.push('space_id = ?');
    vals.push(req.body.spaceId || null);
  }
  // permissionMode：会话级工具权限（readonly/default/full），非法值 fail-safe 归一化为 readonly
  if (req.body.permissionMode !== undefined) {
    sets.push('permission_mode = ?');
    vals.push(normalizePermissionMode(req.body.permissionMode));
  }
  // taskPlan：任务计划落盘（task_plan/task_step 卡片刷新/换设备后恢复）。null = 清除
  // ★ 镜像写工作目录 plan.md（跨会话接力，2026-09-30）：task_plan_json 挂在会话行上，
  //   新会话读不到 —— 计划必须同时落在目录维度（与 decisions.md/progress.md 同族）。
  //   异步 fire-and-forget：文件写入失败不影响 PATCH 本身（fail-safe）。
  if (req.body.taskPlan !== undefined) {
    let planForFile: any = null;
    if (req.body.taskPlan === null) {
      sets.push('task_plan_json = ?'); vals.push(null);
      planForFile = null;
    } else if (req.body.taskPlan && typeof req.body.taskPlan === 'object' && Array.isArray(req.body.taskPlan.steps)) {
      const json = JSON.stringify(req.body.taskPlan);
      sets.push('task_plan_json = ?'); vals.push(json);
      planForFile = req.body.taskPlan;
    }
    if (planForFile !== undefined) {
      const planSnapshot = planForFile;
      const cidForFile = cid;
      void writeTaskPlanFile(cidForFile, planSnapshot).catch(() => { /* 已在 writeTaskPlanFile 内 fail-safe */ });
    }
  }
  if (req.body.mcpServerIds !== undefined || req.body.mcpDisabledTools !== undefined) {
    const serverIds = req.body.mcpServerIds ?? (() => {
      try { const parsed = JSON.parse(existing.mcp_servers_json || '[]'); return Array.isArray(parsed) ? (typeof parsed[0] === 'string' ? parsed : parsed.map((x: any) => x.serverId || x.id || '').filter(Boolean)) : []; }
      catch { return []; } 
    })();
    const disabled = req.body.mcpDisabledTools || {};
    const serversJson = serverIds.map((sid: string) => ({
      serverId: sid,
      disabledTools: disabled[sid] || [],
    }));
    sets.push('mcp_servers_json = ?'); vals.push(JSON.stringify(serversJson));
  }
  if (req.body.skillIds !== undefined) { sets.push('skill_ids_json = ?'); vals.push(JSON.stringify(req.body.skillIds)); }
  // 会话级自定义工具挂载。
  // ★ 为什么必须在这里支持（2026-09-29 自检发现）：`api_conversation_setup` 能写
  //   `custom_tool_ids_json`，但**前端 PATCH 会话时没有对应字段** → 前端那套
  //   `getMergedMounts().customToolIds` 合并逻辑算出来的结果**存不进去**，属于半套实现。
  //   补上后"模型造工具→挂到当前会话"与"用户在 UI 改挂载"走同一条落库路径。
  if (req.body.customToolIds !== undefined) {
    const ids: unknown = req.body.customToolIds;
    sets.push('custom_tool_ids_json = ?');
    vals.push(JSON.stringify(Array.isArray(ids) ? ids.map(String) : []));
  }
  if (req.body.builtinToolIds !== undefined) {
    // 工作流工具（wf_*）挂载上限校验。
    // 为什么要有上限：每个 wf_* 工具都带完整参数 schema，挂太多会占满上下文、
    // 且模型在十几个相似流水线里选择时准确率明显下降。超出直接拒绝并说明，不静默截断。
    const ids: unknown = req.body.builtinToolIds;
    if (Array.isArray(ids)) {
      const wfIds = ids.filter((x) => typeof x === 'string' && x.startsWith(WF_TOOL_PREFIX));
      if (wfIds.length > MAX_WF_TOOLS_PER_CONVERSATION) {
        res.status(400).json({
          error: `一次最多挂载 ${MAX_WF_TOOLS_PER_CONVERSATION} 个工作流（当前 ${wfIds.length} 个）—— 挂太多会让模型难以选择`,
        });
        return;
      }
    }
    sets.push('builtin_tool_ids_json = ?'); vals.push(JSON.stringify(ids));
  }
  if (req.body.pinned !== undefined) { sets.push('pinned = ?'); vals.push(req.body.pinned ? 1 : 0); }
  if (sets.length === 0) { res.json({ data: existing }); return; }

  sets.push('updated_at = ?'); vals.push(Date.now());
  vals.push(cid);
  db.prepare(`UPDATE conversation SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM conversation WHERE id = ?').get(cid);
  res.json({ data: row });
});

// DELETE /api/conversations/:id
// DELETE /api/conversations/clear —— 批量清空当前用户全部会话与消息（设置页「清空缓存」用）
router.delete('/clear', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ids = db.prepare('SELECT id FROM conversation WHERE user_id = ?').all(userId) as any[];
  const clear = () => {
    for (const c of ids) db.prepare('DELETE FROM message WHERE conversation_id = ?').run(c.id);
    db.prepare('DELETE FROM conversation WHERE user_id = ?').run(userId);
  };
  db.transaction(clear)();
  res.json({ ok: true, cleared: ids.length });
});

router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const existing = db.prepare('SELECT * FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId);
  if (!existing) { res.status(404).json({ error: '会话不存在' }); return; }
  db.prepare('DELETE FROM message WHERE conversation_id = ?').run(cid);
  // ★ 压缩摘要随会话一起清（2026-10-03）：message_summary 是 message 的派生物，
  //   会话删了却留下摘要行 = 孤儿数据（且会用同一个 conversation_id 在下条同 id 会话里被读到）。
  //   ★ 同理清内存里的越界授权白名单（path-guard 的会话级状态），否则删会话后残留一小块内存。
  //   两处都是「新增了带 conversation_id 的状态，却没在删除路径上一起收」——同一类漏接线。
  clearMessageSummaries(cid);
  clearAuthorization(cid);
  db.prepare('DELETE FROM conversation WHERE id = ?').run(cid);
  res.json({ ok: true });
});

// GET /api/conversations/:id/messages
// 历史会话还原接口：不携带 system_prompt_snapshot（快照可能很大，且只有查看提示词时才需要）。
// 需要快照时走独立按需接口 GET /api/messages/:mid/snapshot。
// ★ 列清单统一取自 db.ts:MESSAGE_LIST_COLS —— 与 llm-task-manager 的 ReAct 热路径**共用同一常量**，
//   避免"同一语义两处各写一份"的漂移（本项目既有教训）。
router.get('/:id/messages', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId);
  if (!conv) { res.status(404).json({ error: '会话不存在' }); return; }
  const rows = db.prepare(`SELECT ${MESSAGE_LIST_COLS} FROM message WHERE conversation_id = ? ORDER BY created_at ASC`).all(cid);
  res.json({ data: rows });
});

// POST /api/conversations/:id/messages
router.post('/:id/messages', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId);
  if (!conv) { res.status(404).json({ error: '会话不存在' }); return; }
  const { role, content, toolCalls, toolCallId, reasoningContent, tokens, systemPromptSnapshot,
    parentToolCallId, subAgentId, subAgentName, subAgentDepth } = req.body || {};
  if (!role) { res.status(400).json({ error: 'role 为必填项' }); return; }

  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO message (id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, system_prompt_snapshot, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, cid, userId, role, content || null, toolCalls ? JSON.stringify(toolCalls) : null,
    toolCallId || null, reasoningContent || null, systemPromptSnapshot || null, tokens || 0,
    parentToolCallId || null, subAgentId || null, subAgentName || null, subAgentDepth ?? null, now);
  db.prepare('UPDATE conversation SET updated_at = ? WHERE id = ?').run(now, cid);
  const row = db.prepare('SELECT * FROM message WHERE id = ?').get(id);
  res.json({ data: row });
});

export default router;
