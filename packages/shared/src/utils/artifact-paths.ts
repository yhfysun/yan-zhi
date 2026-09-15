// 产物目录规范 —— 前后端共用的单点定义
//
// 目录结构（根 = 工作目录；未设置工作目录时根 = 数据根）：
//   <根>/.yan-zhi/tasks/<conversationId>/      ← 会话产物：以会话 id 为键（2026-09-15 起主规则）
//   <根>/.yan-zhi/tasks/<YYYY-MM-DD>-<任务名>/ ← 无会话上下文时的归档名；也是旧数据的历史目录名
//     ├ uploads/       用户上传的文件、图片
//     ├ intermediate/  任务过程中生成的所有文件
//     └ deliverables/  最终交付给用户的文件
//
// 任务目录以会话 id 为键：id 全局唯一且不可变，会话改名、同日同标题都不再影响产物定位
// （旧规则 <日期>-<会话标题> 每次按当前标题重算，改名即 404 + 磁盘孤儿）。
// 目录可读性由文件管理面板（按会话分组 + 真实文件名）承担，不靠文件夹名。
// 读取侧用 buildArtifactRelDirCandidates 同时探测新旧行，历史产物零搬运。
//
// 用 .yan-zhi 隐藏目录承载，避免工作目录是 git 仓库时把产物混进版本控制。

import type { FileCategory } from '../types/index';

/** 产物根目录名（隐藏目录，不污染 git 工作区） */
export const ARTIFACT_ROOT_NAME = '.yan-zhi';

/** 任务产物集合的子目录名 */
export const ARTIFACT_TASKS_DIR = 'tasks';

/** 三分类对应的磁盘目录名（英文小写，跨平台安全） */
export const ARTIFACT_CATEGORY_DIRS: Record<FileCategory, string> = {
  upload: 'uploads',
  intermediate: 'intermediate',
  deliverable: 'deliverables',
};

/** 任务名缺失时的兜底名 */
export const ARTIFACT_TASK_FALLBACK = '未命名任务';

/** 任务目录名中任务名部分的最大长度 */
export const ARTIFACT_TASK_NAME_MAX = 40;

/** 路径分隔符统一用正斜杠：Node fs 在 Windows 上同样接受，浏览器侧也一致 */
const SEP = '/';

/**
 * 清洗任务名为可安全用作目录名的片段：
 * - 去掉 Windows/macOS 非法字符 \ / : * ? " < > | 与控制字符
 * - 空白折叠为单个连字符（避免路径含空格在命令行场景需要转义）
 * - 去掉首尾连字符与点（Windows 不允许目录名以点结尾）
 * - 超长截断；结果为空时用兜底名
 */
export function sanitizeArtifactTaskName(title: string | null | undefined, fallback = ARTIFACT_TASK_FALLBACK): string {
  const raw = (title || '')
    // 制表/换行先当空白（会话标题可能被粘贴成多行），其余控制字符直接剔除
    .replace(/[\t\n\r\f\v]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '');
  let s = raw
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (s.length > ARTIFACT_TASK_NAME_MAX) s = s.slice(0, ARTIFACT_TASK_NAME_MAX).replace(/[-.]+$/, '');
  return s || fallback;
}

/** 任务日期段：本地时区 YYYY-MM-DD */
export function formatArtifactDate(ts: number): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 任务目录名：<日期>-<任务名>（旧命名规则，仅供无会话上下文归档与历史目录回退） */
export function buildArtifactTaskDirName(title: string | null | undefined, createdAt: number): string {
  return `${formatArtifactDate(createdAt)}-${sanitizeArtifactTaskName(title)}`;
}

/**
 * 相对产物目录（相对给定的根）：.yan-zhi/tasks/<会话id>/<分类目录>
 * 2026-09-15 起的主规则：会话产物一律按会话 id 归档，id 缺失时才退回旧命名。
 * 路径分隔符统一为正斜杠。
 */
export function buildArtifactRelDir(opts: {
  conversationId?: string | null;
  title?: string | null;
  createdAt?: number;
  category: FileCategory;
}): string {
  const categoryDir = ARTIFACT_CATEGORY_DIRS[opts.category] || ARTIFACT_CATEGORY_DIRS.intermediate;
  const cid = (opts.conversationId || '').trim();
  if (cid) {
    return [ARTIFACT_ROOT_NAME, ARTIFACT_TASKS_DIR, cid, categoryDir].join(SEP);
  }
  const taskDir = buildArtifactTaskDirName(opts.title, opts.createdAt || Date.now());
  return [ARTIFACT_ROOT_NAME, ARTIFACT_TASKS_DIR, taskDir, categoryDir].join(SEP);
}

/**
 * 读取侧候选目录列表：先探测新的会话 id 目录，miss 再回退旧的「日期-任务名」目录。
 * 落盘侧只用 buildArtifactRelDir 的第一个候选；回退仅用于读取历史产物，不用于新写入
 * （新写入永远落会话 id 目录，避免再次产生命名漂移）。
 * 传入 hasLegacyDir 时以磁盘实况为准：旧目录不存在就不给读取侧回退候选（避免误建/误命中）。
 */
export function buildArtifactRelDirCandidates(opts: {
  conversationId?: string | null;
  title?: string | null;
  createdAt?: number;
  category: FileCategory;
  /** 旧命名目录是否真实存在（磁盘探测结果）；缺省视为存在，保留回退 */
  hasLegacyDir?: boolean;
}): string[] {
  const cid = (opts.conversationId || '').trim();
  const categoryDir = ARTIFACT_CATEGORY_DIRS[opts.category] || ARTIFACT_CATEGORY_DIRS.intermediate;
  if (!cid) {
    // 无会话上下文：新旧规则本就是同一个「日期-任务名」目录，无需候选
    return [buildArtifactRelDir(opts)];
  }
  const candidates = [[ARTIFACT_ROOT_NAME, ARTIFACT_TASKS_DIR, cid, categoryDir].join(SEP)];
  if (opts.hasLegacyDir !== false) {
    candidates.push(buildArtifactRelDir({ title: opts.title, createdAt: opts.createdAt, category: opts.category }));
  }
  return candidates;
}

/**
 * 把相对产物目录挂到指定根上。根可以是绝对路径（工作目录）或相对路径（数据根）。
 * 会自动归一化多余分隔符与重复斜杠，不改变根的原有分隔符风格。
 */
export function joinArtifactPath(root: string, relDir: string): string {
  const base = (root || '').replace(/[\\/]+$/, '');
  const rel = (relDir || '').replace(/^[\\/]+/, '');
  if (!base) return rel;
  if (!rel) return base;
  return `${base}${SEP}${rel}`;
}
