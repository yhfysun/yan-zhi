// 插件宿主桥（apps/server/src/host-bridge.ts）导出快照测试（mode-pluginization P0）。
//
// 桥面即插件的宿主权限面：新增导出 = 扩大所有插件可用面，必须**显式**改这份快照 +
// design.md §6 + generate-host-shims.mjs 的 __server-host__ shim（按导出名生成）。
// 静默扩面在这里被拦下。
import { describe, it, expect } from 'vitest';
import {
  HOST_BRIDGE_VERSION,
  injectServerHostBridge,
  db,
  createLogger,
  pushPluginAudit,
  encrypt,
  decrypt,
  gitService,
  isWithinRoot,
  runCmd,
  serverState,
} from '../src/host-bridge.js';

/** 桥面白名单快照 —— 扩面改这里 + design.md §6 + generate-host-shims.mjs（按本文件导出生成 shim）
 *  2026-10-25 P3 扩面：db 助手（dataDir/hasSqliteVec/消息摘要/任务类型）+ path-guard 整面 + exec-cmd 的 lookupOnPath
 *  2026-10-26 P4 扩面：authMiddleware / hardDeleteRow / resolveArtifactDirFor / ensureArtifactDirFor（clip-mode 包化） */
const EXPECTED_EXPORTS = [
  'applyBuiltinSeed', 'authMiddleware', 'ensureArtifactDirFor', 'hardDeleteRow', 'resolveArtifactDirFor',
  'COMMAND_TOOLS', 'allowedRootsFor', 'authorizeCommand', 'authorizeDangerTool', 'authorizeDir',
  'checkDangerousCommand', 'checkPathAccess', 'clearAuthorization', 'clearMessageSummaries',
  'collectPathArgs', 'commandExecutionScope', 'createLogger', 'dataDir', 'db', 'decrypt',
  'encrypt', 'getAuthorizedDirs', 'getLatestMessageSummary', 'gitService', 'hasSqliteVec',
  'insertMessageSummary', 'isCommandAuthorized', 'isDangerToolAuthorized', 'isWithinRoot',
  'loadEffectiveTaskTypes', 'lookupOnPath', 'MESSAGE_LIST_COLS', 'normalizeForCompare',
  'pushPluginAudit', 'resetAllAuthorizations', 'runCmd', 'serverState', 'summarizeCommandArgs',
].sort();

describe('插件宿主桥', () => {
  it('注入后 globalThis.__YZ_SERVER_HOST__ 含全部白名单能力', () => {
    injectServerHostBridge();
    const bridge = (globalThis as { __YZ_SERVER_HOST__?: Record<string, unknown> }).__YZ_SERVER_HOST__;
    expect(bridge).toBeTruthy();
    expect(Object.keys(bridge!).filter((k) => k !== 'version').sort()).toEqual(EXPECTED_EXPORTS);
    expect(bridge!.version).toBe(HOST_BRIDGE_VERSION);
    // 能力本体与模块导出是同一引用（dev 直连形态的单例保证）
    expect(bridge!.db).toBe(db);
    expect(bridge!.pushPluginAudit).toBe(pushPluginAudit);
  });

  it('注入幂等（二次调用不覆盖）', () => {
    injectServerHostBridge();
    const first = (globalThis as { __YZ_SERVER_HOST__?: unknown }).__YZ_SERVER_HOST__;
    injectServerHostBridge();
    expect((globalThis as { __YZ_SERVER_HOST__?: unknown }).__YZ_SERVER_HOST__).toBe(first);
  });

  it('宿主桥模块 re-export 与快照一致（防模块面与注入面漂移）', async () => {
    const mod = await import('../src/host-bridge.js');
    const moduleFace = mod as unknown as Record<string, unknown>;
    const keys = Object.keys(moduleFace)
      .filter((k) => k !== 'default' && k !== 'injectServerHostBridge' && k !== 'HOST_BRIDGE_VERSION')
      .sort();
    expect(keys).toEqual(EXPECTED_EXPORTS);
  });
});
