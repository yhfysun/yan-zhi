import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';
import { touchTaskRow } from '../src/llm-task-manager.js';

const TASK_ID = 'task_heartbeat_test';
const USER_ID = 'u_heartbeat_test';
const CONV_ID = 'conv_heartbeat_test';

function seedTask(updatedAt: number): void {
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(USER_ID, USER_ID, '!test-no-login', 0);
  db.prepare(
    'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(CONV_ID, USER_ID, 'heartbeat test', 'default', 0, 0);
  db.prepare(
    `INSERT OR REPLACE INTO llm_task
      (id, user_id, conversation_id, origin, status, step, error, pending_tool_json, params_json, created_at, updated_at)
     VALUES (?, ?, ?, 'chat', 'running', 0, NULL, NULL, NULL, ?, ?)`,
  ).run(TASK_ID, USER_ID, CONV_ID, updatedAt, updatedAt);
}

afterEach(() => {
  db.prepare('DELETE FROM llm_task WHERE id = ?').run(TASK_ID);
});

describe('llm_task 运行心跳', () => {
  it('工具活动会刷新 step 与 updated_at', () => {
    const old = Date.now() - 60_000;
    seedTask(old);

    expect(touchTaskRow(TASK_ID, 7)).toBe(true);

    const row = db.prepare('SELECT status, step, updated_at FROM llm_task WHERE id = ?').get(TASK_ID) as any;
    expect(row.status).toBe('running');
    expect(row.step).toBe(7);
    expect(row.updated_at).toBeGreaterThan(old);
  });

  it('任务行不存在时返回 false，不抛错', () => {
    expect(touchTaskRow('task_does_not_exist', 3)).toBe(false);
  });

  it('统一工具出口必须调用心跳，覆盖主循环与子智能体', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/llm-task-manager.ts'),
      'utf8',
    );
    const start = source.indexOf('async function runToolCallAndPersist(');
    const end = source.indexOf('// ★★★ 进事件缓冲前', start);
    const body = source.slice(start, end > start ? end : start + 3000);
    expect(body).toContain('touchTaskRow(task.id');
  });
});
