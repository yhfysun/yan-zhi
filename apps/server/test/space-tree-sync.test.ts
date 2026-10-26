/**
 * 父任务目录子目录同步（space-tree.ts）—— 真机磁盘集成测试（真实 fs + 临时目录，桩掉 db）。
 *
 * 为什么必须是行为测试：核心承诺是「**自动收编、绝不重复**」（用户 2026-10-17 拍板）——
 * 静态断言证明不了"同一批子文件夹反复同步只挂一次"、"已有平铺空间被收编而不是新建"。
 *
 * 覆盖：
 *   ① 子文件夹 → 新建子空间（task_type 留空 = 不建骨架，骨架只在选类型时建）；
 *   ② dirPath 命中已有平铺空间 → 收编（只改 parent_id），不新建；
 *   ③ 重复调用幂等（已收编的零副作用）；
 *   ④ 已挂在其它父空间下的不抢；
 *   ⑤ 隐藏目录 / 资源骨架段（00-source 等）/ node_modules 不参与挂载；
 *   ⑥ validateParent：不存在 / 自己 / 隔代都被拒。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const box = vi.hoisted(() => {
  const fsMod = require('node:fs');
  const osMod = require('node:os');
  const pathMod = require('node:path');
  const root = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'yz-tree-'));
  return {
    root,
    parentDir: pathMod.join(root, 'douyin'),
    /** 内存 space 表：syncSpaceSubdirs 的全部 SQL 都落在这里 */
    rows: [] as Array<Record<string, any>>,
  };
});

/** 内存库：按 SQL 形状路由到 box.rows（mock 形状 = ../src/db.js 的命名导出 db） */
function makeDb() {
  const find = (id: string) => box.rows.find((r) => r.id === id);
  return {
    db: {
      prepare: (sql: string) => ({
        get: (...args: any[]) => {
          if (/FROM space WHERE id = \? AND user_id = \?/.test(sql)) {
            const r = find(args[0]);
            return r && r.user_id === args[1] ? r : undefined;
          }
          return undefined;
        },
        all: (...args: any[]) => {
          if (/FROM space WHERE user_id = \?/.test(sql)) return box.rows.filter((r) => r.user_id === args[0]);
          return [];
        },
        run: (...args: any[]) => {
          if (/UPDATE space SET parent_id/.test(sql)) {
            const r = find(args[2]);
            if (r) { r.parent_id = args[0]; r.updated_at = args[1]; }
            return;
          }
          if (/INSERT INTO space/.test(sql)) {
            // 生产 SQL（space-tree.ts）：description / task_type 是字面 NULL，占位符只有 7 个：
            //   id, user_id, name, dir_path, parent_id, created_at, updated_at
            if (/VALUES \(\?, \?, \?, \?, NULL, NULL, \?, 0, \?, \?\)/.test(sql)) {
              const [id, user_id, name, dir_path, parent_id, created_at, updated_at] = args;
              box.rows.push({ id, user_id, name, dir_path, description: null, task_type: null, parent_id, sort_order: 0, created_at, updated_at });
              return;
            }
            // 兜底：全占位符形式（与生产 SQL 同步维护）
            const [id, user_id, name, dir_path, description, task_type, parent_id, sort_order, created_at, updated_at] = args;
            box.rows.push({ id, user_id, name, dir_path, description, task_type, parent_id, sort_order, created_at, updated_at });
            return;
          }
        },
      }),
    },
    loadEffectiveTaskTypes: () => [],
  };
}

vi.mock('../src/db.js', () => makeDb());

import { syncSpaceSubdirs, validateParent } from '../src/services/space-tree.js';

const USER = 'u_t';
let parentRow: Record<string, any>;

function seed(row: Partial<Record<string, any>>) {
  box.rows.push({ id: 'x', user_id: USER, name: '', dir_path: null, description: null, task_type: null, parent_id: null, sort_order: 0, created_at: 0, updated_at: 0, ...row });
}

beforeEach(() => {
  box.rows.length = 0;
  fs.rmSync(box.parentDir, { recursive: true, force: true });
  fs.mkdirSync(box.parentDir, { recursive: true });
  seed({ id: 'sp_parent', name: '抖音目录', dir_path: box.parentDir, task_type: 'douyin_ops' });
  parentRow = box.rows[0];
});

