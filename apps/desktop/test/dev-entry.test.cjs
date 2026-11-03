/**
 * dev 入口依赖路径守门。
 *
 * `bin/dev.mjs` 与 `scripts/lib` 不在同一层：漏掉 `../scripts` 时静态检查全过，
 * 只有真正执行 dev 才在模块加载阶段报 MODULE_NOT_FOUND。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

test('bin/dev.mjs 从 scripts/lib 加载插件同步模块', () => {
  const src = fs.readFileSync(path.join(ROOT, 'bin', 'dev.mjs'), 'utf8');
  assert.match(src, /require\(['"]\.\.\/scripts\/lib\/dev-plugin-sync\.cjs['"]\)/);
  assert.strictEqual(fs.existsSync(path.join(ROOT, 'scripts', 'lib', 'dev-plugin-sync.cjs')), true);
});
