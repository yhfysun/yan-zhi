import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db, MESSAGE_LIST_COLS, listMessageSummaries, deleteMessageSummariesAfter } from '../db.js';
// ★ 归档 / 回收站：所有涉及到「会话在不在列表里」与「真删」的活都在这一个出口里，
//   本文件不再手写 DELETE FROM conversation（清理清单随派生表增长，散写必然漏）。
import {
  parseScope, lifecycleClause, hardDeleteRow, softDeleteRow, restoreRow, setArchivedRow, emptyTrash,
  writableGuard, archiveAllInSpace,
} from '../services/conversation-lifecycle.js';
import { normalizePermissionMode } from '../tool-permission.js';
import { writeTaskPlanFile } from '../services/task-plan-file.js';
import { WF_TOOL_PREFIX, MAX_WF_TOOLS_PER_CONVERSATION } from '../services/workflow-tool-registry.js';
import { buildSystemPromptForBackend, buildToolsForBackend, setRunningTaskPermissionMode, compressConversationNow } from '../llm-task-manager.js';
import { estimateTokens } from '@yan-zhi/shared';

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
// ★ 'clip'（剪辑模式）必须在内：漏掉时 POST 会把 mode='clip' 静默落成 'office'，
//   于是剪辑任务在剪辑模式列表里**看不到**（按 mode 过滤为空），
//   却混进办公模式的列表（真实缺陷，靠 CDP 真跑才发现）。
// ★ 2026-10-16 douyin 模式下线（与 office 同形态的重复模式），故从白名单移除。
//   移除**必须**与 db.ts 的存量迁移成对：白名单删掉而库里仍有 mode='douyin' 的行时，
//   那些行在过滤条件 `... = ?` 下**任何模式都匹配不到** → 会话从列表里消失且不报错。
// ★ 会话生命周期（归档 / 回收站，2026-10-16）：
//   scope=active（默认，也是唯一给主列表用的）/ archived / trashed / all。
//   过滤照旧放在 DB 层（理由同上）：归档与回收站会话**绝不能**出现在主列表响应里，
//   否则批量删除、导出、计数这些「扫全量」的逻辑会连带处理用户认为已经被收起来的会话。
const VALID_MODES = new Set(['office', 'dev', 'ops', 'sec', 'wf', 'clip']);

router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const mode = typeof req.query.mode === 'string' ? req.query.mode : '';
  const life = lifecycleClause(parseScope(req.query.scope));
  // 非法 mode 视为「不过滤」而不是「查不到」：前端传错值时不该让用户看到空列表
  if (mode && VALID_MODES.has(mode)) {
    const rows = db.prepare(
      `SELECT * FROM conversation
       WHERE user_id = ? AND COALESCE(NULLIF(mode, ''), 'office') = ? AND ${life}
       ORDER BY pinned DESC, updated_at DESC`,
    ).all(userId, mode);
    res.json({ data: rows });
    return;
  }
  const rows = db.prepare(
    `SELECT * FROM conversation WHERE user_id = ? AND ${life} ORDER BY pinned DESC, updated_at DESC`,
  ).all(userId);
  res.json({ data: rows });
});

// GET /api/conversations/counts —— 侧栏「已归档 / 回收站」角标。
// ★ 单独给计数而不是让前端囤全量再算：主列表默认只拉 active，前端拿不到另外两类。
// ★ 必须在 /:id 之前注册，否则会被当成会话 id。
router.get('/counts', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const row = db.prepare(
    `SELECT
       SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS trashed,
       SUM(CASE WHEN deleted_at IS NULL AND archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived
     FROM conversation WHERE user_id = ?`,
  ).get(userId) as any;
  res.json({ data: { archived: Number(row?.archived || 0), trashed: Number(row?.trashed || 0) } });
});

