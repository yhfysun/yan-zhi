// 文件工具「工作目录边界」守卫 —— 越界访问的判定与授权状态（2026-10-01）
//
// ★★★ 为什么需要（用户报「检查下所有操作文件的工具是不是都是用当前工作目录当根目录的，
//     访问其他目录需要用户授权」，决策「弹窗授权」）：
//
//   此前**全仓没有任何一处校验目标路径是否在工作目录内**：
//     · `resolveToolPath`（core/fs-walk.ts:57）注释写明「越界由上层决定」—— 但上层从未实现；
//     · 唯一的 before 钩子扩展点（tool-hooks.ts 的 registerBeforeToolHook）**调用点为 0**；
//     · 已有的 4 处 `startsWith(root+sep)` 校验**只覆盖 UI 通道**
//       （routes/workspace.ts:61,300 / services/git.ts:66 / plugins/computer-use.ts:542），
//       模型走工具链根本不经过它们。
//   ⇒ 模型可静默读写/枚举磁盘任意位置，用户既看不到也没机会拒绝。
//
// ★ 本模块的定位：**纯判定**（无 IO、无 db、无 SSE）。
//   三种执行入口各自决定拿到 `need-auth` 后怎么办：
//     · llm-task-manager（有前端在线）→ 弹窗授权
//     · routes/tools.ts（UI 试跑，用户主动点）→ 直接放行 + 审计
//     · workflow-runner（后台/无人值守）→ fail-safe 拒绝 + 审计
//   —— 判定逻辑只有一份，避免「同一语义在两处判定」必然漂移（本项目既有教训）。

import path from 'node:path';
import { resolveToolPath } from '@yan-zhi/core';
import { resolveArtifactDirFor } from './artifact-dir.js';
import { serverState } from '../state.js';

/** 访问性质：读 / 写（弹窗文案与默认记忆粒度都依赖它） */
export type PathAction = 'read' | 'write';

interface PathArgSpec {
  /** 参数名 */
  field: string;
  /** 读还是写 */
  action: PathAction;
}

/**
 * 工具 → 路径参数**声明表**。
 *
 * ★★ 判据：**按实现抽，不按名字猜**（本项目既有教训：`api_message_send` / `api_ollama_delete` /
 *    `api_custom_tool_execute` 都是"名字看着正常、实际是写"）。
 *    这里逐条对着各工具的 `execute()` 实现核过：
 *      - `file_write`：`args.path` 语义已收敛为「用户明确点名落点时才传」（file-write.ts:57-61），
 *        常规写入走 `file_name` + ctx 目录 —— 所以**只有显式给了 path 才判**；
 *      - `doyz`：`file/csv/json/md` 是**输入**（read），`out` 是**输出**（write）
 *        —— 漏掉 `out` 就是"写越界静默放行"（doyz.ts:74-90）。
 *
 * ★ 未在此表里的工具（cmd_exec / python_exec 除外）一律**不判路径** —— 它们要么不碰文件系统
 *   （js_exec 沙箱已屏蔽 require/process，js-exec.ts:25），要么路径抽不到（见下方 COMMAND_TOOLS）。
 */
const TOOL_PATH_ARGS: Record<string, PathArgSpec[]> = {
  // ── 文件族（读）──
  file_read: [{ field: 'path', action: 'read' }],
  file_list: [{ field: 'path', action: 'read' }],
  file_grep: [{ field: 'path', action: 'read' }],
  file_to_markdown: [{ field: 'path', action: 'read' }],
  image_analyze: [{ field: 'path', action: 'read' }],
  // ── 文件族（写）──
  file_write: [{ field: 'path', action: 'write' }],
  file_edit: [{ field: 'path', action: 'write' }],
  // ── 源码族（读）──
  code_search: [{ field: 'path', action: 'read' }],
  code_outline: [{ field: 'path', action: 'read' }],
  code_refs: [{ field: 'path', action: 'read' }],
  code_graph: [{ field: 'path', action: 'read' }],
  // ── 文档交付（输出，写）──
  doyz: [
    { field: 'file', action: 'read' },
    { field: 'csv', action: 'read' },
    { field: 'json', action: 'read' },
    { field: 'md', action: 'read' },
    { field: 'out', action: 'write' },
  ],
  // ── API 工具：目录列举 / 文件搜索（读）──
  api_workspace_list_dir: [{ field: 'path', action: 'read' }],
  // ── OCR：传 path 读本地图片（读）；传 image(base64) 时不碰磁盘，抽不到自然不判 ──
  api_tool_ocr: [{ field: 'path', action: 'read' }],
  // ── 媒体加工（ffmpeg）：**输入一律本机绝对路径**（前序工具回传的 file 字段）──
  //   ★ 这里全是**读用户本机文件**，且绝对路径是官方用法（工具描述明写"输入一律为本机绝对路径"）
  //     → 若不登记，`media_edit` 会成为一个"读任意文件"的静默通道。
  //   ★ 6 个字段逐个列（video/video2/media/image/overlay/audio）—— 按实现抽，不按名字猜；
  //     漏一个就是"那条 op 静默越界"（例如只登记 video 而漏 audio → bgsound 可读任意音频）。
  media_edit: [
    { field: 'video', action: 'read' },
    { field: 'video2', action: 'read' },
    { field: 'media', action: 'read' },
    { field: 'image', action: 'read' },
    { field: 'overlay', action: 'read' },
    { field: 'audio', action: 'read' },
  ],
  // media_compose：输入 segments（数组，元素含 file）；输出落会话产物目录（走 mediaTarget）
  // ★ 数组内元素暂不在本表覆盖范围（见文件末尾"已知不覆盖"，留作后续）。
};

