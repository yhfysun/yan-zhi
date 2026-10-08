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
    if (m && !m[1].startsWith('#')) items.push(unquote(m[1]));
  }
  return items;
}

/**
 * 去掉 YAML 单/双引号包裹。
 *
 * ★ 为什么必须剥：排除规则形如 `- '!**\/*.map'` —— 这里的引号**不能省**，
 *   因为 YAML 会把裸的 `!foo` 当 **tag**（`!!str` 那一类）解析，而不是字符串。
 *   所以 yml 必须给引号，解析器就必须负责剥掉，否则 `startsWith('!')` 判不出来。
 */
function unquote(s) {
  if (s.length >= 2 && ((s[0] === "'" && s.at(-1) === "'") || (s[0] === '"' && s.at(-1) === '"'))) {
    return s.slice(1, -1);
  }
  return s;
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

/**
 * 体积裁剪规则一致性（2026-10-08 新增）。
 *
 * ★★ 为什么要测「三份 yml 的排除规则一致」：
 *   排除规则（`!**\/*.map` 等）是**逐份 yml 各写一遍**的，不是共用的。
 *   改一份漏两份 → 桌面 basic/pro 瘦了、lite 或 mac 没瘦（或反过来），
 *   产物体积对不上，而**构建全都成功、没有任何报错**，只能靠人比对文件才发现。
 *   这与 instance.cjs 漏登记是同一类「静默出错」问题，所以同样用测试钉住。
 *
 * ★ 另一条更紧的约束：排除规则**不能命中运行时必需品**。
 *   最典型的是 better-sqlite3 —— 它的 `deps/` 可排除（C 源码 8.8MB），
 *   但 `build/Release/better_sqlite3.node` 必须留（原生二进制，运行时加载）。
 *   所以这里专门断言「deps/ 被排除」且「build/ 未被任何规则覆盖」。
 */
describe('体积裁剪：三份 yml 的排除规则必须一致', () => {
  /** 从 files: 段抽出以 ! 开头的排除项（剥掉 YAML 必需的引号） */
  const exclusions = (yml) =>
    ymlFilesSection(yml).map(unquote).filter((i) => i.startsWith('!'));

  test('三份 yml 的排除项完全相同（改一份必须同步另两份）', () => {
    const [first, ...rest] = YMLS;
    const base = exclusions(first);
    assert.ok(base.length > 0, `${first} 没有任何排除规则 —— 裁剪被整段删掉了？`);
    for (const yml of rest) {
      assert.deepStrictEqual(
        exclusions(yml), base,
        `${yml} 的排除规则与 ${first} 不一致：\n` +
          `  ${first}: ${base.join(', ')}\n` +
          `  ${yml}: ${exclusions(yml).join(', ')}\n` +
          `  → 会导致不同档位产物体积对不上，且构建不会报错。`,
      );
    }
  });

  test('★ 必须排除 sourcemap（实测 3844 个文件共 45MB，asar 的 30%+）', () => {
    for (const yml of YMLS) {
      const ex = exclusions(yml);
      assert.ok(ex.includes('!**/*.js.map'), `${yml} 未排除 *.js.map`);
      assert.ok(ex.includes('!**/*.mjs.map'), `${yml} 未排除 *.mjs.map`);
      assert.ok(ex.includes('!**/*.css.map'), `${yml} 未排除 *.css.map`);
    }
  });

  test('★★ 排除规则不得误伤运行时必需品（better-sqlite3 的 build/ 必须保留）', () => {
    for (const yml of YMLS) {
      const ex = exclusions(yml);
      // deps/ 可以（也只应）被排除：那是 sqlite3 的 C 源码，运行时不读
      assert.ok(
        ex.includes('!**/node_modules/better-sqlite3/deps/**'),
        `${yml} 未排除 better-sqlite3/deps（该目录 9.5MB 纯冗余）`,
      );
      // build/ 绝不能被排除：better_sqlite3.node 在里面，运行时加载它
      const hitBuild = ex.filter((rule) => /better-sqlite3\/(build|lib)\//.test(rule));
      assert.deepStrictEqual(
        hitBuild, [],
        `${yml} 的排除规则命中了 better-sqlite3 的 build/ 或 lib/（原生二进制会被裁掉）：${hitBuild.join(', ')}`,
      );
    }
  });
});

describe('体积裁剪：electronLanguages 三份一致', () => {
  const languagesOf = (yml) => {
    const src = fs.readFileSync(path.join(DESKTOP, yml), 'utf8');
    const lines = src.split(/\r?\n/);
    const start = lines.findIndex((l) => /^electronLanguages:\s*$/.test(l));
    if (start === -1) return null;
    const out = [];
    for (let i = start + 1; i < lines.length; i++) {
      const m = lines[i].match(/^\s*-\s+(.+?)\s*$/);
      if (!m) break;
      out.push(m[1]);
    }
    return out;
  };

  test('三份 yml 都限制了语言包，且集合一致（locales 实测 41MB）', () => {
    const values = YMLS.map((y) => [y, languagesOf(y)]);
    for (const [yml, langs] of values) {
      assert.ok(langs, `${yml} 缺 electronLanguages —— 会随包 Electron 全部语言包（41MB）`);
      assert.ok(langs.length > 0, `${yml} 的 electronLanguages 为空`);
    }
    const base = values[0][1];
    for (const [yml, langs] of values.slice(1)) {
      assert.deepStrictEqual(langs, base, `${yml} 的语言包与 ${values[0][0]} 不一致`);
    }
  });
});