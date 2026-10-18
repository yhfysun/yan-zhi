/**
 * 便携 Node 自动安装（ensurePortableNode 链路）行为测试。
 *
 * 修复点（2026-10-17）：
 *   ① 下载地址解析失败——旧代码用 npmmirror.com/mirrors/node/... 目录，该地址已 302 跳转到
 *      JSON 二进制 API，HTML 正则匹配不到 → 两镜像都解析失败 → 安装失败。
 *      现改为：npmmirror 二进制 API（JSON listing）解析最新 v24 版本 + 直接拼正确 zip URL
 *      （registry.npmmirror.com/-/binary/node/v<ver>/node-v<ver>-win-x64.zip），nodejs.org 兜底。
 *   ② 解压嵌套目录——官方包顶层是 node-vX.Y.Z-<plat>/ 子目录，旧代码直接 -C 到目标目录导致
 *      node.exe 落进子目录、后续 getNodeVersion/resolveOpenclawCmd 找不到二进制 → 安装失败。
 *      现改为：解压到临时目录后 flattenExtractedNode 把嵌套内容提到目标根目录。
 *
 * 不依赖真联网/真下载：resolveLatestV24 用 mock fetch，flatten 用真实 fs 结构。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveLatestV24, flattenExtractedNode } from '../src/services/openclaw-manager';

const ORIGINAL_FETCH = globalThis.fetch;
beforeEach(() => { (globalThis as any).fetch = vi.fn(); });
afterEach(() => { (globalThis as any).fetch = ORIGINAL_FETCH; });

describe('resolveLatestV24：版本解析（优先 npmmirror JSON，兜底 nodejs.org HTML）', () => {
  it('★ npmmirror JSON listing 取最新 v24 目录，去掉尾斜杠并按版本排序', async () => {
    const json = [
      { name: 'v23.11.0/' },
      { name: 'v24.19.0/' },
      { name: 'v24.22.0/' },
      { name: 'index.json' },
    ];
    (globalThis as any).fetch = vi.fn(async () => new Response(JSON.stringify(json), { status: 200 }));
    const v = await resolveLatestV24(() => {});
    expect(v).toBe('24.22.0');
  });

  it('★ npmmirror 失败时回落 nodejs.org 目录 HTML 正则', async () => {
    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (url.includes('registry.npmmirror.com')) return new Response('boom', { status: 500 });
      return new Response(
        '<a href="node-v24.20.0-win-x64.zip">node-v24.20.0-win-x64.zip</a>' +
        '<a href="node-v24.22.0-win-x64.zip">node-v24.22.0-win-x64.zip</a>',
        { status: 200 },
      );
    });
    const v = await resolveLatestV24(() => {});
    expect(v).toBe('24.22.0');
  });

  it('★ 两镜像都失败 → 返回 null（调用方据此抛「未能解析」）', async () => {
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('network down'); });
    const v = await resolveLatestV24(() => {});
    expect(v).toBeNull();
  });
});

describe('flattenExtractedNode：拍平官方包嵌套 node-v* 子目录', () => {
  // 真实契约：extractDir 是 NODE_RUNTIME_DIR/__extract__，拍平后内容提到 dirname(extractDir)
  // （即 NODE_RUNTIME_DIR），随后 __extract__ 被整体删除。
  it('★★ 把 node-vX-win-x64/ 内的 node.exe / npm.cmd / node_modules 提到上级目录', () => {
    const root = mkdtempSync(join(tmpdir(), 'pn-flatten-'));
    const extractDir = join(root, '__extract__');
    mkdirSync(extractDir, { recursive: true });
    const nested = join(extractDir, 'node-v24.22.0-win-x64');
    mkdirSync(join(nested, 'node_modules', 'npm', 'bin'), { recursive: true });
    writeFileSync(join(nested, 'node.exe'), 'MZ');
    writeFileSync(join(nested, 'npm.cmd'), '@echo');
    writeFileSync(join(nested, 'node_modules', 'npm', 'bin', 'npm-cli.js'), '//');

    flattenExtractedNode(extractDir);

    // 拍平后内容应在上级 root（NODE_RUNTIME_DIR）目录
    expect(existsSync(join(root, 'node.exe'))).toBe(true);
    expect(existsSync(join(root, 'npm.cmd'))).toBe(true);
    expect(existsSync(join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js'))).toBe(true);
    // 嵌套的 node-v* 目录应被清空（内容已上移）
    expect(readdirSync(nested)).toEqual([]);
  });

  it('★ 解压结构异常（无 node-v* 目录）→ 抛「未找到 node 目录」', () => {
    const root = mkdtempSync(join(tmpdir(), 'pn-flatten-bad-'));
    const extractDir = join(root, '__extract__');
    mkdirSync(extractDir, { recursive: true });
    writeFileSync(join(extractDir, 'readme.txt'), 'x');
    expect(() => flattenExtractedNode(extractDir)).toThrow(/未找到 node 目录/);
  });
});
