/**
 * 工作流型智能体作为会话智能体时的拦截 —— 回归测试。
 *
 * 背景（真 bug，DB 取证）：会话「龙珠里面打斗名场面」的 agent_id 是 a_wf_drama_pipeline。
 * 用户把工作流型智能体选成了会话智能体，而后端主链路（createTask/runReActLoop）没有类型判定，
 * 按 harness 跑了 ReAct —— 工作流型 agent 的 system_prompt 为 NULL、builtin_tool_ids 为 []，
 * 于是系统提示词里既没有角色定义也没有工具段，工具表几乎为空（连 ask_user/confirm_user
 * 都进不来，因为兜底分支要求 agentId 为空才触发）。
 *
 * 实测后果：4 条消息、tool_calls 全为 None、workflow_run 无记录、conversation_file 0 条。
 * 表现就是「不反问、不产出、不出视频，而且完全不报错」，极难归因。
 *
 * 这里钉住三件事：
 *   1) 拦截确实生效，且给出可操作的指引（三条正确入口）；
 *   2) **拦截必须优先于平台/模型校验** —— 否则平台没配好时会先报「平台不存在」，
 *      把用户引向错误的排查方向（去设置里反复换模型），真正原因被掩盖；
 *   3) 对话型智能体不受影响 —— 过度拦截会让所有会话都跑不起来。
 *
 * 跑法：与 index.ts 启动顺序一致（seed 内置 agent + 内置工作流），但 DATA_DIR 指向临时目录，
 * 不碰生产 data.db。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

let tmpDir: string;
let db: any;
let createTask: any;
let getTask: any;
let wfId: string;
let harnessId: string;

/** 造一个会话并绑定指定 agent，返回 convId */
function newConv(agentId: string) {
  const convId = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO conversation (id,user_id,title,agent_id,platform_id,model_id,pinned,builtin_tool_ids_json,skill_ids_json,mcp_servers_json,created_at,updated_at) VALUES (?,?,?,?,?,?,0,'[]','[]','[]',?,?)",
  ).run(convId, 'guest', 'ZZ测试会话', agentId, 'test-platform', 'test-model', now, now);
  return convId;
}

/**
 * 等到「助手消息已落库」或「任务已 settle」为止。
 *
 * ★★ 为什么不能像原来那样固定 sleep 600ms（2026-10-12 全量跑偶发红）：
 *   createTask 在进主循环前还有若干 DB 读取（模型候选池解析等），全量并发跑时
 *   这段前置耗时会被放大，600ms 就不够 → 读到"只有用户消息"的中间态。
 *   ★ 判据：**任何"等一会儿再看"的固定 sleep 都是竞态**，断言的是时序不是行为；
 *     要等的是**收敛条件**（助手消息出现 / 任务终态），不是一段臆测的时间。
 */
