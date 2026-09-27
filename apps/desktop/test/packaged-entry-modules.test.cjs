/**
 * 打包入口模块登记守门测试（2026-09-27，真实崩溃换来的）。
 *
 * ★★ 背景：main.cjs 第 10 行 `require('./instance.cjs')`，但三份 electron-builder yml 的
 *    `files:` 段都没登记 `instance.cjs` → 打出的 app.asar 里没有这个文件 →
 *    **安装版启动即崩**：
 *      `A JavaScript error occurred in the main process`
 *      `Error: Cannot find module './instance.cjs'`
 *    这与更早的 `keyring-crypto.cjs` 漏登记是**同一类坑**（新增 .cjs 模块忘了同步 yml）。
 *
 * ★ 为什么值得做成测试：这类漏登记在开发/CI 里**完全不报错** ——
 *    `pnpm build` 成功、asar 也产出了，只有用户装上才崩。
 *    而且它极容易复发：以后每加一个 main/preload 侧的本地 .cjs 模块都要记得登记。
 *
 * 判据（两条一起看，缺一不可）：
 *   ① main.cjs / preload.cjs 里每个 `require('./x.cjs')` 的文件都真实存在于 apps/desktop/；
 *   ② 每个都被登记进**三份** yml 的 files: 段（漏任一份，该档位产物就崩）。
 *
 * 运行：node --test apps/desktop/test/
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const YMLS = ['electron-builder.full.yml', 'electron-builder.lite.yml', 'electron-builder.mac.yml'];

/** 从主进程/预加载脚本里抽出所有本地 .cjs 依赖（`require('./x.cjs')`） */
function localCjsRequires(entryFiles) {
  const out = new Set();
  for (const f of entryFiles) {
    const p = path.join(DESKTOP, f);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    // 只认 './xxx.cjs' 形式；忽略 node_modules 包与绝对路径
    for (const m of src.matchAll(/require\(\s*'\.\/([^']+\.cjs)'\s*\)/g)) out.add(m[1]);
  }
  return [...out];
}

/** 从 yml 的 files: 段抽出登记项（该段到下一个顶级键为止） */
function ymlFilesSection(ymlName) {
  const src = fs.readFileSync(path.join(DESKTOP, ymlName), 'utf8');
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => /^files:\s*$/.test(l));
  assert.notStrictEqual(start, -1, `${ymlName} 里找不到 files: 段`);
  const items = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^[A-Za-z_]/.test(l)) break;          // 下一个顶级键 → 段结束
    const m = l.match(/^\s*-\s+(.+?)\s*$/);   // `  - xxx`
    if (m && !m[1].startsWith('#')) items.push(m[1]);
  }
  return items;
}

const ENTRY_FILES = ['main.cjs', 'preload.cjs', 'browser-preload.cjs', 'snip-preload.cjs'];

describe('打包入口模块：本地 require 必须真实存在', () => {
  const requires = localCjsRequires(ENTRY_FILES);

  test('至少能识别出已知的两个本地模块（防正则失效导致的假绿）', () => {
    assert.ok(requires.includes('instance.cjs'), `未识别到 instance.cjs，实际: ${requires.join(', ')}`);
    assert.ok(requires.includes('keyring-crypto.cjs'), `未识别到 keyring-crypto.cjs，实际: ${requires.join(', ')}`);
  });

  test('★ 每个被 require 的本地 .cjs 都真实存在于 apps/desktop/', () => {
    const missing = requires.filter((f) => !fs.existsSync(path.join(DESKTOP, f)));
    assert.deepStrictEqual(missing, [], `以下模块被 require 但文件不存在: ${missing.join(', ')}`);
  });
});

describe('打包入口模块：必须登记进三份 yml 的 files:', () => {
  const requires = localCjsRequires(ENTRY_FILES);

  for (const yml of YMLS) {
    test(`★★ ${yml} 登记了全部本地模块（漏一个 → 该档位安装版启动即崩）`, () => {
      const items = ymlFilesSection(yml);
      const missing = requires.filter((f) => !items.includes(f));
      assert.deepStrictEqual(
        missing, [],
        `${yml} 的 files: 段缺少 ${missing.join(', ')}\n` +
        `  → 打出的 app.asar 里不会有这些文件，main.cjs 顶层 require 会抛 ` +
        `"Cannot find module" 导致应用启动即崩。\n` +
        `  当前已登记: ${items.join(', ')}`,
      );
    });
  }

  test('★ 反向校验：instance.cjs 确实在三份 yml 里（修复的原始缺陷）', () => {
    for (const yml of YMLS) {
      assert.ok(
        ymlFilesSection(yml).includes('instance.cjs'),
        `${yml} 未登记 instance.cjs —— 这正是 2026-09-27 那次「安装版启动即崩」的根因`,
      );
    }
  });

  test('edition.json 与 keyring-crypto.cjs 也都在（既有约定，防回退）', () => {
    for (const yml of YMLS) {
      const items = ymlFilesSection(yml);
      assert.ok(items.includes('edition.json'), `${yml} 缺 edition.json`);
      assert.ok(items.includes('keyring-crypto.cjs'), `${yml} 缺 keyring-crypto.cjs`);
    }
  });
});