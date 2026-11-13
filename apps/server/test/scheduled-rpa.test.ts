import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import scheduledTaskRoutes from '../src/routes/scheduled-tasks.js';
import {
  createAutomationScript,
  publishAutomationScript,
  updateAutomationScript,
} from '../src/services/automation.js';
import {
  refreshScheduledTaskScheduler,
  runScheduledTask,
} from '../src/services/scheduled-tasks.js';
import { db } from '../src/db.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; return res; },
  };
  return res;
}

function handler(method: 'post' | 'patch', path: string) {
  const route = (scheduledTaskRoutes as any).stack.find(
    (layer: any) => layer.route?.path === path && layer.route.methods[method],
  );
  if (!route) throw new Error(`缺少路由 ${method.toUpperCase()} ${path}`);
  return route.route.stack.at(-1).handle as (req: unknown, res: unknown) => Promise<void>;
}

async function call(method: 'post' | 'patch', path: string, body: Record<string, unknown>, params = {}) {
  const res = mockRes();
  await handler(method, path)({ body, params, query: {}, user: { userId: 'guest' } }, res);
  return res;
}

function draft(name = '每日文件检查') {
  return {
    schemaVersion: 1 as const,
    name,
    description: '验证 RPA 定时任务绑定和运行',
    kind: 'hybrid' as const,
    params: [{ key: 'path', label: '文件路径', type: 'string' as const, required: true }],
    steps: [{ id: 'check', type: 'file.exists' as const, path: '{{path}}' }],
  };
}

function publishedScript(name = '每日文件检查') {
  const script = createAutomationScript('guest', draft(name));
  return publishAutomationScript('guest', script.id);
}

function insertRpaTask(scriptId: string, version: number, id = 'st-rpa') {
  const now = Date.now();
  db.prepare(`
    INSERT INTO scheduled_task
      (id, user_id, name, prompt, task_type, schedule_json, enabled,
       rpa_script_id, rpa_script_name, rpa_script_version, rpa_inputs_json,
       created_at, updated_at)
    VALUES (?, 'guest', 'RPA 调度', NULL, 'rpa_script', ?, 1, ?, '每日文件检查', ?, ?, ?, ?)
  `).run(
    id,
    JSON.stringify({ mode: 'interval', minutes: 60 }),
    scriptId,
    version,
    JSON.stringify({ path: __filename }),
    now,
    now,
  );
  return db.prepare('SELECT * FROM scheduled_task WHERE id = ?').get(id) as any;
}

beforeEach(() => {
  db.exec(`
    DELETE FROM automation_run_event;
    DELETE FROM automation_run;
    DELETE FROM automation_script_version;
    DELETE FROM automation_script;
    DELETE FROM message;
    DELETE FROM conversation;
    DELETE FROM scheduled_task;
  `);
  const user = db.prepare('SELECT id FROM user LIMIT 1').get() as any;
  if (!user?.id) {
    db.prepare('INSERT INTO user (id, username, email, password_hash, created_at) VALUES (?, ?, NULL, ?, ?)')
      .run('guest', 'guest', 'x', Date.now());
  }
});

afterEach(() => {
  db.exec('DELETE FROM scheduled_task;');
  db.exec('DELETE FROM automation_run_event; DELETE FROM automation_run;');
  db.exec('DELETE FROM automation_script_version; DELETE FROM automation_script;');
  refreshScheduledTaskScheduler();
});

describe('RPA 定时任务路由', () => {
  it('创建任务时固定当前发布版本并完整保存参数', async () => {
    const script = publishedScript();
    const created = await call('post', '/', {
      name: '每日文件检查',
      taskType: 'rpa_script',
      rpaScriptId: script.id,
      rpaScriptVersion: script.publishedVersion,
      rpaInputs: { path: 'C:\\temp\\report.xlsx' },
      schedule: { mode: 'interval', minutes: 60 },
    });

    expect(created.statusCode).toBe(200);
    expect((created.body as any).data).toMatchObject({
      taskType: 'rpa_script',
      rpaScriptId: script.id,
      rpaScriptName: script.name,
      rpaScriptVersion: script.publishedVersion,
      rpaInputs: { path: 'C:\\temp\\report.xlsx' },
    });
  });

  it('拒绝未发布或非当前发布版本的脚本', async () => {
    const unpublished = createAutomationScript('guest', draft('未发布'));
    const unpublishedRes = await call('post', '/', {
      name: '未发布任务',
      taskType: 'rpa_script',
      rpaScriptId: unpublished.id,
      schedule: { mode: 'interval', minutes: 60 },
    });
    expect(unpublishedRes.statusCode).toBe(400);

    const script = publishedScript();
    const next = updateAutomationScript('guest', script.id, draft('每日文件检查 v2'));
    publishAutomationScript('guest', next.id);
    const staleVersionRes = await call('post', '/', {
      name: '旧版本任务',
      taskType: 'rpa_script',
      rpaScriptId: next.id,
      rpaScriptVersion: script.publishedVersion,
      schedule: { mode: 'interval', minutes: 60 },
    });
    expect(staleVersionRes.statusCode).toBe(400);
  });

  it('编辑已有对话任务时可直接切换为 RPA 固定版本', async () => {
    const script = publishedScript();
    const now = Date.now();
    db.prepare(`
      INSERT INTO scheduled_task
        (id, user_id, name, prompt, task_type, schedule_json, enabled, created_at, updated_at)
      VALUES ('st-chat-rpa', 'guest', '原对话任务', 'say hi', 'chat', ?, 1, ?, ?)
    `).run(JSON.stringify({ mode: 'interval', minutes: 60 }), now, now);

    const updated = await call('patch', '/:id', {
      taskType: 'rpa_script',
      rpaScriptId: script.id,
      rpaScriptVersion: script.publishedVersion,
      rpaInputs: { path: 'C:\\temp\\report.xlsx' },
    }, { id: 'st-chat-rpa' });

    expect(updated.statusCode).toBe(200);
    expect((updated.body as any).data).toMatchObject({
      taskType: 'rpa_script',
      rpaScriptId: script.id,
      rpaScriptVersion: script.publishedVersion,
    });
  });
});

describe('RPA 定时执行', () => {
  it('到点启动固定发布版本并写入自动化运行记录', async () => {
    const script = publishedScript();
    const task = insertRpaTask(script.id, script.publishedVersion!);
    const result = await runScheduledTask(task);

    expect(result.ok).toBe(true);
    const run = db.prepare(
      "SELECT * FROM automation_run WHERE script_id = ? AND trigger_type = 'scheduled' ORDER BY created_at DESC LIMIT 1",
    ).get(script.id) as any;
    expect(run).toMatchObject({
      script_id: script.id,
      script_version: script.publishedVersion,
      user_id: 'guest',
    });

    let latest = db.prepare('SELECT status, steps_json FROM automation_run WHERE id = ?').get(run.id) as any;
    for (let i = 0; i < 30 && latest?.status === 'running'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      latest = db.prepare('SELECT status, steps_json FROM automation_run WHERE id = ?').get(run.id) as any;
    }
    expect(latest.status).toBe('completed');
    expect(JSON.parse(latest.steps_json)).toEqual([
      expect.objectContaining({ stepId: 'check', status: 'completed' }),
    ]);
  });
});