async function waitSettled(convId: string, taskId: string, timeoutMs = 8000) {
  const t0 = Date.now();
  for (;;) {
    // ★ 排序口径与生产一致（routes/conversations.ts: `ORDER BY created_at ASC, id ASC`）：
    //   只按 created_at 排会在同一毫秒内落库的用户/助手消息之间**顺序不定**
    //   （本次全量跑偶发红的真因：拦截分支与用户消息常落在同一毫秒）。
    const msgs = db.prepare('SELECT role, content FROM message WHERE conversation_id=? ORDER BY created_at ASC, id ASC').all(convId) as any[];
    const task = getTask(taskId);
    const done = task && (task.status === 'failed' || task.status === 'completed' || task.status === 'cancelled');
    if (msgs.some((m: any) => m.role === 'assistant') || done) return { msgs, task };
    if (Date.now() - t0 > timeoutMs) return { msgs, task };  // 超时也返回现状，让断言给出真实差异
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * 取**最后一条助手消息**。
 *
 * ★ 为什么不能取「最后一条消息」（2026-10-12 实测）：拦截分支与用户消息的 created_at
 *   常落在同一毫秒，"最后一条"是用户消息还是助手消息**由 SQLite 的决胜顺序决定** →
 *   断言随机红。判据：断言的语义是"后端给出的指引"，就该**按角色取**，别依赖物理顺序。
 */
function lastAssistant(msgs: any[]): string {
  const a = msgs.filter((m: any) => m.role === 'assistant');
  return String(a[a.length - 1]?.content || '');
}

/** 跑一个任务并等它 settle，返回该会话落库的消息 */
async function runAndCollect(agentId: string, userContent = '你好') {
  const convId = newConv(agentId);
  const taskId = createTask({
    conversationId: convId,
    userId: 'guest',
    platformId: 'test-platform',
    modelId: 'test-model',
    userContent,
    agentId,
  });
  const { msgs, task } = await waitSettled(convId, taskId);
  return { convId, taskId, msgs, task };
}

beforeAll(async () => {
  tmpDir = path.join(os.tmpdir(), 'yz-wf-guard-test-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  process.env.DATA_DIR = tmpDir;

  const distBase = path.resolve(__dirname, '../dist/apps/server/src');
  const dbMod: any = await import('file:///' + distBase.replace(/\\/g, '/') + '/db.js');
  db = dbMod.db;

  // 与 index.ts 启动顺序一致：内置工作流 seed
  const wfMod: any = await import('file:///' + distBase.replace(/\\/g, '/') + '/builtin-workflow-agents.js');
  wfMod.seedBuiltinWorkflowAgents(db);

  const taskMod: any = await import('file:///' + distBase.replace(/\\/g, '/') + '/llm-task-manager.js');
  createTask = taskMod.createTask;
  getTask = taskMod.getTask;

  wfId = (db.prepare("SELECT id FROM agent WHERE type='workflow' LIMIT 1").get() as any)?.id;
  harnessId = (db.prepare("SELECT id FROM agent WHERE type='harness' AND system_prompt IS NOT NULL LIMIT 1").get() as any)?.id;
});

afterAll(() => {
  try { db?.close?.(); } catch { /* ignore */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('前置条件：库里有可用的两类智能体', () => {
  it('seed 后存在 workflow 型智能体', () => {
    expect(wfId).toBeTruthy();
  });

  it('seed 后存在 harness 型智能体（对照组）', () => {
    expect(harnessId).toBeTruthy();
  });

  it('★ 工作流型智能体的特征：无提示词、无工具（这正是静默退化的根源）', () => {
    const row = db.prepare('SELECT system_prompt, builtin_tool_ids FROM agent WHERE id=?').get(wfId) as any;
    expect(row.system_prompt).toBeNull();
    expect(JSON.parse(row.builtin_tool_ids || '[]')).toEqual([]);
  });
});

describe('会话绑定工作流型智能体 → 被拦截', () => {
  it('★ 落库一条明确的指引消息，而不是静默退化', async () => {
    const { msgs, task } = await runAndCollect(wfId, '龙珠里面打斗名场面');
    const assistant = msgs.filter((m: any) => m.role === 'assistant');
    expect(assistant.length).toBeGreaterThan(0);
    const text = String(assistant[assistant.length - 1].content || '');
    expect(text).toContain('工作流型智能体');
    expect(text).toContain('不能作为会话智能体');
    expect(task?.status).toBe('failed');
  });

  it('指引里给出三条正确入口（画布运行 / 定时任务 / call_agent 委派）', async () => {
    const { msgs } = await runAndCollect(wfId);
    const text = lastAssistant(msgs);
    expect(text).toContain('画布');
    expect(text).toContain('定时任务');
    expect(text).toContain('call_agent');
    expect(text).toContain('AI 短剧导演');
  });

  it('★ 拦截优先于平台校验：平台不存在时也必须报「工作流」而不是「平台不存在」', async () => {
    // 这是本次实测抓到的顺序问题：拦截若放在平台校验之后，平台没配好时会先报
    // 「平台或模型不存在」，把用户引向设置页反复换模型，真正原因（选错智能体类型）被掩盖。
    // 本用例用「不存在的 platformId/modelId」跑，断言报的是工作流而不是平台。
    const convId = newConv(wfId);
    const taskId = createTask({
      conversationId: convId,
      userId: 'guest',
      platformId: 'platform-that-does-not-exist',
      modelId: 'model-that-does-not-exist',
      userContent: 'hi',
      agentId: wfId,
    });
    const { msgs } = await waitSettled(convId, taskId);
    const text = lastAssistant(msgs);
    expect(text).toContain('工作流型智能体');
    expect(text).not.toContain('平台或模型不存在');
    expect(getTask(taskId)?.status).toBe('failed');
  });

  it('工作流 id 写坏（agent 不存在）时不误报为工作流，仍走正常流程', async () => {
    // isWorkflowAgent(null) === false → 不该被这条拦截吞掉，应由平台校验或后续流程处理
    const { msgs } = await runAndCollect('a_not_exist_agent_id');
    const text = lastAssistant(msgs);
    expect(text).not.toContain('工作流型智能体');
  });
});

describe('对照组：对话型智能体不受影响', () => {
  it('★ harness 型不会被这条拦截拦下（防过度拦截）', async () => {
    const { msgs } = await runAndCollect(harnessId, 'ping');
    const text = String(msgs[msgs.length - 1].content || '');
    expect(text).not.toContain('工作流型智能体');
  });

  it('该 harness 智能体本身有提示词与工具（与工作流形成对照）', () => {
    const row = db.prepare('SELECT system_prompt, builtin_tool_ids FROM agent WHERE id=?').get(harnessId) as any;
    expect((row.system_prompt || '').length).toBeGreaterThan(0);
    expect(JSON.parse(row.builtin_tool_ids || '[]').length).toBeGreaterThan(0);
  });
});