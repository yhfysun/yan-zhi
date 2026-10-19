// 应用即工具（2026-10-17）：app_create_task / app_get_task_status 测试。
//
// 分层（与 multi-agent-plan.test.ts 同一取向）：
//   ① 行为测试 —— 真 DB：appCreateTask 建会话 + 建任务的完整链路
//      （createTask 会起 ReAct 循环，测试环境无模型配置 → 任务自然失败落库，
//        这不影响被测语义：会话/任务行是否按约定创建）；
//   ② 源码守卫 —— 接线正确性（core 注册 / server 暴露 / 权限清单 / 路由核心集 四道，
//      本项目历史上因"漏一道"静默失效过多次）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../src/db.js';
import { appCreateTask, appGetTaskStatus, publishEnqueue, publishMarkPublished, publishRecordStats } from '../src/llm-task-manager.js';
import { checkToolPermission } from '../src/tool-permission.js';
import { TOOL_ROUTE_CORE, TOOL_ROUTE_THRESHOLD } from '../src/services/tool-router.js';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const PARENT_CONV = 'conv_app_create_parent';
const mkTask = (over: Record<string, unknown> = {}) => ({
  id: 'task_app_create_test',
  conversationId: PARENT_CONV,
  userId: 'u_test',
  platformId: 'p_fake',
  modelId: 'm_fake',
  agentId: null,
  permissionMode: 'default',
  pathGuard: 'ask',
  abortController: new AbortController(),
  subscribers: new Set(),
  ...over,
} as any);

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run('u_test', 'u_test_app_create', '!test-no-login', 0);
  db.prepare(
    'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(PARENT_CONV, 'u_test', 'app_create_task 测试父会话', 'default', 0, 0);
});

describe('appCreateTask 行为（真 DB）', () => {
  it('缺 title / 缺 instruction → 拒绝并给可行动提示', async () => {
    const r1 = await appCreateTask(mkTask(), { instruction: 'x' });
    expect(r1).toMatch(/title/);
    const r2 = await appCreateTask(mkTask(), { title: 't' });
    expect(r2).toMatch(/instruction/);
  });

  it('不存在的 agentId → 拒绝且不建会话', async () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM conversation WHERE user_id = ?').get('u_test') as any;
    const r = await appCreateTask(mkTask(), { title: 't', instruction: 'x', agentId: 'a_nope' });
    expect(r).toMatch(/不存在/);
    const after = db.prepare('SELECT COUNT(*) AS n FROM conversation WHERE user_id = ?').get('u_test') as any;
    expect(after.n).toBe(before.n);
  });

  it('合法派发 → 建会话（标题/权限继承）+ 建任务 + 回执带 conversationId', async () => {
    const r = await appCreateTask(mkTask(), { title: '演示视频：一键出片', instruction: '跑一遍一键出片并交付 mp4' });
    expect(r).toMatch(/conversationId[：:]\s*([0-9a-f-]{36})/);
    const convId = r.match(/conversationId[：:]\s*([0-9a-f-]{36})/)![1];
    const conv = db.prepare('SELECT * FROM conversation WHERE id = ?').get(convId) as any;
    expect(conv).toBeTruthy();
    expect(conv.title).toBe('演示视频：一键出片');
    // 权限继承父任务（不升级）
    expect(conv.permission_mode).toBe('default');
    expect(conv.mode).toBe('office');
    // 任务已落库（createTask 的 persistTaskRow）
    const taskRow = db.prepare('SELECT * FROM llm_task WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').get(convId) as any;
    expect(taskRow).toBeTruthy();
    expect(taskRow.status).toMatch(/running|failed|completed|aborted/);
    // 回执包含 taskId 且能对上
    const taskId = r.match(/taskId[：:]\s*(task_\w+)/)![1];
    expect(taskRow.id).toBe(taskId);
  });

  it('权限不升级：父会话 readonly → 派生会话也是 readonly', async () => {
    const roConv = 'conv_app_create_ro';
    db.prepare(
      'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(roConv, 'u_test', '只读父会话', 'readonly', 0, 0);
    const r = await appCreateTask(mkTask({ conversationId: roConv, permissionMode: 'readonly' }), {
      title: '只读派生', instruction: 'x',
    });
    const convId = r.match(/conversationId[：:]\s*([0-9a-f-]{36})/)![1];
    const conv = db.prepare('SELECT permission_mode FROM conversation WHERE id = ?').get(convId) as any;
    expect(conv.permission_mode).toBe('readonly');
  });

  it('appGetTaskStatus：无记录 / 有记录 / 越权 会话三种情形', () => {
    const noRec = appGetTaskStatus(mkTask(), {});
    expect(noRec).toMatch(/还没有执行记录/);
    // 用上面建过的会话查一次（有 llm_task 行）
    const conv = db.prepare(
      "SELECT id FROM conversation WHERE title = '演示视频：一键出片' LIMIT 1",
    ).get() as any;
    expect(conv).toBeTruthy();
    const withRec = appGetTaskStatus(mkTask(), { conversationId: conv.id });
    expect(withRec).toMatch(/状态：/);
    // 越权 / 不存在
    expect(appGetTaskStatus(mkTask(), { conversationId: 'c_nope' })).toMatch(/不存在/);
  });
});

