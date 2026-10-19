/**
 * chrome.contextMenus 兼容层（P3，免费路径）
 *
 * ★ 为什么需要：Electron 内置扩展支持不含 contextMenus，扩展后台调用
 *   chrome.contextMenus.create 会直接抛错。这里只在扩展上下文（MV2 后台页 /
 *   MV3 service worker）注入一个窄 API 面，菜单由主进程用原生 Menu 渲染。
 *
 * ★ 数据流：
 *   preload 注入 chrome.contextMenus → ipc（方法调用）→ 本模块注册表
 *   guest 右键 → 本模块按 contexts / URL 模式过滤 → Menu.popup
 *   点击 → 投递 yz-ext-cm:clicked → 对应扩展的后台页 / service worker
 *
 * ★ 扩展身份不信任 preload 自报：帧按 senderFrame.url、SW 按 worker.scope 反查。
 */

const { BrowserWindow, Menu, ipcMain, webContents } = require('electron')

const INVOKE_CHANNEL = 'yz-ext-cm:invoke'
const CLICKED_CHANNEL = 'yz-ext-cm:clicked'

const MAX_ITEMS_PER_EXTENSION = 200
const MAX_TITLE_LENGTH = 200
const MAX_PATTERNS = 20
const MAX_CONTEXTS = 20

const DEFAULT_CONTEXTS = ['page']
const VALID_CONTEXTS = new Set([
  'all', 'page', 'frame', 'selection', 'link', 'editable',
  'image', 'video', 'audio', 'browser_action', 'page_action', 'action',
])
const VALID_TYPES = new Set(['normal', 'checkbox', 'radio', 'separator'])

function escapeRegExp (value) {
  return String(value).replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}

/** Chrome match pattern → RegExp；无效模式返回 null（该模式视为不匹配） */
function matchPatternToRegExp (pattern) {
  if (typeof pattern !== 'string' || !pattern) return null
  if (pattern === '<all_urls>') return /^(?:https?|wss?|file|ftp):\/\//i
  const match = /^(\*|https?|file|ftp|wss?):\/\/([^/]*)(\/.*)$/i.exec(pattern)
  if (!match) return null
  const scheme = match[1].toLowerCase()
  const host = match[2]
  const schemeRe = scheme === '*' ? '(?:https?)' : escapeRegExp(scheme)
  let hostRe
  if (scheme === 'file') hostRe = ''
  else if (host === '*') hostRe = '[^/]*'
  else if (host.startsWith('*.')) hostRe = '(?:[^/]+\\.)?' + escapeRegExp(host.slice(2))
  else hostRe = escapeRegExp(host)
  const pathRe = match[3].split('*').map(escapeRegExp).join('.*')
  return new RegExp('^' + schemeRe + '://' + hostRe + pathRe + '$', 'i')
}

/** 去掉端口：Chrome 的 match pattern 不包含端口 */
function normalizeUrlForMatch (value) {
  try {
    const url = new URL(String(value))
    if (url.protocol === 'file:') return 'file://' + url.pathname + url.search
    return url.protocol + '//' + url.hostname + url.pathname + url.search
  } catch {
    return String(value || '')
  }
}

function urlMatchesPatterns (value, patterns) {
  if (!value || !Array.isArray(patterns) || patterns.length === 0) return true
  const target = normalizeUrlForMatch(value)
  return patterns.some((pattern) => {
    const re = matchPatternToRegExp(pattern)
    return re ? re.test(target) : false
  })
}

function targetUrlForParams (params) {
  return params.linkURL || params.srcURL || ''
}

/** 按 Electron context-menu params 判断扩展声明的 contexts 是否命中 */
function contextsMatch (contexts, params) {
  const declared = Array.isArray(contexts) && contexts.length ? contexts : DEFAULT_CONTEXTS
  const actual = {
    all: true,
    page: true,
    frame: true,
    selection: !!params.selectionText,
    link: !!params.linkURL,
    editable: !!params.isEditable,
    image: params.mediaType === 'image' || !!params.hasImageContents,
    video: params.mediaType === 'video',
    audio: params.mediaType === 'audio',
  }
  return declared.some((context) => actual[context] === true)
}

function sanitizePatterns (value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item).slice(0, MAX_PATTERNS)
}

function sanitizeContexts (value) {
  if (!Array.isArray(value)) return DEFAULT_CONTEXTS.slice()
  const list = value
    .filter((item) => typeof item === 'string' && VALID_CONTEXTS.has(item))
    .slice(0, MAX_CONTEXTS)
  return list.length ? list : DEFAULT_CONTEXTS.slice()
}

function sanitizeTitle (value) {
  return typeof value === 'string' ? value.slice(0, MAX_TITLE_LENGTH) : ''
}

