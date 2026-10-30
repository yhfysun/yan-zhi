/**
 * 插件宿主桥 —— 插件代码取用宿主能力的唯一入口（白名单即权限面）。
 *
 * 插件有两种物理形态，共用同一份桥：
 *  · 源码形态（dev / 现状 src/plugins/*.ts 注册）：插件 `import { db } from '../host-bridge.js'`，
 *    tsx / tsc / vitest 直接解析到本文件 —— 单进程直连，与历史相对路径 import 行为完全一致。
 *  · 插件包形态（scripts/build-plugins.mjs 产物 backend/index.js）：esbuild 打包时把
 *    *host-bridge.js 的 import 重定向到生成的 shim（读 globalThis.__YZ_SERVER_HOST__），
 *    服务端在 import 插件入口**之前**经 injectServerHostBridge() 注入同一份能力。
 *
 * ★ 白名单纪律：新增导出 = 扩大所有插件的可用面。必须同步：
 *   1) openspec/changes/mode-pluginization/design.md §6 桥面白名单
 *   2) apps/server/test/host-bridge.test.ts 的导出快照
 *   3) apps/desktop/scripts/generate-host-shims.mjs 的 __server-host__ shim 生成（按本文件导出名）
 *
 * ★ 不进桥的：路由挂载（routes/*.ts）、ToolRegistry、license、平台适配器等宿主内部——
 *   插件要能力走 ctx（registerTool/registerBackendRoute/adapter），要数据走 ownedTables 沙箱。
 */
import {
  db, dataDir, hasSqliteVec, clearMessageSummaries,
  getLatestMessageSummary, insertMessageSummary,
  loadEffectiveTaskTypes, MESSAGE_LIST_COLS,
} from './db.js';
import { createLogger } from './services/logger.js';
import { pushPluginAudit } from './services/plugin-audit.js';
import { encrypt, decrypt } from './utils/crypto.js';
import { gitService } from './services/git.js';
// ★ path-guard 整面转发（2026-10-25 P3）：插件的命令/路径授权全走它，逐个登记会一直漏 ——
//   一次收编全部导出，桥面快照测试钉住清单。
import * as pathGuard from './services/path-guard.js';
import { runCmd, lookupOnPath, tarPathArg } from './services/exec-cmd.js';
import { serverState } from './state.js';
// P5 前置（P4 实装）：插件运行时补种（场景/智能体）走宿主种子写入器
import { applyBuiltinSeed } from './db.js';
// ★ 2026-10-26 P4（clip-mode 包化）：剪辑路由要用宿主的三样东西 ——
//   鉴权中间件、会话硬删（删项目=删会话，必须走 lifecycle 唯一出口）、
//   产物目录解析（hereDir 定位宿主资源，**不能**被复制进插件包，否则根目录算错）。
import { authMiddleware } from './auth.js';
import { hardDeleteRow } from './services/conversation-lifecycle.js';
import { resolveArtifactDirFor, ensureArtifactDirFor } from './services/artifact-dir.js';
import { chatViaRow } from './services/llm-call.js';
import { listReadContracts, runReadContract } from './services/read-contracts.js';

/** 桥面版本：插件包 manifest.engine 与它比对；不兼容字段变更时递增 */
export const HOST_BRIDGE_VERSION = 1;

// ---------------------------------------------------------------------------
// 通用 LLM JSON 调用（插件用）—— 只做「用默认模型跑一次、尽量取出 JSON」这一件事。
// ★ 为什么进桥面：AI 增强类能力（桌面整理的 AI 模式）要能无会话执行（一键/定时），
//   走不了对话链路；插件也不该各自拼 URL/鉴权，必须复用 chatViaRow 的统一鉴权与清洗。
// ---------------------------------------------------------------------------
export type LlmJsonResult =
  | { ok: true; text: string; data?: unknown; tokens: number }
  | { ok: false; code: 'no-model' | 'timeout' | 'bad-json' | 'upstream'; error: string };

export interface LlmJsonOptions {
  userId: string;
  system?: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
}

/** 宽松 JSON 提取：容忍 ```json 围栏与前后说明文字；取不到返回 undefined（不抛） */
export function extractJson(text: string): unknown {
  const s = String(text || '').trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : s;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

export async function llmJson(opts: LlmJsonOptions): Promise<LlmJsonResult> {
  try {
    const row = db
      .prepare(
        `SELECT m.*, p.id AS pid, p.api_url, p.api_key_enc, p.protocol, p.headers_json
         FROM model m JOIN platform p ON p.id = m.platform_id
         WHERE m.user_id = ? AND m.enabled = 1 AND m.type = 'llm'
         ORDER BY m.is_default DESC, m.created_at ASC LIMIT 1`,
      )
      .get(opts.userId);
    if (!row) return { ok: false, code: 'no-model', error: '未配置可用模型' };

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: opts.user });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, opts.timeoutMs ?? 20000));
    let content = '';
    let tokens = 0;
    try {
      const r = await chatViaRow(row as never, messages, {
        maxTokens: opts.maxTokens,
        signal: controller.signal,
      });
      content = r.content;
      tokens = r.tokens;
    } finally {
      clearTimeout(timer);
    }
    // data 为 undefined 时由调用方判定 bad-json（本函数只负责尽力解析）
    return { ok: true, text: content, data: extractJson(content), tokens };
  } catch (e) {
    const err = e as Error;
    const aborted = err?.name === 'AbortError' || /abort/i.test(err?.message || '');
    return { ok: false, code: aborted ? 'timeout' : 'upstream', error: err?.message || String(e) };
  }
}

export {
  db, dataDir, hasSqliteVec, clearMessageSummaries,
  getLatestMessageSummary, insertMessageSummary,
  loadEffectiveTaskTypes, MESSAGE_LIST_COLS,
  createLogger, pushPluginAudit, encrypt, decrypt, gitService,
  runCmd, lookupOnPath, tarPathArg, serverState,
  authMiddleware, hardDeleteRow, resolveArtifactDirFor, ensureArtifactDirFor, applyBuiltinSeed,
  listReadContracts, runReadContract,
};
export const {
  COMMAND_TOOLS, allowedRootsFor, authorizeCommand, authorizeDangerTool, authorizeDir,
  checkDangerousCommand, checkPathAccess, clearAuthorization, collectPathArgs,
  commandExecutionScope, getAuthorizedDirs, isCommandAuthorized, isDangerToolAuthorized,
  isWithinRoot, normalizeForCompare, resetAllAuthorizations, summarizeCommandArgs,
} = pathGuard;

/**
 * 把桥面挂到 globalThis（幂等）。插件包形态的后端入口经它取宿主能力；
 * 源码形态不走 globalThis，但提前注入无害（build-plugins 的 shim 只在有插件包时被 import）。
 */
export function injectServerHostBridge(): void {
  const g = globalThis as { __YZ_SERVER_HOST__?: Record<string, unknown> };
  if (g.__YZ_SERVER_HOST__) return;
  g.__YZ_SERVER_HOST__ = {
    version: HOST_BRIDGE_VERSION,
    db, dataDir, hasSqliteVec, clearMessageSummaries,
    getLatestMessageSummary, insertMessageSummary,
    loadEffectiveTaskTypes, MESSAGE_LIST_COLS,
    createLogger, pushPluginAudit, encrypt, decrypt, gitService,
    runCmd, lookupOnPath, tarPathArg, serverState,
    authMiddleware, hardDeleteRow, resolveArtifactDirFor, ensureArtifactDirFor, applyBuiltinSeed,
    llmJson, extractJson,
    listReadContracts, runReadContract,
    ...pathGuard,
  };
}
