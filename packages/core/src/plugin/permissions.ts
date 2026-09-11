// 平台适配器权限过滤代理
import type { PlatformAdapter } from '../platform/types';
import type { PluginPermission } from './types';
import { createSandboxedDb } from './sandbox-db';

export class PermissionDeniedError extends Error {
  constructor(perm: string) {
    super(`插件权限不足: ${perm}`);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * 按清单 permissions 字段过滤 adapter：未声明对应权限的能力被屏蔽。
 * - shell: 未声明则置 undefined
 * - fs / db: 未声明则访问抛 PermissionDeniedError
 * - db: 声明后仍经 DB 沙箱包装——仅可操作 plugin_<插件id>__ 前缀的私有表，系统表全拒
 */
export function createSandboxedAdapter(
  adapter: PlatformAdapter,
  perms: PluginPermission[],
  pluginId = '',
): PlatformAdapter {
  const allowShell = perms.includes('shell');
  const allowFs = perms.includes('fs');
  const allowDb = perms.includes('db');

  const deny = (perm: string): ProxyHandler<object> => ({
    get() {
      throw new PermissionDeniedError(perm);
    },
  });

  return {
    platform: adapter.platform,
    db: allowDb
      ? createSandboxedDb(adapter.db, pluginId)
      : (new Proxy(adapter.db as object, deny('db')) as PlatformAdapter['db']),
    fs: allowFs ? adapter.fs : (new Proxy(adapter.fs as object, deny('fs')) as PlatformAdapter['fs']),
    keyring: adapter.keyring,
    mcp: adapter.mcp,
    shell: allowShell ? adapter.shell : undefined,
  };
}