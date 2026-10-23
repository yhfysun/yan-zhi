/**
 * Chrome/Edge 书签导入解析与发现（只读）。
 * 运行：node --test apps/desktop/test/
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseChromeBookmarks, discoverChromeBookmarks, userDataDir, BROWSERS } = require('../bookmarks-import.cjs');

function chromeFile(roots) {
  return JSON.stringify({ version: 1, roots });
}

describe('parseChromeBookmarks', () => {
  test('解析书签栏与其他书签，保留文件夹层级', () => {
    const text = chromeFile({
      bookmark_bar: {
        name: '书签栏',
        children: [
          { type: 'url', name: 'GitHub', url: 'https://github.com' },
          { type: 'folder', name: 'AI', children: [
            { type: 'url', name: 'Claude', url: 'https://claude.ai' },
          ] },
        ],
      },
      other: { name: '其他书签', children: [{ type: 'url', name: 'Docs', url: 'https://docs.example.com' }] },
      synced: { name: '移动设备书签', children: [] },
    });
    const r = parseChromeBookmarks(text);
    assert.strictEqual(r.count, 3);
    assert.deepStrictEqual(r.roots.map((n) => n.title), ['书签栏', '其他书签']);
    assert.deepStrictEqual(r.roots[0].children[1], {
      title: 'AI',
      children: [{ title: 'Claude', url: 'https://claude.ai' }],
    });
  });

  test('跳过非 http 链接与空根', () => {
    const r = parseChromeBookmarks(chromeFile({
      bookmark_bar: { name: '书签栏', children: [
        { type: 'url', name: '设置', url: 'chrome://settings' },
        { type: 'url', name: '脚本', url: 'javascript:alert(1)' },
      ] },
      other: { name: '其他书签', children: [] },
    }));
    assert.deepStrictEqual(r, { roots: [], count: 0 });
  });

  test('坏 JSON 返回空结果而不抛错', () => {
    assert.deepStrictEqual(parseChromeBookmarks('not json'), { roots: [], count: 0 });
    assert.deepStrictEqual(parseChromeBookmarks('{}'), { roots: [], count: 0 });
    assert.deepStrictEqual(parseChromeBookmarks(null), { roots: [], count: 0 });
  });
});

describe('userDataDir', () => {
  const chrome = BROWSERS.find((b) => b.id === 'chrome');

  test('Windows 走 LOCALAPPDATA', () => {
    const dir = userDataDir(chrome, 'win32', { LOCALAPPDATA: 'C:\\Users\\demo\\AppData\\Local' }, 'C:\\Users\\demo');
    assert.strictEqual(dir, path.join('C:\\Users\\demo\\AppData\\Local', 'Google', 'Chrome', 'User Data'));
  });

  test('macOS / Linux 走 home 相对路径', () => {
    assert.strictEqual(
      userDataDir(chrome, 'darwin', {}, '/Users/demo'),
      path.join('/Users/demo', 'Library', 'Application Support', 'Google', 'Chrome'),
    );
    assert.strictEqual(
      userDataDir(chrome, 'linux', {}, '/home/demo'),
      path.join('/home/demo', '.config', 'google-chrome'),
    );
  });
});

describe('discoverChromeBookmarks', () => {
  test('扫描 User Data 下的 profile 并读取名称', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-bookmarks-'));
    const base = path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
    const profile = path.join(base, 'Default');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(profile, 'Preferences'), JSON.stringify({ profile: { name: '个人' } }));
    fs.writeFileSync(path.join(profile, 'Bookmarks'), chromeFile({
      bookmark_bar: { name: '书签栏', children: [{ type: 'url', name: 'GitHub', url: 'https://github.com' }] },
    }));
    // 非 profile 目录不应被当成书签来源
    fs.mkdirSync(path.join(base, 'Guest Profile'), { recursive: true });

    const r = discoverChromeBookmarks({
      platform: 'win32',
      env: { LOCALAPPDATA: path.join(home, 'AppData', 'Local') },
      home,
    });

    assert.strictEqual(r.profiles.length, 1);
    assert.strictEqual(r.profiles[0].profile, 'Default');
    assert.strictEqual(r.profiles[0].profileName, '个人');
    assert.strictEqual(r.profiles[0].count, 1);
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('浏览器未安装时返回空列表', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-bookmarks-empty-'));
    const r = discoverChromeBookmarks({ platform: 'win32', env: { LOCALAPPDATA: home }, home });
    assert.deepStrictEqual(r, { profiles: [], errors: [] });
    fs.rmSync(home, { recursive: true, force: true });
  });
});
