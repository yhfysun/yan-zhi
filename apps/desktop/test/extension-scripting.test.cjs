// chrome.scripting 兼容层单测：注入源码、帧选择、CSS 记录、注册脚本。
const { test, describe } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  createScriptingManager,
  buildFunctionSource,
  readExtensionFile,
  normalizeContentScript,
} = require('../extension-scripting.cjs')

function makeDir (files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-scripting-'))
  fs.writeFileSync(path.join(dir, 'manifest.json'), '{}')
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content)
  }
  return dir
}

function makeWc ({ id = 11, session, url = 'https://example.com/page', type = 'webview', frameIds = [0] } = {}) {
  const log = []
  const frames = frameIds.map((frameId) => ({
    frameTreeNodeId: frameId,
    executeJavaScript: async (code) => {
      log.push({ frameId, code })
      return 'value-' + frameId
    },
  }))
  const main = frames[0]
  main.framesInSubtree = frames
  const listeners = {}
  const inserted = []
  const removed = []
  const wc = {
    id,
    session,
    mainFrame: main,
    getType: () => type,
    isDestroyed: () => false,
    getURL: () => url,
    insertCSS: async (css) => { inserted.push(css); return 'key-' + inserted.length },
    removeInsertedCSS: async (key) => { removed.push(key) },
    on: (event, fn) => { listeners[event] = fn },
  }
  return { wc, log, listeners, inserted, removed }
}

function makeManager ({ dir, wc, session }) {
  return createScriptingManager({
    getExtensions: () => [{ key: 'demo', electronId: 'ext-1', enabled: true, dir }],
    getSession: () => session,
    webContentsFromId: () => wc,
  })
}

const SESSION = { name: 'browser-session' }

describe('源码与文件读取', () => {
  test('func 源码包装带参数', () => {
    const code = buildFunctionSource('(a, b) => a + b', [1, 2])
    assert.strictEqual(code, '((a, b) => a + b).apply(null, [1,2])')
  })

  test('文件路径不能逃出扩展目录', () => {
    const dir = makeDir({ 'inject.js': 'window.__x = 1' })
    assert.strictEqual(readExtensionFile(dir, 'inject.js'), 'window.__x = 1')
    assert.throws(() => readExtensionFile(dir, '../evil.js'), /非法扩展文件路径/)
    assert.throws(() => readExtensionFile(dir, 'missing.js'), /不存在/)
  })

  test('content script 归一化', () => {
    const script = normalizeContentScript({ matches: ['https://a.com/*'], js: ['a.js'], runAt: 'document_start' }, 's1')
    assert.strictEqual(script.id, 's1')
    assert.deepStrictEqual(script.js, ['a.js'])
    assert.strictEqual(script.runAt, 'document_start')
    assert.throws(() => normalizeContentScript({ js: ['a.js'] }, 's2'), /matches/)
  })
})

