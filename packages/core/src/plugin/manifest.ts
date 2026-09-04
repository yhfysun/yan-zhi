// 插件清单校验
import type { PluginManifest, PluginPermission } from './types';

export class ManifestError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ManifestError';
  }
}

const VALID_PERMS: PluginPermission[] = ['fs', 'shell', 'git', 'db', 'network', 'clipboard', 'desktop-input'];

/** 校验清单对象，返回类型安全的 manifest */
export function validateManifest(m: unknown): PluginManifest {
  if (!m || typeof m !== 'object') throw new ManifestError('清单不是对象');
  const o = m as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) throw new ManifestError('缺少 id');
  if (!/^[a-z][a-z0-9-]*$/.test(o.id)) throw new ManifestError('id 必须为 kebab-case（小写字母/数字/连字符）');
  if (typeof o.name !== 'string' || !o.name) throw new ManifestError('缺少 name');
  if (typeof o.version !== 'string' || !o.version) throw new ManifestError('缺少 version');
  if (Array.isArray(o.permissions)) {
    for (const p of o.permissions) {
      if (!VALID_PERMS.includes(p as PluginPermission)) throw new ManifestError(`未知权限: ${String(p)}`);
    }
  }
  return o as unknown as PluginManifest;
}