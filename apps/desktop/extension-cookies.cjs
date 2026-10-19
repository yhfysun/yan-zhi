/**
 * chrome.cookies 兼容层（P3d，免费路径）
 *
 * ★ Electron 原生不提供 chrome.cookies（能力探测：undefined）。本模块把扩展调用
 *   映射到浏览器分区 session.cookies，并在 cookie 变化时广播 onChanged。
 * ★ 只支持应用唯一的分区存储：storeId 固定 "0"。
 */

const STORE_ID = '0'
const SAME_SITE = new Set(['unspecified', 'no_restriction', 'lax', 'strict'])

function normalizeStoreId (value) {
  if (value === undefined || value === null || value === '' || value === STORE_ID) return STORE_ID
  throw new Error('不支持的 cookie store: ' + value)
}

function normalizeCookie (cookie) {
  if (!cookie || typeof cookie !== 'object') return null
  return {
    name: String(cookie.name || ''),
    value: String(cookie.value || ''),
    domain: String(cookie.domain || ''),
    hostOnly: cookie.hostOnly === true,
    path: String(cookie.path || '/'),
    secure: cookie.secure === true,
    httpOnly: cookie.httpOnly === true,
    sameSite: SAME_SITE.has(cookie.sameSite) ? cookie.sameSite : 'unspecified',
    session: cookie.session === true,
    expirationDate: typeof cookie.expirationDate === 'number' ? cookie.expirationDate : undefined,
    storeId: STORE_ID,
  }
}

function requireUrl (details) {
  if (!details || typeof details.url !== 'string' || !details.url) throw new Error('cookies 调用缺少 url')
  return details.url
}

function buildGetAllFilter (details) {
  const filter = {}
  if (typeof details.url === 'string' && details.url) filter.url = details.url
  if (typeof details.name === 'string') filter.name = details.name
  if (typeof details.domain === 'string') filter.domain = details.domain
  if (typeof details.path === 'string') filter.path = details.path
  if (typeof details.secure === 'boolean') filter.secure = details.secure
  if (typeof details.session === 'boolean') filter.session = details.session
  return filter
}

/** Electron 44：cookies.get 返回数组；Chrome 的 cause 与 Electron 枚举不完全一致 */
const CAUSE_MAP = {
  inserted: 'explicit',
  'inserted-no-change-overwrite': 'explicit',
  'inserted-no-value-change-overwrite': 'explicit',
  'expired-overwrite': 'expired_overwrite',
}

function normalizeCause (cause) {
  return CAUSE_MAP[cause] || cause || 'explicit'
}

/**
 * @param {object} opts
 * @param {() => Electron.Session} opts.getSession
 * @param {(extensionId: string, channel: string, ...args:any[]) => void} opts.deliverEvent
 * @param {() => Array<object>} opts.getExtensions extensionManager.list()
 * @param {() => number[]} [opts.getTabIds]
 * @param {Console} [opts.logger]
 */
function createCookiesManager ({
  getSession,
  deliverEvent,
  getExtensions,
  getTabIds = () => [],
  logger = console,
} = {}) {
  if (typeof getSession !== 'function') throw new Error('getSession required')
  if (typeof deliverEvent !== 'function') throw new Error('deliverEvent required')
  if (typeof getExtensions !== 'function') throw new Error('getExtensions required')

  let installed = false

  function sessionObject () {
    const session = getSession()
    if (!session || !session.cookies) throw new Error('浏览器会话未就绪')
    return session
  }

  function broadcastChanged (cookie, cause, removed) {
    for (const extension of getExtensions() || []) {
      if (!extension || !extension.electronId) continue
      const permissions = Array.isArray(extension.permissions) ? extension.permissions : []
      if (!permissions.includes('cookies')) continue
      try {
        deliverEvent(extension.electronId, 'yz-ext-cookie:changed', { removed: !!removed, cause: normalizeCause(cause), cookie: normalizeCookie(cookie) })
      } catch (err) {
        logger.warn && logger.warn('[ext-cookie] onChanged 投递失败:', err && err.message)
      }
    }
  }

  function install () {
    if (installed) return
    installed = true
    const session = sessionObject()
    session.cookies.on('changed', (_event, cookie, cause, removed) => {
      broadcastChanged(cookie, cause, removed)
    })
  }

  async function invoke (extensionId, method, args) {
    const name = String(method || '')
    if (!name.startsWith('cookies.')) throw new Error('不支持的方法: ' + name)
    const bare = name.slice('cookies.'.length)
    const details = (Array.isArray(args) && args[0] && typeof args[0] === 'object') ? args[0] : {}
    const session = sessionObject()

    switch (bare) {
      case 'get': {
        const url = requireUrl(details)
        if (typeof details.name !== 'string' || !details.name) throw new Error('cookies.get 缺少 name')
        normalizeStoreId(details.storeId)
        const cookies = await session.cookies.get({ url, name: details.name })
        return cookies && cookies.length ? normalizeCookie(cookies[0]) : null
      }
      case 'getAll': {
        normalizeStoreId(details.storeId)
        const cookies = await session.cookies.get(buildGetAllFilter(details))
        return (cookies || []).map(normalizeCookie).filter(Boolean)
      }
      case 'set': {
        const url = requireUrl(details)
        if (typeof details.name !== 'string' || !details.name) throw new Error('cookies.set 缺少 name')
        normalizeStoreId(details.storeId)
        const payload = { url, name: details.name, value: String(details.value === undefined ? '' : details.value) }
        if (typeof details.domain === 'string' && details.domain) payload.domain = details.domain
        if (typeof details.path === 'string' && details.path) payload.path = details.path
        if (typeof details.secure === 'boolean') payload.secure = details.secure
        if (typeof details.httpOnly === 'boolean') payload.httpOnly = details.httpOnly
        if (typeof details.expirationDate === 'number') payload.expirationDate = details.expirationDate
        if (SAME_SITE.has(details.sameSite)) payload.sameSite = details.sameSite
        await session.cookies.set(payload)
        // Electron 的 set 只返回 void；按 Chrome 语义回读已写入的 cookie
        const cookies = await session.cookies.get({ url, name: details.name })
        if (cookies && cookies.length) return normalizeCookie(cookies[0])
        return normalizeCookie({ name: payload.name, value: payload.value, domain: payload.domain || '', path: payload.path || '/' })
      }
      case 'remove': {
        const url = requireUrl(details)
        if (typeof details.name !== 'string' || !details.name) throw new Error('cookies.remove 缺少 name')
        normalizeStoreId(details.storeId)
        const before = await session.cookies.get({ url, name: details.name })
        await session.cookies.remove(url, details.name)
        return before && before.length ? { url, name: details.name, storeId: STORE_ID } : null
      }
      case 'getAllCookieStores': {
        let tabIds = []
        try { tabIds = getTabIds() || [] } catch { /* ignore */ }
        return [{ id: STORE_ID, tabIds }]
      }
      default:
        throw new Error('不支持的方法: ' + name)
    }
  }

  return { install, invoke, _broadcastChanged: broadcastChanged }
}

module.exports = {
  createCookiesManager,
  normalizeCookie,
  normalizeStoreId,
  normalizeCause,
  buildGetAllFilter,
  STORE_ID,
}
