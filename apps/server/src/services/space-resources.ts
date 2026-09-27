// 目录级资源规划 —— 「目录即任务」在磁盘上的落地。
//
// 与会话级产物目录（artifact-dir.ts 的 .yan-zhi/tasks/<convId>/<category>）**分工不同**：
//   · 会话级：一次任务的产物，随会话走；
//   · 目录级（本模块）：跨会话共享的长期资源，用户自己往里拷文件也能被识别 ——
//     这才是「同一目录多次进行任务」的关键。
//
// 目录结构（<空间目录>/ 下，均为用户可见）：
//   00-source/     原始素材
//   01-reference/  参考资料
//   02-work/       过程产物
//   03-output/     最终交付
//   .yan-zhi/task.json  ← 类型 + 游标等机器状态（隐藏目录，不与用户资源混放）
//
// ★ 安全底线（用户拍板「目录骨架创建要幂等：重复设置类型不能覆盖用户已放进去的文件」）：
//   只 mkdir，永不删除/覆盖任何已存在内容；task.json 只在缺失时写入，已存在则合并。

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { RESOURCE_DIRS, RESOURCE_DIR_NAMES, getTaskType, TASK_TYPE_IDS } from '@yan-zhi/shared';
import { db } from '../db.js';
import { serverState } from '../state.js';
import { getSpaceMemoryPath } from './space-memory.js';

/** 目录级机器状态文件名（隐藏在 .yan-zhi 下，不与用户资源混放） */
const TASK_META_FILE = '.yan-zhi/task.json';

interface SpaceRow {
  id: string;
  user_id?: string;
  name: string;
  dir_path: string | null;
  task_type?: string | null;
  task_config_json?: string | null;
}

function getSpaceRow(userId: string | null, spaceId: string): SpaceRow | null {
  const row = userId
    ? db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(spaceId, userId)
    : db.prepare('SELECT * FROM space WHERE id = ?').get(spaceId);
  return (row as SpaceRow) || null;
}

/**
 * 解析空间的资源根目录。
 *
 * 绑定了本地目录 → 直接用（用户资源必须在他自己的目录里，不该被挪到服务端数据目录）；
 * 未绑定 → <workspaceDir>/spaces/<spaceId>/（与空间记忆同规则，保证功能可用）。
 */
export function resolveSpaceResourceRoot(space: Pick<SpaceRow, 'id' | 'dir_path'>): string {
  if (space.dir_path) return space.dir_path;
  return path.join(serverState.workspaceDir || process.cwd(), 'spaces', space.id);
}

/** 资源根是否"真实可见"（绑定目录才让用户直接去放文件；未绑定的是服务端内部目录） */
export function isSpaceDirBound(space: Pick<SpaceRow, 'dir_path'>): boolean {
  return !!space.dir_path;
}

export interface ResourceEntry {
  name: string;
  /** 绝对路径（前端预览/另存为用） */
  path: string;
  size: number;
  mtime: number;
  /** 是否目录 */
  isDir: boolean;
}

/**
 * 建出资源目录骨架（幂等），并回传**本次真正新建**的目录名。
 *
 * ★ 只 mkdir：已存在的目录与其中的文件一律不动。
 *   重复调用（用户反复切类型）不会丢用户放进去的素材。
 */
export async function ensureResourceDirs(
  space: Pick<SpaceRow, 'id' | 'dir_path'>,
): Promise<{ root: string; createdDirs: string[] }> {
  const root = resolveSpaceResourceRoot(space);
  await fsp.mkdir(root, { recursive: true });
  const createdDirs: string[] = [];
  for (const d of RESOURCE_DIRS) {
    const target = path.join(root, d.dir);
    // ★ 先判定再创建：mkdir 之后再 stat 必然存在，就无法区分"本次新建"与"早就有"
    let existed = false;
    try { existed = (await fsp.stat(target)).isDirectory(); } catch { existed = false; }
    try {
      await fsp.mkdir(target, { recursive: true });
      if (!existed) createdDirs.push(d.dir);
    } catch { /* 单个失败不阻塞其它 */ }
  }
  return { root, createdDirs };
}