/**
 * 命令执行类工具 —— **路径静态抽取不可能**，单独处理。
 *
 * 实测（见 issues/文件工具路径基准与越界授权-20261001.md）：
 *   · `cmd_exec`：路径藏在 **`args` 数组元素**里（`["python", "C:/outside/x.py"]`）——
 *     参数名不固定，无法从 schema 抽；
 *   · `python_exec`：路径**只存在于代码字符串**里（`open("C:/outside/x")`）——
 *     静态抽取在原理上就不可能（等价于要静态分析任意程序）。
 * 而这两个恰恰是**最强的越界通道**（一条命令就出去了）。
 *
 * ⇒ 用户决策（2026-10-01）：「首次授权 + 全量审计」
 *   本会话首次调用弹窗过目「命令 + 参数」，之后本会话放行；**每次调用都落审计**。
 *   —— 这样既拦住静默越界，又不骚扰 `npm install` / 跑测试这类高频正当用途。
 */
export const COMMAND_TOOLS = new Set(['cmd_exec', 'python_exec']);

/** 一次越界访问项 */
export interface PathAccessItem {
  toolName: string;
  action: PathAction;
  /** 解析后的绝对路径（已按工作目录解析相对路径） */
  absPath: string;
  /** 模型原始给的路径（弹窗里要让用户看到"它想访问什么"） */
  rawPath: string;
}

/**
 * 比较用归一化：绝对化 + 去尾分隔符 + win32 转小写。
 * ★ Windows 路径大小写不敏感（`C:/Proj` 与 `c:/proj` 是同一处），不转小写会**误判越界**
 *   → 用户明明在授权目录里却被弹窗。反之在 POSIX 上必须保留大小写。
 */
export function normalizeForCompare(p: string): string {
  let n = path.resolve(p).replace(/[\\/]+$/, '');
  if (process.platform === 'win32') n = n.toLowerCase();
  return n;
}

/**
 * 目标是否在根内。
 * ★ 判据与项目既有 4 处校验**完全一致**（routes/workspace.ts:61 等）：
 *   `t !== r && !t.startsWith(r + sep)` → 越界。即「等于根自身算在内」。
 *   （写成 `startsWith(r+sep)` 会漏掉"根目录自己"，`file_list { path: "." }` 会被误判。）
 */
export function isWithinRoot(target: string, root: string): boolean {
  if (!target || !root) return false;
  const t = normalizeForCompare(target);
  const r = normalizeForCompare(root);
  if (!r) return false;
  return t === r || t.startsWith(r + path.sep);
}

/**
 * 从工具入参里抽出**已显式给出**的路径。
 *
 * ★ 只抽显式给出的：未给路径时 `resolveToolPath('')` 会返回工作目录根 ——
 *   若把它也当"路径"参与判定，等于每次调用都要判一次，且**语义错了**
 *   （没给路径本来就是"用工作目录"，天然在内，不需要授权）。
 * ★ 相对路径一律先按 `workspaceDir` 解析（复用 core 的唯一出口，不各写一遍）。
 */
export function collectPathArgs(
  toolName: string,
  args: Record<string, unknown> | null | undefined,
  workspaceDir?: string | null,
): PathAccessItem[] {
  const specs = TOOL_PATH_ARGS[toolName];
  if (!specs || !args) return [];
  const out: PathAccessItem[] = [];
  for (const spec of specs) {
    const raw = (args as Record<string, unknown>)[spec.field];
    if (typeof raw !== 'string' || !raw.trim()) continue; // 未给 / 空串 → 不触发授权
    const rawPath = raw.trim();
    out.push({
      toolName,
      action: spec.action,
      rawPath,
      absPath: resolveToolPath(rawPath, workspaceDir),
    });
  }
  return out;
}