describe('publishEnqueue 行为（真 DB，只入队不发布）', () => {
  it('非法 platform / 缺 title → 拒绝', () => {
    expect(publishEnqueue(mkTask(), { platform: 'twitter', title: 'x' })).toMatch(/platform 必须是/);
    expect(publishEnqueue(mkTask(), { platform: 'douyin' })).toMatch(/title/);
  });

  it('标题含极限词 → 拒绝入队（合规粗筛）', () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM publish_queue').get() as any;
    const r = publishEnqueue(mkTask(), { platform: 'douyin', title: '全网最低价的 AI 工具' });
    expect(r).toMatch(/高危词/);
    const after = db.prepare('SELECT COUNT(*) AS n FROM publish_queue').get() as any;
    expect(after.n).toBe(before.n);
  });

  it('合法内容 → 落库 pending + 回执带队列 ID', () => {
    const r = publishEnqueue(mkTask(), {
      platform: 'douyin', title: '言智一键出片演示', content: '#AI #智能体', mediaPaths: ['C:/x/demo.mp4'],
    });
    expect(r).toMatch(/队列 ID[：:]\s*([0-9a-f-]{36})/);
    const id = r.match(/队列 ID[：:]\s*([0-9a-f-]{36})/)![1];
    const row = db.prepare('SELECT * FROM publish_queue WHERE id = ?').get(id) as any;
    expect(row.status).toBe('pending');
    expect(row.platform).toBe('douyin');
    expect(JSON.parse(row.media_paths_json)).toEqual(['C:/x/demo.mp4']);
  });

  it('publishMarkPublished：pending 不能跳级 / approved 可标记 / 不存在拒绝', () => {
    // pending → 拒绝（跳过人工确认是漏洞）
    const p = publishEnqueue(mkTask(), { platform: 'douyin', title: '跳级测试' });
    const pid = p.match(/队列 ID[：:]\s*([0-9a-f-]{36})/)![1];
    expect(publishMarkPublished(mkTask(), { id: pid })).toMatch(/approved/);
    // approved → 标记成功 + note 落库
    db.prepare("UPDATE publish_queue SET status = 'approved' WHERE id = ?").run(pid);
    const ok = publishMarkPublished(mkTask(), { id: pid, note: 'demo://link' });
    expect(ok).toMatch(/已标记为已发布/);
    const row = db.prepare('SELECT * FROM publish_queue WHERE id = ?').get(pid) as any;
    expect(row.status).toBe('published');
    expect(row.note).toBe('demo://link');
    expect(row.published_at).toBeGreaterThan(0);
    // published 是终态：再次标记被拒
    expect(publishMarkPublished(mkTask(), { id: pid })).toMatch(/approved/);
    // 不存在
    expect(publishMarkPublished(mkTask(), { id: 'nope' })).toMatch(/不存在/);
  });

  it('publishRecordStats：未发布拒绝 / 空数据拒绝 / 合法落库', () => {
    // 复用上一步标记为 published 的条目
    const pub = db.prepare("SELECT id FROM publish_queue WHERE status = 'published' LIMIT 1").get() as any;
    expect(pub).toBeTruthy();
    // 空 / 无数字字段 → 拒绝（防编数据）
    expect(publishRecordStats(mkTask(), { id: pub.id })).toMatch(/至少提供一个数据字段/);
    // 合法记录
    const ok = publishRecordStats(mkTask(), { id: pub.id, views: 1200, likes: 87, comments: 6, note: '发布后 48h' });
    expect(ok).toMatch(/播放 1200/);
    const row = db.prepare('SELECT * FROM publish_queue WHERE id = ?').get(pub.id) as any;
    const stats = JSON.parse(row.stats_json);
    expect(stats.views).toBe(1200);
    expect(stats.likes).toBe(87);
    expect(stats.note).toBe('发布后 48h');
    // 未发布的条目拒绝
    const pend = publishEnqueue(mkTask(), { platform: 'bilibili', title: '未发布记录测试' });
    const pendId = pend.match(/队列 ID[：:]\s*([0-9a-f-]{36})/)![1];
    expect(publishRecordStats(mkTask(), { id: pendId, views: 1 })).toMatch(/published/);
  });
});

