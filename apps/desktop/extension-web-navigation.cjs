/**
 * chrome.webNavigation 兼容层（P3d，免费路径）
 *
 * ★ Electron 原生不提供 chrome.webNavigation。本模块把 guest 的导航事件
 *   （did-start-navigation / did-frame-navigate / dom-ready / did-frame-finish-load /
 *   did-navigate-in-page / did-fail-load）转成扩展事件，并实现 getFrame / getAllFrames。
 * ★ frameId 采用 Chrome 语义：主帧固定 0，子帧用 frameTreeNodeId；主帧 parentFrameId=-1。
 */

const { webContents, webFrameMain } = require('electron')

const CHANNEL = 'yz-ext-webnav'
const EVENTS = [
  'onBeforeNavigate',
  'onCommitted',
  'onDOMContentLoaded',
  'onCompleted',
  'onHistoryStateUpdated',
  'onErrorOccurred',
]

function frameIdFor (wc, frame) {
  if (!frame) return 0
  if (frame === wc.mainFrame) return 0
  return Number(frame.frameTreeNodeId) || 0
}

/** 按 Chrome 语义展开帧树：[{frame, frameId, parentFrameId}] */
function collectFrames (wc) {
  const list = []
  const walk = (frame, parentFrameId, depth) => {
    if (!frame || depth > 32) return
    const frameId = frameIdFor(wc, frame)
    list.push({ frame, frameId, parentFrameId })
    let children = []
    try { children = Array.isArray(frame.frames) ? frame.frames : [] } catch { children = [] }
    for (const child of children) walk(child, frameId, depth + 1)
  }
  walk(wc.mainFrame, -1, 0)
  return list
}

function resolveFrame (wc, frameId) {
  const id = Number(frameId)
  const entries = collectFrames(wc)
  const found = entries.find((entry) => entry.frameId === id)
  if (found) return found
  return entries.length ? entries[0] : null
}

function frameFromIds (wc, processId, routingId) {
  try {
    const frame = webFrameMain.fromId(processId, routingId)
    if (frame) return frame
  } catch { /* ignore */ }
  return wc.mainFrame
}

/**
 * @param {object} opts
 * @param {() => Array<object>} opts.getExtensions
 * @param {(extensionId: string, channel: string, ...args:any[]) => void} opts.deliverEvent
 * @param {() => Electron.Session} opts.getSession
 * @param {(id:number) => Electron.WebContents|undefined} [opts.webContentsFromId]
 * @param {Console} [opts.logger]
 */
