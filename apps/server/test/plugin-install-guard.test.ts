// .yzp 安装闸（P6）：宿主版本解析 + manifest.engine 校验 + 后端入口三态解析。
//
// 为什么钉死这层：engine 校验错了的两个方向都很贵 ——
//   · 该拒没拒：新插件装进旧宿主，运行期才炸（用户看到的是"装上了但功能坏"）；
//   · 该放没放：存量 .yzp（全都没有 engine 字段）被误判不兼容，等于插件生态全灭。
// 入口解析错了则是第一方 .yzp 装回来必 state=error（见 install-entry.ts 注释）。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { satisfiesRange } from '@yan-zhi/core';
import {
  HOST_VERSION_ENV,
  PluginEngineError,
  assertPluginEngine,
  resolveHostVersion,
} from '../src/plugins/host-version.js';
import { resolveInstalledEntryPath, PluginInstallError } from '../src/plugins/install-entry.js';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const plugin = (extra: Record<string, unknown> = {}) => ({ id: 'demo', name: '示例插件', ...extra });

describe('satisfiesRange（engine 用的轻量 semver）', () => {
  it('^ / ~ / 比较符 / 裸版本', () => {
    expect(satisfiesRange('0.1.0', '^0.1')).toBe(true);
    expect(satisfiesRange('0.1.9', '^0.1')).toBe(true);
    expect(satisfiesRange('0.2.0', '^0.1')).toBe(false);
    expect(satisfiesRange('0.1.5', '~0.1.2')).toBe(true);
    expect(satisfiesRange('0.2.0', '~0.1.2')).toBe(false);
    expect(satisfiesRange('0.1.0', '>=0.1')).toBe(true);
    expect(satisfiesRange('0.0.9', '>=0.1')).toBe(false);
    expect(satisfiesRange('0.1.0', '0.1')).toBe(true); // 裸 x.y = >=x.y.0 <(x+1).0.0
    expect(satisfiesRange('0.2.0', '0.1')).toBe(false);
    expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
    expect(satisfiesRange('0.1.5', '>=0.1 <0.2')).toBe(true);
    expect(satisfiesRange('0.2.1', '>=0.1 <0.2')).toBe(false);
  });

  it('|| 或语义', () => {
    expect(satisfiesRange('0.3.0', '^0.1 || ^0.3')).toBe(true);
    expect(satisfiesRange('0.2.0', '^0.1 || ^0.3')).toBe(false);
  });

  it('预发布版本不被未点预发布的 range 匹配', () => {
    expect(satisfiesRange('0.2.0-beta.1', '^0.1')).toBe(false);
    expect(satisfiesRange('0.2.0-beta.1', '^0.2.0-beta.0')).toBe(true);
  });

  it('非法版本/range 抛错（不静默放行）', () => {
    expect(() => satisfiesRange('abc', '^0.1')).toThrow();
    expect(() => satisfiesRange('0.1.0', 'latest')).toThrow();
    expect(() => satisfiesRange('0.1.0', '')).toThrow();
  });
});

describe('assertPluginEngine', () => {
  it('兼容：放行', () => {
    expect(() => assertPluginEngine(plugin({ engine: '^0.1' }), '0.1.0')).not.toThrow();
  });

  it('不兼容：拒绝且文案含双方版本', () => {
    try {
      assertPluginEngine(plugin({ engine: '^0.5' }), '0.1.0');
      throw new Error('应当抛错');
    } catch (e) {
      expect(e).toBeInstanceOf(PluginEngineError);
      const msg = (e as Error).message;
      expect(msg).toContain('^0.5');
      expect(msg).toContain('0.1.0');
      expect(msg).toContain('版本不兼容');
    }
  });

  it('缺 engine / 空串 = 兼容（存量插件不受影响）', () => {
    expect(() => assertPluginEngine(plugin(), '0.1.0')).not.toThrow();
    expect(() => assertPluginEngine(plugin({ engine: undefined }), '0.1.0')).not.toThrow();
    expect(() => assertPluginEngine(plugin({ engine: '' }), '0.1.0')).not.toThrow();
  });

  it('非法 range：拒绝并说明声明非法', () => {
    expect(() => assertPluginEngine(plugin({ engine: 'latest' }), '0.1.0')).toThrow(/engine 声明非法/);
    expect(() => assertPluginEngine(plugin({ engine: '>=' }), '0.1.0')).toThrow(/engine 声明非法/);
  });
});

