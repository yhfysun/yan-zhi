// 浏览器扩展管理器单测（P1）：manifest 校验、安装/开关/重启恢复/删除、路径与注册表防护。
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createExtensionManager,
  readManifest,
  manifestInfo,
  slugify,
  normalizeStoreId,
} = require('../browser-extensions.cjs');

const NOW = '2026-10-19T00:00:00.000Z';

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yz-ext-'));
}

function writeExt(dir, manifest) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

/** 假 session：只实现管理器和测试用到的 extensions.*，并记录已加载 id */
function fakeSession() {
  const loaded = new Map();
  return {
    extensions: {
      async loadExtension(dir) {
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
        const id = 'id-' + path.basename(dir);
        loaded.set(id, dir);
        return { id, name: manifest.name, version: manifest.version, path: dir };
      },
      removeExtension(id) {
        loaded.delete(id);
      },
      getExtension(id) {
        return loaded.has(id) ? { id, path: loaded.get(id) } : null;
      },
    },
    loaded,
  };
}

const MV3 = {
  manifest_version: 3,
  name: 'Test Extension',
  version: '1.2.3',
  description: 'demo',
  permissions: ['storage'],
  host_permissions: ['https://example.com/*'],
  action: { default_popup: 'popup.html' },
  options_ui: { page: 'options.html' },
};

describe('manifest 解析', () => {
  test('readManifest 拒绝缺失 / 非法 JSON / 版本不符', () => {
    const root = makeRoot();
    assert.throws(() => readManifest(root), /manifest/);

    const bad = path.join(root, 'bad');
    fs.mkdirSync(bad);
    fs.writeFileSync(path.join(bad, 'manifest.json'), '{oops');
    assert.throws(() => readManifest(bad), /JSON/);

    const v1 = path.join(root, 'v1');
    writeExt(v1, { manifest_version: 1, name: 'x', version: '1' });
    assert.throws(() => readManifest(v1), /V2/);
  });

  test('manifestInfo 拆分 MV2 host 权限并读取 popup', () => {
    const info = manifestInfo({
      manifest_version: 2,
      name: 'm2',
      version: '1',
      permissions: ['storage', 'https://*/*'],
      browser_action: { default_popup: 'p.html' },
    });
    assert.deepStrictEqual(info.permissions, ['storage']);
    assert.deepStrictEqual(info.hostPermissions, ['https://*/*']);
    assert.strictEqual(info.popup, 'p.html');
  });

  test('slugify 不产生空值', () => {
    assert.ok(slugify('+++').length > 0);
  });
});

describe('扩展管理器', () => {
  test('安装 / 列出 / 开关 / 重启恢复 / 删除', async () => {
    const root = makeRoot();
    const src = path.join(root, 'src-ext');
    writeExt(src, MV3);
    const store = path.join(root, 'store');
    const ses = fakeSession();
    const manager = createExtensionManager({ rootDir: store, getSession: () => ses, now: () => NOW });

    const installed = await manager.installFromDir(src);
    assert.strictEqual(installed.ok, true);
    assert.strictEqual(installed.entry.name, 'Test Extension');
    assert.strictEqual(installed.entry.installedAt, NOW);
    assert.strictEqual(ses.loaded.size, 1);
    assert.ok(fs.existsSync(installed.entry.dir), '安装后目标目录应存在');

    const list = manager.list();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].enabled, true);
    assert.deepStrictEqual(list[0].hostPermissions, ['https://example.com/*']);
    assert.match(manager.pageUrl(list[0].key, 'popup'), /^chrome-extension:\/\/id-.+\/popup\.html$/);
    assert.match(manager.pageUrl(list[0].key, 'options'), /options\.html$/);

    await manager.setEnabled(list[0].key, false);
    assert.strictEqual(ses.loaded.size, 0);
    assert.strictEqual(manager.list()[0].enabled, false);

    await manager.setEnabled(list[0].key, true);
    assert.strictEqual(ses.loaded.size, 1);

    // 模拟重启：新 session + 新 manager，同一个 root
    const ses2 = fakeSession();
    const manager2 = createExtensionManager({ rootDir: store, getSession: () => ses2, now: () => NOW });
    const reloaded = await manager2.loadAll();
    assert.strictEqual(reloaded.loaded, 1);
    assert.strictEqual(ses2.loaded.size, 1);

    await manager2.remove(list[0].key);
    assert.strictEqual(manager2.list().length, 0);
    assert.strictEqual(fs.existsSync(installed.entry.dir), false);
  });

  test('安装非法扩展时不会留下半截目录', async () => {
    const root = makeRoot();
    const bad = path.join(root, 'bad');
    fs.mkdirSync(bad);
    fs.writeFileSync(path.join(bad, 'manifest.json'), JSON.stringify({ manifest_version: 3 }));
    const store = path.join(root, 'store');
    const manager = createExtensionManager({ rootDir: store, getSession: () => fakeSession() });

    await assert.rejects(() => manager.installFromDir(bad), /name/);
    assert.ok(!fs.existsSync(store) || fs.readdirSync(store).length === 0);
  });

  test('拒绝把扩展目录装到自身内部', async () => {
    const root = makeRoot();
    const store = path.join(root, 'store');
    const inner = path.join(store, 'inner');
    writeExt(inner, MV3);
    const manager = createExtensionManager({ rootDir: store, getSession: () => fakeSession() });

    await assert.rejects(() => manager.installFromDir(inner), /自己内部/);
  });

  test('registry 中的非法 key 被忽略', () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, 'registry.json'), JSON.stringify({
      version: 1,
      extensions: [
        { key: '..', enabled: true },
        { key: 'ok-1', enabled: false },
      ],
    }));
    const manager = createExtensionManager({ rootDir: root, getSession: () => fakeSession() });

    assert.deepStrictEqual(manager.list().map((e) => e.key), ['ok-1']);
  });
});