export interface PathGuardInput {
  toolName: string;
  args: Record<string, unknown> | null | undefined;
  /** 当前会话工作目录（相对路径的解析基准） */
  workspaceDir?: string | null;
  /**
   * ★★★ 允许访问的根集合。**必须包含产物目录** ——
   *   产物根 = 空间目录 > 工作目录 > 数据根（services/artifact-dir.ts:100-104），
   *   **不等于**工作目录：用户绑了空间目录、或未设工作目录时，产物落在别处。
   *   漏掉它 → `file_write` 写自己的产物被拦 → 生成全挂（最坏的误伤）。
   *   ★ 用 `allowedRootsFor()` 算，不要在调用方各写一遍（本项目既有教训：入口各写一遍必漂移）。
   */
  allowedRoots: string[];
  /** 本会话用户已授权的目录（弹窗授权结果，父目录粒度） */
  authorizedDirs?: string[];
}

/**
 * 算出一次调用允许访问的全部根 —— **允许根的唯一定义处**（三入口共用）。
 *
 * ★★★ 为什么必须包含产物目录，且用**真实实现**算而不是调用方各写一遍：
 *   产物根 = 空间目录 > 工作目录 > 数据根（`resolveArtifactRoot`，三者**择一**）。
 *   早期我在验证脚本里手工复刻这段逻辑，**复刻错了**（把三者当"同时成立"），
 *   结果"无空间时数据根产物"被判越界 → 差点得出"实现有 bug"的错误结论。
 *   ⇒ 教训：**允许根不能在任何地方被复刻**，只能有一个定义（这里）。
 *
 * @param workspaceDir 会话工作目录
 * @param conversationId 会话 id（产物目录按它归档）
 */
export function allowedRootsFor(workspaceDir?: string | null, conversationId?: string | null): string[] {
  const roots: string[] = [];
  const ws = (workspaceDir || '').trim();
  if (ws) roots.push(ws);
  if (conversationId) {
    for (const category of ['intermediate', 'deliverable', 'upload'] as const) {
      try {
        const r = resolveArtifactDirFor({ conversationId, category });
        // ★ 用 **root**（产物根）而不是仅具体分类目录：同一根下的其它分类目录也该放行
        //   （否则 file_read 读自己上一轮的 intermediate 会被拦）。
        if (r.root) roots.push(r.root);
        if (r.dir) roots.push(r.dir);
      } catch { /* 解析失败不阻断：少一个根最多多弹一次窗，不会误放行 */ }
    }
  }
  // 兜底：连会话 id 都没有时，至少用全局工作目录/数据根（与 resolveArtifactRoot 同序）。
  // 不加兜底会让"没有任何根"→ checkPathAccess 保守报 need-auth → 所有调用都弹窗。
  if (roots.length === 0 && ws) roots.push(ws);
  if (roots.length === 0) {
    const globalWs = (serverState.workspaceDir || '').trim();
    if (globalWs) roots.push(globalWs);
  }
  return [...new Set(roots.map((r) => r.replace(/[\\/]+$/, '')))].filter(Boolean);
}

export type PathGuardVerdict =
  | { kind: 'allow' }
  | { kind: 'need-auth'; items: PathAccessItem[] };

/**
 * 判定一次工具调用是否需要用户授权。
 *
 * 返回 `allow` = 全部目标都在允许根内（或该工具不碰路径）；
 * 返回 `need-auth` = 存在越界目标，**需要用户点头**（调用方决定弹窗 / 拒绝）。
 *
 * ★ 一次列出**全部**越界项（同一次调用里 `doyz` 可能同时给 file + out）
 *   —— 逐个弹是体验灾难（本项目既有约定：一次问全，不要挤牙膏）。
 */
export function checkPathAccess(input: PathGuardInput): PathGuardVerdict {
  const { toolName, args, workspaceDir, allowedRoots, authorizedDirs = [] } = input;
  const roots = [...allowedRoots, ...authorizedDirs].filter((r): r is string => !!r && !!r.trim());

  // 命令类：抽不到路径 → 整条命令授权（调用方按会话记「首次授权」）
  if (COMMAND_TOOLS.has(toolName)) {
    return {
      kind: 'need-auth',
      items: [{
        toolName,
        action: 'write',
        absPath: '',
        rawPath: summarizeCommandArgs(args),
      }],
    };
  }

  const items = collectPathArgs(toolName, args, workspaceDir);
  if (items.length === 0) return { kind: 'allow' };
  if (roots.length === 0) {
    // 没有任何允许根（未设工作目录且产物解析失败）→ 不能"默认全放行"，
    // 也不能"全部拦死"（会把整个应用卡住）。交由调用方按策略处理：
    // 这里保守报 need-auth，让调用方在"无人值守"时明确拒绝、有前端时问用户。
    return { kind: 'need-auth', items };
  }
  const outside = items.filter((it) => !roots.some((r) => isWithinRoot(it.absPath, r)));
  if (outside.length === 0) return { kind: 'allow' };
  return { kind: 'need-auth', items: outside };
}