/** 校验 create/update 入参；返回可落库的字段 */
function sanitizeProps (props, { requireTitle = false } = {}) {
  if (!props || typeof props !== 'object') throw new Error('createProperties 无效')
  const type = VALID_TYPES.has(props.type) ? props.type : 'normal'
  const title = sanitizeTitle(props.title)
  if (type !== 'separator' && requireTitle && !title) throw new Error('菜单项缺少 title')
  let id = props.id
  if (id !== undefined && id !== null && typeof id !== 'number' && typeof id !== 'string') {
    throw new Error('菜单项 id 必须是字符串或数字')
  }
  return {
    id: id === undefined || id === null ? null : String(id),
    rawId: id === undefined || id === null ? null : id,
    parentId: props.parentId === undefined || props.parentId === null ? null : String(props.parentId),
    title,
    type,
    contexts: sanitizeContexts(props.contexts),
    documentUrlPatterns: sanitizePatterns(props.documentUrlPatterns),
    targetUrlPatterns: sanitizePatterns(props.targetUrlPatterns),
    enabled: props.enabled !== false,
    visible: props.visible !== false,
    checked: props.checked === true,
  }
}

function isItemVisible (item, params, pageUrl) {
  if (!item || !item.visible) return false
  if (item.type === 'separator') return true
  if (!contextsMatch(item.contexts, params)) return false
  if (!urlMatchesPatterns(pageUrl, item.documentUrlPatterns)) return false
  const targetUrl = targetUrlForParams(params)
  if (item.targetUrlPatterns.length) {
    if (!targetUrl || !urlMatchesPatterns(targetUrl, item.targetUrlPatterns)) return false
  }
  return true
}

/** 把可见项组装成 parentId 树；父项不可见时子项一并隐藏（Chrome 语义） */
function buildTree (items, params, pageUrl) {
  const allById = new Map(items.map((item) => [item.id, item]))
  const memo = new Map()
  const isShown = (item, depth) => {
    if (!item || depth > 16) return false
    if (memo.has(item.id)) return memo.get(item.id)
    let shown = isItemVisible(item, params, pageUrl)
    if (shown && item.parentId) {
      shown = isShown(allById.get(item.parentId), depth + 1)
    }
    memo.set(item.id, shown)
    return shown
  }
  const visible = items.filter((item) => isShown(item, 0))
  const visibleIds = new Set(visible.map((item) => item.id))
  const childrenByParent = new Map()
  for (const item of visible) {
    const parent = item.parentId && visibleIds.has(item.parentId) ? item.parentId : ''
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, [])
    childrenByParent.get(parent).push(item)
  }
  const build = (parentId, depth) => {
    if (depth > 8) return []
    return (childrenByParent.get(parentId) || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => ({ item, children: build(item.id, depth + 1) }))
  }
  return build('', 0)
}

function formatTitle (title, params) {
  if (!title.includes('%s')) return title
  const selection = String(params.selectionText || '').replace(/\s+/g, ' ').trim()
  if (!selection) return title.replace(/%s/g, '').trim()
  return title.replace(/%s/g, selection)
}

function extensionIdFromUrl (value) {
  try {
    const url = new URL(String(value))
    if (url.protocol !== 'chrome-extension:') return null
    return url.hostname || null
  } catch {
    return null
  }
}

/**
 * @param {object} opts
 * @param {Electron.Session} opts.session 浏览器分区 session（persist:browser-view）
 * @param {() => Electron.BrowserWindow|null} [opts.getPopupWindow]
 * @param {(wc: Electron.WebContents|null) => object|null} [opts.getTabInfo]
 * @param {Console} [opts.logger]
 */
