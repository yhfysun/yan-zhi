// cookies + webNavigation 兼容层单测。
const { test, describe } = require('node:test')
const assert = require('node:assert')

const {
  createCookiesManager,
  normalizeCookie,
  normalizeStoreId,
} = require('../extension-cookies.cjs')
const {
  createWebNavigationManager,
  collectFrames,
  CHANNEL,
} = require('../extension-web-navigation.cjs')

function makeCookieSession () {
  const store = new Map()
  const listeners = {}
  const cookies = {
    // 与 Electron 44 一致：get 返回数组，set/remove 返回 void
    async get (filter) {
      if (filter && filter.name) {
        const cookie = store.get(filter.name)
        return cookie ? [cookie] : []
      }
      let list = [...store.values()]
      if (filter && filter.url) list = list.filter((cookie) => String(cookie.domain || '').includes(new URL(filter.url).hostname))
      return list
    },
    async set (details) {
      const cookie = {
        name: details.name,
        value: details.value,
        domain: details.domain || new URL(details.url).hostname,
        path: details.path || '/',
        secure: !!details.secure,
        httpOnly: !!details.httpOnly,
        sameSite: details.sameSite || 'unspecified',
        session: true,
        hostOnly: true,
      }
      store.set(cookie.name, cookie)
    },
    async remove (_url, name) { store.delete(name) },
    on (event, fn) { listeners[event] = fn },
  }
  return { session: { cookies }, store, listeners }
}

describe('cookies', () => {
  test('normalizeCookie / storeId', () => {
    const cookie = normalizeCookie({ name: 'a', value: 'b', domain: 'x.com', session: true })
    assert.strictEqual(cookie.storeId, '0')
    assert.strictEqual(cookie.path, '/')
    assert.strictEqual(normalizeStoreId('0'), '0')
    assert.throws(() => normalizeStoreId('5'), /不支持的 cookie store/)
  })

  test('set / get / getAll / remove', async () => {
    const { session } = makeCookieSession()
    const manager = createCookiesManager({
      getSession: () => session,
      deliverEvent: () => {},
      getExtensions: () => [],
    })
    const set = await manager.invoke('ext', 'cookies.set', [{ url: 'https://example.com/', name: 'sid', value: '42' }])
    assert.strictEqual(set.name, 'sid')
    assert.strictEqual(set.storeId, '0')
    const got = await manager.invoke('ext', 'cookies.get', [{ url: 'https://example.com/', name: 'sid' }])
    assert.strictEqual(got.value, '42')
    const all = await manager.invoke('ext', 'cookies.getAll', [{ url: 'https://example.com/' }])
    assert.strictEqual(all.length, 1)
    const removed = await manager.invoke('ext', 'cookies.remove', [{ url: 'https://example.com/', name: 'sid' }])
    assert.deepStrictEqual(removed, { url: 'https://example.com/', name: 'sid', storeId: '0' })
    const again = await manager.invoke('ext', 'cookies.remove', [{ url: 'https://example.com/', name: 'sid' }])
    assert.strictEqual(again, null)
  })

  test('onChanged 只投递给有 cookies 权限的扩展', async () => {
    const { session, listeners } = makeCookieSession()
    const events = []
    const manager = createCookiesManager({
      getSession: () => session,
      deliverEvent: (id, channel, payload) => events.push({ id, channel, payload }),
      getExtensions: () => [
        { electronId: 'with', permissions: ['cookies'] },
        { electronId: 'without', permissions: [] },
      ],
    })
    manager.install()
    listeners.changed({}, { name: 'a', value: '1', domain: 'x.com' }, 'explicit', false)
    assert.strictEqual(events.length, 1)
    assert.strictEqual(events[0].id, 'with')
    assert.strictEqual(events[0].payload.removed, false)
    assert.strictEqual(events[0].payload.cookie.storeId, '0')
  })

  test('getAllCookieStores 返回唯一分区与 tab ids', async () => {
    const { session } = makeCookieSession()
    const manager = createCookiesManager({
      getSession: () => session,
      deliverEvent: () => {},
      getExtensions: () => [],
      getTabIds: () => [11, 12],
    })
    const stores = await manager.invoke('ext', 'cookies.getAllCookieStores', [])
    assert.deepStrictEqual(stores, [{ id: '0', tabIds: [11, 12] }])
  })
})

