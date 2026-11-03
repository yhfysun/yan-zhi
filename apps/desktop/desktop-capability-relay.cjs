/**
 * 壳 → 远程 AI 后端的桌面能力出站桥。
 *
 * 协议：hello → call(requestId, capability, method, args) → result。
 * 只做传输与本地文件回传；真正执行由 main.cjs 注入，浏览器复用 runBrowserAction，
 * computer-use 复用 local-capabilities 中的本机工具表。
 */
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const MAX_FILES_TOTAL = 64 * 1024 * 1024;
const MAX_FILE_SINGLE = 32 * 1024 * 1024;
const FILE_KEYS = new Set(['path', 'file', 'filePath', 'savedPath', 'keptTo']);

function collectPathStrings(value, out, key = '') {
  if (typeof value === 'string') {
    if (FILE_KEYS.has(key) && value) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPathStrings(item, out, key);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [k, item] of Object.entries(value)) collectPathStrings(item, out, k);
}

function collectFiles(result) {
  const candidates = new Set();
  collectPathStrings(result, candidates);
  const files = [];
  let total = 0;
  for (const file of candidates) {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_FILE_SINGLE) continue;
      if (total + stat.size > MAX_FILES_TOTAL) break;
      files.push({
        path: file,
        name: path.basename(file),
        dataBase64: fs.readFileSync(file).toString('base64'),
      });
      total += stat.size;
    } catch { /* 非本地路径或文件已清理 */ }
  }
  return files;
}

function createDesktopCapabilityRelay(options = {}) {
  const serverBase = String(options.serverBase || '').replace(/\/+$/, '');
  const token = String(options.token || '');
  const license = String(options.license || '');
  const deviceId = String(options.deviceId || 'yan-zhi-shell');
  const deviceName = String(options.deviceName || '言智轻量壳');
  const capabilities = options.capabilities || { browser: true, computer: [] };
  const execute = options.execute;
  const logger = options.logger || console;
  const WebSocketImpl = options.WebSocketImpl || WebSocket;
  let ws = null;
  let started = false;
  let reconnectTimer = null;
  let pingTimer = null;
  let reconnectMs = 1000;

  if (typeof execute !== 'function') throw new Error('桌面能力桥缺少 execute');
  if (!/^https?:\/\//i.test(serverBase)) throw new Error('桌面能力桥 serverBase 非法');

  function endpoint() {
    const url = new URL(`${serverBase}/api/plugin/desktop-capability/ws`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    if (token) url.searchParams.set('token', token);
    if (license) url.searchParams.set('license', license);
    return url.toString();
  }

  function scheduleReconnect() {
    if (!started || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectMs);
    reconnectTimer.unref?.();
    reconnectMs = Math.min(30_000, reconnectMs * 2);
  }

  function connect() {
    if (!started || ws) return;
    const sock = new WebSocketImpl(endpoint());
    ws = sock;
    sock.on('open', () => {
      reconnectMs = 1000;
      sock.send(JSON.stringify({
        type: 'hello',
        protocol: 1,
        deviceId,
        deviceName,
        capabilities,
      }));
      pingTimer = setInterval(() => {
        try { sock.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch { /* close handles */ }
      }, 15_000);
      pingTimer.unref?.();
      logger.log?.('[desktop-capability] 已连接远程 AI 后端');
    });
    sock.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.type !== 'call' || !msg.id) return;
      void (async () => {
        try {
          const out = await execute(String(msg.capability || ''), String(msg.method || ''), msg.args || {}, msg.context || {});
          const result = out && Object.prototype.hasOwnProperty.call(out, 'result') ? out.result : out;
          const files = collectFiles(result);
          sock.send(JSON.stringify({ type: 'result', id: msg.id, ok: true, result, ...(files.length ? { files } : {}) }));
        } catch (err) {
          sock.send(JSON.stringify({
            type: 'result',
            id: msg.id,
            ok: false,
            error: String((err && err.message) || err),
          }));
        }
      })();
    });
    sock.on('close', () => {
      if (ws === sock) ws = null;
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      scheduleReconnect();
    });
    sock.on('error', (err) => {
      logger.warn?.('[desktop-capability] 连接异常:', (err && err.message) || err);
    });
  }

  return {
    start() {
      if (started) return;
      started = true;
      connect();
    },
    async stop() {
      started = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      const sock = ws;
      ws = null;
      if (sock) {
        await new Promise((resolve) => {
          try {
            sock.once('close', resolve);
            sock.close();
            setTimeout(resolve, 500).unref?.();
          } catch {
            resolve();
          }
        });
      }
    },
  };
}

module.exports = { createDesktopCapabilityRelay, collectFiles };
