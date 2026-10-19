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
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const REGISTRY_VERSION = 1
const MAX_EXTENSIONS = 50
const MANIFEST_CACHE_MAX = 200
const ZIP_MAX_ENTRIES = 20000
const ZIP_MAX_TOTAL_BYTES = 256 * 1024 * 1024

/**
 * manifest 解析缓存。
 * ★ list() 会被 action / webNavigation 等热路径高频调用，此前每次都读盘 + JSON.parse；
 *   按「文件 mtime + size」缓存，安装/更新/开关后 mtime 变化自动失效。
 */
const manifestCache = new Map()
const iconCache = new Map()

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

/** manifest 里声明的图标候选（icons 优先，且从大尺寸到小尺寸；再退回 action/browser_action） */
function iconCandidates (manifest) {
  const out = []
  const push = (value) => {
    if (typeof value === 'string') out.push(value)
    else if (value && typeof value === 'object') {
      for (const path of Object.values(value)) if (typeof path === 'string') out.push(path)
    }
  }
  if (manifest.icons && typeof manifest.icons === 'object') {
    const keys = Object.keys(manifest.icons).map((k) => Number(k) || 0).sort((a, b) => b - a)
    for (const key of keys) push(manifest.icons[String(key)])
  }
  push(manifest.action && manifest.action.default_icon)
  push(manifest.browser_action && manifest.browser_action.default_icon)
  push(manifest.page_action && manifest.page_action.default_icon)
  return out
}

/**
 * 读取扩展图标为 data URL（管理页展示用）。
 * ★ 缓存按文件 mtime+size 失效；单图上限 512KB，避免把大图塞进 IPC。
 */
