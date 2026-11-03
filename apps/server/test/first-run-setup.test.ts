/**
 * 首次安装向导测试（2026-11-02）。
 *
 * ★ 用户实报：第一次启动看到的是**登录页**，不是「自己设置密码」。
 *   根因：预置的空密码管理员账号被 hasRealUsers() 算作"已初始化" → setupRequired=false
 *   → 前端路由把 /setup 换成了 /login。
 *
 * 现约定：空密码占位行（DEFAULT_ADMIN_ID）不算已初始化；它被 /setup 接管并设好密码后才算。
 * 环境坑同 rbac.test.ts：YZ_TEST_FORCE_SQLJS=1，DATA_DIR 指向临时目录。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.YZ_TEST_FORCE_SQLJS = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'yz-first-run-'));

import { db } from '../src/db.js';
import { ensureDefaultAdmin, hasRealUsers, seedRbac, DEFAULT_ADMIN_ID } from '../src/rbac.js';

beforeAll(() => {
  // 与启动顺序一致：先 seedRbac（建根组织/管理员角色），再种占位管理员
  seedRbac();
});

describe('首启：设置密码向导的判定', () => {
  it('预置空密码管理员不算已初始化（否则用户永远看不到设置密码页）', () => {
    expect(ensureDefaultAdmin()).toBe(true);
    const row = db.prepare('SELECT username, password_hash FROM user WHERE id = ?').get(DEFAULT_ADMIN_ID) as any;
    expect(row).toBeTruthy();
    expect(row.password_hash).toBe('');
    expect(hasRealUsers()).toBe(false);
  });

  it('占位账号设置密码后即算已初始化（向导不再出现）', () => {
    db.prepare('UPDATE user SET username = ?, password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run('自己设的管理员', 'bcrypt-hash', DEFAULT_ADMIN_ID);
    expect(hasRealUsers()).toBe(true);
  });

  it('★ 库里已有其它账号但缺占位管理员时，启动仍补种（开发库 401 的根因）', () => {
    // 复现用户环境：库里有历史账号，但没有 yanZhiPower
    db.prepare('DELETE FROM user_role WHERE user_id = ?').run(DEFAULT_ADMIN_ID);
    db.prepare('DELETE FROM user WHERE id = ?').run(DEFAULT_ADMIN_ID);
    db.prepare("INSERT INTO user (id, username, email, password_hash, created_at) VALUES ('u_legacy', 'test1', NULL, 'x', ?)")
      .run(Date.now());
    expect(hasRealUsers()).toBe(true);

    // 旧实现要求"零用户"才补种 → 这里会是 false，登录页永远 401
    expect(ensureDefaultAdmin()).toBe(true);
    const row = db.prepare('SELECT username, password_hash, must_change_password FROM user WHERE id = ?')
      .get(DEFAULT_ADMIN_ID) as any;
    expect(row?.username).toBe('yanZhiPower');
    expect(row?.password_hash).toBe('');
    expect(row?.must_change_password).toBe(1);
    // 已有占位行时不重复种（幂等）
    expect(ensureDefaultAdmin()).toBe(false);
  });
});
