// 发布队列路由 —— 模型入队的内容在这里人工确认（2026-10-17 合规设计：模型只入队，发布必须人工点头）
import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { buildSystemPromptForBackend, buildToolsForBackend, createTask } from '../llm-task-manager.js';
import { resolveFirstModel } from '../services/model-pools.js';
import { TOKEN_DEAD_PLATFORM_IDS_SQL } from '../services/token-pool.js';

const router = Router();
router.use(authMiddleware);

/** 平台形态 → 派发指令里的动作提示（与 llm-task-manager 的 PUBLISH_PLATFORM_KINDS 同口径） */
const PLATFORM_KIND_HINTS: Record<string, string> = {
  douyin: '短视频（创作者中心上传页）', xiaohongshu: '图文笔记（创作者中心发布页）',
  bilibili: '视频（创作者中心投稿页）', wechat: '公众号文章（图文编辑器）',
  csdn: '技术文章（创作中心 Markdown 编辑器，把正文以 Markdown 粘贴导入）',
  juejin: '技术文章（创作中心 Markdown 编辑器，把正文以 Markdown 粘贴导入）',
  zhihu: '专栏文章（富文本编辑器）',
};

const VALID_STATUS = new Set(['pending', 'approved', 'rejected', 'published']);

function rowToItem(r: any) {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    platform: r.platform,
    title: r.title,
    content: r.content,
    mediaPaths: (() => { try { return r.media_paths_json ? JSON.parse(r.media_paths_json) : []; } catch { return []; } })(),
    tags: r.tags,
    status: r.status,
    note: r.note,
    collection: r.collection,
    stats: (() => { try { return r.stats_json ? JSON.parse(r.stats_json) : null; } catch { return null; } })(),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
  };
}

// GET /api/publish-queue?status=pending  队列列表（缺省全部，前端按状态分组）
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const conds: string[] = ['user_id = ?'];
  const params: unknown[] = [userId];
  if (status && VALID_STATUS.has(status)) {
    conds.push('status = ?');
    params.push(status);
  }
  const rows = db.prepare(
    `SELECT * FROM publish_queue WHERE ${conds.join(' AND ')} ORDER BY updated_at DESC LIMIT 200`,
  ).all(...params);
  res.json({ data: rows.map(rowToItem) });
});

// GET /api/publish-queue/counts  角标：待确认数量
router.get('/counts', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const row = db.prepare(
    `SELECT SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved
     FROM publish_queue WHERE user_id = ?`,
  ).get(userId) as any;
  res.json({ data: { pending: Number(row?.pending || 0), approved: Number(row?.approved || 0) } });
});

// POST /api/publish-queue  手动补一条（可选；主入口是模型 publish_enqueue 工具）
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { conversationId, platform, title, content, mediaPaths, tags } = req.body || {};
  if (!platform || !title) { res.status(400).json({ error: 'platform/title 为必填项' }); return; }
  const id = uuid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO publish_queue (id, user_id, conversation_id, platform, title, content, media_paths_json, tags, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).run(id, userId, conversationId || null, String(platform), String(title),
    typeof content === 'string' ? content : '',
    Array.isArray(mediaPaths) && mediaPaths.length ? JSON.stringify(mediaPaths.map(String)) : null,
    typeof tags === 'string' ? tags : '', now, now);
  const row = db.prepare('SELECT * FROM publish_queue WHERE id = ?').get(id);
  res.json({ data: rowToItem(row) });
});

// POST /api/publish-queue/:id/status  状态流转（confirm→approved / reject→rejected / markPublished→published / backToPending）
router.post('/:id/status', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = req.params.id;
  const action = String(req.body?.action || '');
  const map: Record<string, { status: string; published?: number | null }> = {
    confirm: { status: 'approved' },
    reject: { status: 'rejected' },
    backToPending: { status: 'pending', published: null },
    markPublished: { status: 'published', published: Date.now() },
  };
  const next = map[action];
  if (!next) { res.status(400).json({ error: `action 必须是 ${Object.keys(map).join(' / ')} 之一` }); return; }
  const row = db.prepare('SELECT * FROM publish_queue WHERE id = ? AND user_id = ?').get(id, userId) as any;
  if (!row) { res.status(404).json({ error: '队列条目不存在' }); return; }
  // 流转合法性：published 是终态（可回退重发）；rejected 只能回 pending 重来
  if (row.status === 'published' && action !== 'backToPending') {
    res.status(409).json({ error: '该条目已发布，如需重新发布请先「撤回待确认」' }); return;
  }
  db.prepare('UPDATE publish_queue SET status = ?, published_at = ?, note = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(next.status, next.published !== undefined ? next.published : row.published_at,
      typeof req.body?.note === 'string' ? req.body.note : row.note, Date.now(), id, userId);
  const updated = db.prepare('SELECT * FROM publish_queue WHERE id = ?').get(id);
  res.json({ data: rowToItem(updated) });
});