/** 读 task.json（缺失/损坏返回 null） */
async function readTaskMeta(root: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fsp.readFile(path.join(root, TASK_META_FILE), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 写 task.json（**合并**语义：保留已有字段，只更新本次传入的）。
 * 首次创建目录骨架时调用；用户在别的机器上拷贝了整个目录，task.json 会一并带过去。
 *
 * ★ 实测（2026-09-27）：改任务类型必须**覆盖** taskType/taskTypeLabel，
 *   否则「先设小说改写、再改成配音」后文件里还写着小说改写 ——
 *   用户把整个目录拷到别的机器上，读到的就是过期的类型。
 *   合并语义只适用于"本次没传的字段"（保留游标等机器状态），不是"这个字段不更新"。
 */
async function mergeTaskMeta(root: string, patch: Record<string, unknown>): Promise<void> {
  const file = path.join(root, TASK_META_FILE);
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const existing = (await readTaskMeta(root)) || {};
    const next = { ...existing, ...patch, updatedAt: Date.now() };
    await fsp.writeFile(file, JSON.stringify(next, null, 2), 'utf-8');
  } catch { /* 元信息写失败不影响资源目录可用性 */ }
}

/**
 * 清空 task.json 里的任务类型（用户把目录改回「通用」时调用）。
 *
 * ★ 不清掉的话：DB 已是"通用"（不再注入 SOP），文件里却还写着 dubbing/novel_rewrite 之类
 *   —— 两者不一致；用户按文件理解"这目录还是配音任务"，拷到别的机器打开更会误导。
 * ★ 只删类型相关字段，**保留其它机器状态**（进度游标等），与"只 mkdir 不删用户文件"的底线上不冲突
 *   （task.json 是机器状态文件，不是用户资源）。
 */
async function clearTaskMetaType(root: string): Promise<void> {
  const file = path.join(root, TASK_META_FILE);
  try {
    const existing = await readTaskMeta(root);
    if (!existing) return; // 文件都没有，无需处理
    delete existing.taskType;
    delete existing.taskTypeLabel;
    delete existing.taskConfig;
    await fsp.writeFile(file, JSON.stringify({ ...existing, updatedAt: Date.now() }, null, 2), 'utf-8');
  } catch { /* 元信息写失败不影响资源目录可用性 */ }
}

export interface SetTaskTypeResult {
  spaceId: string;
  taskType: string;
  root: string;
  bound: boolean;
  /** 本次新建的目录（已存在的不会出现在这里） */
  createdDirs: string[];
  /** 是否产生了变更（重复设同一类型且目录齐全 → false） */
  changed: boolean;
}

/**
 * 给空间设置任务类型：更新 DB + 建资源目录骨架 + 写 task.json。
 *
 * ★ 幂等：目录只 mkdir；task.json 只在缺失时写、存在则合并。
 *   重复设置同一类型不会覆盖用户已放进去的文件，也不会重建已存在的目录。
 */
export async function setSpaceTaskType(
  userId: string | null,
  spaceId: string,
  taskType: string | null,
): Promise<SetTaskTypeResult> {
  const space = getSpaceRow(userId, spaceId);
  if (!space) throw new Error('空间不存在或不属于当前用户');

  const normalized = taskType && TASK_TYPE_IDS.includes(taskType) ? taskType : null;
  const prev = space.task_type || null;

  // 落库（normalized=null 表示"通用"，显式清空）
  try {
    db.prepare('UPDATE space SET task_type = ?, updated_at = ? WHERE id = ?')
      .run(normalized, Date.now(), spaceId);
  } catch { /* 列未迁移等异常：仍继续建目录，保证资源目录可用 */ }

  const bound = isSpaceDirBound(space);
  const { root, createdDirs } = await ensureResourceDirs(space);

  if (normalized) {
    // mergeTaskMeta 的展开写会**覆盖** taskType/taskTypeLabel（改类型时必须覆盖，
    // 否则文件里留着上一个类型 —— 拷到别的机器就会读到过期类型）
    await mergeTaskMeta(root, {
      taskType: normalized,
      taskTypeLabel: getTaskType(normalized).label,
      spaceId,
      resourceDirs: RESOURCE_DIR_NAMES,
    });
  } else if (prev) {
    // 从某类型改回「通用」：清掉文件里的类型标记，避免 DB（已无类型）与文件不一致
    await clearTaskMetaType(root);
  }

  return {
    spaceId,
    taskType: normalized || 'general',
    root,
    bound,
    createdDirs,
    changed: prev !== normalized,
  };
}

/**
 * 列举某段资源目录下的文件（供文件面板「项目资源」段）。
 * 只列一层（用户资源通常是平铺的文件；深层目录由文件树面板承担）。
 */
export async function listResourceDir(spaceId: string, dir: string): Promise<ResourceEntry[]> {
  if (!RESOURCE_DIR_NAMES.includes(dir)) throw new Error('未知的资源目录: ' + dir);
  const space = getSpaceRow(null, spaceId);
  if (!space) throw new Error('空间不存在');
  const target = path.join(resolveSpaceResourceRoot(space), dir);
  let names: string[] = [];
  try {
    names = await fsp.readdir(target);
  } catch {
    return []; // 目录不存在 = 空（不视为错误，前端展示"暂无"）
  }
  const out: ResourceEntry[] = [];
  for (const n of names) {
    if (n.startsWith('.')) continue; // 隐藏文件不进列表
    const p = path.join(target, n);
    try {
      const st = await fsp.stat(p);
      out.push({ name: n, path: p, size: st.isDirectory() ? 0 : st.size, mtime: st.mtimeMs, isDir: st.isDirectory() });
    } catch { /* 单个文件读取失败跳过 */ }
  }
  out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  return out;
}

/** 解析资源目录下某个文件的绝对路径（含安全校验：防穿越、只允许一层文件名） */
export function resolveResourceFilePath(spaceId: string, dir: string, name: string): string | null {
  if (!RESOURCE_DIR_NAMES.includes(dir)) return null;
  // 文件名只允许"单段"：禁分隔符、禁 ..、禁控制字符（与媒体路由同口径）
  if (!name || name.length > 180) return null;
  if (/[\\/\u0000-\u001f\u007f]/.test(name) || name === '.' || name === '..' || name.includes('..')) return null;
  const space = getSpaceRow(null, spaceId);
  if (!space) return null;
  const target = path.join(resolveSpaceResourceRoot(space), dir, name);
  try {
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  } catch {
    return null;
  }
  return target;
}

/** 资源目录概览（各段文件数）—— 提示词注入用，让模型知道用户放了什么 */
export async function summarizeResourceDirs(spaceId: string): Promise<Array<{ dir: string; label: string; count: number; names: string[] }>> {
  const out: Array<{ dir: string; label: string; count: number; names: string[] }> = [];
  for (const d of RESOURCE_DIRS) {
    let entries: ResourceEntry[] = [];
    try { entries = await listResourceDir(spaceId, d.dir); } catch { /* 空间不存在等 */ }
    out.push({ dir: d.dir, label: d.label, count: entries.length, names: entries.slice(0, 10).map((e) => e.name) });
  }
  return out;
}

/** 同步版资源目录摘要（任务组装提示词是同步路径）：直接 readdirSync，失败静默 */
export function summarizeResourceDirsSync(spaceId: string): Array<{ dir: string; label: string; count: number; names: string[] }> {
  const space = getSpaceRow(null, spaceId);
  if (!space) return [];
  const root = resolveSpaceResourceRoot(space);
  const out: Array<{ dir: string; label: string; count: number; names: string[] }> = [];
  for (const d of RESOURCE_DIRS) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(path.join(root, d.dir)).filter((n) => !n.startsWith('.'));
    } catch { /* 目录不存在 */ }
    out.push({ dir: d.dir, label: d.label, count: names.length, names: names.slice(0, 10) });
  }
  return out;
}

/** 空间记忆文件路径复用（避免两处各算一套路径） */
export { getSpaceMemoryPath };