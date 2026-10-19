/**
 * chrome.scripting 兼容层（P3c，免费路径）
 *
 * ★ Electron 原生不提供 chrome.scripting（能力探测：undefined）。本模块实现：
 *   - executeScript：files / code / func（func 由 preload 序列化成源码）
 *   - insertCSS / removeCSS：按「扩展 + 标签 + CSS 哈希」记录 Electron 返回的 key
 *   - registerContentScripts / get / update / unregister：进程内注册，
 *     在 guest 每次 dom-ready 时按 URL 匹配注入（不跨重启持久化）
 *
 * ★ 已知差异：
 *   - 注入执行在页面主世界（Electron executeJavaScript），不是 Chrome 的隔离世界；
 *     依赖 chrome.* API 的注入代码不可用。
 *   - runAt 统一按 dom-ready 执行；insertCSS 只作用于主帧。
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const { webContents } = require('electron')
const { urlMatchesPatterns } = require('./extension-context-menus.cjs')

const MAX_SOURCE_BYTES = 4 * 1024 * 1024
const MAX_FRAMES = 50
const VALID_RUN_AT = new Set(['document_start', 'document_end', 'document_idle'])

function readExtensionFile (dir, relative) {
  if (typeof relative !== 'string' || !relative) throw new Error('扩展文件路径无效')
  const absolute = path.resolve(dir, String(relative))
  const rel = path.relative(dir, absolute)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('非法扩展文件路径: ' + relative)
  let stat
  try {
    stat = fs.statSync(absolute)
  } catch {
    throw new Error('扩展文件不存在: ' + relative)
  }
  if (!stat.isFile()) throw new Error('扩展文件不存在: ' + relative)
  if (stat.size > MAX_SOURCE_BYTES) throw new Error('扩展文件过大: ' + relative)
  return fs.readFileSync(absolute, 'utf8')
}

function buildFunctionSource (funcSource, args) {
  if (typeof funcSource !== 'string' || !funcSource.trim()) throw new Error('缺少 func')
  const values = Array.isArray(args) ? args : []
  return `(${funcSource}).apply(null, ${JSON.stringify(values)})`
}

function normalizeInjection (injection, dir) {
  if (!injection || typeof injection !== 'object') throw new Error('注入参数无效')
  const sources = []
  const files = Array.isArray(injection.files)
    ? injection.files
    : (typeof injection.file === 'string' ? [injection.file] : [])
  for (const file of files) sources.push(readExtensionFile(dir, file))
  if (typeof injection.code === 'string' && injection.code.trim()) sources.push(injection.code)
  if (typeof injection.funcSource === 'string') {
    sources.push(buildFunctionSource(injection.funcSource, injection.args))
  }
  if (!sources.length) throw new Error('executeScript 需要 files / code / func')
  return sources
}

function normalizeCss (injection, dir) {
  if (!injection || typeof injection !== 'object') throw new Error('注入参数无效')
  const parts = []
  const files = Array.isArray(injection.files)
    ? injection.files
    : (typeof injection.file === 'string' ? [injection.file] : [])
  for (const file of files) parts.push(readExtensionFile(dir, file))
  if (typeof injection.css === 'string' && injection.css.trim()) parts.push(injection.css)
  if (!parts.length) throw new Error('insertCSS 需要 css / files')
  return parts.join('\n')
}

function selectFrames (wc, target) {
  const main = wc.mainFrame
  if (!main) throw new Error('目标标签页没有主帧')
  let frames = []
  try {
    frames = Array.isArray(main.framesInSubtree) && main.framesInSubtree.length
      ? main.framesInSubtree.slice()
      : [main]
  } catch {
    frames = [main]
  }
  if (!frames.includes(main)) frames.unshift(main)
  frames = frames.slice(0, MAX_FRAMES)
  if (Array.isArray(target.frameIds) && target.frameIds.length) {
    const ids = new Set(target.frameIds.map((id) => Number(id)))
    return frames.filter((frame) => ids.has(Number(frame.frameTreeNodeId)))
  }
  if (target.allFrames) return frames
  return [main]
}

function isStringArray (value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function normalizeContentScript (script, fallbackId) {
  if (!script || typeof script !== 'object') throw new Error('content script 参数无效')
  const matches = isStringArray(script.matches) ? script.matches.filter(Boolean) : []
  if (!matches.length) throw new Error('content script 缺少 matches')
  return {
    id: typeof script.id === 'string' && script.id ? script.id : fallbackId,
    matches,
    excludeMatches: isStringArray(script.excludeMatches) ? script.excludeMatches.filter(Boolean) : [],
    js: isStringArray(script.js) ? script.js.filter(Boolean) : [],
    css: isStringArray(script.css) ? script.css.filter(Boolean) : [],
    runAt: VALID_RUN_AT.has(script.runAt) ? script.runAt : 'document_idle',
    allFrames: script.allFrames === true,
    world: script.world === 'MAIN' ? 'MAIN' : 'ISOLATED',
  }
}

/**
 * @param {object} opts
 * @param {() => Array<object>} opts.getExtensions extensionManager.list()
 * @param {() => Electron.Session} opts.getSession
 * @param {() => Electron.WebContents|null} [opts.getActiveWebContents]
 * @param {(id:number) => Electron.WebContents|undefined} [opts.webContentsFromId]
 * @param {Console} [opts.logger]
 */
