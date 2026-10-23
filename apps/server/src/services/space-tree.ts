// 父任务目录的子目录树（2026-10-17）。
//
// 设计（用户拍板）：一个工作目录设成「父任务类型」（如抖音运营）后，
//   它下面的**磁盘子文件夹**要变成侧栏里看得见的「子目录」层级：
//   · 子目录 = 子空间（space.parent_id 指向父空间，dirPath 指向子文件夹）；
//   · 已有的平铺空间（dirPath 命中）**自动收编**，绝不重复建；
//   · 没有对应空间的子文件夹 → 新建子空间（不设类型 = 不建资源骨架，用户 2026-10-17 明确）；
//   · 子空间各自选子线（类型）后，走 setSpaceTaskType 建自己的资源骨架（幂等）。
//
// 为什么放服务端：扫盘只在这端可靠（Tauri webview 的 fs 有 scope 限制，见项目经验）；
//   Web/Dexie 端无此功能也不需要（无固定工作目录）。

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { RESOURCE_DIR_NAMES } from '@yan-zhi/shared';
import { db, loadEffectiveTaskTypes } from '../db.js';

/** 构建产物与资源骨架段不作为子目录参与挂载（00-source 等是类型的骨架，不是子任务） */
const SKIP_DIR_NAMES = new Set(['node_modules', '__pycache__', ...RESOURCE_DIR_NAMES]);

/** Windows 不区分大小写、分隔符两头通吃：统一成小写正斜杠再比 */
function normDir(p?: string | null): string {
  if (!p) return '';
  return p.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
}

/** 取某类型的子任务线（运行时权威 = task_type 表；库里没有再用内置补）。
 *  id=parent（独立「父任务」）→ 子线 = 全部具体类型（父容器语义，用户任选）。 */
function childLinesOf(parentTypeId: string): Array<{ id: string; label: string }> {
  const effective = loadEffectiveTaskTypes();
  const seen = new Map<string, string>();
  const pick = (t: { id: string; label: string }) => { if (!seen.has(t.id)) seen.set(t.id, t.label); };
  if (parentTypeId === 'parent') {
    effective.filter((t) => isConcreteType(effective, t.id)).forEach(pick);
  } else {
    effective.filter((t) => t.parentId === parentTypeId).forEach(pick);
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}

/** 具体类型 = 非独立父任务、也没有人把它当父（没有子线挂在它下面） */
function isConcreteType(effective: Array<{ id: string; parentId?: string }>, id: string): boolean {
  return id !== 'parent' && !effective.some((t) => t.parentId === id);
}

export interface SyncSubdirsResult {
  spaceId: string;
  /** 本次收编的已有平铺空间数 */
  adopted: string[];
  /** 本次新建的子空间名 */
  created: string[];
  /** 父类型支持的子线（前端建子空间后选类型用） */
  childLines: Array<{ id: string; label: string }>;
}

/**
 * 把父任务目录下的磁盘子文件夹同步成子空间（幂等，可反复调用）。
 *
 * 规则：
 *   1. 只扫一层目录，跳过隐藏目录、资源骨架段（00-source 等）与构建产物目录；
 *   2. dirPath 命中已有空间 → 只改 parent_id（收编），不改名不碰类型；
 *   3. 已挂在其它父空间下的不动（不抢别人孩子）；
 *   4. 没有对应空间 → 新建（name=文件夹名，task_type 空 → 不建骨架）；
 *   5. 已是本空间子空间的跳过（重复调用零副作用）。
 */
export async function syncSpaceSubdirs(userId: string, spaceId: string): Promise<SyncSubdirsResult> {
  const parent = db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(spaceId, userId) as any;
  if (!parent) throw new Error('空间不存在');
  if (!parent.dir_path) throw new Error('该空间未绑定本地目录，无法同步子目录');

  let entries: fs.Dirent[] = [];
  try {
    entries = await fsp.readdir(parent.dir_path, { withFileTypes: true });
  } catch {
    throw new Error('读取目录失败：' + parent.dir_path);
  }

  // 全量空间按归一化 dirPath 建索引（收编判据）
  const all = db.prepare('SELECT * FROM space WHERE user_id = ?').all(userId) as any[];
  const byDir = new Map<string, any>();
  for (const s of all) {
    const k = normDir(s.dir_path);
    if (k) byDir.set(k, s);
  }

  const adopted: string[] = [];
  const created: string[] = [];
  const now = Date.now();

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith('.') || SKIP_DIR_NAMES.has(ent.name)) continue;
    const childAbs = path.join(parent.dir_path, ent.name);
    const key = normDir(childAbs);
    if (key === normDir(parent.dir_path)) continue;

    const existing = byDir.get(key);
    if (existing) {
      if (existing.id === parent.id) continue;                      // 自己不收自己
      if (existing.parent_id === parent.id) continue;               // 已是本空间子空间 → 零副作用
      if (existing.parent_id) continue;                             // 已挂在别的父空间下 → 不抢
      db.prepare('UPDATE space SET parent_id = ?, updated_at = ? WHERE id = ?')
        .run(parent.id, now, existing.id);
      adopted.push(existing.name || ent.name);
      continue;
    }

    // 没有对应空间 → 新建子空间；task_type 留空 = 不建资源骨架（用户选了类型才建）
    const id = uuid();
    db.prepare(
      `INSERT INTO space (id, user_id, name, dir_path, description, task_type, parent_id, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, 0, ?, ?)`,
    ).run(id, userId, ent.name, childAbs, parent.id, now, now);
    byDir.set(key, { id, parent_id: parent.id });
    created.push(ent.name);
  }

  return { spaceId, adopted, created, childLines: parent.task_type ? childLinesOf(parent.task_type) : [] };
}

/** 删父空间时子空间上提为**祖父**（没有祖父则到顶层）。
 *  与 task-types 删父类型"上提不级联"同语义：删中间层不该把整棵子树拍平。 */
export function promoteChildSpaces(spaceId: string): void {
  try {
    const parent = db.prepare('SELECT parent_id FROM space WHERE id = ?').get(spaceId) as any;
    db.prepare('UPDATE space SET parent_id = ? WHERE parent_id = ?').run(parent?.parent_id || null, spaceId);
  } catch { /* 列未迁移等：容忍 */ }
}

/** parentId 合法性校验：父必须存在、不能是自己、不能挂到自己的子孙下（会成环）。
 *  2026-10-23 用户拍板：放开「只支持两级」——目录树支持任意层级。 */
export function validateParent(userId: string, spaceId: string | null, parentId: string): string | null {
  const parent = db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(parentId, userId) as any;
  if (!parent) return '父空间不存在';
  if (spaceId && spaceId === parentId) return '空间不能以自己为父';
  if (spaceId) {
    // 从目标父往上走，撞到自己 = 把空间挂进了自己的子树 → 成环
    let cur = parent;
    const seen = new Set<string>();
    while (cur) {
      if (cur.id === spaceId) return '不能把空间挂到自己的子目录下（会成环）';
      if (!cur.parent_id || seen.has(cur.id)) break;
      seen.add(cur.id);
      cur = db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(cur.parent_id, userId) as any;
    }
  }
  return null;
}