// POST /api/publish-queue/:id/dispatch  派发发布任务（P2 发布执行闭环）
// 前置：条目必须已确认（approved）—— 派发即用户的"人工点头"动作本身在 confirm 步发生。
// 做法：建一个绑定言智代言官的顶层会话+任务（复用 app-as-tool 链路，与手动建任务完全同构），
// 指令自包含（平台/媒体/标题/正文/标签/队列 ID），由它委派 pageAgent 实际执行平台发布；
// 完成后发布任务用 publish_mark_published 回写状态。条目保持 approved（终态由回写驱动）。
router.post('/:id/dispatch', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM publish_queue WHERE id = ? AND user_id = ?').get(id, userId) as any;
  if (!row) { res.status(404).json({ error: '队列条目不存在' }); return; }
  if (row.status !== 'approved') {
    res.status(409).json({ error: `条目状态是 ${row.status}，只有已确认（approved）的条目才能派发发布任务` });
    return;
  }

  // ★★★ 派发前硬校验媒体文件（2026-10-18，fail-fast）：
  //   媒体路径失效（文件被重命名/移动/删除）的任务派出去，执行员必然在 upload 上反复重试，
  //   实测烧掉 27 条消息 + 一次 429 限流才终止 —— 这是"任务不自动止损空转烧钱"的根因之一。
  //   ⇒ 文件不存在就**根本不启动任务**，409 报明缺哪个文件，用户修完路径再派。
  //   判据：这是派发时刻就能静态判定的不可恢复错误，运行期任何重试都救不回来。
  const mediaForCheck = (() => { try { return row.media_paths_json ? JSON.parse(row.media_paths_json) as string[] : []; } catch { return []; } })();
  const missingMedia = mediaForCheck.filter((p) => !fs.existsSync(p));
  if (missingMedia.length) {
    res.status(409).json({ error: `媒体文件不存在，已拒绝派发（请在队列条目里修正媒体路径后重新派发）：${missingMedia.join('；')}` });
    return;
  }

  // 1) 解析执行智能体：言智代言官（懂发布 SOP 与 pageAgent 委派）→ 默认智能体
  let agentId: string | null = null;
  const yanzhi = db.prepare("SELECT id FROM agent WHERE id = 'a_builtin_yanzhi_agent' AND (user_id = ? OR is_public = 1)").get(userId);
  if (yanzhi) agentId = 'a_builtin_yanzhi_agent';
  else {
    const def = db.prepare("SELECT id FROM agent WHERE id = 'a_default_assistant' AND (user_id = ? OR is_public = 1)").get(userId);
    if (def) agentId = 'a_default_assistant';
  }

  // 2) 解析模型：智能体绑定 → 默认模型（与 runScheduledTask 同口径）
  let platformId: string | null = null;
  let modelId: string | null = null;
  if (agentId) {
    const agent = db.prepare('SELECT platform_id, model_id FROM agent WHERE id = ?').get(agentId) as any;
    if (agent) { platformId = agent.platform_id || null; modelId = agent.model_id || null; }
    if (!modelId) {
      const poolFirst = resolveFirstModel(db, { userId, agentId }, 'llm');
      if (poolFirst) { platformId = poolFirst.platformId; modelId = poolFirst.model.id; }
    }
  }
  if (!platformId || !modelId) {
    const fallback = db.prepare(
      `SELECT m.id, m.platform_id FROM model m JOIN platform p ON p.id = m.platform_id
       WHERE m.user_id = ? AND m.enabled = 1 AND m.type = 'llm' AND m.visible = 1 AND p.llm_enabled = 1
         AND p.id NOT IN (${TOKEN_DEAD_PLATFORM_IDS_SQL})
       ORDER BY CASE WHEN m.is_default = 1 AND p.is_builtin = 0 THEN 0 WHEN m.is_default = 1 THEN 1 ELSE 2 END, m.created_at ASC
       LIMIT 1`,
    ).get(userId) as any;
    if (fallback) { platformId = fallback.platform_id; modelId = fallback.id; }
  }
  if (!platformId || !modelId) {
    res.status(409).json({ error: '未找到可用模型，请先在「设置 → 模型平台」配置并启用模型' });
    return;
  }

  // 3) 建会话 + 任务（指令自包含：发布任务看不到派发它时的上下文）
  // ★ 会话必须先落库（2026-10-18 修）：createTask 的会话生命周期检查查不到行会直接抛
  //   CONVERSATION_NOT_FOUND —— 此前只生成了 convId 没 INSERT，派发永远 409"会话不存在"，
  //   新任务建不出来。与 appCreateTask / runScheduledTask 的建会话完全同构。
  // 归属空间：继承队列条目来源会话的空间（用户口径：派发的任务应在同一个工作空间里）；
  // 来源会话已删则落「未归类」。
  let spaceId: string | null = null;
  if (row.conversation_id) {
    const src = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(row.conversation_id) as any;
    spaceId = src?.space_id || null;
  }
  // 权限：派发本身是用户"人工点头"的动作（按钮触发），且发布 SOP 必须委派 pageAgent
  // （call_agent 在 readonly 下属写操作必被拦）——这里给 default，readonly 会让任务必失败。
  const convId = uuid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO conversation (id, user_id, title, agent_id, platform_id, model_id, space_id, mcp_servers_json, skill_ids_json, pinned, permission_mode, mode, task_type, title_source, source, source_meta_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', 0, ?, 'office', NULL, 'auto', NULL, NULL, ?, ?)`,
  ).run(convId, userId, `发布：${row.title}`, agentId, platformId, modelId, spaceId, 'default', now, now);
  const media = (() => { try { return row.media_paths_json ? JSON.parse(row.media_paths_json) as string[] : []; } catch { return []; } })();
  const userContent = [
    `[发布任务] 把一条已确认的内容发布到平台，完成后用 publish_mark_published 回写。`,
    ``,
    `- 队列条目 ID：${row.id}（标记已发布时传给 publish_mark_published 的 id）`,
    `- 平台：${row.platform}`,
    `- 标题：${row.title}`,
    `- 正文：${row.content || '（无）'}`,
    `- 标签：${row.tags || '（无）'}`,
    `- 合集：${row.collection || '（无，如平台支持建议创建/选择合集）'}`,
    `- 媒体文件：${media.length ? media.join('；') : '（无，纯文字发布）'}`,
    ``,
    `要求：用 call_agent 委派**发布执行员**（agentId: "a_builtin_publish_agent"）执行实际发布操作——`,
    `它是平台页面专职执行者，挂有各平台创作者中心实测配方；内容形态：${PLATFORM_KIND_HINTS[row.platform] || '创作者发布页'}（用户浏览器已有登录态），按标题/正文/标签填写并上传媒体文件后提交。`,
    row.collection ? `发布时务必把内容归入合集/专栏「${row.collection}」（平台支持时；合集不存在则先创建同名合集）。` : `如平台支持合集且用户有同名合集，顺带归入。`,
    `发布动作真实完成后调用 publish_mark_published { id: "${row.id}", note: "<发布链接或平台返回标识>" }；`,
    `如果发布失败（登录态失效/页面结构变化等），如实汇报失败原因，**不要**调用 publish_mark_published。`,
  ].join('\n');
  try {
    const systemPrompt = buildSystemPromptForBackend(agentId, userId, undefined, { conversationId: convId });
    const tools = buildToolsForBackend(agentId, userId, { conversationId: convId });
    const taskId = createTask({
      conversationId: convId, userId, platformId, modelId,
      userContent, agentId, systemPrompt, tools,
    });
    // 回执记录实际执行模型（2026-10-18 教训：模型池全是失效条目时 L4 兜底会按"最新优先"
    // 选到本地小模型，3B 跑不了 ReAct 工具调用——任务空转"完成"但什么都没做。
    // 把模型写进 note，队列面板一眼可见，不再静默选歪。）
    const mrow = db.prepare('SELECT m.model_id, m.alias, p.name AS plat FROM model m JOIN platform p ON p.id = m.platform_id WHERE m.id = ?').get(modelId) as any;
    const modelLabel = mrow ? `${mrow.plat}/${mrow.alias || mrow.model_id}` : String(modelId);
    db.prepare('UPDATE publish_queue SET note = ?, updated_at = ? WHERE id = ?')
      .run(`发布任务已派发：会话 ${convId}（任务 ${taskId}），执行模型 ${modelLabel}`, now, id);
    res.json({ data: { conversationId: convId, taskId } });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.startsWith('CONVERSATION_')) { res.status(409).json({ error: msg }); return; }
    // 会话建了任务没建成功 → 清掉空壳
    try { db.prepare('DELETE FROM conversation WHERE id = ?').run(convId); } catch { /* ignore */ }
    res.status(500).json({ error: `派发失败：${msg}` });
  }
});

// DELETE /api/publish-queue/:id  删除条目
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const n = db.prepare('DELETE FROM publish_queue WHERE id = ? AND user_id = ?').run(req.params.id, userId).changes;
  res.json({ data: { deleted: n > 0 } });
});

export default router;