function createScriptingManager ({
  getExtensions,
  getSession,
  getActiveWebContents = null,
  webContentsFromId = null,
  logger = console,
} = {}) {
  if (typeof getExtensions !== 'function') throw new Error('getExtensions required')
  if (typeof getSession !== 'function') throw new Error('getSession required')

  const resolveWebContents = webContentsFromId
    || (typeof webContents !== 'undefined' && webContents ? (id) => webContents.fromId(id) : null)
  const registered = new Map() // extensionId → Map<scriptId, script>
  const styleKeys = new Map() // `${extensionId}|${wcId}|${hash}` → Electron insertCSS key
  let scriptSeq = 0

  function findExtension (extensionId) {
    return (getExtensions() || []).find((item) => item.electronId === extensionId) || null
  }

  function targetWebContents (target) {
    const spec = target && typeof target === 'object' ? target : {}
    let wc = null
    if (spec.tabId !== undefined && spec.tabId !== null) {
      if (!resolveWebContents) throw new Error('无法解析标签页')
      wc = resolveWebContents(Number(spec.tabId))
    } else if (typeof getActiveWebContents === 'function') {
      wc = getActiveWebContents()
    }
    if (!wc || wc.isDestroyed()) throw new Error('目标标签页不存在')
    let session = null
    try { session = getSession() } catch { /* ignore */ }
    if (session && wc.session !== session) throw new Error('目标标签页不在浏览器分区')
    const type = typeof wc.getType === 'function' ? wc.getType() : ''
    if (type === 'window' || type === 'backgroundPage') throw new Error('目标不是网页标签页')
    let url = ''
    try { url = wc.getURL() } catch { /* ignore */ }
    if (/^(chrome-extension|devtools|chrome):/i.test(url)) throw new Error('目标不是网页标签页')
    return wc
  }

  async function executeScript (extensionId, injection) {
    const extension = findExtension(extensionId)
    if (!extension) throw new Error('扩展未加载')
    const sources = normalizeInjection(injection, extension.dir)
    const wc = targetWebContents(injection.target)
    const frames = selectFrames(wc, injection.target || {})
    const results = []
    for (const frame of frames) {
      let value
      for (const source of sources) {
        value = await frame.executeJavaScript(source, false)
      }
      results.push({ frameId: Number(frame.frameTreeNodeId) || 0, result: value })
    }
    return results
  }

  function styleKey (extensionId, wc, css) {
    const hash = crypto.createHash('sha256').update(css).digest('hex')
    return { storeKey: `${extensionId}|${wc.id}|${hash}` }
  }

  async function insertCSS (extensionId, injection) {
    const extension = findExtension(extensionId)
    if (!extension) throw new Error('扩展未加载')
    const css = normalizeCss(injection, extension.dir)
    const wc = targetWebContents(injection.target)
    const key = await wc.insertCSS(css)
    const { storeKey } = styleKey(extensionId, wc, css)
    styleKeys.set(storeKey, key)
    return undefined
  }

  async function removeCSS (extensionId, injection) {
    const extension = findExtension(extensionId)
    if (!extension) throw new Error('扩展未加载')
    const css = normalizeCss(injection, extension.dir)
    const wc = targetWebContents(injection.target)
    const { storeKey } = styleKey(extensionId, wc, css)
    const key = styleKeys.get(storeKey)
    if (!key) return undefined
    styleKeys.delete(storeKey)
    await wc.removeInsertedCSS(key)
    return undefined
  }

  function registerContentScripts (extensionId, scripts) {
    if (!Array.isArray(scripts) || !scripts.length) throw new Error('scripts 不能为空')
    let map = registered.get(extensionId)
    if (!map) {
      map = new Map()
      registered.set(extensionId, map)
    }
    for (const script of scripts) {
      const normalized = normalizeContentScript(script, 'script-' + (++scriptSeq))
      map.set(normalized.id, normalized)
    }
    return undefined
  }

  function getRegisteredContentScripts (extensionId, filter) {
    const map = registered.get(extensionId)
    const list = map ? [...map.values()] : []
    const ids = filter && Array.isArray(filter.ids) ? filter.ids : null
    if (!ids) return list
    return list.filter((script) => ids.includes(script.id))
  }

  function updateContentScripts (extensionId, scripts) {
    return registerContentScripts(extensionId, scripts)
  }

  function unregisterContentScripts (extensionId, filter) {
    const map = registered.get(extensionId)
    if (!map) return undefined
    const ids = filter && Array.isArray(filter.ids) ? filter.ids : null
    if (!ids) map.clear()
    else for (const id of ids) map.delete(id)
    return undefined
  }

  function matches (url, script) {
    if (!urlMatchesPatterns(url, script.matches)) return false
    if (script.excludeMatches.length && urlMatchesPatterns(url, script.excludeMatches)) return false
    return true
  }

  async function runRegisteredScripts (wc) {
    if (!wc || wc.isDestroyed()) return
    let url = ''
    try { url = wc.getURL() } catch { return }
    if (!/^https?:/i.test(url)) return
    for (const [extensionId, map] of registered) {
      if (!map.size) continue
      for (const script of map.values()) {
        if (!matches(url, script)) continue
        const target = { tabId: wc.id, allFrames: script.allFrames }
        try {
          if (script.js.length) await executeScript(extensionId, { target, files: script.js })
          if (script.css.length) await insertCSS(extensionId, { target, files: script.css })
        } catch (err) {
          logger.warn && logger.warn('[ext-scripting] 注册脚本注入失败:', err && err.message)
        }
      }
    }
  }

  function attachToWebContents (wc) {
    if (!wc || wc.isDestroyed() || wc.__yzExtScriptingWired) return
    wc.__yzExtScriptingWired = true
    wc.on('dom-ready', () => { void runRegisteredScripts(wc) })
  }

  function invoke (extensionId, method, args) {
    const name = String(method || '')
    if (!name.startsWith('scripting.')) throw new Error('不支持的方法: ' + name)
    const bare = name.slice('scripting.'.length)
    const [first] = Array.isArray(args) ? args : []
    switch (bare) {
      case 'executeScript':
        return executeScript(extensionId, first)
      case 'insertCSS':
        return insertCSS(extensionId, first)
      case 'removeCSS':
        return removeCSS(extensionId, first)
      case 'registerContentScripts':
        return registerContentScripts(extensionId, first)
      case 'getRegisteredContentScripts':
        return getRegisteredContentScripts(extensionId, first)
      case 'updateContentScripts':
        return updateContentScripts(extensionId, first)
      case 'unregisterContentScripts':
        return unregisterContentScripts(extensionId, first)
      default:
        throw new Error('不支持的方法: ' + name)
    }
  }

  return {
    invoke,
    executeScript,
    insertCSS,
    removeCSS,
    registerContentScripts,
    getRegisteredContentScripts,
    updateContentScripts,
    unregisterContentScripts,
    attachToWebContents,
    runRegisteredScripts,
    _registered: registered,
    _styleKeys: styleKeys,
  }
}

module.exports = {
  createScriptingManager,
  readExtensionFile,
  buildFunctionSource,
  normalizeInjection,
  normalizeCss,
  normalizeContentScript,
  selectFrames,
}
