const { app, BrowserWindow, session } = require('electron')
const http = require('http')
const path = require('path')
const fs = require('fs')

const PARTITION = 'persist:spike-ext'
const PORT = 38217
const MODE = process.env.SPIKE_MODE || 'builtin'
const STORE_TEST = process.env.SPIKE_STORE === '1'
const CM_TEST = process.env.SPIKE_CONTEXTMENU === '1'

app.setPath('userData', path.join(__dirname, 'userdata'))
app.commandLine.appendSwitch('disable-gpu')
if (process.env.SPIKE_PROXY) app.commandLine.appendSwitch('proxy-server', process.env.SPIKE_PROXY)

const result = {
  mode: MODE,
  startedAt: new Date().toISOString(),
  extensions: [],
  loaded: [],
  pings: [],
  probe: null,
  store: [],
  errors: []
}

let ses = null
let finished = false
let cmShim = null
let actionManager = null

function log (...args) { console.log(...args) }

function startServer () {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = (req.url || '/').split('?')[0]
      if (url.startsWith('/ping-') || url.startsWith('/cm-') || url.startsWith('/cap')) {
        result.pings.push(req.url)
        log('[PING]', req.url)
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('ok')
        return
      }
      if (url === '/blocked.js') {
        res.writeHead(200, { 'content-type': 'application/javascript' })
        res.end('window.__BLOCKED_LOADED__ = true;')
        return
      }
      if (url === '/dnr-blocked.js') {
        res.writeHead(200, { 'content-type': 'application/javascript' })
        res.end('window.__DNR_BLOCKED_LOADED__ = true;')
        return
      }
      if (url === '/page.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end('<!doctype html><html><head><meta charset="utf-8"><title>spike</title></head><body><div id="spike-marker">none</div><script src="/blocked.js"></script><script src="/dnr-blocked.js"></script><script>setTimeout(function(){document.getElementById("spike-marker").textContent="blocked="+!!window.__BLOCKED_LOADED__+" dnr="+!!window.__DNR_BLOCKED_LOADED__},300)</script></body></html>')
        return
      }
      res.writeHead(404)
      res.end('not found')
    })
    server.on('error', reject)
    server.listen(PORT, '127.0.0.1', () => resolve(server))
  })
}

async function loadFixtures () {
  const root = path.join(__dirname, 'fixtures')
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(root, d.name))
  for (const dir of dirs) {
    const name = path.basename(dir)
    try {
      const api = ses.extensions && typeof ses.extensions.loadExtension === 'function' ? ses.extensions : ses
      const ext = await api.loadExtension(dir)
      result.extensions.push({ fixture: name, id: ext.id, name: ext.name, version: ext.version })
      log('[EXT LOADED]', name, ext.id)
    } catch (err) {
      result.errors.push({ fixture: name, error: String((err && err.message) || err) })
      log('[EXT FAILED]', name, String((err && err.message) || err))
    }
  }
}

async function runStore () {
  let installer
  try {
    installer = require('electron-chrome-web-store')
  } catch (err) {
    result.errors.push({ storeRequire: String((err && err.message) || err) })
    return
  }
  for (const id of ['ddkjiahejlhfcafbddmgiahcphecmpfh', 'eimadpbcbfnmbkopoojfekhnkhdbieeh']) {
    try {
      const ext = await installer.installExtension(id, { session: ses })
      result.store.push({ id, ok: true, loaded: ext && ext.id ? ext.id : null })
      log('[STORE OK]', id)
    } catch (err) {
      result.store.push({ id, ok: false, error: String((err && err.message) || err) })
      log('[STORE FAILED]', id, String((err && err.message) || err))
    }
  }
}

