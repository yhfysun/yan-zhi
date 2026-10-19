/**
 * 浏览器扩展管理器（P1/P2，免费路径）
 *
 * ★ 只用 Electron 内置的 `ses.extensions.*`，不引入 GPL 的 electron-chrome-extensions。
 *   P0 实测（docs/浏览器扩展-复用Chrome生态-任务规划-20261019.md）：
 *   content script / MV2 background / MV3 service worker / webRequest 均可用；
 *   MV3 declarativeNetRequest 不生效；toolbar popup 用独立窗口兜底。
 *
 * ★ 两种来源：
 *   - folder：用户选择的已解压目录，复制到 rootDir/<key>。
 *   - store：electron-chrome-web-store（MIT）从 Chrome 商店安装，落在
 *     storeDir/<storeId>/<version>/；只允许白名单内的扩展。
 *
 * ★ 为什么注册表自己维护：Electron 不会跨重启记忆扩展（loadExtension 必须每次启动调用），
 *   所以启用列表、安装时间、Electron 返回的 extension id 都要落盘。
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const REGISTRY_VERSION = 1
const MAX_EXTENSIONS = 50
const MANIFEST_CACHE_MAX = 200

/**
 * manifest 解析缓存。
 * ★ list() 会被 action / webNavigation 等热路径高频调用，此前每次都读盘 + JSON.parse；
 *   按「文件 mtime + size」缓存，安装/更新/开关后 mtime 变化自动失效。
 */
const manifestCache = new Map()

/** manifest 校验 + 解析；失败抛出可直接展示给用户的中文错误 */
function readManifest (dir) {
  const file = path.join(dir, 'manifest.json')
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    throw new Error('缺少 manifest.json')
  }
  const cached = manifestCache.get(file)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.manifest
  }
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    throw new Error('manifest.json 不是合法 JSON')
  }
  if (!manifest || typeof manifest !== 'object') throw new Error('manifest.json 内容无效')
  const mv = Number(manifest.manifest_version)
  if (mv !== 2 && mv !== 3) throw new Error('仅支持 Manifest V2 / V3')
  if (!manifest.name || !manifest.version) throw new Error('manifest 缺少 name 或 version')
  if (manifestCache.size >= MANIFEST_CACHE_MAX) manifestCache.clear()
  manifestCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, manifest })
  return manifest
}

/** 从 manifest 提取 UI 需要的字段（权限、弹窗、选项页） */
function manifestInfo (manifest) {
  const rawPerms = Array.isArray(manifest.permissions)
    ? manifest.permissions.filter((p) => typeof p === 'string')
    : []
  const mv2Hosts = manifest.manifest_version === 2
    ? rawPerms.filter((p) => p === '<all_urls>' || /^(https?|file|ftp|\*):\/\//.test(p))
    : []
  const hostPermissions = (Array.isArray(manifest.host_permissions) ? manifest.host_permissions : [])
    .filter((p) => typeof p === 'string')
    .concat(mv2Hosts)
  const permissions = rawPerms.filter((p) => !mv2Hosts.includes(p))
  const action = manifest.action || manifest.browser_action || {}
  return {
    manifestVersion: manifest.manifest_version,
    name: String(manifest.name),
    version: String(manifest.version),
    description: typeof manifest.description === 'string' ? manifest.description : '',
    permissions,
    hostPermissions,
    popup: typeof action.default_popup === 'string' ? action.default_popup : '',
    optionsPage: (manifest.options_ui && typeof manifest.options_ui.page === 'string' ? manifest.options_ui.page : '')
      || (typeof manifest.options_page === 'string' ? manifest.options_page : ''),
  }
}

function slugify (name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return slug || 'ext'
}

/** 从商店链接 / 纯 ID 中提取 32 位扩展 ID（Chrome 扩展 ID 只含 a-p） */
function normalizeStoreId (input) {
  const match = /[a-p]{32}/.exec(String(input || '').trim())
  if (!match) throw new Error('无法识别 Chrome 扩展 ID')
  return match[0]
}

/** 版本比较（支持 1.2.3 / 1.2.3.4 这类纯数字段） */
function compareVersions (a, b) {
  const pa = String(a || '0').split(/[._-]/).map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '0').split(/[._-]/).map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff) return diff
  }
  return 0
}

