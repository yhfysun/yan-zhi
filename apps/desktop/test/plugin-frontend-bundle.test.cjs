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

    // shim 必须随包（P7）：bundle 用相对路径 ../shared/…，同一份产物在 yz:// 与 HTTP 下都能解析
    const refs = new Set([...text.matchAll(/\.\.\/shared\/host\/([^"']+)/g)].map((m) => m[1]));
    const missing = [...refs].filter((r) => !fs.existsSync(path.join(BUILTIN, id, 'shared', 'host', r)));
    assert.deepEqual(missing, [], `${id} 引用了未随包复制的宿主 shim`);
    assert.ok(
      fs.existsSync(path.join(BUILTIN, id, 'shared', 'vue.mjs')),
      `${id} 缺 shared/vue.mjs（Web/移动端 HTTP 装载会 404）`,
    );
    assert.ok(!text.includes('yz://shared'), `${id} 仍写死 yz:// 前缀（Web 端无法解析）`);

    // 自包含：bundle 里所有相对 import 都必须能在包内找到文件（相对路径在 yz:// 与 HTTP 下
    // 语义一致，只要文件在包里就一定能解析；缺一个就是运行期 404/模块找不到）。
    const pkgRoot = path.join(BUILTIN, id);
    const relSpecs = new Set(
      [...text.matchAll(/(?:from|import)\s*\(?\s*"(\.[^"]+)"/g)].map((m) => m[1]),
    );
    const unresolved = [...relSpecs].filter((spec) => {
      const target = path.resolve(path.join(pkgRoot, 'frontend'), spec);
      return !fs.existsSync(target);
    });
    assert.deepEqual(unresolved, [], `${id} bundle 引用了包内不存在的相对模块`);

    // ③ 有 bundle 就必须在 manifest 里声明入口 —— 否则加载器不会走 bundle，
    //    「bundle 优先」成了死代码，装回来的 .yzp 也拿不到前端（P7 补齐的字段）。
    assert.equal(manifest.ui?.entry, 'frontend/index.mjs', `${id} manifest.ui.entry 未指向 bundle`);
    if (manifest.contributes?.mode) {
      assert.equal(manifest.contributes.mode.entry, 'frontend/index.mjs', `${id} contributes.mode.entry 未指向 bundle`);
    }
  });
}