// POST /api/conversations/archive-all —— 一键归档某空间下的全部 active 会话（侧栏空间右键菜单）。
// ★ 必须注册在 /:id 参数路由之前，否则 'archive-all' 会被当成会话 id。
// ★ 单条 SQL 批量，不让前端 N 次循环调 POST /:id/archive（慢且中途失败会出现半归档状态）。
//   只动 active：已归档的保持原归档时间，回收站的不碰（等用户在回收站里决定去留）。
router.post('/archive-all', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const spaceId = String(req.body?.spaceId || '');
  if (!spaceId) { res.status(400).json({ error: 'spaceId 为必填项' }); return; }
  const n = archiveAllInSpace(userId, spaceId);
  res.json({ data: { archived: n } });
});

// POST /api/conversations
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { title, platformId, modelId, agentId, spaceId, permissionMode, mode, taskType } = req.body || {};
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
    'INSERT INTO conversation (id, user_id, title, agent_id, platform_id, model_id, space_id, mcp_servers_json, skill_ids_json, pinned, permission_mode, mode, task_type, title_source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, userId, title, resolvedAgentId, platformId || null, modelId || null, spaceId || null, '[]', '[]', 0, normalizePermissionMode(permissionMode),
    // 归属模式：前端建会话时带上当前模式；缺省 office（与存量迁移口径一致）
    VALID_MODES.has(String(mode)) ? String(mode) : 'office',
    // 任务级任务类型（2026-10-14「父任务」层）：多任务目录里本条任务选中的子线；
    // 空 = 跟随目录（space.task_type）。父类型也允许落在会话上（选线前的占位由注入侧兜）。
    taskType ? String(taskType) : null,
    // 标题来源：新建一律 'auto'（首个任务 completed 时允许 LLM 生成标题覆盖一次；见 services/conversation-title.ts）
    'auto', now, now);
  const row = db.prepare('SELECT * FROM conversation WHERE id = ?').get(id);
  res.json({ data: row });
});

// PATCH /api/conversations/:id
router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const existing = db.prepare('SELECT * FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId) as any;
  if (!existing) { res.status(404).json({ error: '会话不存在' }); return; }

  // ★ 归档 = 完全只读（对齐 ChatGPT / Claude / WorkBuddy 的稳定语义：归档后不可改名、
  //   不可换模型、不可挪空间，要改先取消归档 —— 没有任何特例）。
  //   此前留了「仅改名放行」的口子，那是我自己发明的语义，业界没有这种组合。
  //   回收站内的会话对外不可见，一律 404。
  const guard = writableGuard(cid, userId);
  if (guard === 'not_found' || guard === 'trashed') { res.status(404).json({ error: '会话不存在' }); return; }
  if (guard === 'archived') {
    res.status(409).json({ error: 'CONVERSATION_ARCHIVED', message: '会话已归档（只读），取消归档后才能修改' });
    return;
  }

  const sets: string[] = [];
  const vals: any[] = [];
  const bodyFields: Record<string, string> = { title: 'title', platformId: 'platform_id', modelId: 'model_id', systemPrompt: 'system_prompt', agentId: 'agent_id' };
  for (const [key, col] of Object.entries(bodyFields)) {
    if (req.body[key] !== undefined) { sets.push(`${col} = ?`); vals.push(req.body[key]); }
  }
  // taskType：任务级任务类型（「父任务」层：多任务目录里给本条任务换一条子线）。
  //   传 null/空串 = 清掉，回落到跟随目录（space.task_type）。
  //   ★ 实时生效靠注入侧每次读库（llm-task-manager 取 conversation.task_type ?? space.task_type），
  //     这里只落库，不复制一份到内存 —— 两处各存一份必然漂移。
  if (req.body.taskType !== undefined) {
    sets.push('task_type = ?');
    vals.push(req.body.taskType ? String(req.body.taskType) : null);
  }
  // ★ 标题来源收口（2026-10-11）：只要本次 PATCH 带了 title，就一律视为用户手动改名
  //   → title_source 强制置 'user'（LLM 自动生成的标题是 title_source='auto'/'llm' 行，
  //   永不会再被服务端生成逻辑覆盖）。前端无需感知该字段，服务端收口防伪造。
  if (req.body.title !== undefined) { sets.push('title_source = ?'); vals.push('user'); }
  // spaceId：支持移动会话到空间（传 null/空字符串归"未归类"）
  if (req.body.spaceId !== undefined) {
    sets.push('space_id = ?');
    vals.push(req.body.spaceId || null);
  }
  // permissionMode：会话级工具权限（readonly/default/full），非法值 fail-safe 归一化为 readonly
  if (req.body.permissionMode !== undefined) {
    const nextMode = normalizePermissionMode(req.body.permissionMode);
    sets.push('permission_mode = ?');
    vals.push(nextMode);
    // ★ 实时生效（2026-10-06）：同会话 running 任务立即按新模式运行时拦截
    setRunningTaskPermissionMode(cid, nextMode);
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

// DELETE /api/conversations/clear —— 设置页「清空缓存」。
//
// ★ 2026-10-16 语义变更（原实现是**永久删除全部会话及其消息**，和用户心里
//   「清空列表」的预期不符：一旦点了，包括刚归档的重要会话在内全部不可恢复）。
//   现在改为「全部会话移入回收站」——列表照样清空，但随时能从回收站整体还原。
//   真要永久抹掉请走 DELETE /trash（清空回收站）。
router.delete('/clear', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const r = db.prepare(
    'UPDATE conversation SET deleted_at = ? WHERE user_id = ? AND deleted_at IS NULL',
  ).run(Date.now(), userId);
  res.json({ ok: true, moved: r.changes, trashed: true });
});

// DELETE /api/conversations/trash —— 永久清空回收站（不可恢复，前端必须二次确认）
router.delete('/trash', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const n = emptyTrash(userId);
  res.json({ ok: true, removed: n });
});