describe('resolveHostVersion', () => {
  it('YZ_HOST_VERSION 优先（主进程注入的打包版可靠来源）', () => {
    expect(resolveHostVersion({ env: { [HOST_VERSION_ENV]: '1.4.2' }, startDir: tmpDir('hv-') })).toBe('1.4.2');
  });

  it('env 非法时忽略，继续走目录探测', () => {
    const repo = tmpDir('hv-repo-');
    fs.mkdirSync(path.join(repo, 'apps', 'desktop'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'apps', 'desktop', 'package.json'), JSON.stringify({ name: 'app', version: '0.3.0' }));
    const start = path.join(repo, 'apps', 'server', 'src', 'plugins');
    fs.mkdirSync(start, { recursive: true });
    expect(resolveHostVersion({ env: { [HOST_VERSION_ENV]: 'not-a-version' }, startDir: start })).toBe('0.3.0');
  });

  it('没有应用包时回落 @yan-zhi/server 的版本，再没有就 0.0.0', () => {
    const repo = tmpDir('hv-srv-');
    fs.mkdirSync(path.join(repo, 'apps', 'server'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'apps', 'server', 'package.json'),
      JSON.stringify({ name: '@yan-zhi/server', version: '0.1.1' }),
    );
    const start = path.join(repo, 'apps', 'server', 'src');
    fs.mkdirSync(start, { recursive: true });
    expect(resolveHostVersion({ env: {}, startDir: start })).toBe('0.1.1');

    const bare = tmpDir('hv-none-');
    expect(resolveHostVersion({ env: {}, startDir: bare })).toBe('0.0.0');
  });
});

describe('resolveInstalledEntryPath（.yzp 入口三态）', () => {
  it('插件包形态：backend/index.js', () => {
    const dir = tmpDir('entry-pkg-');
    fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'backend', 'index.js'), 'export default {}');
    const entry = resolveInstalledEntryPath(dir, { id: 'demo', name: 'x', version: '0.1.0' });
    expect(entry).toBe(path.join(dir, 'backend', 'index.js'));
  });

  it('manifest.main 优先于约定路径', () => {
    const dir = tmpDir('entry-main-');
    fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'backend', 'index.js'), 'pkg');
    fs.writeFileSync(path.join(dir, 'main.js'), 'declared');
    const entry = resolveInstalledEntryPath(dir, { id: 'demo', name: 'x', version: '0.1.0', main: 'main.js' });
    expect(entry).toBe(path.join(dir, 'main.js'));
  });

  it('manifest.main 指向不存在的文件：可读报错', () => {
    const dir = tmpDir('entry-badmain-');
    expect(() =>
      resolveInstalledEntryPath(dir, { id: 'demo', name: 'x', version: '0.1.0', main: 'nope.js' }),
    ).toThrow(/声明的入口不存在/);
  });

  it('早期 .yzp：根 index.js', () => {
    const dir = tmpDir('entry-legacy-');
    fs.writeFileSync(path.join(dir, 'index.js'), 'legacy');
    expect(resolveInstalledEntryPath(dir, { id: 'demo', name: 'x', version: '0.1.0' })).toBe(path.join(dir, 'index.js'));
  });

  it('三种都没有：拒绝安装并说明应有入口', () => {
    const dir = tmpDir('entry-none-');
    try {
      resolveInstalledEntryPath(dir, { id: 'demo', name: 'x', version: '0.1.0' });
      throw new Error('应当抛错');
    } catch (e) {
      expect(e).toBeInstanceOf(PluginInstallError);
      expect((e as Error).message).toContain('backend/index.js');
    }
  });
});