describe('商店扩展（白名单 + store）', () => {
  const STORE_ID = 'eimadpbcbfnmbkopoojfekhnkhdbieeh';

  function fakeStore() {
    return {
      updated: 0,
      async installExtension(id, opts) {
        const dir = path.join(opts.extensionsPath, id, '1.0.0');
        writeExt(dir, { manifest_version: 3, name: 'Store ' + id, version: '1.0.0' });
        return await opts.session.extensions.loadExtension(dir);
      },
      async uninstallExtension(id, opts) {
        fs.rmSync(path.join(opts.extensionsPath, id), { recursive: true, force: true });
      },
      async updateExtensions() {
        this.updated += 1;
      },
    };
  }

  function setup() {
    const root = makeRoot();
    const storeDir = path.join(root, 'store');
    const ses = fakeSession();
    const store = fakeStore();
    const whitelist = {
      isAllowed: (id) => id === STORE_ID,
      list: () => [{ id: STORE_ID, name: 'Dark Reader', status: 'verified', note: '' }],
    };
    const manager = createExtensionManager({
      rootDir: root,
      storeDir,
      store,
      whitelist,
      getSession: () => ses,
      now: () => NOW,
    });
    return { root, storeDir, ses, store, manager };
  }

  test('白名单内安装 / 列出 / 开关 / 更新 / 删除', async () => {
    const { manager, ses, store, storeDir } = setup();
    const installed = await manager.installFromStore(
      'https://chromewebstore.google.com/detail/dark-reader/' + STORE_ID,
    );
    assert.strictEqual(installed.ok, true);
    assert.strictEqual(installed.entry.source, 'store');
    assert.strictEqual(installed.entry.storeId, STORE_ID);
    assert.strictEqual(manager.list().length, 1);
    assert.strictEqual(manager.list()[0].source, 'store');

    const key = 'store-' + STORE_ID;
    await manager.setEnabled(key, false);
    assert.strictEqual(ses.loaded.size, 0);
    await manager.setEnabled(key, true);
    assert.strictEqual(ses.loaded.size, 1);

    await manager.updateAll();
    assert.strictEqual(store.updated, 1);

    await manager.remove(key);
    assert.strictEqual(manager.list().length, 0);
    assert.strictEqual(fs.existsSync(path.join(storeDir, STORE_ID)), false);
  });

  test('白名单外拒绝安装', async () => {
    const { manager } = setup();
    await assert.rejects(
      () => manager.installFromStore('ddkjiahejlhfcafbddmgiahcphecmpfh'),
      /白名单/,
    );
  });

  test('normalizeStoreId 支持链接与纯 ID', () => {
    assert.strictEqual(
      normalizeStoreId('https://chromewebstore.google.com/detail/x/' + STORE_ID),
      STORE_ID,
    );
    assert.strictEqual(normalizeStoreId(STORE_ID), STORE_ID);
    assert.throws(() => normalizeStoreId('not-an-id'), /扩展 ID/);
  });
});

describe('manifest 解析缓存', () => {
  test('文件变化后按 mtime 失效', () => {
    const dir = makeRoot();
    writeExt(dir, { manifest_version: 3, name: 'A', version: '1.0.0' });
    assert.strictEqual(readManifest(dir).name, 'A');
    writeExt(dir, { manifest_version: 3, name: 'B', version: '1.0.0' });
    // 强制 mtime 前进，避免文件系统时间精度导致缓存不失效
    const file = path.join(dir, 'manifest.json');
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(file, future, future);
    assert.strictEqual(readManifest(dir).name, 'B');
  });
});
