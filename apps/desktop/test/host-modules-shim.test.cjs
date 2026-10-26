// 宿主内部模块外置（P4 前端 bundle 化）纯逻辑守门。
//
// 规则错了的代价是**静默状态双份**：把 stores/mode 打进插件包 ⇒ 插件里的 activeMode
// 与宿主是两个 ref，切模式对不上。这里把「哪些该外置、key 怎么算、shim 怎么转发」钉死。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const lib = () => import('../scripts/lib/host-shims.mjs');

test('外置范围：四个宿主目录的 .ts 外置，组件/测试/声明文件不外置', async () => {
  const { isHostModuleRel } = await lib();
  for (const rel of ['stores/mode.ts', 'composables/chat/useChat.ts', 'api/client.ts', 'utils/menuPosition.ts']) {
    assert.equal(isHostModuleRel(rel), true, `${rel} 应外置`);
  }
  for (const rel of ['components/clip/EffectCardGrid.vue', 'views/ClipWorkbench.vue', 'stores/mode.test.ts', 'stores/types.d.ts']) {
    assert.equal(isHostModuleRel(rel), false, `${rel} 不应外置`);
  }
});

test('key = 相对 packages/ui/src 去扩展名（shim 路径与之对应）', async () => {
  const { hostModuleKey } = await lib();
  assert.equal(hostModuleKey('stores/mode.ts'), 'stores/mode');
  assert.equal(hostModuleKey('composables/chat/useChat.tsx'), 'composables/chat/useChat');
});

test('生成的 shim 从 window.__YZ_HOST__.mods[key] 取回同一实例（命名导出逐条转发）', async () => {
  const { generateHostModuleShims } = await lib();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-hmshim-'));
  try {
    const fakeMod = { activeMode: { __ref: true }, leadOf: () => 'ai' };
    globalThis.__YZ_HOST__ = { apiVersion: 1, m: {}, mods: { 'stores/mode': fakeMod }, api: {} };
    const { written } = generateHostModuleShims(dir, [{ key: 'stores/mode', names: ['activeMode', 'leadOf'] }]);
    assert.deepEqual(written[0].names, ['activeMode', 'leadOf']);
    const shim = await import(pathToFileURL(path.join(dir, 'host-shims', 'host', 'stores', 'mode.mjs')).href);
    assert.strictEqual(shim.default, fakeMod, 'default 应指向宿主模块命名空间（组件/工具函数的兜底）');
    assert.strictEqual(shim.activeMode, fakeMod.activeMode, '命名导出必须是同一个对象（单例）');
    assert.strictEqual(shim.leadOf, fakeMod.leadOf);
  } finally {
    delete globalThis.__YZ_HOST__;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('宿主未登记时 shim 明确报错（不静默 undefined）', async () => {
  const { generateHostModuleShims } = await lib();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-hmshim2-'));
  try {
    globalThis.__YZ_HOST__ = { apiVersion: 1, m: {}, mods: {}, api: {} };
    generateHostModuleShims(dir, [{ key: 'stores/mode', names: ['activeMode'] }]);
    const shimPath = pathToFileURL(path.join(dir, 'host-shims', 'host', 'stores', 'mode.mjs')).href;
    await assert.rejects(() => import(shimPath), /宿主模块未登记/);
  } finally {
    delete globalThis.__YZ_HOST__;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