// POST /api/conversations/:id/restore —— 从回收站恢复
router.post('/:id/restore', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  if (!restoreRow(cid, userId)) { res.status(404).json({ error: '会话不存在或不在回收站' }); return; }
  res.json({ ok: true });
});

// POST /api/conversations/:id/archive —— 归档（可逆，数据全留，会话变只读）
// body.archived=false 即取消归档（同一个端点两个方向，避免两个端点两处漂移）
router.post('/:id/archive', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const archived = req.body?.archived !== false;
  if (!setArchivedRow(cid, userId, archived)) {
    res.status(404).json({ error: '会话不存在、或在回收站里（回收站内的会话请先恢复）' });
    return;
  }
  res.json({ ok: true, archived });
});

router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const existing = db.prepare('SELECT * FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId) as any;
  if (!existing) { res.status(404).json({ error: '会话不存在' }); return; }
  // 已在回收站 ⇒ 这条就是「永久删除」（与回收站里的永久删除同一语义，走同一出口）
  if (existing.deleted_at) { hardDeleteRow(cid); res.json({ ok: true, permanent: true }); return; }
  if (!softDeleteRow(cid, userId)) { res.status(404).json({ error: '会话不存在' }); return; }
  res.json({ ok: true, trashed: true });
});

// DELETE /api/conversations/:id/permanent —— 显式永久删除（绕过回收站，前端需二次确认）
router.delete('/:id/permanent', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const existing = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId);
  if (!existing) { res.status(404).json({ error: '会话不存在' }); return; }
  hardDeleteRow(cid);
  res.json({ ok: true, permanent: true });
});

// GET /api/conversations/:id/messages
// 历史会话还原接口：不携带 system_prompt_snapshot（快照可能很大，且只有查看提示词时才需要）。
// 需要快照时走独立按需接口 GET /api/messages/:mid/snapshot。
// ★ 列清单统一取自 db.ts:MESSAGE_LIST_COLS —— 与 llm-task-manager 的 ReAct 热路径**共用同一常量**，
//   避免"同一语义两处各写一份"的漂移（本项目既有教训）。
// ── ★★★ 压缩历史（D8，2026-10-09）─────────────────────────────────────────
// 压缩是**增量累积**的（新摘要吸收旧摘要），但读取只认**最新一条** →
// "压了什么、压到第几轮"对用户完全不可见（只看到一个"已压缩 N 次"计数）。
// `insertMessageSummary` 注释写着"追加不覆盖，保留历史以便回滚/审计"，
// 而 `deleteMessageSummariesAfter`（回滚）**生产零调用** —— 存了历史却没有读的出口。
// 这两条路由补上那个出口：列历史 + 回退到某个压缩点（**原文一字未动**，非破坏性）。