function makeWc () {
  const listeners = {}
  const child = { frameTreeNodeId: 22, url: 'https://example.com/frame', frames: [] }
  const main = { frameTreeNodeId: 11, url: 'https://example.com/page', frames: [child] }
  const wc = {
    id: 11,
    session: { name: 's' },
    mainFrame: main,
    isDestroyed: () => false,
    getURL: () => 'https://example.com/page',
    on: (event, fn) => { listeners[event] = fn },
  }
  return { wc, listeners, main, child }
}

describe('webNavigation', () => {
  test('帧树与 getFrame/getAllFrames', () => {
    const { wc } = makeWc()
    const frames = collectFrames(wc)
    assert.deepStrictEqual(frames.map((item) => [item.frameId, item.parentFrameId]), [[0, -1], [22, 0]])
    const nav = createWebNavigationManager({
      getExtensions: () => [{ electronId: 'ext', permissions: ['webNavigation'] }],
      deliverEvent: () => {},
      getSession: () => wc.session,
      webContentsFromId: () => wc,
    })
    assert.strictEqual(nav.invoke('ext', 'webNavigation.getFrame', [{ tabId: 11, frameId: 0 }]).url, 'https://example.com/page')
    assert.strictEqual(nav.invoke('ext', 'webNavigation.getFrame', [{ tabId: 11, frameId: 22 }]).parentFrameId, 0)
    assert.strictEqual(nav.invoke('ext', 'webNavigation.getAllFrames', [{ tabId: 11 }]).length, 2)
  })

  test('导航事件只投递有权限的扩展；ERR_ABORTED 忽略', () => {
    const { wc, listeners } = makeWc()
    const events = []
    const nav = createWebNavigationManager({
      getExtensions: () => [
        { electronId: 'yes', permissions: ['webNavigation'] },
        { electronId: 'no', permissions: [] },
      ],
      deliverEvent: (id, channel, eventName, details) => events.push({ id, channel, eventName, details }),
      getSession: () => wc.session,
      webContentsFromId: () => wc,
    })
    nav.attachToWebContents(wc)
    listeners['did-start-navigation']({}, 'https://example.com/next', false, true, 1, 2)
    listeners['did-frame-navigate']({}, 'https://example.com/next', 200, 'OK', true, 1, 2)
    listeners['dom-ready']()
    listeners['did-fail-load']({}, -3, 'ERR_ABORTED', 'https://example.com/next', true, 1, 2)
    listeners['did-fail-load']({}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://bad.test/', true, 1, 2)
    assert.deepStrictEqual(events.map((item) => item.eventName), [
      'onBeforeNavigate',
      'onCommitted',
      'onDOMContentLoaded',
      'onErrorOccurred',
    ])
    assert.ok(events.every((item) => item.id === 'yes' && item.channel === CHANNEL))
    assert.strictEqual(events[0].details.tabId, 11)
    assert.strictEqual(events[0].details.frameId, 0)
    assert.match(events[3].details.error, /^net::ERR_/)
  })

  test('非网页分区拒绝', () => {
    const { wc } = makeWc()
    const nav = createWebNavigationManager({
      getExtensions: () => [],
      deliverEvent: () => {},
      getSession: () => ({ name: 'other' }),
      webContentsFromId: () => wc,
    })
    assert.throws(() => nav.invoke('ext', 'webNavigation.getFrame', [{ tabId: 11 }]), /不在浏览器分区/)
  })
})
