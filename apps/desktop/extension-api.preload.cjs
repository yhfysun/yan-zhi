/**
 * 扩展上下文 API preload（P3）
 *
 * 由 extension-context-menus.cjs 的 registerExtensionPreload 注册到
 * persist:browser-view，分别以 frame 与 service-worker 类型运行：
 *   - frame：MV2 后台页、扩展页面（chrome-extension://<id>/...）
 *   - service-worker：MV3 service worker
 *
 * 只补 Electron 缺失的 chrome.contextMenus；其余 chrome.* 保持 Electron 原样。
 * 主世界注入通过 contextBridge 暴露的窄对象完成，不把 ipcRenderer 暴露给扩展代码。
 */

const electron = (() => {
  try { return require('electron') } catch (err) {
    console.error('[contextMenus] require(electron) 失败', err)
    return null
  }
})()
const { contextBridge, ipcRenderer, webFrame } = electron || {}

const INVOKE_CHANNEL = 'yz-ext-cm:invoke'
const CLICKED_CHANNEL = 'yz-ext-cm:clicked'
const BRIDGE_KEY = '__yzExtBridge'

function isServiceWorker () {
  return typeof process !== 'undefined' && process.type === 'service-worker'
}

function isExtensionFrame () {
  try {
    return typeof location !== 'undefined' && location.protocol === 'chrome-extension:'
  } catch {
    return false
  }
}

function shouldInstall () {
  // ★ SW preload 里 self/location/chrome 均不可见（实测 Electron 44），无法在此判断
  //   是否为扩展 SW；统一尝试注入，由主世界检查 chrome 是否存在，普通页面的 SW 自动跳过。
  if (isServiceWorker()) return true
  return isExtensionFrame()
}

/**
 * 在扩展主世界安装 chrome.contextMenus。
 * ★ 该函数会被序列化后在主世界执行，只能依赖 globalThis，不能引用外部变量。
 */