/**
 * @param {object} opts
 * @param {string} opts.rootDir 扩展目录根（userData/browser-extensions）
 * @param {string} [opts.storeDir] 商店扩展目录（rootDir/store）
 * @param {object} [opts.store] electron-chrome-web-store 模块（installExtension/uninstallExtension/updateExtensions）
 * @param {{isAllowed:(id:string)=>boolean, list:()=>Array}} [opts.whitelist]
 * @param {() => Electron.Session|null} opts.getSession 取持久浏览器 session
 * @param {() => string} [opts.now] 时间源（单测可注入）
 * @param {Console} [opts.logger]
 */
function createExtensionManager ({
  rootDir,
  storeDir = null,
  store = null,
  whitelist = null,
  getSession,
  now = () => new Date().toISOString(),
  logger = console,
} = {}) {
  if (!rootDir) throw new Error('rootDir required')
  const registryPath = path.join(rootDir, 'registry.json')
  let registry = { version: REGISTRY_VERSION, extensions: [] }
  let queue = Promise.resolve()

  /** 所有写操作串行化：安装/卸载/开关可能来自连点或并发 IPC */
  function serialize (fn) {
    const run = queue.then(fn, fn)
    queue = run.catch(() => {})
    return run
  }

  function ensureRoot () {
    fs.mkdirSync(rootDir, { recursive: true })
  }

  function isValidKey (key) {
    return typeof key === 'string'
      && key.length > 0
      && key.length <= 80
      && /^[a-zA-Z0-9._-]+$/.test(key)
      && key !== '.'
      && key !== '..'
  }

  function folderDir (entry) {
    const dir = path.join(rootDir, entry.key)
    const rel = path.relative(rootDir, dir)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('非法扩展目录')
    return dir
  }

  /** 商店扩展按 <version> 子目录存放；返回版本最高且含 manifest 的那个 */
  function findStoreDir (storeId) {
    if (!storeDir || !storeId) return null
    const base = path.join(storeDir, storeId)
    let entries
    try {
      entries = fs.readdirSync(base, { withFileTypes: true })
    } catch {
      return null
    }
    let best = null
    for (const dirent of entries) {
      if (!dirent.isDirectory()) continue
      const dir = path.join(base, dirent.name)
      const manifestPath = path.join(dir, 'manifest.json')
      if (!fs.existsSync(manifestPath)) continue
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        const version = String(manifest.version || '0')
        if (!best || compareVersions(version, best.version) > 0) best = { dir, version }
      } catch { /* 跳过损坏的版本目录 */ }
    }
    return best ? best.dir : null
  }

  function entryDir (entry) {
    if ((entry.source || 'folder') === 'store') return findStoreDir(entry.storeId)
    return folderDir(entry)
  }

  function loadRegistry () {
    ensureRoot()
    if (!fs.existsSync(registryPath)) return
    try {
      const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
      const list = Array.isArray(raw && raw.extensions) ? raw.extensions : []
      registry = {
        version: REGISTRY_VERSION,
        extensions: list.filter((e) => e && isValidKey(e.key)),
      }
    } catch (err) {
      logger.warn && logger.warn('[ext] registry 读取失败，按空处理:', err && err.message)
      registry = { version: REGISTRY_VERSION, extensions: [] }
    }
  }

  function saveRegistry () {
    ensureRoot()
    const tmp = registryPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(registry, null, 2))
    fs.renameSync(tmp, registryPath)
  }

  function sessionObject () {
    try {
      return getSession ? getSession() : null
    } catch {
      return null
    }
  }

  function sessionApi () {
    const ses = sessionObject()
    return ses && ses.extensions && typeof ses.extensions.loadExtension === 'function' ? ses.extensions : null
  }

  function list () {
    loadRegistry()
    return registry.extensions.map((entry) => {
      const dir = entryDir(entry)
      let info
      try {
        if (!dir) throw new Error('扩展文件缺失')
        info = manifestInfo(readManifest(dir))
      } catch (err) {
        info = {
          manifestVersion: null,
          name: entry.key,
          version: '',
          description: '',
          permissions: [],
          hostPermissions: [],
          popup: '',
          optionsPage: '',
          manifestError: String((err && err.message) || err),
        }
      }
      return {
        key: entry.key,
        electronId: entry.electronId || null,
        enabled: !!entry.enabled,
        source: entry.source || 'folder',
        storeId: entry.storeId || null,
        installedAt: entry.installedAt || null,
        loadError: entry.loadError || null,
        dir,
        ...info,
      }
    })
  }

  async function installFromDir (srcDir) {
    return serialize(async () => {
      const abs = path.resolve(srcDir)
      const rel = path.relative(rootDir, abs)
      if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
        throw new Error('不能把扩展目录装到它自己内部')
      }
      const manifest = readManifest(abs)
      const info = manifestInfo(manifest)
      loadRegistry()
      if (registry.extensions.length >= MAX_EXTENSIONS) throw new Error('扩展数量已达上限（' + MAX_EXTENSIONS + '）')
      const api = sessionApi()
      if (!api) throw new Error('浏览器会话未就绪')
      const key = slugify(info.name) + '-' + crypto.randomBytes(4).toString('hex')
      const dest = path.join(rootDir, key)
      ensureRoot()
      fs.cpSync(abs, dest, { recursive: true })
      let ext
      try {
        ext = await api.loadExtension(dest)
      } catch (err) {
        fs.rmSync(dest, { recursive: true, force: true })
        throw new Error('扩展加载失败: ' + String((err && err.message) || err))
      }
      const entry = {
        key,
        electronId: ext.id,
        enabled: true,
        source: 'folder',
        installedAt: now(),
        loadError: null,
      }
      registry.extensions.push(entry)
      saveRegistry()
      return { ok: true, entry: { ...entry, ...info, dir: dest } }
    })
  }

  async function installFromStore (idOrUrl) {
    return serialize(async () => {
      if (!store || typeof store.installExtension !== 'function') throw new Error('商店模块不可用')
      if (!storeDir) throw new Error('商店目录未配置')
      const storeId = normalizeStoreId(idOrUrl)
      if (!whitelist || typeof whitelist.isAllowed !== 'function' || !whitelist.isAllowed(storeId)) {
        throw new Error('该扩展不在精选白名单内')
      }
      const ses = sessionObject()
      if (!ses) throw new Error('浏览器会话未就绪')
      let ext
      try {
        ext = await store.installExtension(storeId, { session: ses, extensionsPath: storeDir })
      } catch (err) {
        throw new Error('商店安装失败: ' + String((err && err.message) || err))
      }
      loadRegistry()
      const key = 'store-' + storeId
      let entry = registry.extensions.find((e) => e.key === key)
      if (!entry) {
        entry = {
          key,
          storeId,
          source: 'store',
          enabled: true,
          installedAt: now(),
          loadError: null,
        }
        registry.extensions.push(entry)
      }
      entry.electronId = ext && ext.id ? ext.id : entry.electronId
      entry.enabled = true
      entry.loadError = null
      saveRegistry()
      const dir = entryDir(entry)
      const info = dir ? manifestInfo(readManifest(dir)) : {}
      return { ok: true, entry: { ...entry, ...info, dir } }
    })
  }

  async function setEnabled (key, enabled) {
    return serialize(async () => {
      loadRegistry()
      const entry = registry.extensions.find((e) => e.key === key)
      if (!entry) throw new Error('扩展不存在')
      if (enabled) {
        const api = sessionApi()
        if (!api) throw new Error('浏览器会话未就绪')
        const dir = entryDir(entry)
        if (!dir) throw new Error('扩展文件缺失')
        readManifest(dir)
        try {
          const ext = await api.loadExtension(dir)
          entry.electronId = ext.id
          entry.enabled = true
          entry.loadError = null
        } catch (err) {
          entry.loadError = String((err && err.message) || err)
          saveRegistry()
          throw new Error('扩展加载失败: ' + entry.loadError)
        }
      } else {
        const api = sessionApi()
        if (api && entry.electronId) {
          try { api.removeExtension(entry.electronId) } catch (err) {
            logger.warn && logger.warn('[ext] 卸载失败:', err && err.message)
          }
        }
        entry.enabled = false
      }
      saveRegistry()
      return { ok: true, key, enabled: !!enabled }
    })
  }

  async function remove (key) {
    return serialize(async () => {
      loadRegistry()
      const idx = registry.extensions.findIndex((e) => e.key === key)
      if (idx < 0) throw new Error('扩展不存在')
      const entry = registry.extensions[idx]
      const ses = sessionObject()
      if ((entry.source || 'folder') === 'store' && store && typeof store.uninstallExtension === 'function' && ses) {
        try {
          await store.uninstallExtension(entry.storeId, { session: ses, extensionsPath: storeDir })
        } catch (err) {
          logger.warn && logger.warn('[ext] 商店卸载失败:', err && err.message)
        }
        try { fs.rmSync(path.join(storeDir, entry.storeId), { recursive: true, force: true }) } catch { /* ignore */ }
      } else {
        const api = sessionApi()
        if (api && entry.electronId) {
          try { api.removeExtension(entry.electronId) } catch { /* ignore */ }
        }
        try { fs.rmSync(folderDir(entry), { recursive: true, force: true }) } catch { /* ignore */ }
      }
      registry.extensions.splice(idx, 1)
      saveRegistry()
      return { ok: true, key }
    })
  }

  /** 启动时调用：按注册表把启用的扩展重新加载进 session */
  async function loadAll () {
    return serialize(async () => {
      loadRegistry()
      const api = sessionApi()
      if (!api) return { ok: true, loaded: 0, note: 'session not ready' }
      let loaded = 0
      for (const entry of registry.extensions) {
        if (!entry.enabled) continue
        const dir = entryDir(entry)
        if (!dir) {
          entry.loadError = '扩展文件缺失'
          continue
        }
        try {
          readManifest(dir)
          const ext = await api.loadExtension(dir)
          entry.electronId = ext.id
          entry.loadError = null
          loaded++
        } catch (err) {
          entry.loadError = String((err && err.message) || err)
          logger.warn && logger.warn('[ext] 启动加载失败:', entry.key, entry.loadError)
        }
      }
      saveRegistry()
      return { ok: true, loaded }
    })
  }

  /** 检查并安装商店扩展更新（只覆盖已启用/已加载的扩展） */
  async function updateAll () {
    return serialize(async () => {
      if (!store || typeof store.updateExtensions !== 'function') throw new Error('商店模块不可用')
      const ses = sessionObject()
      if (!ses) throw new Error('浏览器会话未就绪')
      try {
        await store.updateExtensions(ses)
      } catch (err) {
        throw new Error('检查更新失败: ' + String((err && err.message) || err))
      }
      loadRegistry()
      const api = sessionApi()
      for (const entry of registry.extensions) {
        if ((entry.source || 'folder') !== 'store' || !entry.enabled) continue
        const dir = entryDir(entry)
        if (!dir) {
          entry.loadError = '扩展文件缺失'
          continue
        }
        try {
          const ext = api && typeof api.getExtension === 'function' ? api.getExtension(entry.storeId) : null
          if (ext && ext.id) {
            entry.electronId = ext.id
            entry.loadError = null
          }
        } catch { /* ignore */ }
      }
      saveRegistry()
      return { ok: true }
    })
  }

  /** 返回扩展页面 URL（popup/options）；没有该页面或未加载时返回 null */
  function pageUrl (key, kind) {
    loadRegistry()
    const entry = registry.extensions.find((e) => e.key === key)
    if (!entry || !entry.electronId) return null
    const dir = entryDir(entry)
    if (!dir) return null
    const info = manifestInfo(readManifest(dir))
    const page = kind === 'options' ? info.optionsPage : info.popup
    if (!page) return null
    return 'chrome-extension://' + entry.electronId + '/' + String(page).replace(/^\/+/, '')
  }

  function whitelistEntries () {
    return whitelist && typeof whitelist.list === 'function' ? whitelist.list() : []
  }

  return {
    loadRegistry,
    list,
    installFromDir,
    installFromStore,
    setEnabled,
    remove,
    loadAll,
    updateAll,
    pageUrl,
    whitelistEntries,
  }
}

module.exports = {
  createExtensionManager,
  readManifest,
  manifestInfo,
  slugify,
  normalizeStoreId,
  compareVersions,
}