// ── ★★★ 手动压缩（D3-转，2026-10-10）───────────────────────────────────────
// POST /api/conversations/:id/compact —— 用户主动「现在压一下」。
// ★ 与自动压缩**同一条流水线**（`buildContextView` + `forceCompress`），
//   不另写压缩实现；摘要仍落 `message_summary`（可在压缩历史里看到、可回退）。
// ★ 返回压缩后的统计供前端回显（压了多少条 / 摘要预览）。
router.post('/:id/compact', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId);
  if (!conv) { res.status(404).json({ error: '会话不存在' }); return; }
  // ★ 拒绝在任务运行中手动压缩：压缩会写 message_summary，与主循环每步的压缩并发会互相干扰。
  //   （用户想压时任务通常是空闲态；正在跑的任务本就由自动压缩覆盖。）
  const running = (() => {
    try {
      const rows = db.prepare('SELECT status FROM conversation WHERE id = ?').get(cid) as any;
      return rows?.status === 'running';
    } catch { return false; }
  })();
  if (running) { res.status(409).json({ error: '任务正在运行中，无需手动压缩（自动压缩已覆盖）；请等空闲后再试' }); return; }
  try {
    const r = await compressConversationNow(cid, userId);
    if (!r.ok) { res.status(400).json({ error: r.error || '压缩失败' }); return; }
    res.json({ data: { compacted: !!r.compacted, coveredCount: r.coveredCount || 0, summaryPreview: (r.summary || '').slice(0, 200) } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '压缩失败' });
  }
});

// GET /api/conversations/:id/summaries —— 列出压缩历史（新→旧，最多 20 条）
router.get('/:id/summaries', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId);
  if (!conv) { res.status(404).json({ error: '会话不存在' }); return; }
  const items = listMessageSummaries(cid, 20).map((s) => ({
    id: s.id,
    // 不返回摘要全文（可能很长）：给前 200 字预览 + 覆盖的消息条数
    preview: s.summary.slice(0, 200),
    coveredCount: s.messageIds.length,
    tokens: s.tokens,
    createdAt: s.createdAt,
    // 是否**当前生效**（读取路径只认最新一条）
    active: false,
  }));
  if (items.length) items[0].active = true;
  res.json({ items, total: items.length });
});

// POST /api/conversations/:id/summaries/:summaryId/rollback —— 回退到该压缩点（保留该条，删其之后）
// ★ 非破坏性：只删 message_summary 行，**message 表一字未动** → 原文始终完整。
//   回退后该条成为"最新"，下一轮上下文按它重建（等价于"回到那次压缩的状态"）。
router.post('/:id/summaries/:summaryId/rollback', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId);
  if (!conv) { res.status(404).json({ error: '会话不存在' }); return; }
  const sid = req.params.summaryId;
  // 先校验该摘要确属本会话（避免跨会话误删）—— deleteMessageSummariesAfter 内部也会校验，
  // 但这里显式查一次以便给出明确错误（否则"删了 0 条"分不清是"不存在"还是"已是最新"）。
  const exists = listMessageSummaries(cid, 100).some((s) => s.id === sid);
  if (!exists) { res.status(404).json({ error: '该压缩记录不存在或不属于本会话' }); return; }
  const removed = deleteMessageSummariesAfter(cid, sid);
  res.json({ ok: true, removed, note: '已回退压缩记录（对话原文未改动，下一轮按该压缩点重建上下文）' });
});

