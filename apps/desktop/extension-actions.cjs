/**
 * chrome.action / browserAction 兼容层（P3b，免费路径）
 *
 * ★ Electron 原生不提供 action API（能力探测：chrome.action === undefined）。
 *   这里维护每个扩展的工具条状态（标题/角标/图标/popup/启停），并负责：
 *   - 解析 manifest 的 action / browser_action 默认值；
 *   - 把图标读成 data URL 供渲染层直接展示；
 *   - 点击时优先打开 popup，否则向扩展后台投递 action.onClicked。
 *
 * ★ 状态分两层：manifest 默认值（随扩展列表刷新）+ 运行时 overrides（set* 调用），
 *   避免刷新扩展列表时丢掉 setBadgeText 等运行时状态。
 */

const fs = require('fs')
const path = require('path')

const CLICKED_CHANNEL = 'yz-ext-action:clicked'
const DEFAULT_BADGE_COLOR = '#FF0000'
const MAX_ICON_BYTES = 512 * 1024
const MAX_TITLE_LENGTH = 200
const MAX_BADGE_LENGTH = 32

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
}

function clampByte (value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(255, Math.round(n))) : 0
}

/** Chrome 的 badge color 允许 [r,g,b,a] 数组或 CSS 字符串 */
function normalizeColor (value) {
  if (Array.isArray(value)) {
    const alpha = value.length > 3 ? clampByte(value[3]) / 255 : 1
    return `rgba(${clampByte(value[0])},${clampByte(value[1])},${clampByte(value[2])},${alpha})`
  }
  if (typeof value === 'string' && value.trim() && value.length <= 64) return value.trim()
  return DEFAULT_BADGE_COLOR
}

/** default_icon 可能是字符串或 {16,32,...}；优先 16/32，再取任意一项 */
function pickIconPath (icon) {
  if (typeof icon === 'string') return icon
  if (!icon || typeof icon !== 'object') return ''
  for (const size of ['16', '32', '48', '128']) {
    if (typeof icon[size] === 'string') return icon[size]
  }
  const first = Object.values(icon).find((value) => typeof value === 'string')
  return first || ''
}

function manifestActionDefaults (manifest) {
  const action = (manifest && (manifest.action || manifest.browser_action)) || {}
  const name = manifest && manifest.name ? String(manifest.name) : ''
  return {
    name,
    title: typeof action.default_title === 'string' ? action.default_title : name,
    badgeText: '',
    badgeColor: DEFAULT_BADGE_COLOR,
    iconPath: pickIconPath(action.default_icon),
    popup: typeof action.default_popup === 'string' ? action.default_popup : '',
    enabled: true,
  }
}

/**
 * @param {object} opts
 * @param {() => Array<object>} opts.getExtensions extensionManager.list() 的结果
 * @param {(extensionId: string, channel: string, ...args:any[]) => void} opts.deliverEvent
 * @param {(key: string) => Promise<{ok:boolean,error?:string}>} opts.openPopup
 * @param {() => object|null} [opts.getActiveTab]
 * @param {(state: object) => void} [opts.notify]
 * @param {(dir: string) => object} [opts.readManifest] 注入便于单测
 * @param {Console} [opts.logger]
 */
