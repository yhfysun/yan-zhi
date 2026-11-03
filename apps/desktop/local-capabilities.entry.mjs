/**
 * 壳本机能力运行时（第一阶段：远程控制）。
 *
 * 监听壳所在机器的局域网端口，直接提供：
 *   GET  /remote                 控制端页面（壳自带前端 dist）
 *   POST /api/plugin/remote-control/pair
 *   WS   /api/plugin/remote-control/session/ws
 *   GET  /api/plugin/remote-control/status
 *
 * 配对、WebRTC 信令与键鼠注入复用服务端 remote-control 插件。管理面只能由 Electron
 * 主进程经本模块调用，HTTP 管理端点必须携带 host key，避免局域网控制端越权换码/急停。
 */
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';
import { WebSocketServer } from 'ws';
import { remoteControlModule } from '../server/src/plugins/remote-control.ts';
import { computerUseModule } from '../server/src/plugins/computer-use.ts';

const API_PREFIX = '/api/plugin/remote-control';
const MAX_JSON_BODY = 2 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};
const STATIC_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' http: https: ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

function timingEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a || '')).digest();
  const right = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(left, right);
}

function isWithinRoot(child, root) {
  const rel = path.relative(path.resolve(root), path.resolve(child));
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

export function listLanIpv4() {
  const out = [];
  const interfaces = os.networkInterfaces();
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const item of entries || []) {
      const family = typeof item.family === 'string' ? item.family : item.family === 4 ? 'IPv4' : '';
      if (family !== 'IPv4' || item.internal || !item.address) continue;
      out.push({ name, address: item.address, family: 'IPv4' });
    }
  }
  return out;
}

function jsonResponse(res, statusCode, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', String(payload.length));
  res.setHeader('cache-control', 'no-store');
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('JSON 格式错误'));
      }
    });
    req.on('error', reject);
  });
}

function compileRoute(pattern) {
  const keys = [];
  const body = String(pattern)
    .split('/')
    .map((part) => {
      if (!part.startsWith(':')) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      keys.push(part.slice(1));
      return '([^/]+)';
    })
    .join('/');
  return { re: new RegExp(`^${body}/?$`), keys };
}

function remoteAddressOf(req) {
  const raw = String(req?.socket?.remoteAddress || '');
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

class JsonPluginStorage {
  constructor(file) {
    this.file = file;
    this.data = {};
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object') this.data = parsed;
    } catch { /* 首次启动或文件损坏：从空状态开始 */ }
  }

  async get(key) {
    return this.data[key];
  }

  async set(key, value) {
    this.data[key] = value;
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    await fsp.rename(tmp, this.file);
  }

  async delete(key) {
    delete this.data[key];
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    await fsp.rename(tmp, this.file);
  }
}

function createRouteTable() {
  const routes = [];
  const add = (method) => (pattern, handler) => {
    const compiled = compileRoute(pattern);
    routes.push({ method, pattern, handler, ...compiled });
  };
  const adapter = {
    get: add('GET'),
    post: add('POST'),
    put: add('PUT'),
    patch: add('PATCH'),
    delete: add('DELETE'),
  };
  return { routes, adapter };
}

function matchRoute(routes, method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.re.exec(pathname);
    if (!match) continue;
    const params = {};
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1] || '');
    });
    return { route, params };
  }
  return null;
}

function makeInternalRequest(pathname, options = {}) {
  const req = {
    method: options.method || 'GET',
    url: pathname,
    originalUrl: `${API_PREFIX}${pathname}`,
    headers: options.headers || {},
    socket: { remoteAddress: options.remoteAddress || '127.0.0.1' },
    body: options.body,
    params: options.params || {},
    readableEnded: true,
  };
  return req;
}

function invokeRegisteredRoute(routes, method, pathname, options = {}) {
  const matched = matchRoute(routes, method, pathname);
  if (!matched) return Promise.resolve({ statusCode: 404, body: { error: 'not found' } });
  const req = makeInternalRequest(pathname, { ...options, method, params: matched.params });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (statusCode, body) => {
      if (settled) return;
      settled = true;
      resolve({ statusCode, body });
    };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = Number(code) || 200;
        return this;
      },
      setHeader() {},
      json(body) {
        finish(this.statusCode, body);
      },
      send(body) {
        finish(this.statusCode, body);
      },
      end(body) {
        finish(this.statusCode, body);
      },
      write() { return true; },
      once() { return this; },
      on() { return this; },
    };
    Promise.resolve(matched.route.handler(req, res)).catch(reject);
  });
}

