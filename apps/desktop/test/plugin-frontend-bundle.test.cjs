// 插件前端 bundle 与宿主 shim 的一致性守门（P4）。
//
// 两类静默失效：
//   ① bundle 里的视图 key 与 manifest.contribues.routes[].component 不一致 → 装载器取不到组件，
//      页面回落构建期表（看起来"能开"，bundle 化其实没生效）；
//   ② bundle 引用的 yz://shared/host/<key>.mjs 没有生成 → 运行时抛「宿主模块未登记」。
// 未构建插件包时跳过（CI 不跑 build-plugins 的场景不该红）。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..', '..');
const BUILTIN = path.join(REPO, 'apps', 'server', 'plugins', 'builtin');
const SHIMS = path.join(REPO, 'apps', 'desktop', 'host-shims', 'host');
const BUNDLED = ['clip-mode', 'dev-mode', 'wf-mode'];

function bundleFiles(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')) : [];
}

for (const id of BUNDLED) {
  const dir = path.join(BUILTIN, id, 'frontend');
  const files = bundleFiles(dir);
  test(`${id}：bundle 的视图 key 与 manifest component 一致，且宿主 shim 齐全`, { skip: !files.length && '未构建插件前端（跳过）' }, () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(BUILTIN, id, 'manifest.json'), 'utf8'));
    const expected = (manifest.contributes?.routes || []).map((r) => r.component).filter(Boolean);
    assert.ok(expected.length, `${id} manifest 没有 routes.component`);

    let text = '';
    for (const f of files) text += fs.readFileSync(path.join(dir, f), 'utf8');

    for (const key of expected) {
      assert.ok(text.includes(`"${key}"`), `${id} bundle 缺视图 key ${key}（装载器会取不到组件）`);
    }

    const refs = new Set([...text.matchAll(/yz:\/\/shared\/host\/([^"']+)/g)].map((m) => m[1]));
    const missing = [...refs].filter((r) => !fs.existsSync(path.join(SHIMS, r)));
    assert.deepEqual(missing, [], `${id} 引用了未生成的宿主 shim`);
  });
}
