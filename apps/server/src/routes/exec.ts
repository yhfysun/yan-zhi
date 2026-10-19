// 无头执行路由（headless exec，2026-10-19）—— 对标 Codex 的 `codex exec`。
//
// ★ 为什么需要：现有所有任务入口都绑定「前端在线」——LLM 任务走 SSE 推送、UI 工具委托前端执行。
//   CI、脚本、外部编排想"跑一次任务拿结果"时无处可去。本路由提供**一次性、非交互**入口：
//   POST /api/exec { prompt, platformId, modelId, ... } → 等任务跑完 → 返回 JSON。
//
// ★ 与交互式链路的差异（有意的）：
//   1) includeUiTools=false —— 无人值守，ask_user / confirm_user 等 UI 工具不进工具面；
//   2) 不自动选默认模型 —— 必须显式给 platformId + modelId。自动选模型的口径现有两份
//      （scheduled-tasks / memory-dreaming 各一），再抄第三份必然漂移；宁可让调用方明确指定；
//   3) 默认权限模式沿用会话值（新会话为 readonly）—— CI 要写文件必须显式传 permissionMode。
//
// ★ 超时语义：到点先 abortTask（让 ReAct 循环正常收尾、消息落库），再返回 ok:false。
//   不做"直接掐断 HTTP 连接"——那会留下 running 任务占着会话。
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import {
  createTask, subscribe, abortTask, getTask,
  buildSystemPromptForBackend, buildToolsForBackend, loadAgentModelParams,
} from '../llm-task-manager.js';

const router = Router();
router.use(authMiddleware);

/** 任务终态事件（其余都是过程事件） */
export const TERMINAL_TASK_EVENTS = new Set(['task:completed', 'task:error', 'task:aborted']);

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_TIMEOUT_MS = 60 * 60 * 1000;

router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const body = (req.body || {}) as Record<string, unknown>;

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const platformId = typeof body.platformId === 'string' ? body.platformId.trim() : '';
  const modelId = typeof body.modelId === 'string' ? body.modelId.trim() : '';
  if (!prompt) { res.status(400).json({ error: 'prompt 必填' }); return; }
  if (!platformId || !modelId) {
    res.status(400).json({ error: 'platformId / modelId 必填（无头模式不自动选默认模型，避免与 UI 口径漂移）' });
    return;
  }

  // ── 会话：复用或新建（新建会话默认 readonly，CI 要写文件请显式传 permissionMode）──
  const nowSec = Math.floor(Date.now() / 1000);
  let conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
  const agentId = typeof body.agentId === 'string' && body.agentId ? body.agentId : null;
  if (conversationId) {
    const row = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(conversationId, userId);
    if (!row) { res.status(404).json({ error: 'conversationId 不存在' }); return; }
  } else {
    conversationId = uuid();
    db.prepare(
      "INSERT INTO conversation (id, user_id, title, agent_id, platform_id, model_id, mcp_servers_json, skill_ids_json, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', 0, ?, ?)",
    ).run(conversationId, userId, `无头执行：${prompt.slice(0, 30)}`, agentId, platformId, modelId, nowSec, nowSec);
  }

  const mode = typeof body.permissionMode === 'string' ? body.permissionMode : '';
  if (mode === 'readonly' || mode === 'default' || mode === 'all') {
    db.prepare('UPDATE conversation SET permission_mode = ? WHERE id = ?').run(mode, conversationId);
  }

  const workspaceDir = typeof body.workspaceDir === 'string' && body.workspaceDir.trim()
    ? body.workspaceDir.trim() : undefined;
  const maxSteps = Number.isFinite(body.maxSteps)
    ? Math.max(1, Math.min(500, Math.floor(Number(body.maxSteps)))) : 60;
  const timeoutMs = Number.isFinite(body.timeoutMs)
    ? Math.max(5_000, Math.min(MAX_TIMEOUT_MS, Math.floor(Number(body.timeoutMs)))) : DEFAULT_TIMEOUT_MS;

  const systemPrompt = buildSystemPromptForBackend(agentId, userId, undefined, { conversationId });
  const tools = buildToolsForBackend(agentId, userId);
  const modelParams = loadAgentModelParams(agentId, userId);

  let taskId: string;
  try {
    taskId = createTask({
      conversationId, userId, platformId, modelId,
      userContent: prompt,
      agentId,
      systemPrompt,
      tools,
      options: {
        temperature: modelParams.temperature,
        maxTokens: modelParams.maxTokens,
        topP: modelParams.topP,
        reasoningEffort: modelParams.reasoningEffort,
      },
      maxSteps,
      // 无人值守：UI 工具（ask_user/confirm_user）不进工具面，否则模型会停下来等一个不存在的用户
      includeUiTools: false,
      workspaceDir,
      pathGuard: 'ask',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ ok: false, conversationId, error: msg });
    return;
  }

  // ── 等终态（subscribe 会重放 createTask 之后已产生的事件，不会有竞态漏判）──
  const outcome = await new Promise<{ ok: boolean; error: string | null }>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (ok: boolean, error: string | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { unsubscribe(); } catch { /* 已退订 */ }
      resolve({ ok, error });
    };
    const unsubscribe = subscribe(taskId, 0, (ev) => {
      if (!TERMINAL_TASK_EVENTS.has(ev.type)) return;
      finish(ev.type === 'task:completed', ev.type === 'task:error'
        ? String((ev as any).error || (ev as any).message || '任务失败') : null);
    });
    timer = setTimeout(() => {
      try { abortTask(taskId); } catch { /* 已结束 */ }
      finish(false, `超时（${Math.round(timeoutMs / 1000)}s）`);
    }, timeoutMs);
  });

  const task = getTask(taskId);
  const last = db.prepare(
    "SELECT content FROM message WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1",
  ).get(conversationId) as any;
  const files = db.prepare(
    'SELECT path, tool FROM file_change WHERE task_id = ? ORDER BY created_at ASC',
  ).all(taskId) as any[];

  res.json({
    ok: outcome.ok,
    conversationId,
    taskId,
    text: String(last?.content || ''),
    steps: (task as any)?.step ?? 0,
    files: files.map((f) => ({ path: String(f.path || ''), tool: String(f.tool || '') })),
    error: outcome.error,
  });
});

export default router;
