/**
 * 内置插件包扫描（mode-pluginization P1）。
 *
 * 内置插件有两种物理形态，运行时按「包优先、源码兜底」装载：
 *  · 插件包：`plugins/builtin/<id>/{manifest.json, backend/index.js}` —— build-plugins.mjs
 *    的产物。dev 落在 apps/server/plugins/builtin；打包由 electron-builder 拷到
 *    resources/server/dist/plugins/builtin。manifest.json 为单清单或 { multi, manifests }。
 *  · 源码：src/plugins/*.ts 直接 registerBuiltin（历史行为，包缺失时的兜底）。
 *
 * bare import（express/@yan-zhi/core 等）由 Node 沿目录上溯解析到 server 的 node_modules，
 * 原生依赖零复制；宿主内部模块一律经 host-bridge（esbuild 重定向到 __YZ_SERVER_HOST__ shim）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PluginManifest } from '@yan-zhi/core';

const moduleDir = path.dirname(fileURLToPath(import.meta.url)); // …/apps/server/src/plugins 或 …/dist/apps/server/src/plugins

/** 候选根目录：打包布局（resources/server/dist/plugins/builtin）与 dev 布局（apps/server/plugins/builtin） */
export function builtinPackageDirs(): string[] {
  const dirs: string[] = [];
  const rp = (process as unknown as { resourcesPath?: string }).resourcesPath;
  if (rp) dirs.push(path.join(rp, 'server', 'dist', 'plugins', 'builtin'));
  // dev：src/plugins 上溯两级 = apps/server
  dirs.push(path.resolve(moduleDir, '..', '..', 'plugins', 'builtin'));
  // 打包（dist 直跑）：…/dist/apps/server/src/plugins 上溯四级 = resources/server/dist
  dirs.push(path.resolve(moduleDir, '..', '..', '..', '..', 'plugins', 'builtin'));
  return [...new Set(dirs)].filter((d) => fs.existsSync(d));
}

export interface BuiltinPackageEntry {
  manifest: PluginManifest;
  /** 插件包后端入口绝对路径（backend/index.js） */
  entryPath: string;
  /** 所属包目录 */
  packageDir: string;
}

export interface BuiltinPackageScan {
  /** 全部展开后的插件（multi 包已按清单展开），id → 条目。同名先到先得（内置优先于已安装由调用方保证）。 */
  byId: Map<string, BuiltinPackageEntry>;
  /** multi 包（一个目录多个清单，如 skins 的 27 套皮肤）——调用方整包注册 */
  multiPackages: { packageDir: string; entryPath: string; manifests: PluginManifest[] }[];
}

/** 扫描全部 builtin 包目录（dirs 可注入，供测试用临时目录）。损坏包跳过（不阻断启动）。 */
export function scanBuiltinPackages(dirs?: string[]): BuiltinPackageScan {
  const byId = new Map<string, BuiltinPackageEntry>();
  const multiPackages: BuiltinPackageScan['multiPackages'] = [];
  for (const dir of dirs ?? builtinPackageDirs()) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const pkgDir = path.join(dir, name);
      const mfFile = path.join(pkgDir, 'manifest.json');
      if (!fs.statSync(pkgDir).isDirectory() || !fs.existsSync(mfFile)) continue;
      const entryPath = path.join(pkgDir, 'backend', 'index.js');
      try {
        const j = JSON.parse(fs.readFileSync(mfFile, 'utf8')) as
          | PluginManifest
          | { multi: boolean; manifests: PluginManifest[] };
        if ('multi' in j && Array.isArray(j.manifests)) {
          const valid = j.manifests.filter((m) => m && typeof m.id === 'string');
          multiPackages.push({ packageDir: pkgDir, entryPath, manifests: valid });
          for (const m of valid) if (!byId.has(m.id)) byId.set(m.id, { manifest: m, entryPath, packageDir: pkgDir });
        } else {
          const single = j as PluginManifest;
          if (single && typeof single.id === 'string' && !byId.has(single.id)) {
            byId.set(single.id, { manifest: single, entryPath, packageDir: pkgDir });
          }
        }
      } catch {
        /* 清单损坏 → 跳过该包，不阻断启动 */
      }
    }
  }
  return { byId, multiPackages };
}