function readIconDataUrl (dir, manifest) {
  for (const rel of iconCandidates(manifest)) {
    const file = path.join(dir, rel)
    const relCheck = path.relative(dir, file)
    if (!relCheck || relCheck.startsWith('..') || path.isAbsolute(relCheck)) continue
    let stat
    try {
      stat = fs.statSync(file)
    } catch {
      continue
    }
    if (!stat.isFile() || stat.size > 512 * 1024) continue
    const key = `${stat.mtimeMs}:${stat.size}`
    const cached = iconCache.get(file)
    if (cached && cached.key === key) return cached.dataUrl
    let buffer
    try {
      buffer = fs.readFileSync(file)
    } catch {
      continue
    }
    const ext = path.extname(file).toLowerCase()
    const mime = ext === '.svg' ? 'image/svg+xml'
      : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
        : ext === '.webp' ? 'image/webp'
          : 'image/png'
    const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`
    if (iconCache.size >= MANIFEST_CACHE_MAX) iconCache.clear()
    iconCache.set(file, { key, dataUrl })
    return dataUrl
  }
  return ''
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

/** 递归列出目录内文件（不跟随符号链接，避免把外部文件算进指纹） */
function walkFiles (root, rel = '', out = []) {
  let entries
  try {
    entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true })
  } catch {
    return out
  }
  for (const dirent of entries) {
    const relPath = rel ? rel + '/' + dirent.name : dirent.name
    if (dirent.isDirectory()) walkFiles(root, relPath, out)
    else if (dirent.isFile()) out.push(relPath)
  }
  return out
}

/** 目录内容指纹：排序后的「相对路径 + 内容」逐文件喂进 SHA-256 */
function computeDirFingerprint (dir) {
  const files = walkFiles(dir).sort()
  const hash = crypto.createHash('sha256')
  for (const rel of files) {
    hash.update(rel)
    hash.update('\0')
    hash.update(fs.readFileSync(path.join(dir, rel)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

/** 文件指纹（zip 包等） */
function fileSha256 (file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

/**
 * 解压 zip 到系统临时目录，返回临时根目录（调用方负责删除）。
 * ★ 三道防护：zip-slip（路径穿越）、条目数上限、解压后总大小上限。
 */
function extractZipToTemp (zipPath) {
  let AdmZip
  try {
    AdmZip = require('adm-zip')
  } catch {
    throw new Error('缺少解压组件 adm-zip')
  }
  let zip
  try {
    zip = new AdmZip(zipPath)
  } catch {
    throw new Error('不是有效的 zip 文件')
  }
  const entries = zip.getEntries()
  if (!entries.length) throw new Error('zip 包为空')
  if (entries.length > ZIP_MAX_ENTRIES) throw new Error('zip 包文件数量过多')
  let total = 0
  for (const entry of entries) {
    const name = String(entry.entryName || '')
    const segments = name.split(/[\\/]/)
    if (!name || path.isAbsolute(name) || segments.includes('..')) {
      throw new Error('zip 包包含非法路径: ' + name)
    }
    total += Number(entry.header && entry.header.size) || 0
  }
  if (total > ZIP_MAX_TOTAL_BYTES) throw new Error('zip 包解压后过大')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-ext-zip-'))
  try {
    zip.extractAllTo(tmp, true)
    return tmp
  } catch (err) {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
    throw new Error('解压失败: ' + String((err && err.message) || err))
  }
}

/** zip 常见两种布局：manifest 在根，或包在单层目录里 */
function locateManifestRoot (root) {
  if (fs.existsSync(path.join(root, 'manifest.json'))) return root
  let found = null
  for (const dirent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue
    const dir = path.join(root, dirent.name)
    if (fs.existsSync(path.join(dir, 'manifest.json'))) {
      if (found) throw new Error('zip 包内存在多个 manifest.json，无法确定扩展目录')
      found = dir
    }
  }
  if (!found) throw new Error('zip 包内未找到 manifest.json')
  return found
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

  /**
   * 商店目录对账：Chrome 商店页里点「添加至 Chrome」由库直接落盘并加载，
   * 不会经过本管理器的 registry。这里扫描 storeDir，把未登记的商店扩展补进注册表，
   * 保证管理页/工具条能看见它们。
   * @returns {number} 新增条目数
   */
  function reconcileStoreExtensions () {
    if (!storeDir) return 0
    let dirs = []
    try {
      dirs = fs.readdirSync(storeDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^[a-p]{32}$/.test(d.name))
        .map((d) => d.name)
    } catch {
      return 0
    }
    if (!dirs.length) return 0
    loadRegistry()
    const ses = sessionObject()
    const api = ses && ses.extensions && typeof ses.extensions.getExtension === 'function' ? ses.extensions : null
    let added = 0
    for (const storeId of dirs) {
      if (registry.extensions.some((e) => e.storeId === storeId)) continue
      const dir = findStoreDir(storeId)
      if (!dir) continue
      try {
        readManifest(dir)
      } catch {
        continue
      }
      let electronId = storeId
      try {
        const ext = api ? api.getExtension(storeId) : null
        if (ext && ext.id) electronId = ext.id
      } catch { /* ignore */ }
      registry.extensions.push({
        key: 'store-' + storeId,
        storeId,
        source: 'store',
        enabled: true,
        installedAt: now(),
        loadError: null,
        electronId,
      })
      added++
    }
    if (added) saveRegistry()
    return added
  }

  function list () {
    loadRegistry()
    reconcileStoreExtensions()
    return registry.extensions.map((entry) => {
      const dir = entryDir(entry)
      let info
      let iconDataUrl = ''
      try {
        if (!dir) throw new Error('扩展文件缺失')
        const manifest = readManifest(dir)
        info = manifestInfo(manifest)
        iconDataUrl = readIconDataUrl(dir, manifest)
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
        fingerprint: entry.fingerprint || null,
        origin: entry.origin || null,
        iconDataUrl,
        dir,
        ...info,
      }
    })
  }

  /**
   * @param {string} srcDir 已解压的扩展目录
   * @param {{fingerprint?:string, origin?:string, source?:'folder'|'zip'}} [meta]
   *   zip 安装时由调用方传入 zip 文件指纹；目录安装时按目录内容计算。
   */
  async function installFromDir (srcDir, meta = {}) {
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
        source: meta.source || 'folder',
        installedAt: now(),
        loadError: null,
        fingerprint: meta.fingerprint || computeDirFingerprint(dest),
        origin: meta.origin || abs,
      }
      registry.extensions.push(entry)
      saveRegistry()
      return { ok: true, entry: { ...entry, ...info, dir: dest } }
    })
  }

  /**
   * 从本地 zip 包安装（商店不可达时的降级入口）。
   * @param {string} zipPath
   * @param {{confirm?: (ctx:{info:object,fingerprint:string,fileName:string})=>Promise<boolean>}} [opts]
   *   confirm 在解压/校验之后、真正落盘之前调用；返回 false 视为用户取消。
   */
  async function installFromZip (zipPath, { confirm } = {}) {
    const abs = path.resolve(String(zipPath || ''))
    let stat
    try {
      stat = fs.statSync(abs)
    } catch {
      throw new Error('文件不存在')
    }
    if (!stat.isFile()) throw new Error('不是文件')
    if (!/\.zip$/i.test(abs)) throw new Error('仅支持 .zip 扩展包')
    const fingerprint = fileSha256(abs)
    const tmp = extractZipToTemp(abs)
    try {
      const srcDir = locateManifestRoot(tmp)
      const info = manifestInfo(readManifest(srcDir))
      if (typeof confirm === 'function') {
        const ok = await confirm({ info, fingerprint, fileName: path.basename(abs) })
        if (!ok) return { ok: false, canceled: true }
      }
      return await installFromDir(srcDir, { fingerprint, origin: abs, source: 'zip' })
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
    }
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
    installFromZip,
    installFromStore,
    setEnabled,
    remove,
    loadAll,
    updateAll,
    pageUrl,
    whitelistEntries,
    fingerprintDir: computeDirFingerprint,
    reconcileStoreExtensions,
  }
}

module.exports = {
  createExtensionManager,
  readManifest,
  manifestInfo,
  slugify,
  normalizeStoreId,
  compareVersions,
  computeDirFingerprint,
  fileSha256,
  locateManifestRoot,
}
