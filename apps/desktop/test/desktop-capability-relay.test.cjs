/**
 * 壳 → 远程 AI 后端的桌面能力出站桥。
 *
 * 关键约束：壳主动连接；收到 browser/computer RPC 后在本机执行；回执里带回的本地
 * 文件以 base64 上传到后端临时区，避免远程后端拿不到截图路径。
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocketServer } = require('ws');

const RELAY = path.resolve(__dirname, '..', 'desktop-capability-relay.cjs');
let wss;
let port;
let tmp;

before(async () => {
  assert.ok(fs.existsSync(RELAY), '缺少 desktop-capability-relay.cjs');
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-desktop-relay-'));
  wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => wss.once('listening', resolve));
  port = wss.address().port;
});

after(async () => {
  if (wss) await new Promise((resolve) => wss.close(resolve));
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

function waitFor(ws, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('等待消息超时'));
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

describe('桌面能力出站桥', () => {
  test('hello 后执行 computer RPC，并把截图文件一起回传', async () => {
    const { createDesktopCapabilityRelay } = require(RELAY);
    const screenshot = path.join(tmp, 'shot.png');
    const bytes = Buffer.from([1, 2, 3, 4]);
    fs.writeFileSync(screenshot, bytes);
    let receivedHello = null;
    let receivedCall = null;
    const serverReady = new Promise((resolve) => {
      wss.once('connection', (ws, req) => {
        const url = new URL(req.url, 'http://localhost');
        receivedHello = { token: url.searchParams.get('token'), license: url.searchParams.get('license') };
        ws.on('message', (raw) => {
          const msg = JSON.parse(String(raw));
          if (msg.type === 'hello') resolve({ ws, msg });
        });
      });
    });

    const relay = createDesktopCapabilityRelay({
      serverBase: `http://127.0.0.1:${port}`,
      token: 'jwt-token',
      license: 'license-code',
      deviceId: 'shell-1',
      deviceName: '测试壳',
      capabilities: { browser: true, computer: ['computer_screenshot'] },
      execute: async (capability, method) => {
        assert.strictEqual(capability, 'computer');
        assert.strictEqual(method, 'computer_screenshot');
        return {
          result: {
            content: [{ type: 'text', text: JSON.stringify({ file: screenshot }) }],
            _meta: { path: screenshot },
          },
        };
      },
      logger: { log() {}, warn() {}, error() {} },
    });
    relay.start();

    const { ws, msg: hello } = await serverReady;
    assert.match(receivedHello.token, /jwt-token/);
    assert.strictEqual(receivedHello.license, 'license-code');
    assert.strictEqual(hello.deviceId, 'shell-1');
    assert.strictEqual(hello.capabilities.browser, true);
    ws.send(JSON.stringify({ type: 'hello.ack', protocol: 1 }));

    ws.send(JSON.stringify({
      type: 'call',
      id: 'req-1',
      capability: 'computer',
      method: 'computer_screenshot',
      args: {},
      context: { conversationId: 'conv-1' },
    }));
    const result = await waitFor(ws, (m) => m.type === 'result' && m.id === 'req-1');
    receivedCall = result;
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.files[0].path, screenshot);
    assert.strictEqual(Buffer.from(result.files[0].dataBase64, 'base64').equals(bytes), true);

    await relay.stop();
  });
});
