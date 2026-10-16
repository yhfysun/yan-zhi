// 插件清单校验
import type { PluginManifest, PluginPermission } from './types';

export class ManifestError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ManifestError';
  }
}

// ★ 新增权限必须同时改 types.ts 的 PluginPermission 联合与本表 ——
//   漏改这里的后果不是"该权限被忽略"，而是 validateManifest **抛错**，
//   而它是在 registerBuiltin 里被调用的，一抛就中断**整个插件系统初始化**：
//   所有插件（含无关的 ops-shell / sec-lab）的后端路由全部不挂载 → 全量 404。
//   2026-10-16 实测踩过（shop-write 未登记，运维/安全/店铺三条线的接口一起 404），
//   故 test/shop-write-gate.test.ts 里加了一条「清单必须能通过真实 validateManifest」的守门。
const VALID_PERMS: PluginPermission[] = ['fs', 'shell', 'git', 'db', 'network', 'clipboard', 'desktop-input', 'remote-shell', 'shop-write'];

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