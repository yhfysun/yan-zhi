/**
 * 商店下载专用 fetch（P2）
 *
 * ★ 为什么需要：Node/Electron 主进程的全局 fetch（undici）**不走系统代理**。
 *   P0 实测：本机系统代理 127.0.0.1:7890 时，`fetch` / `net.fetch` / undici ProxyAgent
 *   对商店域名均失败，而 curl 能完整下载 CRX。Chromium 的 `session.resolveProxy()`
 *   能正确读到系统代理（实测返回 `PROXY 127.0.0.1:7890`），所以这里：
 *     ① 用 resolveProxy 拿代理；
 *     ② 手动 CONNECT 建隧道 + TLS；
 *     ③ 自己处理重定向，返回标准 Response 给 electron-chrome-web-store。
 *
 * ★ 只拦截商店相关域名，其他 URL 原样交给原 fetch，避免影响主进程其它网络调用。
 * ★ 显式覆盖：环境变量 `YZ_HTTP_PROXY`（例：http://127.0.0.1:7890）。
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const net = require('net')
const tls = require('tls')
const { spawn } = require('child_process')
const { URL } = require('url')

const STORE_HOSTS = new Set([
  'clients2.google.com',
  'update.googleapis.com',
  'chromewebstore.google.com',
])

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 6
const CONNECT_TIMEOUT_MS = 20000
const REQUEST_TIMEOUT_MS = 60000

function isStoreUrl (url) {
  try {
    const u = new URL(String(url))
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    if (STORE_HOSTS.has(u.hostname)) return true
    return /(^|\.)googleusercontent\.com$/i.test(u.hostname)
  } catch {
    return false
  }
}

/** `PROXY 127.0.0.1:7890` → `{ host, port, auth }`；DIRECT / SOCKS 返回 null */
function parseProxyRule (text) {
  if (!text) return null
  const match = /^(PROXY|HTTPS)\s+([^\s;]+)/i.exec(String(text).trim())
  if (!match) return null
  return normalizeProxy(match[2])
}

/** `127.0.0.1:7890` / `http://user:pass@host:port` → `{ host, port, auth }` */
function normalizeProxy (raw) {
  if (!raw) return null
  let text = String(raw).trim()
  if (!text || /^DIRECT$/i.test(text)) return null
  if (!/^https?:\/\//i.test(text)) text = 'http://' + text
  try {
    const u = new URL(text)
    if (!u.hostname) return null
    return {
      host: u.hostname,
      port: Number(u.port || 80),
      auth: u.username
        ? decodeURIComponent(u.username) + ':' + decodeURIComponent(u.password)
        : null,
    }
  } catch {
    return null
  }
}

function headersToObject (headers) {
  if (!headers) return {}
  if (typeof headers.forEach === 'function' && typeof headers.get === 'function') {
    const out = {}
    headers.forEach((value, key) => { out[key] = value })
    return out
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers)
  const out = {}
  for (const [key, value] of Object.entries(headers)) {
    out[key] = Array.isArray(value) ? value.join(', ') : String(value)
  }
  return out
}

function rawHeadersToObject (headers) {
  const out = {}
  for (const [key, value] of Object.entries(headers || {})) {
    out[key] = Array.isArray(value) ? value.join(', ') : String(value)
  }
  return out
}

function normalizeBody (body) {
  if (body == null) return null
  if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array) return body
  return String(body)
}

/* ────────────────────────────────────────────────────────────
 * curl 通道
 * ★ 为什么需要：本机代理对 Node/Chromium 发往 clients2.google.com /
 *   www.google.com 的 TLS ClientHello 会直接 reset，但 curl/openssl 正常。
 *   curl 是操作系统自带（Windows 10+ / macOS / Linux），无 curl 时回退到上面的隧道。
 * ──────────────────────────────────────────────────────────── */

let curlAvailable = null

function hasCurl () {
  if (curlAvailable !== null) return Promise.resolve(curlAvailable)
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('curl', ['--version'], { stdio: 'ignore', windowsHide: true })
    } catch {
      curlAvailable = false
      resolve(false)
      return
    }
    child.on('error', () => { curlAvailable = false; resolve(false) })
    child.on('close', (code) => { curlAvailable = code === 0; resolve(curlAvailable) })
  })
}

function runProcess (cmd, args, input) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
    } catch (err) {
      reject(err)
      return
    }
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stderr }))
    if (input) child.stdin.write(input)
    child.stdin.end()
  })
}