async function serveStatic(req, res, distDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    jsonResponse(res, 405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    jsonResponse(res, 400, { error: 'bad path' });
    return;
  }
  const rel = pathname === '/' || pathname === '/remote' || pathname === '/remote/'
    ? 'index.html'
    : pathname.replace(/^\/+/, '');
  const target = path.resolve(distDir, rel);
  if (!isWithinRoot(target, distDir)) {
    jsonResponse(res, 403, { error: 'forbidden' });
    return;
  }
  let stat = null;
  try {
    stat = await fsp.stat(target);
  } catch { /* SPA 深链接回退到 index.html */ }
  if (!stat?.isFile()) {
    const fallback = path.join(distDir, 'index.html');
    try {
      stat = await fsp.stat(fallback);
      return sendFile(req, res, fallback, stat);
    } catch {
      jsonResponse(res, 404, { error: 'frontend dist 不存在' });
      return;
    }
  }
  return sendFile(req, res, target, stat);
}

function sendFile(req, res, file, stat) {
  const ext = path.extname(file).toLowerCase();
  res.statusCode = 200;
  res.setHeader('content-type', MIME[ext] || 'application/octet-stream');
  res.setHeader('content-length', String(stat.size));
  res.setHeader('cache-control', ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable');
  res.setHeader('content-security-policy', STATIC_CSP);
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file).on('error', () => {
    if (!res.headersSent) jsonResponse(res, 500, { error: '读取前端资源失败' });
    else res.destroy();
  }).pipe(res);
}

