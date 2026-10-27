// 多清单 .yzp（skins 类）安装语义（P6）：目录扫描、卸载删目录、重启补绑。
//
// 三条易错判断用纯函数钉住：
//   ① 多清单包一个目录含多个插件 —— 卸载其中一个不能删目录，否则兄弟插件跟着消失；
//   ② 重启恢复必须按清单逐条补绑，入口是 backend/index.js（旧实现固定 index.js）；
//   ③ 老式数组/无 id 包装的包没有安装目录名可用，安装端必须拒绝（结构层给出 packageId=null）。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  installedRebinds,
  packageDirsToRemove,
  parsePackageManifest,
  readInstalledPackage,
  scanInstalledPackages,
} from '../src/plugins/installed-packages.js';
import type { PluginManifest } from '@yan-zhi/core';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writePackage(root: string, dirName: string, manifest: unknown, entry: boolean) {
  const dir = path.join(root, dirName);
  fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (entry) fs.writeFileSync(path.join(dir, 'backend', 'index.js'), 'export default { async activate() {} };');
  return dir;
}

const mf = (id: string): PluginManifest => ({ id, name: id, version: '1.0.0' });

describe('parsePackageManifest', () => {
  it('单清单：packageId = manifest.id', () => {
    const s = parsePackageManifest({ id: 'demo', name: 'x', version: '1.0.0' });
    expect(s.kind).toBe('single');
    expect(s.packageId).toBe('demo');
    expect(s.rawManifests).toHaveLength(1);
  });

  it('多清单包装：packageId 取顶层 id（缺 id → null，安装端据此拒绝）', () => {
    const withId = parsePackageManifest({ id: 'skins', multi: true, count: 2, manifests: [{ id: 'a' }, { id: 'b' }] });
    expect(withId.kind).toBe('multi');
    expect(withId.packageId).toBe('skins');
    expect(withId.rawManifests).toHaveLength(2);

    const noId = parsePackageManifest({ multi: true, manifests: [{ id: 'a' }] });
    expect(noId.kind).toBe('multi');
    expect(noId.packageId).toBeNull();

    const legacy = parsePackageManifest([{ id: 'a' }]);
    expect(legacy.kind).toBe('multi');
    expect(legacy.packageId).toBeNull();
  });
});

describe('scanInstalledPackages / readInstalledPackage', () => {
  it('单清单与多清单目录都能读，坏清单与缺清单目录被跳过', () => {
    const root = tmpDir('inst-scan-');
    writePackage(root, 'solo', mf('solo'), true);
    writePackage(root, 'pack', { id: 'pack', multi: true, count: 2, manifests: [mf('p1'), mf('p2')] }, true);
    fs.mkdirSync(path.join(root, 'broken'), { recursive: true });
    fs.writeFileSync(path.join(root, 'broken', 'manifest.json'), '{oops');
    fs.mkdirSync(path.join(root, 'empty'), { recursive: true });

    const pkgs = scanInstalledPackages(root);
    expect(pkgs.map((p) => p.dirName).sort()).toEqual(['pack', 'solo']);
    expect(pkgs.find((p) => p.dirName === 'pack')!.manifests.map((m) => m.id)).toEqual(['p1', 'p2']);
    expect(readInstalledPackage(path.join(root, 'missing'), 'missing')).toBeNull();
  });

  it('根目录不存在 → 空数组（不抛错）', () => {
    expect(scanInstalledPackages(path.join(tmpDir('inst-none-'), 'nope'))).toEqual([]);
  });
});

describe('packageDirsToRemove（卸载删目录）', () => {
  const root = tmpDir('inst-remove-');
  const multiDir = writePackage(root, 'pack', { id: 'pack', multi: true, manifests: [mf('p1'), mf('p2')] }, true);
  const soloDir = writePackage(root, 'solo', mf('solo'), true);
  const pkgs = scanInstalledPackages(root);

  it('多清单包还有兄弟插件在注册 → 保留目录', () => {
    const registered = new Set(['p2']);
    const dirs = packageDirsToRemove(pkgs, 'p1', (id) => registered.has(id));
    expect(dirs).not.toContain(multiDir);
  });

  it('多清单包最后一个插件被卸载 → 删除目录', () => {
    const dirs = packageDirsToRemove(pkgs, 'p1', () => false);
    expect(dirs).toContain(multiDir);
  });

  it('单清单包卸载 → 删除目录', () => {
    expect(packageDirsToRemove(pkgs, 'solo', () => false)).toEqual([soloDir]);
  });

  it('不属于任何包 → 不删任何目录', () => {
    expect(packageDirsToRemove(pkgs, 'ghost', () => true)).toEqual([]);
  });
});

describe('installedRebinds（重启恢复）', () => {
  it('多清单包为每个已注册 id 补绑同一入口，未注册的 id 跳过', () => {
    const root = tmpDir('inst-rebind-');
    const dir = writePackage(root, 'pack', { id: 'pack', multi: true, manifests: [mf('p1'), mf('p2')] }, true);
    const rebinds = installedRebinds(scanInstalledPackages(root), (id) => id === 'p1' || id === 'p2');
    expect(rebinds.map((r) => r.id)).toEqual(['p1', 'p2']);
    for (const r of rebinds) expect(r.entryPath).toBe(path.join(dir, 'backend', 'index.js'));

    const onlyP1 = installedRebinds(scanInstalledPackages(root), (id) => id === 'p1');
    expect(onlyP1.map((r) => r.id)).toEqual(['p1']);
  });

  it('入口缺失的包不产出补绑（不让重启把插件激活成 error）', () => {
    const root = tmpDir('inst-noentry-');
    writePackage(root, 'solo', mf('solo'), false);
    expect(installedRebinds(scanInstalledPackages(root), () => true)).toEqual([]);
  });
});
