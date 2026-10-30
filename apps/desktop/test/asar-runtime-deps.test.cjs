/**
 * asar 运行时依赖边界守门（2026-10-30，安装慢查出来的）。
 *
 * ★★ 背景：`dependencies` 里的包 electron-builder 会**整棵依赖树**塞进 app.asar。
 *    渲染层（vue / element-plus / @yan-zhi/ui …）的包虽然列在 dependencies，
 *    但 Vite 早就把它们打进 `dist` 了 —— asar 里那份是**纯冗余**。
 *    实测（pro 档 10-30 产物）：app.asar 334MB 里 292MB 是这类包，
 *      @yan-zhi/ui 37MB（含 24MB 源码 + 14.8MB 宠物图集）、@napi-rs/canvas 36MB、
 *      echarts 24MB、docx 20MB、pdfjs 17MB、better-sqlite3 的 linux/musl prebuild …
 *    它不影响文件数（asar 是单文件），但直接拖长安装包解压时间。
 *    → 渲染层依赖一律放 devDependencies（构建期需要，运行期不需要）。
 *
 * 判据（双向，缺一不可）：
 *   ① 随包的 .cjs 模块里每个 `require('裸包名')` 都必须在 dependencies 里
 *      —— 漏登记 = 打包版启动即崩（Cannot find module）。
 *   ② dependencies 里的每个包都必须真的被某个随包模块 require
 *      —— 多登记 = asar 白胖（就是本次要修的问题）。
 *
 * 运行：node --test apps/desktop/test/
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');

const DESKTOP = path.resolve(__dirname, '..');
const YMLS = ['electron-builder.full.yml', 'electron-builder.lite.yml', 'electron-builder.mac.yml'];

/** 内建模块 + electron 本身不算第三方依赖 */
const BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'electron',
]);

/** 从 yml 的 files: 段抽登记项（该段到下一个顶级键为止） */
function ymlFilesSection(ymlName) {
  const src = fs.readFileSync(path.join(DESKTOP, ymlName), 'utf8');
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => /^files:\s*$/.test(l));
  assert.notStrictEqual(start, -1, `${ymlName} 里找不到 files: 段`);
  const items = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^[A-Za-z_]/.test(l)) break;
    const m = l.match(/^\s*-\s+(.+?)\s*$/);
    if (!m || m[1].startsWith('#')) continue;
    let v = m[1];
    if (v.length >= 2 && ((v[0] === "'" && v.at(-1) === "'") || (v[0] === '"' && v.at(-1) === '"'))) {
      v = v.slice(1, -1);
    }
    items.push(v);
  }
  return items;
}

/** 随包的 .cjs 模块（排除 `!` 排除规则与目录通配） */
function packagedCjsModules() {
  const names = new Set();
  for (const yml of YMLS) {
    for (const item of ymlFilesSection(yml)) {
      if (item.startsWith('!') || item.includes('*')) continue;
      if (item.endsWith('.cjs')) names.add(item);
    }
  }
  return [...names].sort();
}

/**
 * 抽裸包名 require。
 * ★ 先剔掉整行注释：main.cjs 里有一句 `// ★ 为什么内联而不 require('@yan-zhi/shared')`，
 *   不剔就会把 @yan-zhi/shared 误判成运行时依赖（再次把 24MB 源码拖进包）。
 */
function bareRequires(file) {
  const src = fs
    .readFileSync(path.join(DESKTOP, file), 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  const out = new Set();
  for (const m of src.matchAll(/require\(\s*['"]([^'".][^'"]*)['"]\s*\)/g)) {
    const name = m[1];
    if (BUILTINS.has(name)) continue;
    // 子路径引用（pkg/sub）归到包名
    out.add(name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]);
  }
  return out;
}

describe('asar 运行时依赖边界', () => {
  const modules = packagedCjsModules();
  const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
  const deps = new Set(Object.keys(pkg.dependencies || {}));
  const required = new Set();
  for (const f of modules) for (const r of bareRequires(f)) required.add(r);

  test('随包模块至少扫到了主进程入口（防解析失效导致空跑）', () => {
    assert.ok(modules.includes('main.cjs'), '打包 .cjs 清单里没有 main.cjs');
    assert.ok(required.has('better-sqlite3'), 'main.cjs 的裸 require 一个都没解析出来');
  });

  test('① 主进程 require 的每个包都在 dependencies 里（否则打包版启动即崩）', () => {
    const missing = [...required].filter((r) => !deps.has(r)).sort();
    assert.deepStrictEqual(
      missing,
      [],
      `这些包被主进程 require，但不在 dependencies（打包后会 Cannot find module）：${missing.join(', ')}`,
    );
  });

  test('② dependencies 里没有渲染层冗余（否则 app.asar 白胖、安装解压变慢）', () => {
    const unused = [...deps].filter((d) => !required.has(d)).sort();
    assert.deepStrictEqual(
      unused,
      [],
      `这些包在 dependencies 但没有任何主进程模块 require —— 渲染层依赖已被 Vite 打进 dist，` +
        `请移到 devDependencies，否则会整棵依赖树进 app.asar：${unused.join(', ')}`,
    );
  });
});
