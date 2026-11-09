/**
 * export-shell.test.cjs — 导出轻量壳模块纯逻辑单测（2026-11-08）。
 *
 * 为什么模块不能 require electron：node --test 直跑（TESTING-NOTES「能真跑就真跑」）。
 * export-shell.cjs 因此被刻意设计成零依赖（路径/时间/网卡全部可注入）。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { collectLanIps, isExcluded, makeCopyFilter, exportShell } = require('../export-shell.cjs');

test('collectLanIps：只收 IPv4 私网、剔 internal 与公网', () => {
  const ips = collectLanIps({
   以太: [{ family: 'IPv4', address: '192.168.1.100', internal: false }],
    loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    公网: [{ family: 'IPv4', address: '203.0.113.5', internal: false }],
    IPv6: [{ family: 'IPv6', address: 'fe80::1', internal: false }],
    换个172段: [{ family: 'IPv4', address: '172.20.3.4', internal: false }],
    边界外172: [{ family: 'IPv4', address: '172.32.0.1', internal: false }],
  });
  const addrs = ips.map((x) => x.address).sort();
  assert.deepStrictEqual(addrs, ['172.20.3.4', '192.168.1.100']);
});

test('isExcluded：resources 下后端专属目录 + 安装器遗留物', () => {
  for (const rel of [
    'resources/server/dist/apps/server/src/index.js',
    'resources/server',
    'resources/license/default-codes.json',
    'resources/python/python.exe',
    'resources/python-tools/doyz/main.py',
  ]) {
    assert.ok(isExcluded(rel), rel);
  }
  for (const rel of ['Uninstall yan-zhi.exe', 'unins000.dat', 'unins001.exe']) {
    assert.ok(isExcluded(rel), rel);
  }
  // 必须保留的东西
  for (const rel of [
    'resources/app.asar',
    'resources/app.asar.unpacked/node_modules/sqlite-vec-windows-x64/vec0.dll',
    'resources/icon.ico',
    'resources/edition.json',
    'resources/server-base.json', // 由导出器覆盖写入，不是剔除
    'locales/zh-CN.pak',
    'yan-zhi.exe',
  ]) {
    assert.ok(!isExcluded(rel), `不应剔除: ${rel}`);
  }
});

test('makeCopyFilter：源相对路径归一化（反斜杠→/）', () => {
  const root = 'C:\\fake\\root';
  const filter = makeCopyFilter(root);
  assert.strictEqual(filter(path.join(root, 'resources', 'server', 'x.js')), false);
  assert.strictEqual(filter(path.join(root, 'resources', 'app.asar')), true);
  assert.strictEqual(filter(path.join(root, 'yan-zhi.exe')), true);
});

/** 造一个最小"安装目录"：resources/app.asar + 一个该剔除的后端目录 + 一个该保留的文件 */
function makeFakeInstall(root) {
  fs.mkdirSync(path.join(root, 'resources', 'server', 'dist'), { recursive: true });
  fs.mkdirSync(path.join(root, 'resources', 'license'), { recursive: true });
  fs.mkdirSync(path.join(root, 'resources', 'python'), { recursive: true });
  fs.mkdirSync(path.join(root, 'locales'), { recursive: true });
  fs.writeFileSync(path.join(root, 'resources', 'app.asar'), 'fake-asar');
  fs.writeFileSync(path.join(root, 'resources', 'server', 'dist', 'index.js'), 'backend');
  fs.writeFileSync(path.join(root, 'resources', 'license', 'codes.json'), 'codes');
  fs.writeFileSync(path.join(root, 'resources', 'python', 'python.exe'), 'py');
  fs.writeFileSync(path.join(root, 'locales', 'zh-CN.pak'), 'pak');
  fs.writeFileSync(path.join(root, 'Uninstall yan-zhi.exe'), 'unins');
}

test('exportShell：端到端（zip=false 文件夹模式）——排除后端资源、写入 server-base', async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-export-'));
  try {
    const src = path.join(work, 'install');
    const dest = path.join(work, 'out');
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(dest, { recursive: true });
    makeFakeInstall(src);

    const phases = [];
    const r = await exportShell({
      sourceDir: src,
      destDir: dest,
      serverBase: 'http://192.168.1.50:3001/',
      appVersion: '1.2.3',
      zip: false,
      _di: { now: new Date('2026-11-08T12:34:56Z') },
    }, (p) => phases.push(p.phase));
    assert.ok(r.ok, r.error);
    assert.ok(r.folderPath, '应返回文件夹路径');

    const out = r.folderPath;
    assert.ok(fs.existsSync(path.join(out, 'resources', 'app.asar')));
    assert.ok(fs.existsSync(path.join(out, 'locales', 'zh-CN.pak')));
    assert.ok(!fs.existsSync(path.join(out, 'resources', 'server')), 'server 必须被剔除');
    assert.ok(!fs.existsSync(path.join(out, 'resources', 'license')), 'license 必须被剔除');
    assert.ok(!fs.existsSync(path.join(out, 'resources', 'python')), 'python 必须被剔除');
    assert.ok(!fs.existsSync(path.join(out, 'Uninstall yan-zhi.exe')), '卸载器必须被剔除');

    const sb = JSON.parse(fs.readFileSync(path.join(out, 'resources', 'server-base.json'), 'utf8'));
    assert.strictEqual(sb.serverBase, 'http://192.168.1.50:3001', '地址应去尾斜杠');
    assert.ok(sb._说明, '说明字段应在（给人看）');

    assert.ok(phases.includes('copy') && phases.includes('config') && phases.includes('done'));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('exportShell：参数校验（非法地址 / 无效源目录）', async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-export-'));
  try {
    const src = path.join(work, 'install');
    const dest = path.join(work, 'out');
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(dest, { recursive: true });
    makeFakeInstall(src);

    let r = await exportShell({ sourceDir: src, destDir: dest, serverBase: '192.168.1.1:3001', zip: false });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /http/);

    r = await exportShell({ sourceDir: path.join(work, 'nope'), destDir: dest, serverBase: 'http://x', zip: false });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /app\.asar/);

    r = await exportShell({ sourceDir: src, destDir: '', serverBase: 'http://x', zip: false });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /输出目录/);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