function finish () {
  if (finished) return
  finished = true
  const extApi = ses && ses.extensions && typeof ses.extensions.getAllExtensions === 'function' ? ses.extensions : ses
  try {
    result.loaded = extApi.getAllExtensions().map((e) => ({ id: e.id, name: e.name, version: e.version }))
  } catch (err) {
    result.errors.push({ getAllExtensions: String((err && err.message) || err) })
  }
  try {
    result.serviceWorkers = ses.serviceWorkers.getAllRunning()
  } catch (err) {
    result.errors.push({ serviceWorkers: String((err && err.message) || err) })
  }
  const file = path.join(__dirname, 'result-' + MODE + (STORE_TEST ? '-store' : '') + '.json')
  fs.writeFileSync(file, JSON.stringify(result, null, 2))
  log('[RESULT FILE]', file)
  log('[RESULT]', JSON.stringify(result, null, 2))
  app.quit()
}

app.whenReady().then(async () => {
  ses = session.fromPartition(PARTITION)

  if (process.env.SPIKE_PROXY) {
    const cfg = { proxyRules: process.env.SPIKE_PROXY, proxyBypassRules: '127.0.0.1;localhost' }
    await ses.setProxy(cfg)
    await session.defaultSession.setProxy(cfg)
    result.proxy = process.env.SPIKE_PROXY
  }

  if (process.env.SPIKE_CRX_DIR) {
    const dir = process.env.SPIKE_CRX_DIR
    globalThis.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString()
      let id = null
      try {
        const u = new URL(url)
        id = new URLSearchParams(u.searchParams.get('x') || '').get('id')
      } catch { /* ignore */ }
      const file = id ? path.join(dir, id + '.crx') : null
      if (file && fs.existsSync(file)) return new Response(fs.readFileSync(file), { status: 200 })
      return new Response('not found', { status: 404 })
    }
    result.fetchImpl = 'crx-dir'
  }

  if (process.env.SPIKE_NET_FETCH === '1') {
    const { net } = require('electron')
    globalThis.fetch = (input, init) => net.fetch(typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input), init)
    result.fetchImpl = 'net.fetch'
  }

  if (MODE === 'library') {
    try {
      const { ElectronChromeExtensions } = require('electron-chrome-extensions')
      global.__ext = new ElectronChromeExtensions({ session: ses, license: 'GPL-3.0' })
      result.library = 'initialized'
    } catch (err) {
      result.errors.push({ libraryInit: String((err && err.message) || err) })
    }
  }

  if (CM_TEST) {
    try {
      const { createContextMenuShim, registerExtensionPreload } = require('../../extension-context-menus.cjs')
      const { createActionManager } = require('../../extension-actions.cjs')
      const { readManifest } = require('../../browser-extensions.cjs')
      registerExtensionPreload(ses, path.join(__dirname, '..', '..', 'extension-api.preload.cjs'))
      result.preloads = ses.getPreloadScripts().map((p) => ({ id: p.id, type: p.type, filePath: p.filePath }))
      cmShim = createContextMenuShim({
        session: ses,
        handleMethod: (extensionId, method, args) => {
          try {
            if (!actionManager) throw new Error('actionManager 未就绪')
            const value = actionManager.invoke(extensionId, method, args)
            result.actionInvokes = (result.actionInvokes || []).concat([{ extensionId, method, ok: true }])
            return value
          } catch (err) {
            result.actionInvokes = (result.actionInvokes || []).concat([{
              extensionId, method, ok: false, error: String((err && err.message) || err),
            }])
            throw err
          }
        },
        logger: {
          warn: function () { result.errors.push({ warn: Array.prototype.join.call(arguments, ' ') }) },
          log: function () { result.swConsole = (result.swConsole || []).concat([Array.prototype.join.call(arguments, ' ')]) },
        },
        getTabInfo: () => ({
          id: 7, windowId: 1, index: 0, active: true, highlighted: true,
          selected: true, pinned: false, incognito: false,
          url: 'https://example.com/article', title: 'spike',
        }),
      })
      cmShim.install()
      result.contextMenuShim = 'installed'
      actionManager = createActionManager({
        getExtensions: () => result.extensions
          .filter((e) => /action/.test(e.fixture))
          .map((e) => ({ key: e.fixture, electronId: e.id, enabled: true, dir: path.join(__dirname, 'fixtures', e.fixture) })),
        deliverEvent: cmShim.deliverEvent,
        openPopup: async () => ({ ok: true }),
        getActiveTab: () => ({ id: 7, url: 'https://example.com/article' }),
        notify: (state) => {
          result.actionUpdates = (result.actionUpdates || []).concat([{
            title: state.title,
            badgeText: state.badgeText,
            badgeColor: state.badgeColor,
            hasIcon: !!state.iconDataUrl,
            enabled: state.enabled,
          }])
        },
        readManifest,
      })
      result.actionManager = 'installed'
      ses.serviceWorkers.on('console-message', (_event, details) => {
        result.swConsole = (result.swConsole || []).concat([
          'sw-console: ' + ((details && (details.message || details.sourceId)) || JSON.stringify(details)),
        ])
      })
    } catch (err) {
      result.errors.push({ contextMenuShim: String((err && err.message) || err) })
    }
  }

  async function runContextMenuChecks () {
    if (!cmShim) return
    const params = {
      pageURL: 'https://example.com/article',
      frameURL: 'https://example.com/article',
      selectionText: 'hello',
      mediaType: 'none',
      isEditable: false,
    }
    result.contextMenu = {
      template: JSON.parse(JSON.stringify(cmShim.buildTemplate(params))),
    }
    for (const ext of result.extensions) {
      if (!/contextmenu/.test(ext.fixture)) continue
      const itemId = ext.fixture.indexOf('mv2') === 0 ? 'mv2-item' : 'mv3-item'
      cmShim.deliverClick(ext.id, {
        menuItemId: itemId,
        pageUrl: params.pageURL,
        frameUrl: params.frameURL,
        selectionText: params.selectionText,
        linkUrl: '',
        srcUrl: '',
        mediaType: 'none',
        editable: false,
        wasChecked: false,
        checked: false,
      })
    }
    if (actionManager) {
      result.actions = actionManager.list().map((state) => ({
        key: state.key,
        title: state.title,
        badgeText: state.badgeText,
        badgeColor: state.badgeColor,
        hasIcon: !!state.iconDataUrl,
        hasPopup: state.hasPopup,
      }))
      for (const ext of result.extensions) {
        if (!/action/.test(ext.fixture)) continue
        await actionManager.click(ext.fixture)
      }
    }
  }

  try {
    await startServer()
  } catch (err) {
    result.errors.push({ server: String((err && err.message) || err) })
  }

  await loadFixtures()
  if (STORE_TEST) await runStore()

  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    webPreferences: { webviewTag: true, contextIsolation: true, sandbox: true }
  })

  win.webContents.on('did-attach-webview', (_event, guest) => {
    result.guestAttached = true
    if (global.__ext) {
      try {
        global.__ext.addTab(guest, win)
        result.libraryAddTab = true
      } catch (err) {
        result.errors.push({ addTab: String((err && err.message) || err) })
      }
    }
    guest.on('dom-ready', () => {
      setTimeout(async () => {
        try {
          result.probe = await guest.executeJavaScript('(function(){return {mv2Dom:!!document.getElementById("spike-mv2-content"),mv3Dom:!!document.getElementById("spike-mv3-content"),blockedLoaded:!!window.__BLOCKED_LOADED__,dnrBlockedLoaded:!!window.__DNR_BLOCKED_LOADED__,marker:(document.getElementById("spike-marker")||{}).textContent||null,url:location.href}})()')
        } catch (err) {
          result.errors.push({ probe: String((err && err.message) || err) })
        }
        if (CM_TEST) {
          try {
            await runContextMenuChecks()
          } catch (err) {
            result.errors.push({ contextMenuChecks: String((err && err.message) || err) })
          }
          await new Promise((resolve) => setTimeout(resolve, 1200))
        }
        finish()
      }, 3000)
    })
  })

  win.webContents.on('did-fail-load', (_e, code, desc) => {
    result.errors.push({ embedderLoad: code + ' ' + desc })
  })

  const embedder = 'file://' + path.join(__dirname, 'embedder.html').replace(/\\/g, '/') + '?port=' + PORT
  await win.loadURL(embedder)

  setTimeout(() => {
    result.errors.push({ timeout: 'probe timed out' })
    finish()
  }, 25000)
})