export async function startLocalCapabilities(options = {}) {
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : 3001;
  const host = String(options.host || '0.0.0.0');
  const distDir = path.resolve(options.distDir || path.join(import.meta.dirname, 'dist'));
  const dataDir = path.resolve(options.dataDir || path.join(os.homedir(), '.yan-zhi', 'local-capabilities'));
  const logger = options.logger || console;
  const routes = createRouteTable();
  let wsRegistration = null;
  const pluginStorage = new JsonPluginStorage(path.join(dataDir, 'remote-control.json'));
  const computerStorage = new JsonPluginStorage(path.join(dataDir, 'computer-use.json'));

  const ctx = {
    id: 'remote-control',
    config: {
      openMode: false,
      allowExternalSubnet: false,
      allowSelfWindowClick: false,
      idleTimeoutMin: 30,
      stunUrls: 'stun:stun.qq.com:3478,stun:stun.l.google.com:19302',
      ...(options.remoteControl || {}),
    },
    log: (...args) => logger.log?.(...args),
    storage: pluginStorage,
    registerBackendRoute(setup) {
      setup(routes.adapter);
      return { dispose() {} };
    },
    registerWebSocket(pattern, handler) {
      wsRegistration = { pattern, handler };
      return { dispose() {} };
    },
    registerTool() {
      return { dispose() {} };
    },
    emit() {},
    on() {
      return { dispose() {} };
    },
  };
  await remoteControlModule.activate(ctx);

  const computerTools = new Map();
  if (options.computerUse !== false) {
    const computerCtx = {
      id: 'computer-use',
      config: {
        maxOps: 200,
        allowSelfWindowClick: false,
        localExecution: true,
        screenshotDir: path.join(dataDir, 'computer-use-data', 'screenshots'),
        ...(options.computerUse || {}),
      },
      log: (...args) => logger.log?.(...args),
      storage: computerStorage,
      adapter: {
        shell: {
          exec(command, args = [], execOptions = {}) {
            return new Promise((resolve) => {
              // 工具层为兼容 cmd 会给路径参数加双引号；execFile 直传时不能保留这层引号。
              const cleanArgs = Array.isArray(args)
                ? args.map((arg) => String(arg).replace(/^"(.*)"$/s, '$1'))
                : [];
              execFile(command, cleanArgs, {
                timeout: Math.max(1000, Number(execOptions.timeout) || 20000),
                windowsHide: true,
                maxBuffer: 16 * 1024 * 1024,
                encoding: 'utf8',
              }, (err, stdout, stderr) => {
                resolve({
                  stdout: String(stdout || ''),
                  stderr: String(stderr || (err && err.message) || ''),
                  exitCode: err ? (Number.isFinite(Number(err.code)) ? Number(err.code) : 1) : 0,
                });
              });
            });
          },
        },
      },
      registerTool(def) {
        computerTools.set(def.name, def);
        return { dispose() { computerTools.delete(def.name); } };
      },
      registerBackendRoute() {
        return { dispose() {} };
      },
      registerWebSocket() {
        return { dispose() {} };
      },
      emit() {},
      on() {
        return { dispose() {} };
      },
    };
    await computerUseModule.activate(computerCtx);
  }

  const keyResult = await invokeRegisteredRoute(routes.routes, 'GET', '/hostkey');
  const hostKey = String(keyResult.body?.data?.key || '');
  if (!hostKey) throw new Error('本机远控 host key 初始化失败');

  const managementPaths = new Set(['/hostkey', '/code/rotate', '/code/custom', '/whitelist', '/audit', '/panic']);
  const needsHostKey = (pathname) => managementPaths.has(pathname) || pathname.startsWith('/whitelist/');
  const hasHostKey = (req) => timingEqual(req.headers?.['x-rc-host-key'], hostKey);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname.startsWith(`${API_PREFIX}/`)) {
        const routePath = url.pathname.slice(API_PREFIX.length);
        if (needsHostKey(routePath) && !hasHostKey(req)) {
          jsonResponse(res, 403, { error: '仅允许本机管理面访问' });
          return;
        }
        const matched = matchRoute(routes.routes, req.method || 'GET', routePath);
        if (!matched) {
          jsonResponse(res, 404, { error: 'not found' });
          return;
        }
        req.params = matched.params;
        req.originalUrl = req.url;
        if ((req.headers['content-type'] || '').includes('application/json')) {
          req.body = await readJsonBody(req);
        }
        res.status = (code) => {
          res.statusCode = Number(code) || 200;
          return res;
        };
        res.json = (body) => jsonResponse(res, res.statusCode || 200, body);
        await matched.route.handler(req, res);
        return;
      }
      await serveStatic(req, res, distDir);
    } catch (err) {
      logger.warn?.('[local-capabilities] 请求失败:', err?.message || err);
      if (!res.headersSent) jsonResponse(res, 500, { error: err?.message || 'internal error' });
      else res.destroy();
    }
  });

  let wss = null;
  if (wsRegistration) {
    wss = new WebSocketServer({ noServer: true });
    const wsPath = `${API_PREFIX}${wsRegistration.pattern}`;
    server.on('upgrade', (req, socket, head) => {
      let pathname = '';
      try {
        pathname = new URL(req.url || '/', 'http://localhost').pathname;
      } catch { /* fall through */ }
      if (pathname !== wsPath) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wsRegistration.handler(ws, req);
      });
    });
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const actualPort = server.address()?.port || port;
  const ipv4 = listLanIpv4();
  const preferred = ipv4[0]?.address || '127.0.0.1';
  const displayHost = host === '127.0.0.1' || host === 'localhost' ? '127.0.0.1' : preferred;
  const baseUrl = `http://${displayHost}:${actualPort}`;

  async function status() {
    const out = await invokeRegisteredRoute(routes.routes, 'GET', '/status', {
      headers: { 'x-rc-host-key': hostKey },
    });
    return out.body?.data || null;
  }

  async function info() {
    const current = await status();
    return {
      ok: true,
      role: 'remote-control-host',
      baseUrl,
      port: actualPort,
      hostKey,
      code: String(current?.code?.current || ''),
      mode: String(current?.mode || ''),
      pluginEnabled: !!current,
      addresses: ipv4,
      remotePath: current?.code?.current
        ? `/remote?code=${encodeURIComponent(current.code.current)}`
        : '/remote',
    };
  }

  async function rotateCode() {
    const out = await invokeRegisteredRoute(routes.routes, 'POST', '/code/rotate', {
      headers: { 'x-rc-host-key': hostKey },
      body: {},
    });
    if (out.body?.error) throw new Error(String(out.body.error));
    return {
      code: String(out.body?.data?.code?.current || ''),
      raw: out.body?.data?.code,
    };
  }

  function capabilities() {
    return {
      remoteControl: true,
      browser: true,
      computer: [...computerTools.keys()].sort(),
    };
  }

  async function executeComputerTool(name, args = {}, context = {}) {
    const tool = computerTools.get(String(name || ''));
    if (!tool) throw new Error(`未知的电脑使用工具: ${name}`);
    return tool.execute(args || {}, context);
  }

  logger.log?.(`[local-capabilities] 远控被控端已监听 ${baseUrl}`);
  return {
    server,
    port: actualPort,
    baseUrl,
    info,
    rotateCode,
    capabilities,
    executeComputerTool,
    async close() {
      for (const client of wss?.clients || []) {
        try { client.close(); } catch { /* ignore */ }
      }
      try { await remoteControlModule.deactivate?.(); } catch { /* ignore */ }
      try { await computerUseModule.deactivate?.(); } catch { /* ignore */ }
      await new Promise((resolve) => server.close(() => resolve()));
      try { wss?.close(); } catch { /* ignore */ }
    },
  };
}
