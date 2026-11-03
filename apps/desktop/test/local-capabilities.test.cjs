/**
 * 轻量壳本机能力运行时守门。
 *
 * 核心口径：轻量壳不是远程后端的“纯客户端”。远控邀请地址指向壳所在机器时，
 * `/remote`、配对、host 信令和输入注入都必须在本机完成；远程后端只负责账号与 AI。
 * 本测试直接构建运行时 bundle 并起一个临时端口，按真实控制器链路走一遍。
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { WebSocket } = require('ws');

const DESKTOP = path.resolve(__dirname, '..');
const MAIN = fs.readFileSync(path.join(DESKTOP, 'main.cjs'), 'utf8');
const SHELL_YML = fs.readFileSync(path.join(DESKTOP, 'electron-builder.shell.yml'), 'utf8');
const BUILD_SCRIPT = path.join(DESKTOP, 'scripts', 'build-local-capabilities.cjs');

let tempDir;
let runtime;
let baseUrl;
let info;

before(async () => {
  assert.ok(fs.existsSync(BUILD_SCRIPT), '缺少 scripts/build-local-capabilities.cjs');
  const { buildLocalCapabilities } = require(BUILD_SCRIPT);
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-local-cap-'));
  const outfile = path.join(tempDir, 'local-capabilities.bundle.cjs');
  await buildLocalCapabilities({ outfile });
  const distDir = path.join(tempDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>remote</title><div id="app"></div>', 'utf8');

  const mod = require(outfile);
  runtime = await mod.startLocalCapabilities({
    port: 0,
    host: '127.0.0.1',
    distDir,
    dataDir: path.join(tempDir, 'data'),
    logger: { log() {}, warn() {}, error() {} },
  });
  baseUrl = runtime.baseUrl;
  info = await runtime.info();
});

after(async () => {
  try {
    await runtime?.close();
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch { /* Windows 文件句柄释放稍慢 */ }
  }
});

function request(method, pathname, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, baseUrl);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(url, {
      method,
      headers: {
        ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* HTML/文本响应 */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForMessage(ws, predicate, timeoutMs = 3000) {
  const queued = ws.__messages || [];
  const hitIndex = queued.findIndex(predicate);
  if (hitIndex >= 0) {
    const [hit] = queued.splice(hitIndex, 1);
    return Promise.resolve(hit);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('等待 WebSocket 消息超时'));
    }, timeoutMs);
    function onMessage(raw) {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (!predicate(msg)) return;
      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve(msg);
    }
    ws.on('message', onMessage);
  });
}

function openWs(pathname) {
  const ws = new WebSocket(baseUrl.replace(/^http/, 'ws') + pathname);
  ws.__messages = [];
  ws.on('message', (raw) => {
    try { ws.__messages.push(JSON.parse(String(raw))); } catch { /* binary */ }
  });
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

describe('轻量壳：本机远程控制运行时', () => {
  test('邀请地址由壳本机直接提供 /remote 页面', async () => {
    const r = await request('GET', `/remote?code=${encodeURIComponent(info.code)}`);
    assert.strictEqual(r.status, 200);
    assert.match(String(r.headers['content-type'] || ''), /text\/html/);
    assert.match(r.text, /<div id="app"><\/div>/);
  });

  test('本机 API 暴露 hostkey/status，且启动信息带 IP 直连地址与授权码', async () => {
    assert.match(info.baseUrl, /^http:\/\/(127\.0\.0\.1|\[::1\]):\d+$/);
    assert.ok(info.hostKey.length >= 32);
    assert.ok(info.code.length >= 6);

    const r = await request('GET', '/api/plugin/remote-control/status');
    assert.strictEqual(r.status, 200);
    assert.ok(r.json?.data);
    assert.strictEqual(r.json.data.code, null, '无 host key 的 status 不得泄露授权码');
  });

  test('管理端点只允许本机 host key，局域网控制端拿不到换码/急停能力', async () => {
    const denied = await request('POST', '/api/plugin/remote-control/code/rotate');
    assert.strictEqual(denied.status, 403);

    const allowed = await request('POST', '/api/plugin/remote-control/code/rotate', {
      headers: { 'x-rc-host-key': info.hostKey },
    });
    assert.strictEqual(allowed.status, 200);
    assert.ok(allowed.json?.data?.code?.current);
  });

  test('IP 直连配对链路：host WS 在本机收到确认请求，控制端获得 pending', async () => {
    const host = await openWs(`/api/plugin/remote-control/session/ws?role=host&key=${encodeURIComponent(info.hostKey)}`);
    const hello = await waitForMessage(host, (m) => m.type === 'host.hello');
    assert.strictEqual(hello.type, 'host.hello');
    host.send(JSON.stringify({ type: 'rtc.ready' }));

    const current = await runtime.rotateCode();
    const paired = await request('POST', '/api/plugin/remote-control/pair', {
      body: {
        code: current.code,
        deviceId: 'test-controller',
        deviceName: '测试控制端',
      },
    });
    assert.strictEqual(paired.status, 200);
    assert.strictEqual(paired.json?.data?.status, 'pending');
    assert.ok(paired.json?.data?.confirmId);

    const pending = await waitForMessage(host, (m) => m.type === 'session.pending');
    assert.strictEqual(pending.confirmId, paired.json.data.confirmId);
    host.close();
  });

  test('computer-use 工具由壳本机运行时注册，可被远程 AI 后端按能力调用', async () => {
    const caps = await runtime.capabilities();
    assert.ok(caps.computer.includes('computer_screenshot'));
    assert.ok(caps.computer.includes('computer_mouse_click'));
    await assert.rejects(
      () => runtime.executeComputerTool('computer_not_exists', {}),
      /未知的电脑使用工具/,
    );
  });

  test('壳模式启动本机运行时，打包产物与构建脚本都已登记', () => {
    assert.match(MAIN, /startLocalCapabilities/);
    assert.match(MAIN, /local-capabilities\.bundle\.cjs/);
    assert.match(SHELL_YML, /local-capabilities\.bundle\.cjs/);
    const buildShell = fs.readFileSync(path.join(DESKTOP, 'scripts', 'build-shell.cjs'), 'utf8');
    assert.match(buildShell, /build-local-capabilities\.cjs/);
  });
});