/** 从 curl -D 的头文件里取**最后一个**响应块（-L 会有多个重定向块） */
function parseCurlHeaders (text) {
  const blocks = String(text || '').split(/\r?\n\r?\n/).filter((block) => block.trim())
  for (let i = blocks.length - 1; i >= 0; i--) {
    const lines = blocks[i].split(/\r?\n/)
    const match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})/.exec(lines[0] || '')
    if (!match) continue
    const headers = {}
    for (const line of lines.slice(1)) {
      const idx = line.indexOf(':')
      if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
    }
    return { status: Number(match[1]), headers }
  }
  return { status: 0, headers: {} }
}

async function curlFetch (url, { method, headers, body, proxy }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-ext-fetch-'))
  const headerPath = path.join(dir, 'headers.txt')
  const bodyPath = path.join(dir, 'body.bin')
  try {
    const args = ['-sS', '-L', '--max-time', '120', '--connect-timeout', '20', '-D', headerPath, '-o', bodyPath]
    if (proxy) {
      args.push('--proxy', 'http://' + proxy.host + ':' + proxy.port)
      if (proxy.auth) args.push('--proxy-user', proxy.auth)
    }
    if (method && method !== 'GET') args.push('-X', method)
    for (const [key, value] of Object.entries(headers || {})) {
      if (value == null || value === '') continue
      const lower = key.toLowerCase()
      if (lower === 'host' || lower === 'content-length') continue
      args.push('-H', key + ': ' + value)
    }
    if (body) args.push('--data-binary', '@-')
    args.push(url)

    const { code, stderr } = await runProcess('curl', args, body)
    if (code !== 0) {
      throw new Error('curl 下载失败(' + code + '): ' + String(stderr || '').trim().slice(0, 300))
    }
    const parsed = parseCurlHeaders(fs.readFileSync(headerPath, 'utf8'))
    const buffer = fs.readFileSync(bodyPath)
    const noBody = parsed.status === 204 || parsed.status === 304 || parsed.status < 200
    return new Response(noBody ? null : buffer, { status: parsed.status, headers: parsed.headers })
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

/**
 * 代理解析器（带 60s 缓存）。
 * 优先级：YZ_HTTP_PROXY → session.resolveProxy → 直连。
 */
function createProxyResolver (resolveProxyRaw, { ttlMs = 60000 } = {}) {
  const cache = new Map()
  return async function resolve (url) {
    let origin
    try { origin = new URL(url).origin } catch { return null }
    const hit = cache.get(origin)
    if (hit && hit.expires > Date.now()) return hit.proxy
    let proxy = normalizeProxy(process.env.YZ_HTTP_PROXY)
    if (!proxy) {
      try {
        proxy = parseProxyRule(await resolveProxyRaw(url))
      } catch {
        proxy = null
      }
    }
    cache.set(origin, { proxy, expires: Date.now() + ttlMs })
    return proxy
  }
}

/** HTTPS 经代理：手写 CONNECT 隧道 + TLS（http.request 的 CONNECT 在本机代理上会被断开） */
function requestViaTunnel (target, { method, headers, body, proxy }) {
  return new Promise((resolve, reject) => {
    const port = Number(target.port || 443)
    const host = target.hostname
    let settled = false
    const socket = net.connect({ host: proxy.host, port: proxy.port })
    const fail = (err) => {
      if (settled) return
      settled = true
      try { socket.destroy() } catch { /* ignore */ }
      reject(err)
    }
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => fail(new Error('代理连接超时')))
    socket.on('error', fail)
    socket.once('connect', () => {
      const auth = proxy.auth
        ? 'Proxy-Authorization: Basic ' + Buffer.from(proxy.auth).toString('base64') + '\r\n'
        : ''
      socket.write(
        'CONNECT ' + host + ':' + port + ' HTTP/1.1\r\n' +
        'Host: ' + host + ':' + port + '\r\n' +
        'Proxy-Connection: Keep-Alive\r\n' +
        auth +
        '\r\n',
      )
    })

    let buffer = Buffer.alloc(0)
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      const end = buffer.indexOf('\r\n\r\n')
      if (end < 0) return
      socket.removeListener('data', onData)
      socket.setTimeout(0)
      // ★ 必须先 pause：socket 处于 flowing 状态时 tls.connect 不会启动握手（实测直接超时）。
      socket.pause()
      const head = buffer.subarray(0, end).toString('latin1')
      const match = /^HTTP\/1\.[01] (\d{3})/.exec(head)
      const status = match ? Number(match[1]) : 0
      if (status !== 200) {
        fail(new Error('代理 CONNECT 失败: HTTP ' + status))
        return
      }
      const rest = buffer.subarray(end + 4)
      if (rest.length) socket.unshift(rest)
      const tlsSocket = tls.connect({ socket, servername: host, ALPNProtocols: ['http/1.1'] })
      tlsSocket.on('error', fail)
      tlsSocket.once('secureConnect', () => {
        const req = http.request({
          host,
          port,
          path: target.pathname + target.search,
          method,
          headers: { ...headers, Host: target.host },
          agent: false,
          createConnection: () => tlsSocket,
        }, (res) => {
          const chunks = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () => {
            if (settled) return
            settled = true
            resolve({
              status: res.statusCode || 0,
              headers: rawHeadersToObject(res.headers),
              body: Buffer.concat(chunks),
            })
          })
          res.on('error', fail)
        })
        req.on('error', fail)
        req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('商店请求超时')))
        if (body) req.write(body)
        req.end()
      })
    }
    socket.on('data', onData)
  })
}