function createContextMenuShim ({
  session,
  getPopupWindow = null,
  getTabInfo = null,
  logger = console,
} = {}) {
  if (!session) throw new Error('session required')

  const menus = new Map() // extensionId → Map<id, item>
  let nextAutoId = 0
  let sequence = 0
  let installed = false
  let disposed = false
  const workers = new WeakSet()

  function extensionMenus (extensionId) {
    let list = menus.get(extensionId)
    if (!list) {
      list = new Map()
      menus.set(extensionId, list)
    }
    return list
  }

  function invoke (extensionId, method, args) {
    if (!extensionId) throw new Error('无法识别扩展身份')
    if (disposed) throw new Error('扩展菜单已注销')
    const list = extensionMenus(extensionId)
    const [first, second] = Array.isArray(args) ? args : []

    switch (method) {
      case 'create': {
        if (list.size >= MAX_ITEMS_PER_EXTENSION) throw new Error('右键菜单项数量已达上限')
        const props = sanitizeProps(first, { requireTitle: true })
        const id = props.id === null ? String(++nextAutoId) : props.id
        if (list.has(id)) throw new Error('菜单项 id 重复: ' + id)
        if (props.parentId && !list.has(props.parentId)) throw new Error('父菜单项不存在: ' + props.parentId)
        const item = {
          ...props,
          extensionId,
          id,
          rawId: props.rawId === null ? id : props.rawId,
          order: ++sequence,
        }
        list.set(id, item)
        return { ok: true, id: item.rawId }
      }
      case 'update': {
        const id = String(first)
        const item = list.get(id)
        if (!item) throw new Error('菜单项不存在: ' + id)
        const patch = sanitizeProps(second, { requireTitle: false })
        for (const key of ['title', 'type', 'contexts', 'documentUrlPatterns', 'targetUrlPatterns', 'enabled', 'visible', 'checked', 'parentId']) {
          if (second && Object.prototype.hasOwnProperty.call(second, key)) item[key] = patch[key]
        }
        if (!item.title && item.type !== 'separator') throw new Error('菜单项缺少 title')
        return { ok: true }
      }
      case 'remove': {
        const id = String(first)
        list.delete(id)
        for (const [childId, child] of list) {
          if (child.parentId === id) list.delete(childId)
        }
        return { ok: true }
      }
      case 'removeAll':
        list.clear()
        return { ok: true }
      default:
        throw new Error('不支持的方法: ' + method)
    }
  }

  function handleFrameInvoke (event, method, args) {
    const url = event && event.senderFrame && event.senderFrame.url
      ? event.senderFrame.url
      : (event && event.sender ? event.sender.getURL() : '')
    return invoke(extensionIdFromUrl(url), method, args)
  }

  function attachWorker (worker) {
    if (!worker || workers.has(worker) || worker.isDestroyed?.()) return
    const extensionId = extensionIdFromUrl(worker.scope)
    if (!extensionId) return
    workers.add(worker)
    try {
      worker.ipc.handle(INVOKE_CHANNEL, (_event, method, args) => invoke(extensionId, method, args))
    } catch (err) {
      logger.warn && logger.warn('[ext-menu] worker IPC 注册失败:', err && err.message)
    }
  }

  function install () {
    if (installed) return
    installed = true
    ipcMain.handle(INVOKE_CHANNEL, handleFrameInvoke)
    session.serviceWorkers.on('running-status-changed', (details) => {
      if (disposed || !details || details.runningStatus !== 'starting') return
      const worker = session.serviceWorkers.getWorkerFromVersionID(details.versionId)
      if (worker) attachWorker(worker)
    })
    for (const info of Object.values(session.serviceWorkers.getAllRunning() || {})) {
      if (!info || !info.scope || !extensionIdFromUrl(info.scope)) continue
      try {
        const worker = session.serviceWorkers.getWorkerFromVersionID(info.versionId)
        if (worker) attachWorker(worker)
      } catch { /* 已停止 */ }
    }
    session.extensions.on('extension-unloaded', (_event, extension) => {
      if (extension && extension.id) menus.delete(extension.id)
    })
  }

  function buildTemplate (params, wc = null) {
    const pageUrl = params.pageURL || ''
    const template = []
    for (const [, list] of menus) {
      const tree = buildTree([...list.values()], params, pageUrl)
      const group = []
      for (const node of tree) {
        const menuItem = toMenuItem(node, params, wc)
        if (menuItem) group.push(menuItem)
      }
      while (group.length && group[0].type === 'separator') group.shift()
      while (group.length && group[group.length - 1].type === 'separator') group.pop()
      if (!group.length) continue
      if (template.length) template.push({ type: 'separator' })
      template.push(...group)
    }
    return template
  }

  function toMenuItem (node, params, wc) {
    const item = node.item
    if (item.type === 'separator') return { type: 'separator' }
    if (node.children.length) {
      const submenu = node.children
        .map((child) => toMenuItem(child, params, wc))
        .filter(Boolean)
      while (submenu.length && submenu[0].type === 'separator') submenu.shift()
      while (submenu.length && submenu[submenu.length - 1].type === 'separator') submenu.pop()
      if (!submenu.length) return null
      return {
        label: formatTitle(item.title, params),
        enabled: item.enabled,
        submenu,
      }
    }
    const template = {
      label: formatTitle(item.title, params),
      enabled: item.enabled,
      click: () => onItemClick(item, params, wc),
    }
    if (item.type === 'checkbox' || item.type === 'radio') {
      template.type = item.type
      template.checked = item.checked
    }
    return template
  }

  function toggleChecked (item, extensionId) {
    if (item.type === 'checkbox') {
      item.checked = !item.checked
      return
    }
    if (item.type === 'radio') {
      item.checked = true
      const list = menus.get(extensionId)
      if (!list) return
      for (const sibling of list.values()) {
        if (sibling !== item && sibling.type === 'radio' && sibling.parentId === item.parentId) {
          sibling.checked = false
        }
      }
    }
  }

  function onItemClick (item, params, wc) {
    const extensionId = item.extensionId
    if (!extensionId) return
    const wasChecked = item.checked
    toggleChecked(item, extensionId)
    const parent = item.parentId ? menus.get(extensionId)?.get(item.parentId) : null
    const info = {
      menuItemId: item.rawId,
      parentMenuItemId: parent ? parent.rawId : undefined,
      pageUrl: params.pageURL || '',
      frameUrl: params.frameURL || params.pageURL || '',
      selectionText: params.selectionText || '',
      linkUrl: params.linkURL || '',
      srcUrl: params.srcURL || '',
      mediaType: params.mediaType || 'none',
      editable: !!params.isEditable,
      wasChecked,
      checked: item.checked,
    }
    deliverClick(extensionId, info, wc, params)
  }

  function tabInfoFor (wc, params) {
    let tab = null
    try {
      tab = getTabInfo ? getTabInfo(wc) : null
    } catch { /* ignore */ }
    if (!tab) {
      tab = {
        id: -1,
        windowId: 1,
        active: true,
        highlighted: true,
        selected: true,
        pinned: false,
        incognito: false,
        url: params.pageURL || '',
        title: '',
      }
    }
    return tab
  }

  function deliverClick (extensionId, info, wc = null, params = {}) {
    const tab = tabInfoFor(wc, params)
    const prefix = 'chrome-extension://' + extensionId + '/'
    for (const wc of webContents.getAllWebContents()) {
      if (!wc || wc.isDestroyed() || wc.session !== session) continue
      let url = ''
      try { url = wc.getURL() } catch { continue }
      if (!url.startsWith(prefix)) continue
      try { wc.send(CLICKED_CHANNEL, info, tab) } catch (err) {
        logger.warn && logger.warn('[ext-menu] 事件投递失败:', err && err.message)
      }
    }
    // MV3：service worker 可能已休眠，startWorkerForScope 会唤醒后再投递
    Promise.resolve()
      .then(() => session.serviceWorkers.startWorkerForScope(prefix))
      .then((worker) => {
        if (worker && !worker.isDestroyed?.()) worker.send(CLICKED_CHANNEL, info, tab)
      })
      .catch(() => { /* 非 MV3 或无法唤醒：忽略 */ })
  }

  function attachToWebContents (wc) {
    if (!wc || wc.isDestroyed() || wc.__yzExtContextMenuWired) return
    wc.__yzExtContextMenuWired = true
    wc.on('context-menu', (_event, params) => {
      if (disposed) return
      const template = buildTemplate(params, wc)
      if (!template.length) return
      try {
        const menu = Menu.buildFromTemplate(template)
        const win = (getPopupWindow && getPopupWindow()) || BrowserWindow.fromWebContents(wc) || undefined
        menu.popup({ window: win })
      } catch (err) {
        logger.warn && logger.warn('[ext-menu] 菜单弹出失败:', err && err.message)
      }
    })
  }

  function dispose () {
    disposed = true
    menus.clear()
    if (installed) {
      try { ipcMain.removeHandler(INVOKE_CHANNEL) } catch { /* ignore */ }
    }
  }

  return {
    install,
    attachToWebContents,
    invoke,
    buildTemplate,
    deliverClick,
    dispose,
    _menus: menus,
  }
}

/**
 * 给浏览器分区注册扩展上下文 preload。
 * frame 覆盖 MV2 后台页与扩展页面，service-worker 覆盖 MV3。
 */
function registerExtensionPreload (session, preloadPath) {
  if (!session || typeof session.registerPreloadScript !== 'function') return false
  const registrations = [
    { id: 'yz-ext-api-frame', type: 'frame', filePath: preloadPath },
    { id: 'yz-ext-api-sw', type: 'service-worker', filePath: preloadPath },
  ]
  for (const registration of registrations) {
    try {
      session.registerPreloadScript(registration)
    } catch (err) {
      // 重复注册同一 id 会抛错，说明已注册过
      if (!/already/i.test(String(err && err.message))) throw err
    }
  }
  return true
}

module.exports = {
  createContextMenuShim,
  registerExtensionPreload,
  matchPatternToRegExp,
  urlMatchesPatterns,
  contextsMatch,
  sanitizeProps,
  buildTree,
  formatTitle,
  extensionIdFromUrl,
  normalizeUrlForMatch,
  INVOKE_CHANNEL,
  CLICKED_CHANNEL,
}
