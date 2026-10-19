// chrome.action / browserAction 兼容层单测：manifest 默认值、运行时覆盖、点击路由。
const { test, describe } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  createActionManager,
  normalizeColor,
  pickIconPath,
  manifestActionDefaults,
  CLICKED_CHANNEL,
} = require('../extension-actions.cjs')

const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

function makeExtDir (manifest, icon = 'icon.png') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-action-'))
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  if (icon) fs.writeFileSync(path.join(dir, icon), PNG_BYTES)
  return dir
}

function makeManager (overrides = {}) {
  const dir = overrides.dir || makeExtDir({
    manifest_version: 3,
    name: 'Demo Action',
    version: '1.0.0',
    action: { default_title: 'Demo', default_icon: 'icon.png', default_popup: 'popup.html' },
  })
  const extensions = overrides.extensions || [{ key: 'demo', electronId: 'ext-1', enabled: true, dir }]
  const events = []
  const popups = []
  const notified = []
  const manager = createActionManager({
    getExtensions: () => extensions,
    deliverEvent: (extensionId, channel, ...args) => events.push({ extensionId, channel, args }),
    openPopup: async (key) => { popups.push(key); return { ok: true } },
    getActiveTab: () => ({ id: 7, url: 'https://example.com' }),
    notify: (state) => notified.push(state),
    readManifest: (extensionDir) => JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8')),
  })
  return { manager, dir, events, popups, notified, extensions }
}

describe('颜色与图标默认值', () => {
  test('badge color 支持数组与字符串', () => {
    assert.strictEqual(normalizeColor([255, 0, 0, 255]), 'rgba(255,0,0,1)')
    assert.match(normalizeColor([0, 128, 255, 128]), /^rgba\(0,128,255,0\.50/)
    assert.strictEqual(normalizeColor('#00ff00'), '#00ff00')
    assert.strictEqual(normalizeColor(null), '#FF0000')
  })

  test('default_icon 支持字符串与尺寸对象', () => {
    assert.strictEqual(pickIconPath('a.png'), 'a.png')
    assert.strictEqual(pickIconPath({ 128: 'big.png', 16: 'small.png' }), 'small.png')
    assert.strictEqual(pickIconPath({ 48: 'mid.png' }), 'mid.png')
    assert.strictEqual(pickIconPath(null), '')
  })

  test('MV3 action 与 MV2 browser_action 默认值', () => {
    const mv3 = manifestActionDefaults({
      name: 'A',
      action: { default_title: 'T', default_popup: 'p.html', default_icon: { 32: 'i32.png' } },
    })
    assert.strictEqual(mv3.title, 'T')
    assert.strictEqual(mv3.popup, 'p.html')
    assert.strictEqual(mv3.iconPath, 'i32.png')

    const mv2 = manifestActionDefaults({
      name: 'B',
      browser_action: { default_title: 'TB', default_popup: 'b.html', default_icon: 'b.png' },
    })
    assert.strictEqual(mv2.title, 'TB')
    assert.strictEqual(mv2.iconPath, 'b.png')
    assert.strictEqual(mv2.popup, 'b.html')
  })
})

describe('状态与运行时覆盖', () => {
  test('list 返回图标 data URL 与 popup 标记', () => {
    const { manager } = makeManager()
    const states = manager.list()
    assert.strictEqual(states.length, 1)
    assert.strictEqual(states[0].key, 'demo')
    assert.strictEqual(states[0].title, 'Demo')
    assert.strictEqual(states[0].hasPopup, true)
    assert.ok(states[0].iconDataUrl.startsWith('data:image/png;base64,'))
  })

  test('setBadgeText / setBadgeBackgroundColor / getBadgeText', () => {
    const { manager, notified } = makeManager()
    manager.invoke('ext-1', 'action.setBadgeText', [{ text: '12' }])
    manager.invoke('ext-1', 'browserAction.setBadgeBackgroundColor', [{ color: [1, 2, 3, 255] }])
    const state = manager.list()[0]
    assert.strictEqual(state.badgeText, '12')
    assert.strictEqual(state.badgeColor, 'rgba(1,2,3,1)')
    assert.strictEqual(manager.invoke('ext-1', 'action.getBadgeText', [{}]).text, '12')
    assert.ok(notified.length >= 2)
  })

  test('setTitle / setPopup / setIcon / enable / disable', () => {
    const { manager, dir } = makeManager()
    fs.writeFileSync(path.join(dir, 'other.png'), PNG_BYTES)
    manager.invoke('ext-1', 'action.setTitle', [{ title: '新标题' }])
    manager.invoke('ext-1', 'action.setPopup', [{ popup: '' }])
    manager.invoke('ext-1', 'action.setIcon', [{ path: 'other.png' }])
    const state = manager.list()[0]
    assert.strictEqual(state.title, '新标题')
    assert.strictEqual(state.hasPopup, false)
    assert.ok(state.iconDataUrl.startsWith('data:image/png;base64,'))
    manager.invoke('ext-1', 'action.disable', [])
    assert.strictEqual(manager.list()[0].enabled, false)
    manager.invoke('ext-1', 'action.enable', [])
    assert.strictEqual(manager.list()[0].enabled, true)
  })

  test('未知方法抛错；禁用扩展不出现在列表', () => {
    const { manager, extensions } = makeManager()
    assert.throws(() => manager.invoke('ext-1', 'action.unknown', [{}]), /不支持的方法/)
    extensions[0].enabled = false
    assert.strictEqual(manager.list().length, 0)
  })
})

describe('点击路由', () => {
  test('有 popup 时打开弹窗，不投递 onClicked', async () => {
    const { manager, popups, events } = makeManager()
    const result = await manager.click('demo')
    assert.strictEqual(result.ok, true)
    assert.deepStrictEqual(popups, ['demo'])
    assert.strictEqual(events.length, 0)
  })

  test('无 popup 时投递 action.onClicked 并带当前 tab', async () => {
    const dir = makeExtDir({ manifest_version: 3, name: 'NoPopup', version: '1', action: { default_title: 'N' } })
    const { manager, events } = makeManager({ dir, extensions: [{ key: 'nopopup', electronId: 'ext-2', enabled: true, dir }] })
    const result = await manager.click('nopopup')
    assert.strictEqual(result.ok, true)
    assert.strictEqual(events.length, 1)
    assert.strictEqual(events[0].channel, CLICKED_CHANNEL)
    assert.strictEqual(events[0].extensionId, 'ext-2')
    assert.strictEqual(events[0].args[0].id, 7)
  })

  test('图标被 disable 后点击拒绝', async () => {
    const { manager } = makeManager()
    manager.invoke('ext-1', 'action.disable', [])
    const result = await manager.click('demo')
    assert.strictEqual(result.ok, false)
  })
})