function installMainWorld () {
  const bridge = globalThis.__yzExtBridge
  try { delete globalThis.__yzExtBridge } catch { /* ignore */ }
  if (!bridge) return
  const chromeObject = globalThis.chrome
  if (!chromeObject) return

  const callbacks = Object.create(null)
  const listeners = []
  let counter = 0

  bridge.onClicked((info, tab) => {
    const callback = callbacks[String(info && info.menuItemId)]
    if (callback) {
      try { callback(info, tab) } catch (err) { console.error('[contextMenus.onclick]', err) }
    }
    for (const listener of listeners.slice()) {
      try { listener(info, tab) } catch (err) { console.error('[contextMenus.onClicked]', err) }
    }
  })

  function setLastError (err) {
    try {
      chromeObject.runtime.lastError = err ? { message: String((err && err.message) || err) } : undefined
    } catch { /* lastError 可能为只读 */ }
  }

  function settle (promise, callback) {
    if (typeof callback !== 'function') {
      promise.catch(() => {})
      return
    }
    promise.then(
      () => { setLastError(null); try { callback() } catch (err) { console.error(err) } },
      (err) => { setLastError(err); try { callback() } catch (e) { console.error(e) } }
    )
  }

  /** 与 settle 相同，但保留返回值（get* 方法 / Promise 形式） */
  function settleValue (promise, callback, map) {
    const mapped = typeof map === 'function' ? promise.then(map) : promise
    if (typeof callback !== 'function') return mapped
    mapped.then(
      (value) => { setLastError(null); try { callback(value) } catch (err) { console.error(err) } },
      (err) => { setLastError(err); try { callback(undefined) } catch (e) { console.error(e) } }
    )
  }

  function invokeWithRetry (method, args, attempts) {
    const left = attempts === undefined ? 3 : attempts
    return bridge.invoke(method, args).catch((err) => {
      if (left <= 1) throw err
      return new Promise((resolve) => setTimeout(resolve, 60)).then(() => invokeWithRetry(method, args, left - 1))
    })
  }

  const onClicked = {
    addListener (listener) {
      if (typeof listener === 'function' && listeners.indexOf(listener) < 0) listeners.push(listener)
    },
    removeListener (listener) {
      const index = listeners.indexOf(listener)
      if (index >= 0) listeners.splice(index, 1)
    },
    hasListener (listener) {
      return listeners.indexOf(listener) >= 0
    },
  }

  const contextMenus = {
    create (createProperties, callback) {
      const props = Object.assign({}, createProperties)
      if (props.id === undefined || props.id === null) props.id = String(++counter)
      if (typeof props.onclick === 'function') {
        callbacks[String(props.id)] = props.onclick
        delete props.onclick
      }
      settle(bridge.invoke('create', [props]), callback)
      return props.id
    },
    update (id, updateProperties, callback) {
      settle(bridge.invoke('update', [id, Object.assign({}, updateProperties)]), callback)
    },
    remove (id, callback) {
      settle(bridge.invoke('remove', [id]), callback)
    },
    removeAll (callback) {
      settle(bridge.invoke('removeAll', []), callback)
    },
    onClicked,
    ACTION_MENU_TOP_LEVEL_LIMIT: 6,
  }

  try {
    Object.defineProperty(chromeObject, 'contextMenus', {
      value: contextMenus,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  } catch (err) {
    console.error('[contextMenus] 注入失败', err)
  }

  // ---- chrome.action / browserAction ----
  const actionListeners = []
  bridge.onActionClicked((tab) => {
    for (const listener of actionListeners.slice()) {
      try { listener(tab) } catch (err) { console.error('[action.onClicked]', err) }
    }
  })

  const actionEvent = {
    addListener (listener) {
      if (typeof listener === 'function' && actionListeners.indexOf(listener) < 0) actionListeners.push(listener)
    },
    removeListener (listener) {
      const index = actionListeners.indexOf(listener)
      if (index >= 0) actionListeners.splice(index, 1)
    },
    hasListener (listener) {
      return actionListeners.indexOf(listener) >= 0
    },
  }

  function actionCall (method, args, callback, map) {
    // ★ MV3 SW 启动极早期，主进程的 worker IPC handler 可能尚未挂上；
    //   invoke 会立即 reject。这里短重试 3 次，覆盖启动竞态。
    const promise = invokeWithRetry('action.' + method, args)
    if (typeof callback !== 'function' && typeof map !== 'function') {
      promise.catch(() => {})
      return undefined
    }
    return settleValue(promise, callback, map)
  }

  function actionTabArg (tabId, callback) {
    if (typeof tabId === 'function') return { tabId: null, callback: tabId }
    return { tabId: tabId === undefined ? null : tabId, callback }
  }

  const actionApi = {
    setTitle (details, callback) { actionCall('setTitle', [details || {}], callback) },
    getTitle (details, callback) { return actionCall('getTitle', [details || {}], callback, (v) => v && v.title) },
    setBadgeText (details, callback) { actionCall('setBadgeText', [details || {}], callback) },
    getBadgeText (details, callback) { return actionCall('getBadgeText', [details || {}], callback, (v) => v && v.text) },
    setBadgeBackgroundColor (details, callback) { actionCall('setBadgeBackgroundColor', [details || {}], callback) },
    getBadgeBackgroundColor (details, callback) {
      return actionCall('getBadgeBackgroundColor', [details || {}], callback, (v) => v && v.color)
    },
    setIcon (details, callback) { actionCall('setIcon', [details || {}], callback) },
    setPopup (details, callback) { actionCall('setPopup', [details || {}], callback) },
    getPopup (details, callback) { return actionCall('getPopup', [details || {}], callback, (v) => v && v.popup) },
    enable (tabId, callback) {
      const args = actionTabArg(tabId, callback)
      return actionCall('enable', [args.tabId], args.callback)
    },
    disable (tabId, callback) {
      const args = actionTabArg(tabId, callback)
      return actionCall('disable', [args.tabId], args.callback)
    },
    openPopup (callback) { return actionCall('openPopup', [], callback) },
    onClicked: actionEvent,
  }

  try {
    // ★ 必须无条件覆盖：manifest 声明 action/browser_action 时，Electron 会预置一个
    //   原生空壳对象（调用不报错但不生效），按“存在就跳过”会让扩展一直在用空壳。
    Object.defineProperty(chromeObject, 'action', {
      value: actionApi,
      enumerable: true,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(chromeObject, 'browserAction', {
      value: actionApi,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  } catch (err) {
    console.error('[action] 注入失败', err)
  }
}

function install () {
  if (!electron) return
  if (!shouldInstall()) return
  const bridge = {
    invoke: (method, args) => ipcRenderer.invoke(INVOKE_CHANNEL, method, args),
    onClicked: (callback) => {
      ipcRenderer.on(CLICKED_CHANNEL, (_event, info, tab) => callback(info, tab))
    },
    onActionClicked: (callback) => {
      ipcRenderer.on('yz-ext-action:clicked', (_event, tab) => callback(tab))
    },
  }

  if (!process.contextIsolated) {
    globalThis[BRIDGE_KEY] = bridge
    installMainWorld()
    return
  }

  try {
    contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge)
    if (contextBridge.executeInMainWorld) {
      contextBridge.executeInMainWorld({ func: installMainWorld })
    } else {
      webFrame.executeJavaScript('(' + installMainWorld.toString() + ')()')
    }
  } catch (err) {
    console.error('[contextMenus] preload 注入失败', err)
  }
}

install()
