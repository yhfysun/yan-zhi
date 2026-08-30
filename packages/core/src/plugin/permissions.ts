// 平台适配器权限过滤代理
import type { PlatformAdapter } from '../platform/types';
import type { PluginPermission } from './types';

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
 */
export function createSandboxedAdapter(adapter: PlatformAdapter, perms: PluginPermission[]): PlatformAdapter {
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
    db: allowDb ? adapter.db : (new Proxy(adapter.db as object, deny('db')) as PlatformAdapter['db']),
    fs: allowFs ? adapter.fs : (new Proxy(adapter.fs as object, deny('fs')) as PlatformAdapter['fs']),
    keyring: adapter.keyring,
    mcp: adapter.mcp,
    shell: allowShell ? adapter.shell : undefined,
  };
}