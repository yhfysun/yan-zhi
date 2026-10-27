/**
 * 已安装插件包（.yzp）的目录扫描与包级语义（P6 多清单支持）。
 *
 * 一个安装目录可能对应**多个插件**（skins 的 `{ id, multi: true, manifests: [...] }`），
 * 于是三处逻辑不能再按"目录名 === 插件 id"假设：
 *   ① 去重检查：包里任何一个 id 已存在都算冲突；
 *   ② 卸载：删掉其中一个 id 时，目录里还有别的已注册插件就不能删目录；
 *   ③ 重启恢复：一个目录要为包里每个已注册 id 补绑入口。
 * 本模块把这些判断做成纯函数（fs 可注入），供安装路由与启动恢复共用。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { PluginManifest } from '@yan-zhi/core';
import { resolveInstalledEntryPath } from './install-entry.js';

export interface PackageManifestShape {
  kind: 'single' | 'multi';
  /** 包 id = 安装目录名。单清单取 manifest.id；多清单取包装层 id（老包可能为 null） */
  packageId: string | null;
  /** 未校验的原始清单对象（逐条交给 validateManifest） */
  rawManifests: Record<string, unknown>[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 归类 manifest.json 的三种形态（单清单 / 旧数组 / 多清单包装），只做结构判断。
 *  ★ 不做过滤：条目是否合法交给 validateManifest（install）或 readInstalledPackage（扫描），
 *    否则"条目缺 id"会被这里静默丢掉，报错变成"清单为空"这种看不出原因的文案。 */
export function parsePackageManifest(raw: unknown): PackageManifestShape {
  if (Array.isArray(raw)) {
    return { kind: 'multi', packageId: null, rawManifests: raw as Record<string, unknown>[] };
  }
  if (isRecord(raw) && Array.isArray(raw.manifests)) {
    const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
    return { kind: 'multi', packageId: id, rawManifests: raw.manifests as Record<string, unknown>[] };
  }
  return {
    kind: 'single',
    packageId: isRecord(raw) && typeof raw.id === 'string' && raw.id ? raw.id : null,
    rawManifests: [raw as Record<string, unknown>],
  };
}

export interface InstalledPackage {
  /** 安装目录名（= 包 id） */
  dirName: string;
  dir: string;
  kind: 'single' | 'multi';
  packageId: string | null;
  /** 结构上可用的清单（含 id），未做完整校验 */
  manifests: PluginManifest[];
}

/** 读取单个安装目录的清单；目录/清单损坏返回 null（扫描不因一个坏包中断）。 */
export function readInstalledPackage(dir: string, dirName: string): InstalledPackage | null {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
  const shape = parsePackageManifest(raw);
  const manifests: PluginManifest[] = [];
  for (const m of shape.rawManifests) {
    if (typeof m.id === 'string' && m.id) manifests.push(m as unknown as PluginManifest);
  }
  if (!manifests.length) return null;
  return { dirName, dir, kind: shape.kind, packageId: shape.packageId, manifests };
}

/** 扫描已安装根目录下的全部插件包（目录不存在 → 空数组）。 */
export function scanInstalledPackages(root: string): InstalledPackage[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: InstalledPackage[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(root, ent.name);
    const pkg = readInstalledPackage(dir, ent.name);
    if (pkg) out.push(pkg);
  }
  return out;
}

/** 包后端入口（多清单共用一份）；找不到返回 null。 */
export function resolvePackageEntryPathIn(dir: string, manifests: PluginManifest[]): string | null {
  for (const m of manifests) {
    try {
      return resolveInstalledEntryPath(dir, m);
    } catch {
      /* 换下一条清单试（理论上同一目录入口一致） */
    }
  }
  return null;
}

/** 包后端入口（多清单共用一份）；找不到返回 null。 */
export function resolvePackageEntryPath(pkg: InstalledPackage): string | null {
  return resolvePackageEntryPathIn(pkg.dir, pkg.manifests);
}

/**
 * 卸载某个插件 id 后，哪些安装目录可以整个删掉。
 * 只有「包含该 id 且包里没有其它仍在注册的 id」的目录才删。
 */
export function packageDirsToRemove(
  packages: InstalledPackage[],
  pluginId: string,
  isRegistered: (id: string) => boolean,
): string[] {
  const out: string[] = [];
  for (const pkg of packages) {
    if (!pkg.manifests.some((m) => m.id === pluginId)) continue;
    const hasRemaining = pkg.manifests.some((m) => m.id !== pluginId && isRegistered(m.id));
    if (!hasRemaining) out.push(pkg.dir);
  }
  return out;
}

/** 重启恢复：为每个「包里已被 DB 恢复」的 id 补绑入口。 */
export function installedRebinds(
  packages: InstalledPackage[],
  isRegistered: (id: string) => boolean,
): { id: string; entryPath: string }[] {
  const out: { id: string; entryPath: string }[] = [];
  for (const pkg of packages) {
    const entryPath = resolvePackageEntryPath(pkg);
    if (!entryPath) continue;
    for (const m of pkg.manifests) {
      if (isRegistered(m.id)) out.push({ id: m.id, entryPath });
    }
  }
  return out;
}