// GET /api/conversations/:id/context-breakdown?agentId=
// 上下文分段估算（2026-10-06，对齐 WorkBuddy 同款分类）：系统级提示 / 工具定义与描述 /
// 技能级 MCP / 对话内容。全部为 estimateTokens 估算值（与前端 tokenCount 同口径，非 API 精确值）。
// skill 子目录文件不计入（按需 file_read，不占常驻上下文）。
router.get('/:id/context-breakdown', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const conv = db.prepare('SELECT agent_id FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId) as any;
  if (!conv) { res.status(404).json({ error: '会话不存在' }); return; }
  const agentId = (typeof req.query.agentId === 'string' && req.query.agentId) || conv.agent_id || null;
  try {
    // 系统级提示：agent 提示词 + skills 流程指引 + 子智能体清单 + 应用指引等（不含工具 schema）
    const systemPrompt = buildSystemPromptForBackend(agentId, userId, undefined, { conversationId: cid });
    const system = estimateTokens(systemPrompt);
    // 工具定义与描述：模型真正看到的工具面（含 schema）；MCP 工具单独拆「技能级 MCP」
    const tools = buildToolsForBackend(agentId, userId, { conversationId: cid }) as any[];
    let toolsTokens = 0;
    let mcpTokens = 0;
    for (const t of tools || []) {
      const est = estimateTokens(JSON.stringify(t));
      const name = String(t?.function?.name || t?.name || '');
      if (name.startsWith('mcp_')) mcpTokens += est;
      else toolsTokens += est;
    }
    // Skill 流程指引（挂载 skill 的截断 body）：系统提示的组成部分，单独拆「Skill」类
    let skillTokens = 0;
    try {
      const ids = new Set<string>();
      const agentRow = agentId ? (db.prepare('SELECT skill_ids FROM agent WHERE id = ?').get(agentId) as any) : null;
      const convRow = db.prepare('SELECT skill_ids_json FROM conversation WHERE id = ?').get(cid) as any;
      try { for (const x of JSON.parse(convRow?.skill_ids_json || '[]')) ids.add(String(x)); } catch { /* 无挂载 */ }
      try { for (const x of JSON.parse(agentRow?.skill_ids || '[]')) ids.add(String(x)); } catch { /* 无挂载 */ }
      for (const sid of ids) {
        const sk = db.prepare('SELECT body, enabled FROM skill WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(sid, userId) as any;
        if (!sk?.enabled) continue;
        // 与注入口径一致：truncateSkillBody 截断 2000 字 + 参考资料指针
        skillTokens += estimateTokens((sk.body || '').slice(0, 2400));
      }
    } catch { /* 估算失败不计入 */ }
    // 对话内容：历史消息正文 + 推理
    const rows = db.prepare('SELECT content, reasoning_content FROM message WHERE conversation_id = ?').all(cid) as any[];
    let messages = 0;
    for (const r of rows) messages += estimateTokens(r?.content || '') + estimateTokens(r?.reasoning_content || '');
    res.json({ data: { system, tools: toolsTokens, mcp: mcpTokens, skill: skillTokens, messages } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '上下文分段计算失败' });
  }
});

// GET /api/conversations/:id/messages
// 分页协议（2026-10-11，为解决 403 条消息全量拉取导致渲染主线程饱和）：
//   - 不带参数：全量返回（旧行为，向后兼容，老调用方不受影响）
//   - 带 limit：返回**最新** limit 条（ASC 排列），附 hasMore / oldestCursor
//   - limit + before + beforeId：向前翻页，取 (created_at, id) 组合游标**之前**的一页
//     ★ 游标必须是组合键：流式批量插入同毫秒多条消息常见，单时间戳游标会漏消息
//   - 排序统一 created_at ASC, id ASC（确定性次序，同毫秒内按 id 稳定，游标才能对齐）
router.get('/:id/messages', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId);
  if (!conv) { res.status(404).json({ error: '会话不存在' }); return; }

  const limitRaw = req.query.limit;
  if (limitRaw === undefined) {
    const rows = db.prepare(
      `SELECT ${MESSAGE_LIST_COLS} FROM message WHERE conversation_id = ? ORDER BY created_at ASC, id ASC`,
    ).all(cid);
    res.json({ data: rows });
    return;
  }

  const limit = Number(limitRaw);
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    res.status(400).json({ error: 'limit 必须是 1-500 的整数' });
    return;
  }

  const before = req.query.before !== undefined ? Number(req.query.before) : null;
  const beforeId = typeof req.query.beforeId === 'string' ? req.query.beforeId : null;
  if (before !== null && (!Number.isFinite(before) || !Number.isInteger(before))) {
    res.status(400).json({ error: 'before 必须是毫秒时间戳整数' });
    return;
  }
  if ((before === null) !== (beforeId === null)) {
    res.status(400).json({ error: 'before 与 beforeId 必须成对提供' });
    return;
  }

  // 多取一条判断 hasMore，避免额外 COUNT 查询
  const fetchLimit = limit + 1;
  let rows: any[];
  if (before !== null && beforeId) {
    rows = db.prepare(
      `SELECT ${MESSAGE_LIST_COLS} FROM message
       WHERE conversation_id = ?
         AND (created_at < ? OR (created_at = ? AND id < ?))
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).all(cid, before, before, beforeId, fetchLimit);
  } else {
    rows = db.prepare(
      `SELECT ${MESSAGE_LIST_COLS} FROM message WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).all(cid, fetchLimit);
  }

  const hasMore = rows.length > limit;
  if (hasMore) rows = rows.slice(0, limit);
  // DESC 取页后反转回 ASC，调用方拿到的顺序与全量接口一致
  rows.reverse();

  const oldest = rows.length > 0 ? rows[0] : null;
  res.json({
    data: rows,
    hasMore,
    oldestCursor: oldest ? { createdAt: oldest.created_at, id: oldest.id } : null,
  });
});

