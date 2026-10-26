// 宿主共享依赖 shim 完备性测试（mode-pluginization P0）。
//
// 插件前端 bundle 对 vue/element-plus 等的 import 在构建期被改写到 yz://shared/*.mjs，
// shim 再委托 window.__YZ_HOST__。两个静默失效点都在这里拦截：
//   1. 宿主新增了库但没重新生成 shim（导出缺）→ 插件 import undefined；
//   2. shim 枚举时把真实需要的导出过滤掉了。
// 测试在真实模块上逐导出比对 shim 转发值（引用相等），跑前幂等重生成一次。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DESKTOP_DIR = path.join(__dirname, '..');

test('shared shims 与真实模块逐导出对齐', async () => {
  const { generateHostShims, shimsDir, SHARED_MODULES } = await import('../scripts/lib/host-shims.mjs');
  await generateHostShims(DESKTOP_DIR);

  const real = {};
  for (const { key, specifier } of SHARED_MODULES) real[key] = await import(specifier);
  globalThis.__YZ_HOST__ = { apiVersion: 1, m: real, api: {} };

  const dir = shimsDir(DESKTOP_DIR);
  for (const { key, specifier } of SHARED_MODULES) {
    const shim = await import(pathToFileURL(path.join(dir, `${key}.mjs`)).href);
    assert.ok(shim.default, `${key}.mjs default 导出缺失`);
    const expected = Object.keys(real[key]).filter((n) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n) && n !== 'default');
    for (const name of expected) {
      assert.ok(name in shim, `${key}.mjs 缺导出 ${name}（重新跑 generate:host-shims）`);
      assert.strictEqual(shim[name], real[key][name], `${key}.mjs 的 ${name} 与真实模块引用不一致`);
    }
  }
  delete globalThis.__YZ_HOST__;
});

test('__server-host__ shim 与 host-bridge.ts 导出面对齐', async () => {
  const { generateHostShims, shimsDir, parseHostBridgeExports } = await import('../scripts/lib/host-shims.mjs');
  await generateHostShims(DESKTOP_DIR);
  const src = fs.readFileSync(path.join(DESKTOP_DIR, '..', 'server', 'src', 'host-bridge.ts'), 'utf8');
  const names = parseHostBridgeExports(src);
  assert.ok(names.includes('db') && names.includes('pushPluginAudit'), 'host-bridge 导出解析异常');

  globalThis.__YZ_SERVER_HOST__ = Object.fromEntries(names.map((n) => [n, Symbol('bridge')]));
  const shim = await import(pathToFileURL(path.join(shimsDir(DESKTOP_DIR), '__server-host__.mjs')).href);
  for (const n of names) {
    assert.ok(n in shim && shim[n] === globalThis.__YZ_SERVER_HOST__[n], `server shim 缺/错导出 ${n}`);
  }
  delete globalThis.__YZ_SERVER_HOST__;
});