describe('executeScript', () => {
  test('func 注入并返回结果', async () => {
    const { wc, log } = makeWc({ session: SESSION })
    const manager = makeManager({ dir: makeDir(), wc, session: SESSION })
    const results = await manager.executeScript('ext-1', {
      target: { tabId: 11 },
      funcSource: '() => 1',
    })
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].frameId, 0)
    assert.ok(log[0].code.includes('apply(null, [])'))
  })

  test('files 注入按顺序执行', async () => {
    const dir = makeDir({ 'a.js': 'window.__a = 1', 'b.js': 'window.__b = 2' })
    const { wc, log } = makeWc({ session: SESSION })
    const manager = makeManager({ dir, wc, session: SESSION })
    await manager.executeScript('ext-1', { target: { tabId: 11 }, files: ['a.js', 'b.js'] })
    assert.deepStrictEqual(log.map((item) => item.code), ['window.__a = 1', 'window.__b = 2'])
  })

  test('allFrames 与 frameIds 选择', async () => {
    const dir = makeDir({ 'a.js': 'void 0' })
    const all = makeWc({ session: SESSION, frameIds: [0, 1, 2] })
    const managerAll = makeManager({ dir, wc: all.wc, session: SESSION })
    const results = await managerAll.executeScript('ext-1', { target: { tabId: 11, allFrames: true }, files: ['a.js'] })
    assert.deepStrictEqual(results.map((item) => item.frameId), [0, 1, 2])

    const one = makeWc({ session: SESSION, frameIds: [0, 1, 2] })
    const managerOne = makeManager({ dir, wc: one.wc, session: SESSION })
    const filtered = await managerOne.executeScript('ext-1', { target: { tabId: 11, frameIds: [2] }, files: ['a.js'] })
    assert.deepStrictEqual(filtered.map((item) => item.frameId), [2])
  })

  test('拒绝非网页目标与错误分区', async () => {
    const dir = makeDir({ 'a.js': 'void 0' })
    const popup = makeWc({ session: SESSION, type: 'window' })
    await assert.rejects(makeManager({ dir, wc: popup.wc, session: SESSION }).executeScript('ext-1', {
      target: { tabId: 11 }, files: ['a.js'],
    }), /不是网页标签页/)

    const other = makeWc({ session: {}, type: 'webview' })
    await assert.rejects(makeManager({ dir, wc: other.wc, session: SESSION }).executeScript('ext-1', {
      target: { tabId: 11 }, files: ['a.js'],
    }), /不在浏览器分区/)

    const extPage = makeWc({ session: SESSION, type: 'webview', url: 'chrome-extension://abc/page.html' })
    await assert.rejects(makeManager({ dir, wc: extPage.wc, session: SESSION }).executeScript('ext-1', {
      target: { tabId: 11 }, files: ['a.js'],
    }), /不是网页标签页/)
  })
})

describe('insertCSS / removeCSS', () => {
  test('同内容可被 removeCSS 精确移除', async () => {
    const { wc, inserted, removed } = makeWc({ session: SESSION })
    const manager = makeManager({ dir: makeDir(), wc, session: SESSION })
    await manager.insertCSS('ext-1', { target: { tabId: 11 }, css: 'body{color:red}' })
    assert.deepStrictEqual(inserted, ['body{color:red}'])
    await manager.removeCSS('ext-1', { target: { tabId: 11 }, css: 'body{color:red}' })
    assert.deepStrictEqual(removed, ['key-1'])
    await manager.removeCSS('ext-1', { target: { tabId: 11 }, css: 'body{color:red}' })
    assert.deepStrictEqual(removed, ['key-1'], '重复移除不应再调用')
  })
})

describe('注册内容脚本', () => {
  test('注册后在 dom-ready 按 URL 匹配注入', async () => {
    const dir = makeDir({ 'content.js': 'window.__registered = true', 'style.css': 'body{margin:0}' })
    const { wc, log, inserted } = makeWc({ session: SESSION, url: 'https://example.com/page' })
    const manager = makeManager({ dir, wc, session: SESSION })
    manager.registerContentScripts('ext-1', [{
      id: 's1',
      matches: ['https://example.com/*'],
      js: ['content.js'],
      css: ['style.css'],
    }])
    assert.strictEqual(manager.getRegisteredContentScripts('ext-1').length, 1)
    await manager.runRegisteredScripts(wc)
    assert.deepStrictEqual(log.map((item) => item.code), ['window.__registered = true'])
    assert.deepStrictEqual(inserted, ['body{margin:0}'])
  })

  test('URL 不匹配不注入；unregister 后可清空', async () => {
    const dir = makeDir({ 'content.js': 'void 0' })
    const { wc, log } = makeWc({ session: SESSION, url: 'https://other.com/page' })
    const manager = makeManager({ dir, wc, session: SESSION })
    manager.registerContentScripts('ext-1', [{ id: 's1', matches: ['https://example.com/*'], js: ['content.js'] }])
    await manager.runRegisteredScripts(wc)
    assert.strictEqual(log.length, 0)
    manager.unregisterContentScripts('ext-1', { ids: ['s1'] })
    assert.strictEqual(manager.getRegisteredContentScripts('ext-1').length, 0)
  })

  test('attachToWebContents 注册 dom-ready 监听（幂等）', () => {
    const { wc, listeners } = makeWc({ session: SESSION })
    const manager = makeManager({ dir: makeDir(), wc, session: SESSION })
    manager.attachToWebContents(wc)
    manager.attachToWebContents(wc)
    assert.strictEqual(typeof listeners['dom-ready'], 'function')
  })
})