/** 把命令类工具的入参压成一行给用户过目（截断防超长） */
function summarizeCommandArgs(args: Record<string, unknown> | null | undefined): string {
  if (!args) return '';
  const cmd = typeof args.command === 'string' ? args.command : '';
  const cmdArgs = Array.isArray(args.args) ? (args.args as unknown[]).map(String) : [];
  if (cmd) return [cmd, ...cmdArgs].join(' ').slice(0, 500);
  if (typeof args.code === 'string') {
    return args.code.replace(/\s+/g, ' ').trim().slice(0, 500);
  }
  try { return JSON.stringify(args).slice(0, 500); } catch { return ''; }
}

// ───────────────────────── 会话级授权状态（内存） ─────────────────────────
//
// ★ 为什么第一版只做**会话级**（不做全局持久化）：
//   越界访问本身是低频动作，会话级已能消掉绝大多数重复弹窗；
//   而"全局长期授权"会**持续扩大攻击面**（用户半年后忘了自己授权过 `C:/`），
//   价值与风险不成正比。全局授权目录留作后续可选（见方案 2.5）。

/** 会话 → 已授权目录集合（父目录粒度） */
const authorizedDirsByConv = new Map<string, Set<string>>();
/** 会话 → 是否已授权命令类工具（cmd_exec / python_exec） */
const commandAuthorizedConvs = new Set<string>();

/** 记录「允许该目录（本会话）」。dir 传目标路径，内部存其父目录。 */
export function authorizeDir(conversationId: string, targetAbsPath: string): string {
  const dir = path.dirname(path.resolve(targetAbsPath));
  let set = authorizedDirsByConv.get(conversationId);
  if (!set) { set = new Set(); authorizedDirsByConv.set(conversationId, set); }
  set.add(dir);
  return dir;
}

/** 取本会话已授权目录（判定时并入允许根） */
export function getAuthorizedDirs(conversationId: string): string[] {
  const set = authorizedDirsByConv.get(conversationId);
  return set ? [...set] : [];
}

/** 本会话是否已授权命令类工具 */
export function isCommandAuthorized(conversationId: string): boolean {
  return commandAuthorizedConvs.has(conversationId);
}

/** 记录「允许命令类工具（本会话）」 */
export function authorizeCommand(conversationId: string): void {
  commandAuthorizedConvs.add(conversationId);
}

/** 清理会话授权（会话删除/结束时调用；不调也只是内存泄漏一小块，不影响正确性） */
export function clearAuthorization(conversationId: string): void {
  authorizedDirsByConv.delete(conversationId);
  commandAuthorizedConvs.delete(conversationId);
}

/** 供测试重置全部状态 */
export function resetAllAuthorizations(): void {
  authorizedDirsByConv.clear();
  commandAuthorizedConvs.clear();
}

// ───────────────────────── 已知不覆盖（必须随交付说明，不能装作没有）─────────────────────────
//
// 1. **`cmd_exec` 的 `args` 数组**：`["python", "C:/outside/x.py"]` —— 路径在数组元素里，
//    字段名不固定，静态抽取不可能。已按用户决策走「整条命令首次授权 + 全量审计」（COMMAND_TOOLS）。
// 2. **`python_exec` 的代码字符串**：`open("C:/outside/x")` —— 静态抽取在原理上不可能（等价于
//    静态分析任意程序）。同上，走整条命令授权。
// 3. **数组型路径参数**（如 `media_compose.segments[].file`）：本版只支持**顶层字符串字段**。
//    接入方式与 media_edit 同（在 TOOL_PATH_ARGS 加条目即可），但需要先把抽取函数扩展为
//    支持"数组元素里的字段" —— 留作后续，**当前不装作已覆盖**。
// 4. **MCP / 自定义工具**（`mcp_*` / `custom_*`）：外部来源，副作用不可静态判定 ——
//    只读会话已由 tool-permission 的 UNCONTROLLABLE_PREFIXES 拒绝；full 模式下仍可任意访问，
//    属"外部来源不可控"，本模块不覆盖。
// 5. **Web 端**：apps/web/src/platform.ts 的 WebFs 天然限制在用户授权的 rootHandle 内
//    → 本来就有边界（弹窗在 Web 端基本不会触发，保留作二道防线）。