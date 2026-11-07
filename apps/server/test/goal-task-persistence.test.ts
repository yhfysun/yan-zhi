import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import {
  abortTask,
  cleanupTasks,
  createTask,
  getLatestTaskRowForConversation,
  getTask,
  markOrphanTasksInterrupted,
} from '../src/llm-task-manager.js';

const USER = 'u_goal_task';
const CONV = 'conv_goal_task';

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(USER, 'u_goal_task', '!test-no-login', 0);
  db.prepare(
    'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(CONV, USER, '目标任务持久化测试', 'default', 0, 0);
});

describe('goal task persistence', () => {
  it('创建任务时保存参数快照与目标批次关联', () => {
    const taskId = createTask({
      conversationId: CONV,
      userId: USER,
      platformId: 'p_goal_fake',
      modelId: 'm_goal_fake',
      userContent: '执行目标测试',
      agentId: null,
      maxSteps: 17,
      goalId: 'goal_persist_test',
      goalBatchId: 'gobatch_persist_test',
      modeFlags: { goal: true, plan: true },
    });
    const row = db.prepare('SELECT * FROM llm_task WHERE id = ?').get(taskId) as any;
    expect(row.goal_id).toBe('goal_persist_test');
    expect(row.goal_batch_id).toBe('gobatch_persist_test');
    expect(row.params_json).toBeTruthy();
    const params = JSON.parse(row.params_json);
    expect(params.maxSteps).toBe(17);
    expect(params.modeFlags).toEqual({ goal: true, plan: true });
    expect(getLatestTaskRowForConversation(CONV, USER)?.id).toBe(taskId);
    abortTask(taskId);
  });

  it('普通 2 小时看门狗不会清理仍有心跳的目标任务', () => {
    const taskId = createTask({
      conversationId: CONV,
      userId: USER,
      platformId: 'p_goal_fake',
      modelId: 'm_goal_fake',
      userContent: '长目标',
      goalId: 'goal_long_running',
      goalBatchId: 'gobatch_long_running',
    });
    const task = getTask(taskId)!;
    task.status = 'running';
    task.createdAt = Date.now() - 3 * 60 * 60 * 1000;
    task.heartbeatAt = Date.now();
    cleanupTasks();
    expect(getTask(taskId)).toBeTruthy();
    abortTask(taskId);
  });

  it('启动回收跳过目标关联任务，普通孤儿仍标 interrupted', () => {
    const now = Date.now();
    db.prepare(`
      INSERT OR REPLACE INTO llm_task
        (id, user_id, conversation_id, origin, status, step, error, pending_tool_json,
         params_json, goal_id, goal_batch_id, heartbeat_at, created_at, updated_at)
      VALUES (?, ?, ?, 'chat', 'running', 1, NULL, '[]', '{}', ?, ?, ?, ?, ?)
    `).run('task_goal_orphan', USER, CONV, 'goal_orphan', 'gobatch_orphan', now, now, now);
    db.prepare(`
      INSERT OR REPLACE INTO llm_task
        (id, user_id, conversation_id, origin, status, step, error, pending_tool_json,
         params_json, goal_id, goal_batch_id, heartbeat_at, created_at, updated_at)
      VALUES (?, ?, ?, 'chat', 'running', 1, NULL, '[]', '{}', NULL, NULL, NULL, ?, ?)
    `).run('task_normal_orphan', USER, CONV, now, now);

    markOrphanTasksInterrupted();

    const goal = db.prepare('SELECT status FROM llm_task WHERE id = ?').get('task_goal_orphan') as any;
    const normal = db.prepare('SELECT status FROM llm_task WHERE id = ?').get('task_normal_orphan') as any;
    expect(goal.status).toBe('running');
    expect(normal.status).toBe('interrupted');
  });
});
