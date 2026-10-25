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
  validateOptionalFields(o);
  return o as unknown as PluginManifest;
}

/** mode-pluginization 新增字段校验（全部可选，非法即抛——宁可拒绝安装也不带病运行） */
function validateOptionalFields(o: Record<string, unknown>): void {
  // engine：宿主兼容版本（semver range 简校验；安装时再做完整比对）
  if (o.engine !== undefined) {
    if (typeof o.engine !== 'string' || !/^(\^|~|>=?)?\d+\.\d+(\.\d+)?/.test(o.engine)) {
      throw new ManifestError(`engine 必须为 semver range（如 '^0.1'），收到: ${String(o.engine)}`);
    }
  }
  // ownedTables：插件自有表白名单（防 SQL 注入表名/越权摸主库）
  if (o.ownedTables !== undefined) {
    if (!Array.isArray(o.ownedTables)) throw new ManifestError('ownedTables 必须为数组');
    for (const t of o.ownedTables) {
      if (typeof t !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(t)) {
        throw new ManifestError(`ownedTables 表名非法: ${String(t)}`);
      }
    }
  }
  // ui：旧形态 string（兼容）；新形态对象 { entry }
  if (o.ui !== undefined && typeof o.ui !== 'string') {
    if (typeof o.ui !== 'object' || o.ui === null || Array.isArray(o.ui)) {
      throw new ManifestError('ui 必须为字符串或 { entry } 对象');
    }
    const ui = o.ui as Record<string, unknown>;
    if (ui.entry !== undefined && (typeof ui.entry !== 'string' || !ui.entry)) {
      throw new ManifestError('ui.entry 必须为非空字符串');
    }
  }
  // contributes.mode：模式声明（key 会进 conversation.mode 列与路由表，格式必须收紧）
  const contributes = o.contributes as Record<string, unknown> | undefined;
  const mode = contributes?.mode as Record<string, unknown> | undefined;
  if (mode !== undefined) {
    if (typeof mode !== 'object' || mode === null) throw new ManifestError('contributes.mode 必须为对象');
    if (typeof mode.key !== 'string' || !/^[a-z][a-z0-9-]*$/.test(mode.key)) {
      throw new ManifestError(`contributes.mode.key 必须为 kebab-case，收到: ${String(mode.key)}`);
    }
    if (typeof mode.route !== 'string' || !mode.route.startsWith('/')) {
      throw new ManifestError('contributes.mode.route 必须为以 / 开头的路由');
    }
    if (mode.entry !== undefined && (typeof mode.entry !== 'string' || !mode.entry)) {
      throw new ManifestError('contributes.mode.entry 必须为非空字符串');
    }
    if (mode.chatPlacement !== undefined && mode.chatPlacement !== 'center' && mode.chatPlacement !== 'side') {
      throw new ManifestError("contributes.mode.chatPlacement 只允许 'center' | 'side'");
    }
  }
}