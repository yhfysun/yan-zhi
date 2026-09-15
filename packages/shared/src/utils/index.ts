// 工具函数

/** 生成唯一 ID */
export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** 当前时间戳（秒） */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** 延时 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 简单 token 估算（中文按 1.5 字/token，英文按 0.25 词/token） */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = text.replace(/[\u4e00-\u9fff]/g, '').split(/\s+/).filter(Boolean).length;
  return Math.ceil(cjk * 1.5 + words * 0.25);
}

/** 安全 JSON 解析 */
export function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** 防抖 */
export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as T;
}

// ===== SQL 文本工具（server sql-guard 与前端控制台共用） =====
export {
  splitSqlStatements,
  statementAt,
  type SqlStatement,
} from './sql-text';

// ===== 服务端资源地址解析（API_BASE 已含 /api，拼接必须按「站点根」）=====
export { serverOrigin, resolveServerUrl } from './server-url';

// ===== 产物目录规范（前端落盘与后端落盘共用同一套规则）=====
// 这里导出的是「规范本身」：目录名常量 + 纯路径函数。
// 落盘侧的根解析（查 DB / 读工作目录）在 apps/server/src/services/artifact-dir.ts，
// 因为它依赖服务端状态，不属于共享层。
export {
  ARTIFACT_ROOT_NAME,
  ARTIFACT_TASKS_DIR,
  ARTIFACT_CATEGORY_DIRS,
  ARTIFACT_TASK_FALLBACK,
  sanitizeArtifactTaskName,
  formatArtifactDate,
  buildArtifactTaskDirName,
  buildArtifactRelDir,
  buildArtifactRelDirCandidates,
  joinArtifactPath,
} from './artifact-paths';