function createActionManager ({
  getExtensions,
  deliverEvent,
  openPopup,
  getActiveTab = null,
  notify = null,
  readManifest,
  logger = console,
} = {}) {
  if (typeof getExtensions !== 'function') throw new Error('getExtensions required')
  if (typeof deliverEvent !== 'function') throw new Error('deliverEvent required')
  if (typeof openPopup !== 'function') throw new Error('openPopup required')

  const overrides = new Map() // extensionId → {title?, badgeText?, badgeColor?, iconPath?, popup?, enabled?}
  const iconCache = new Map() // absolutePath|mtime|size → dataUrl|null

  function overrideFor (extensionId) {
    let value = overrides.get(extensionId)
    if (!value) {
      value = {}
      overrides.set(extensionId, value)
    }
    return value
  }

  function findExtension (predicate) {
    const list = getExtensions() || []
    return list.find(predicate) || null
  }

  function defaultsFor (extension) {
    if (!extension || !extension.dir) return null
    try {
      const manifest = readManifest(extension.dir)
      return manifestActionDefaults(manifest)
    } catch (err) {
      logger.warn && logger.warn('[ext-action] manifest 读取失败:', err && err.message)
      return null
    }
  }

  function resolveIcon (dir, relative) {
    if (!dir || !relative || typeof relative !== 'string') return ''
    const absolute = path.resolve(dir, relative)
    const rel = path.relative(dir, absolute)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return ''
    let stat
    try {
      stat = fs.statSync(absolute)
    } catch {
      return ''
    }
    if (!stat.isFile() || stat.size > MAX_ICON_BYTES) return ''
    const cacheKey = `${absolute}|${stat.mtimeMs}|${stat.size}`
    if (iconCache.has(cacheKey)) return iconCache.get(cacheKey)
    let dataUrl = ''
    try {
      const mime = MIME_BY_EXT[path.extname(absolute).toLowerCase()] || 'application/octet-stream'
      dataUrl = `data:${mime};base64,${fs.readFileSync(absolute).toString('base64')}`
    } catch {
      dataUrl = ''
    }
    if (iconCache.size > 200) iconCache.clear()
    iconCache.set(cacheKey, dataUrl)
    return dataUrl
  }

  function stateFor (extension) {
    const defaults = defaultsFor(extension)
    if (!defaults) return null
    const extra = overrides.get(extension.electronId) || {}
    const merged = { ...defaults }
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) merged[key] = value
    }
    return {
      key: extension.key,
      extensionId: extension.electronId,
      name: defaults.name,
      title: String(merged.title || defaults.name).slice(0, MAX_TITLE_LENGTH),
      badgeText: String(merged.badgeText || '').slice(0, MAX_BADGE_LENGTH),
      badgeColor: merged.badgeColor || DEFAULT_BADGE_COLOR,
      iconDataUrl: resolveIcon(extension.dir, merged.iconPath),
      hasPopup: !!merged.popup,
      enabled: merged.enabled !== false,
    }
  }

  function list () {
    const states = []
    for (const extension of getExtensions() || []) {
      if (!extension || !extension.key || !extension.electronId) continue
      if (extension.enabled === false) continue
      const state = stateFor(extension)
      if (state) states.push(state)
    }
    return states
  }

  function notifyFor (extensionId) {
    if (typeof notify !== 'function') return
    const extension = findExtension((item) => item.electronId === extensionId)
    if (!extension) return
    const state = stateFor(extension)
    if (state) notify(state)
  }

  function firstDetails (args) {
    const first = Array.isArray(args) ? args[0] : undefined
    return first && typeof first === 'object' ? first : {}
  }

  function invoke (extensionId, method, args) {
    if (!extensionId) throw new Error('无法识别扩展身份')
    const name = String(method || '')
    const bare = name.startsWith('action.')
      ? name.slice('action.'.length)
      : name.startsWith('browserAction.')
        ? name.slice('browserAction.'.length)
        : ''
    if (!bare) throw new Error('不支持的方法: ' + name)

    const extension = findExtension((item) => item.electronId === extensionId)
    if (!extension) throw new Error('扩展未加载')
    const defaults = defaultsFor(extension)
    if (!defaults) throw new Error('扩展 manifest 不可读')
    const extra = overrideFor(extensionId)
    const current = { ...defaults, ...extra }
    const details = firstDetails(args)

    switch (bare) {
      case 'setTitle':
        extra.title = String(details.title || '').slice(0, MAX_TITLE_LENGTH)
        break
      case 'getTitle':
        return { title: String(current.title || defaults.name) }
      case 'setBadgeText':
        extra.badgeText = String(details.text || '').slice(0, MAX_BADGE_LENGTH)
        break
      case 'getBadgeText':
        return { text: String(current.badgeText || '') }
      case 'setBadgeBackgroundColor':
        extra.badgeColor = normalizeColor(details.color)
        break
      case 'getBadgeBackgroundColor':
        return { color: current.badgeColor }
      case 'setIcon':
        if (typeof details.path === 'string') extra.iconPath = details.path
        else if (details.path && typeof details.path === 'object') extra.iconPath = pickIconPath(details.path)
        break
      case 'setPopup':
        extra.popup = typeof details.popup === 'string' ? details.popup : ''
        break
      case 'getPopup':
        return { popup: String(current.popup || '') }
      case 'enable':
        extra.enabled = true
        break
      case 'disable':
        extra.enabled = false
        break
      case 'openPopup':
        return openPopup(extension.key)
      default:
        throw new Error('不支持的方法: ' + name)
    }
    notifyFor(extensionId)
    return { ok: true }
  }

  async function click (key) {
    const extension = findExtension((item) => item.key === String(key))
    if (!extension) return { ok: false, error: '扩展不存在' }
    if (extension.enabled === false) return { ok: false, error: '扩展已禁用' }
    const state = stateFor(extension)
    if (!state) return { ok: false, error: '扩展状态不可用' }
    if (!state.enabled) return { ok: false, error: '扩展图标已禁用' }
    if (state.hasPopup) {
      return openPopup(extension.key)
    }
    const tab = typeof getActiveTab === 'function' ? getActiveTab() : null
    deliverEvent(extension.electronId, CLICKED_CHANNEL, tab || null)
    return { ok: true }
  }

  function clear (extensionId) {
    overrides.delete(extensionId)
  }

  return { list, invoke, click, clear, stateFor, _overrides: overrides }
}

module.exports = {
  createActionManager,
  normalizeColor,
  pickIconPath,
  manifestActionDefaults,
  CLICKED_CHANNEL,
  DEFAULT_BADGE_COLOR,
}