describe('接线守卫（源码四道，漏一道即静默失效）', () => {
  const LTM = strip(read('apps/server/src/llm-task-manager.ts'));

  function strip(s: string): string {
    return s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  }

  it('core 注册了十个应用编排工具', () => {
    const src = read('packages/core/src/tool/builtin/index.ts');
    for (const cls of ['AppCreateTaskTool', 'AppGetTaskStatusTool', 'AppOpenWindowTool', 'ScreenRecordTool', 'DemoComposeTool', 'AnimComposeTool', 'PublishEnqueueTool', 'PublishMarkPublishedTool', 'PublishRecordStatsTool', 'DesignAssetSitesTool']) {
      expect(src).toContain(`new ${cls}()`);
    }
  });

  it('接线全覆盖（拦截/权限/核心集；不再无条件暴露，改由代言官挂载）', () => {
    const FAMILY = ['app_create_task', 'app_get_task_status', 'app_open_window', 'screen_record', 'demo_compose', 'anim_compose', 'publish_enqueue', 'publish_mark_published', 'publish_record_stats', 'design_asset_sites'];
    const loop = LTM.match(/for \(const name of \[([^\]]+)\]\)/)![1];
    for (const name of FAMILY) {
      if (['app_create_task', 'app_get_task_status', 'app_open_window', 'screen_record', 'publish_enqueue', 'publish_mark_published', 'publish_record_stats'].includes(name)) {
        expect(LTM).toContain(`toolName === '${name}'`); // server 拦截族；demo_compose/anim_compose/design_asset_sites 走 registry 直执行
      }
      // ★ 2026-10-20：内容生产工具不再无条件广播（llm-task-manager 1.5 步收窄到规划三件套），
      //   改由「言智代言官」builtin-yanzhi-agent.ts 声明挂载 —— 谁用谁挂，其余不占上下文。
      expect(loop).not.toContain(`'${name}'`);
      expect(LTM).toMatch(new RegExp(`ALWAYS_ALLOWED_BUILTINS[\\s\\S]{0,400}'${name}'`));
      expect(TOOL_ROUTE_CORE.has(name)).toBe(true);
    }
    expect(TOOL_ROUTE_THRESHOLD).toBeGreaterThan(TOOL_ROUTE_CORE.size);
  });

  it('executeTool 有四个工具的拦截分支', () => {
    for (const name of ['app_create_task', 'app_get_task_status', 'app_open_window', 'screen_record']) {
      expect(LTM).toContain(`toolName === '${name}'`);
    }
  });

  it('★ 2026-10-20：应用编排四工具不再无条件暴露（保留 ALWAYS_ALLOWED 放行）', () => {
    const loop = LTM.match(/for \(const name of \[([^\]]+)\]\)/)![1];
    for (const name of ['app_create_task', 'app_get_task_status', 'app_open_window', 'screen_record']) {
      expect(loop).not.toContain(`'${name}'`);
      expect(LTM).toMatch(new RegExp(`ALWAYS_ALLOWED_BUILTINS[\\s\\S]{0,400}'${name}'`));
    }
  });

  it('权限清单：委派拒 / 录屏写拒 / 弹窗交互放行', () => {
    // app_create_task 与 call_agent 同性质（派生的智能体可写）
    expect(checkToolPermission('readonly', 'app_create_task').allowed).toBe(false);
    // screen_record 落盘视频文件
    expect(checkToolPermission('readonly', 'screen_record').allowed).toBe(false);
    // app_open_window 纯展示
    expect(checkToolPermission('readonly', 'app_open_window').allowed).toBe(true);
    // app_get_task_status 纯读（不在任何黑名单，默认放行）
    expect(checkToolPermission('readonly', 'app_get_task_status').allowed).toBe(true);
  });

  it('路由核心集覆盖 + 阈值大于核心集规模', () => {
    for (const name of ['app_create_task', 'app_get_task_status', 'app_open_window', 'screen_record']) {
      expect(TOOL_ROUTE_CORE.has(name)).toBe(true);
    }
    expect(TOOL_ROUTE_THRESHOLD).toBeGreaterThan(TOOL_ROUTE_CORE.size);
  });

  it('言智代言官内置定义挂载了应用编排四件套', async () => {
    const { builtinYanzhiAgentDefs, YANZHI_AGENT_ID, YANZHI_AGENT_BUILTIN_TOOLS } =
      await import('../src/builtin-yanzhi-agent.js');
    expect(YANZHI_AGENT_ID).toBe('a_builtin_yanzhi_agent');
    for (const name of ['app_create_task', 'app_get_task_status', 'app_open_window', 'screen_record']) {
      expect(YANZHI_AGENT_BUILTIN_TOOLS).toContain(name);
    }
    const def = builtinYanzhiAgentDefs[0];
    expect(def.id).toBe(YANZHI_AGENT_ID);
    expect(def.force_sync).toBe(true);
    expect(String(def.system_prompt)).toContain('app_create_task');
    expect(String(def.system_prompt)).toContain('screen_record');
    // 挂载清单与 seed 行一致（单一数据源：builtin_tool_ids 从常量序列化）
    expect(JSON.parse(String(def.builtin_tool_ids))).toEqual(YANZHI_AGENT_BUILTIN_TOOLS);
  });
});
