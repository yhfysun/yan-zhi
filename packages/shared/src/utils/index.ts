// 工具函数

// 文本编码识别（UTF-8 / GBK / UTF-16 自动判定）——三端共用的单一出口
export * from './text-encoding';

// 有效上下文策略（标称窗口 ≠ 可用窗口）—— 服务端压缩预算与前端用量展示的**同一口径**
export * from './context-policy';

// 按 key 分桶的「连续无变化计数」（B7）——**服务端与桌面两链路共用的唯一实现**。
// ★ 为什么放 shared：两处（`server/routes/browser.ts` 与 `desktop/main.cjs`）本各写一份
//   模块级单值，正是"跨会话互相污染"的根源；共用一份才能保证两链路行为一致。
export * from './keyed-streak';

// 按 key 串行的执行队列（A2）——**三端共用的唯一实现**。
// ★ 为什么放 shared：前端已有同款思路（`ui/stores/browser-op-queue.ts`），服务端的
//   文件「读-改-写」也需要；两处各写一份必然漂移。shared 被 core/ui/server 同时依赖。
export * from './keyed-serial-queue';

// 剪辑效果库（滤镜/转场/文字动画/音效）——**三端共用的单一真相源**。
// ★ 为什么放 shared 而不是 server/services：核心 schema（packages/core）也要用它生成
//   工具参数的 enum。放 server 下会让 core 依赖 server（层次倒置），
//   于是 schema 只能手写第二份清单 → 与实现漂移（本项目已有三处各写一份的前车之鉴）。
export * from './clip-effects';

// 智能体默认采样参数（temperature / maxTokens / topP …）——**前后端共用的单一真相源**。
// ★ 为什么放 shared（2026-10-10 实据）：这些默认值此前散落 **7 处**硬编码，
//   改一处忘一处 → 出现"源码 65536、库里表定义仍是 2048"的撕裂，直接导致
//   推理模型（deepseek-flash）输出预算被思考吃光 → 正文恒空、任务假装"完成"。
export * from './agent-defaults';

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

/**
 * 简单 token 估算（用于上下文压缩阈值判定、记忆注入预算、前端用量展示）。
 *
 * ★★★ 2026-09-29 修正 —— 此前对「无空格文本」几乎不计数，是本项目一个**系统性低估 bug**：
 *
 *   旧实现：`Math.ceil(cjk * 1.5 + words * 0.25)`，其中 words = 非中文部分按 `\s+` 切分。
 *   问题：代码 / JSON / 日志 / base64 / 长路径**几乎没有空格**，整段被当成"1 个词"，
 *   只算 0.25 token —— 实测 `'x'.repeat(20000)` → **1 token**（真实约 5000 token，低估 **5000 倍**）。
 *
 *   后果链（这正是"上下文压缩几乎永不触发"的真正主因，比阈值口径错误更根本）：
 *     压缩判据 = `tokenCount(messages) > maxTokens`，而 tokenCount 用的是本函数 →
 *     长任务里绝大部分内容是中文对话 + 英文代码/工具输出 → 估算值远低于真实值 →
 *     **阈值永远达不到** → 上下文无限膨胀 → 上游 400 或模型被长上下文拖垮。
 *
 *   新实现按**字符类别**分别计价（cjk / 其他非 ASCII / ASCII）：
 *     · 中文等 CJK：1 字 ≈ 1.5 token（保留原口径）
 *     · 其他非 ASCII（日文/韩文/符号/emoji）：1 字 ≈ 1 token
 *     · ASCII 字母数字：**4 字符 ≈ 1 token**（对代码/JSON/日志/base64 都成立）
 *     · ASCII 空白与标点：8 字符 ≈ 1 token（更廉价）
 *   这是**保守估计**（宁可高估 → 早点压缩；压缩早了只是浪费一点摘要，压缩晚了直接 400）。
 *
 *   ★ 为什么不再按"词数"算：词数模型只对**自然语言散文**成立，而本产品里真正吃 token 的
 *     恰恰是代码与工具输出。**换了统计口径后必须同步复核调用方阈值**（已查：压缩阈值按
 *     `contextWindow × 0.5` 换算，估算变准后触发点更接近真实窗口的 50%，语义正确）。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;      // CJK 汉字
  let nonAscii = 0; // 其他非 ASCII（假名/谚文/符号/emoji）
  let asciiWord = 0; // ASCII 字母数字
  let asciiSpace = 0; // ASCII 空白与标点
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code > 0xffff) { nonAscii++; continue; } // emoji 等代理对
    if (code >= 0x4e00 && code <= 0x9fff) cjk++;
    else if (code > 0x7f) nonAscii++;
    else if (
      (code >= 48 && code <= 57) ||   // 0-9
      (code >= 65 && code <= 90) ||   // A-Z
      (code >= 97 && code <= 122)     // a-z
    ) asciiWord++;
    else asciiSpace++;
  }
  return Math.ceil(cjk * 1.5 + nonAscii * 1 + asciiWord / 4 + asciiSpace / 8);
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

// ===== Promise 超时兜底（唯一实现；此前 7+ 份手写）=====
export { withTimeout, withTimeoutOrUndefined } from './timeout';

// ===== SQL 文本工具（server sql-guard 与前端控制台共用） =====
export {
  splitSqlStatements,
  statementAt,
  type SqlStatement,
} from './sql-text';

// ===== 服务端资源地址解析（API_BASE 已含 /api，拼接必须按「站点根」）=====
export { serverOrigin, resolveServerUrl } from './server-url';

// ===== 本机内嵌后端地址（实例端口唯一判据：生产 3001 / 开发 3002）=====
// ★ 前端**不得再硬编码 3001** —— 端口随实例而异，写死会让开发实例界面请求到安装版后端。
export {
  DEFAULT_API_PORT,
  DEV_API_PORT,
  resolveLocalApiPort,
  localApiBase,
  localApiOrigin,
} from './local-server';

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

// ===== 任务类型注册表（「目录即任务」的类型定义 + 资源目录骨架 + SOP）=====
// 前后端共用同一份：后端取 SOP 注入提示词，前端取 label/guide 做下拉与引导文案。
export {
  RESOURCE_DIRS,
  RESOURCE_DIR_NAMES,
  DEFAULT_CONFIRM_BATCH_SIZE,
  TASK_TYPES,
  TASK_TYPE_IDS,
  getTaskType,
  formatTaskTypeContext,
  type ResourceDirSpec,
  type TaskTypeSpec,
} from './task-types';