function createWebNavigationManager ({
  getExtensions,
  deliverEvent,
  getSession,
  webContentsFromId = null,
  logger = console,
} = {}) {
  if (typeof getExtensions !== 'function') throw new Error('getExtensions required')
  if (typeof deliverEvent !== 'function') throw new Error('deliverEvent required')
  if (typeof getSession !== 'function') throw new Error('getSession required')

  const resolveWebContents = webContentsFromId
    || (typeof webContents !== 'undefined' && webContents ? (id) => webContents.fromId(id) : null)

  function dispatch (eventName, details) {
    if (!EVENTS.includes(eventName)) return
    for (const extension of getExtensions() || []) {
      if (!extension || !extension.electronId) continue
      const permissions = Array.isArray(extension.permissions) ? extension.permissions : []
      if (!permissions.includes('webNavigation')) continue
      try {
        deliverEvent(extension.electronId, CHANNEL, eventName, details)
      } catch (err) {
        logger.warn && logger.warn('[ext-webnav] 事件投递失败:', err && err.message)
      }
    }
  }

  function targetWebContents (details) {
    if (!details || details.tabId === undefined || details.tabId === null) throw new Error('缺少 tabId')
    if (!resolveWebContents) throw new Error('无法解析标签页')
    const wc = resolveWebContents(Number(details.tabId))
    if (!wc || wc.isDestroyed()) throw new Error('目标标签页不存在')
    const session = getSession()
    if (session && wc.session !== session) throw new Error('目标标签页不在浏览器分区')
    return wc
  }

  function getFrame (extensionId, details) {
    const wc = targetWebContents(details)
    const entry = resolveFrame(wc, details.frameId === undefined ? 0 : details.frameId)
    if (!entry) throw new Error('帧不存在')
    return {
      errorOccurred: false,
      frameId: entry.frameId,
      parentFrameId: entry.parentFrameId,
      url: String(entry.frame.url || ''),
      documentId: String(entry.frame.frameTreeNodeId || ''),
      documentLifecycle: 'active',
    }
  }

  function getAllFrames (extensionId, details) {
    const wc = targetWebContents(details)
    return collectFrames(wc).map((entry) => ({
      errorOccurred: false,
      frameId: entry.frameId,
      parentFrameId: entry.parentFrameId,
      url: String(entry.frame.url || ''),
      documentId: String(entry.frame.frameTreeNodeId || ''),
      documentLifecycle: 'active',
    }))
  }

  function attachToWebContents (wc) {
    if (!wc || wc.isDestroyed() || wc.__yzExtWebNavWired) return
    wc.__yzExtWebNavWired = true
    const tabId = wc.id
    const base = () => ({ tabId, timeStamp: Date.now() })

    wc.on('did-start-navigation', (_event, url, isInPlace, _isMainFrame, processId, routingId) => {
      if (isInPlace) return
      const entry = resolveFrame(wc, frameIdFor(wc, frameFromIds(wc, processId, routingId)))
      dispatch('onBeforeNavigate', {
        ...base(),
        frameId: entry ? entry.frameId : 0,
        parentFrameId: entry ? entry.parentFrameId : -1,
        url: String(url || ''),
      })
    })

    wc.on('did-frame-navigate', (_event, url, _code, _status, _isMainFrame, processId, routingId) => {
      const entry = resolveFrame(wc, frameIdFor(wc, frameFromIds(wc, processId, routingId)))
      dispatch('onCommitted', {
        ...base(),
        frameId: entry ? entry.frameId : 0,
        parentFrameId: entry ? entry.parentFrameId : -1,
        url: String(url || ''),
        transitionType: 'link',
        transitionQualifiers: [],
      })
    })

    wc.on('dom-ready', () => {
      dispatch('onDOMContentLoaded', { ...base(), frameId: 0, parentFrameId: -1, url: wc.getURL() })
    })

    wc.on('did-frame-finish-load', (_event, _isMainFrame, processId, routingId) => {
      const entry = resolveFrame(wc, frameIdFor(wc, frameFromIds(wc, processId, routingId)))
      dispatch('onCompleted', {
        ...base(),
        frameId: entry ? entry.frameId : 0,
        parentFrameId: entry ? entry.parentFrameId : -1,
        url: entry ? String(entry.frame.url || '') : wc.getURL(),
      })
    })

    wc.on('did-navigate-in-page', (_event, url, _isMainFrame, processId, routingId) => {
      const entry = resolveFrame(wc, frameIdFor(wc, frameFromIds(wc, processId, routingId)))
      dispatch('onHistoryStateUpdated', {
        ...base(),
        frameId: entry ? entry.frameId : 0,
        parentFrameId: entry ? entry.parentFrameId : -1,
        url: String(url || ''),
        transitionType: 'link',
        transitionQualifiers: [],
      })
    })

    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, _isMainFrame, processId, routingId) => {
      if (errorCode === -3) return // ERR_ABORTED：普通取消，不当作导航失败
      const entry = resolveFrame(wc, frameIdFor(wc, frameFromIds(wc, processId, routingId)))
      dispatch('onErrorOccurred', {
        ...base(),
        frameId: entry ? entry.frameId : 0,
        parentFrameId: entry ? entry.parentFrameId : -1,
        url: String(validatedURL || ''),
        error: `net::ERR_${String(errorDescription || errorCode).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
      })
    })
  }

  function invoke (extensionId, method, args) {
    const name = String(method || '')
    if (!name.startsWith('webNavigation.')) throw new Error('不支持的方法: ' + name)
    const bare = name.slice('webNavigation.'.length)
    const details = (Array.isArray(args) && args[0] && typeof args[0] === 'object') ? args[0] : {}
    if (bare === 'getFrame') return getFrame(extensionId, details)
    if (bare === 'getAllFrames') return getAllFrames(extensionId, details)
    throw new Error('不支持的方法: ' + name)
  }

  return {
    invoke,
    getFrame,
    getAllFrames,
    attachToWebContents,
    dispatch,
  }
}

module.exports = {
  createWebNavigationManager,
  collectFrames,
  resolveFrame,
  frameIdFor,
  CHANNEL,
  EVENTS,
}
