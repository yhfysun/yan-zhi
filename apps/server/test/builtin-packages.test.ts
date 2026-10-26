// 内置插件包扫描器（apps/server/src/plugins/builtin-packages.ts）守门测试。
//
// 「包优先、源码兜底」是内置插件切换插件包形态（P1）的装载契约：
//   · git-explorer 单清单包 → byId 命中，entryPath 指向包内 backend/index.js；
//   · skins 多清单包（{multi,manifests}）→ multiPackages 整包展开 27+ 套；
//   · 损坏 manifest.json 跳过不抛（不阻断启动）；
//   · 空目录/缺目录 → 全空（调用方走源码兜底）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanBuiltinPackages } from '../src/plugins/builtin-packages.js';

let root: string;

function writePkg(id: string, manifest: unknown, withBackend = true): void {
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  if (withBackend) {
    mkdirSync(join(dir, 'backend'), { recursive: true });
    writeFileSync(join(dir, 'backend', 'index.js'), 'export default { async activate() {} };\n', 'utf8');
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'yz-builtin-pkgs-'));
  writePkg('git-explorer', { id: 'git-explorer', name: 'Git 文件管理', version: '1.0.0' });
  writePkg('skins', {
    multi: true,
    manifests: [
      { id: 'skin-alpha', name: 'A', version: '1.0.0' },
      { id: 'skin-beta', name: 'B', version: '1.0.0' },
    ],
  });
  writePkg('broken', { id: 'broken', name: '坏包' });
  // 破坏它的 manifest（写在最后，避免 JSON.stringify 直接写坏难构造）
  writeFileSync(join(root, 'broken', 'manifest.json'), '{ not json', 'utf8');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('scanBuiltinPackages', () => {
  it('单清单包进 byId，多清单包整包进 multiPackages 并展开', () => {
    const scan = scanBuiltinPackages([root]);
    expect(scan.byId.has('git-explorer')).toBe(true);
    expect(scan.byId.get('git-explorer')?.entryPath).toContain(join('git-explorer', 'backend', 'index.js'));
    expect(scan.multiPackages).toHaveLength(1);
    expect(scan.multiPackages[0].manifests.map((m) => m.id)).toEqual(['skin-alpha', 'skin-beta']);
    expect(scan.byId.has('skin-alpha')).toBe(true);
    expect(scan.byId.get('skin-alpha')?.packageDir).toContain('skins');
  });

  it('损坏包跳过不抛', () => {
    const scan = scanBuiltinPackages([root]);
    expect(scan.byId.has('broken')).toBe(false);
  });

  it('目录不存在 → 全空（调用方走源码兜底）', () => {
    const scan = scanBuiltinPackages([join(root, 'not-exist')]);
    expect(scan.byId.size).toBe(0);
    expect(scan.multiPackages).toHaveLength(0);
  });
});