// POST /api/conversations/:id/messages
router.post('/:id/messages', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  // ★ 同时读生命周期列：归档会话是**只读**的（2026-10-16 决策，对齐 ChatGPT /
  //   Anthropic Agent SDK 的 archive 语义）。前端禁用输入框只是第一道，这里必须真拦 ——
  //   否则任何绕过前端的写入（旧页面、脚本、模型自己）都能往归档会话里灌消息。
  const conv = db.prepare('SELECT id, archived_at, deleted_at FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId) as any;
  if (!conv) { res.status(404).json({ error: '会话不存在' }); return; }
  if (conv.deleted_at) { res.status(409).json({ error: '会话已在回收站', code: 'CONVERSATION_TRASHED' }); return; }
  const { role, content, toolCalls, toolCallId, reasoningContent, tokens, systemPromptSnapshot,
    parentToolCallId, subAgentId, subAgentName, subAgentDepth } = req.body || {};
  if (!role) { res.status(400).json({ error: 'role 为必填项' }); return; }
  // 只拦「用户开口」这一类：assistant / tool 回执仍要允许落库 —— 任务跑到一半被归档时，
  // 后台还在补录回复，拦了会把一段对话劈成"有问无答"。
  if (conv.archived_at && role === 'user') {
    res.status(409).json({ error: '该会话已归档，恢复后才能继续对话', code: 'CONVERSATION_ARCHIVED' });
    return;
  }

  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO message (id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, system_prompt_snapshot, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, cid, userId, role, content || null, toolCalls ? JSON.stringify(toolCalls) : null,
    toolCallId || null, reasoningContent || null, systemPromptSnapshot || null, tokens || 0,
    parentToolCallId || null, subAgentId || null, subAgentName || null, subAgentDepth ?? null, now);
  // ★ last_activity_at 与 updated_at 分开：前者表示"真实对话活动"（自动归档的判据），
  //   后者只是排序用。若将来给 PATCH 补刷 updated_at，用 updated_at 会让"改个名也算活跃"。
  db.prepare('UPDATE conversation SET updated_at = ?, last_activity_at = ? WHERE id = ?').run(now, now, cid);
  const row = db.prepare('SELECT * FROM message WHERE id = ?').get(id);
  res.json({ data: row });
});

export default router;
