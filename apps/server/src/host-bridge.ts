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
import { runCmd, lookupOnPath } from './services/exec-cmd.js';
import { serverState } from './state.js';
// P5 前置（P4 实装）：插件运行时补种（场景/智能体）走宿主种子写入器
import { applyBuiltinSeed } from './db.js';
// ★ 2026-10-26 P4（clip-mode 包化）：剪辑路由要用宿主的三样东西 ——
//   鉴权中间件、会话硬删（删项目=删会话，必须走 lifecycle 唯一出口）、
//   产物目录解析（hereDir 定位宿主资源，**不能**被复制进插件包，否则根目录算错）。
import { authMiddleware } from './auth.js';
import { hardDeleteRow } from './services/conversation-lifecycle.js';
import { resolveArtifactDirFor, ensureArtifactDirFor } from './services/artifact-dir.js';

/** 桥面版本：插件包 manifest.engine 与它比对；不兼容字段变更时递增 */
export const HOST_BRIDGE_VERSION = 1;

export {
  db, dataDir, hasSqliteVec, clearMessageSummaries,
  getLatestMessageSummary, insertMessageSummary,
  loadEffectiveTaskTypes, MESSAGE_LIST_COLS,
  createLogger, pushPluginAudit, encrypt, decrypt, gitService,
  runCmd, lookupOnPath, serverState,
  authMiddleware, hardDeleteRow, resolveArtifactDirFor, ensureArtifactDirFor, applyBuiltinSeed,
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
    runCmd, lookupOnPath, serverState,
    authMiddleware, hardDeleteRow, resolveArtifactDirFor, ensureArtifactDirFor, applyBuiltinSeed,
    ...pathGuard,
  };
}