describe('① 子文件夹 → 新建子空间（不建骨架）', () => {
  it('每个子目录登记为子空间，task_type 留空', async () => {
    fs.mkdirSync(path.join(box.parentDir, '推流'));
    fs.mkdirSync(path.join(box.parentDir, '带货'));
    const r = await syncSpaceSubdirs(USER, 'sp_parent');
    expect(r.created.sort()).toEqual(['带货', '推流']);
    const kids = box.rows.filter((x) => x.parent_id === 'sp_parent');
    expect(kids.length).toBe(2);
    expect(kids.every((k) => !k.task_type)).toBe(true); // 用户拍板：没选类型不建骨架
    expect(kids.every((k) => k.dir_path && k.name)).toBe(true);
  });
});

describe('② 收编：dirPath 命中已有平铺空间 → 只改 parent_id，不新建', () => {
  it('平铺空间被收编，目录路径原样保留', async () => {
    const sub = path.join(box.parentDir, '推流');
    fs.mkdirSync(sub);
    seed({ id: 'sp_old', name: '推流目录', dir_path: sub, task_type: 'douyin_traffic' });
    const r = await syncSpaceSubdirs(USER, 'sp_parent');
    expect(r.adopted).toEqual(['推流目录']);
    expect(r.created).toEqual([]);
    const hit = box.rows.find((x) => x.id === 'sp_old');
    expect(hit.parent_id).toBe('sp_parent');
    expect(hit.task_type).toBe('douyin_traffic'); // 收编不碰类型
    expect(hit.name).toBe('推流目录');             // 也不改名
  });
});

describe('③④ 幂等与边界', () => {
  it('重复调用零副作用（已收编的不重复挂）', async () => {
    fs.mkdirSync(path.join(box.parentDir, '推流'));
    await syncSpaceSubdirs(USER, 'sp_parent');
    const r2 = await syncSpaceSubdirs(USER, 'sp_parent');
    expect(r2.created).toEqual([]);
    expect(r2.adopted).toEqual([]);
    expect(box.rows.filter((x) => x.parent_id === 'sp_parent').length).toBe(1);
  });

  it('已挂在其它父空间下的不抢', async () => {
    const sub = path.join(box.parentDir, '推流');
    fs.mkdirSync(sub);
    seed({ id: 'sp_other_kid', name: '别家孩子', dir_path: sub, parent_id: 'sp_other_parent' });
    const r = await syncSpaceSubdirs(USER, 'sp_parent');
    expect(r.adopted).toEqual([]);
    expect(r.created).toEqual([]);
    expect(box.rows.find((x) => x.id === 'sp_other_kid')!.parent_id).toBe('sp_other_parent');
  });

  it('隐藏目录 / 资源骨架段 / node_modules 不参与挂载', async () => {
    for (const n of ['.yan-zhi', '.git', '00-source', '03-output', 'node_modules', '__pycache__']) {
      fs.mkdirSync(path.join(box.parentDir, n));
    }
    fs.mkdirSync(path.join(box.parentDir, '真实子目录'));
    const r = await syncSpaceSubdirs(USER, 'sp_parent');
    expect(r.created).toEqual(['真实子目录']);
  });

  it('未绑定目录的父空间直接报可读错误', async () => {
    parentRow.dir_path = null;
    await expect(syncSpaceSubdirs(USER, 'sp_parent')).rejects.toThrow(/未绑定本地目录/);
  });
});

describe('⑤ validateParent（2026-10-23 拍板：放开「只支持两级」→ 成环检测）', () => {
  it('父不存在 / 是自己 / 挂进自己子树（成环）都被拒；多级挂载合法', () => {
    expect(validateParent(USER, null, 'sp_no')).toBe('父空间不存在');
    expect(validateParent(USER, 'sp_parent', 'sp_parent')).toBe('空间不能以自己为父');
    seed({ id: 'sp_child', name: '子', parent_id: 'sp_parent' });
    // ★ 放开两级后：把空间挂到「子空间」下是合法的（任意层级）
    expect(validateParent(USER, 'sp_x', 'sp_child')).toBeNull();
    expect(validateParent(USER, 'sp_x', 'sp_parent')).toBeNull();
    // 成环：把祖先挂到自己的子孙下 → 拒（沿父链上溯撞到自己）
    expect(validateParent(USER, 'sp_parent', 'sp_child')).toBe('不能把空间挂到自己的子目录下（会成环）');
  });
});