/** HTTP 经代理：直接把绝对 URL 发给代理 */
function requestViaProxy (target, { method, headers, body, proxy }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxy.host,
      port: proxy.port,
      method,
      path: target.toString(),
      headers: { ...headers, Host: target.host, ...(proxy.auth ? { 'Proxy-Authorization': 'Basic ' + Buffer.from(proxy.auth).toString('base64') } : {}) },
      timeout: REQUEST_TIMEOUT_MS,
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode || 0,
        headers: rawHeadersToObject(res.headers),
        body: Buffer.concat(chunks),
      }))
      res.on('error', reject)
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

/**
 * 商店 fetch（签名与全局 fetch 兼容）。
 * @param {string|Request} input
 * @param {RequestInit} [init]
 * @param {{resolveProxy: (url:string)=>Promise<object|null>, fallbackFetch: Function}} opts
 */
async function storeFetch (input, init = {}, { resolveProxy, fallbackFetch, preferCurl = false }) {
  const url = typeof input === 'string' ? input : (input && input.url)
  if (!url) throw new Error('无效的请求地址')
  let method = String(init.method || (input && input.method) || 'GET').toUpperCase()
  let headers = headersToObject(init.headers || (input && input.headers))
  let body = normalizeBody(init.body)
  let current = url

  const initialProxy = await resolveProxy(url)
  if (initialProxy && preferCurl && await hasCurl()) {
    // curl -L 自己处理重定向；走到这里说明代理对 Node 的 TLS 指纹不友好
    return curlFetch(url, { method, headers, body, proxy: initialProxy })
  }

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const target = new URL(current)
    const proxy = await resolveProxy(current)
    let res
    if (!proxy) {
      const response = await fallbackFetch(current, { method, headers, body })
      res = {
        status: response.status,
        headers: headersToObject(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      }
    } else if (target.protocol === 'https:') {
      res = await requestViaTunnel(target, { method, headers, body, proxy })
    } else {
      res = await requestViaProxy(target, { method, headers, body, proxy })
    }

    if (REDIRECT_STATUSES.has(res.status) && res.headers.location) {
      current = new URL(res.headers.location, current).toString()
      if (res.status === 303 && method !== 'HEAD') {
        method = 'GET'
        body = null
        delete headers['content-length']
        delete headers['Content-Length']
      }
      continue
    }

    const noBody = res.status === 204 || res.status === 304 || res.status < 200
    return new Response(noBody ? null : res.body, { status: res.status, headers: res.headers })
  }
  throw new Error('商店请求重定向次数过多')
}

/**
 * 把商店域名接管到代理感知 fetch。
 * @param {{resolveProxy: (url:string)=>Promise<string>, fallbackFetch?: Function}} opts
 * @returns {() => void} 卸载函数
 */
function installStoreFetch ({ resolveProxy, fallbackFetch = globalThis.fetch } = {}) {
  if (typeof fallbackFetch !== 'function') throw new Error('缺少可用的 fetch')
  if (fallbackFetch.__yzStoreFetch) return () => {}
  const resolve = createProxyResolver(resolveProxy)
  const wrapped = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url)
    if (!isStoreUrl(url)) return fallbackFetch(input, init)
    return storeFetch(input, init, { resolveProxy: resolve, fallbackFetch, preferCurl: true })
  }
  wrapped.__yzStoreFetch = true
  globalThis.fetch = wrapped
  return function uninstall () {
    if (globalThis.fetch === wrapped) globalThis.fetch = fallbackFetch
  }
}

module.exports = {
  installStoreFetch,
  storeFetch,
  isStoreUrl,
  parseProxyRule,
  normalizeProxy,
  createProxyResolver,
}
