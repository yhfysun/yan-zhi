/**
 * 轻量壳本机执行桥：远程 AI 后端 → 壳所在机器的 computer-use / browser。
 *
 * 这里不测试 HTTP 层，专测能力连接的配对、定向请求、回执与文件回传。真机上这层
 * 一旦选错，用户看到的不是“报错”，而是工具悄悄操作了远程后端机器。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

type Handler = (...args: unknown[]) => void;

class FakeWs {
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  handlers: Record<string, Handler[]> = {};
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  close() {
    this.readyState = 3;
    this.emit('close', 1000, Buffer.from(''));
  }
  on(event: string, cb: Handler) {
    (this.handlers[event] ||= []).push(cb);
  }
  emit(event: string, ...args: unknown[]) {
    for (const cb of this.handlers[event] || []) cb(...args);
  }
  receive(msg: Record<string, unknown>) {
    this.emit('message', Buffer.from(JSON.stringify(msg)), false);
  }
}

let wsHandler: ((ws: FakeWs, req: { url: string; headers: Record<string, string> }) => void) | null = null;
let dispose = { dispose() {} };

async function activate() {
  const mod = await import('../src/plugins/desktop-capability.js');
  const ctx = {
    id: 'desktop-capability',
    config: {},
    log: () => undefined,
    storage: {
      get: async () => undefined,
      set: async () => undefined,
      delete: async () => undefined,
    },
    registerBackendRoute: () => ({ dispose() {} }),
    registerTool: () => ({ dispose() {} }),
    registerWebSocket: (path: string, handler: typeof wsHandler) => {
      expect(path).toBe('/ws');
      wsHandler = handler;
      return { dispose() {} };
    },
    emit: () => undefined,
    on: () => ({ dispose() {} }),
    adapter: {},
  };
  await mod.desktopCapabilityModule.activate(ctx as never);
  return mod;
}

function connect(mod: Awaited<ReturnType<typeof activate>>, userToken = ''): FakeWs {
  if (!wsHandler) throw new Error('WS 未注册');
  const ws = new FakeWs();
  wsHandler(ws, {
    url: `/api/plugin/desktop-capability/ws${userToken ? `?token=${encodeURIComponent(userToken)}` : ''}`,
    headers: {},
  });
  ws.receive({
    type: 'hello',
    deviceId: 'shell-1',
    deviceName: '测试轻量壳',
    capabilities: {
      browser: true,
      computer: ['computer_screenshot', 'computer_mouse_click'],
    },
  });
  expect(ws.sent.find((m) => m.type === 'hello.ack')).toBeTruthy();
  return ws;
}

beforeEach(async () => {
  wsHandler = null;
  dispose = { dispose() {} };
});

afterEach(async () => {
  const mod = await import('../src/plugins/desktop-capability.js');
  await mod.desktopCapabilityModule.deactivate?.();
  dispose.dispose();
  vi.useRealTimers();
});

describe('桌面能力桥', () => {
  it('壳 hello 后，computer 调用会发到壳并按 requestId 回执', async () => {
    const mod = await activate();
    const host = connect(mod);
    expect(mod.desktopCapabilitySeen('guest')).toBe(true);
    const pending = mod.callDesktopCapability(
      'computer',
      'computer_mouse_move',
      { x: 12, y: 34 },
      { userId: 'guest', timeoutMs: 2000 },
    );
    const call = host.sent.find((m) => m.type === 'call');
    expect(call).toMatchObject({
      capability: 'computer',
      method: 'computer_mouse_move',
      args: { x: 12, y: 34 },
    });
    host.receive({
      type: 'result',
      id: call!.id,
      ok: true,
      result: { content: [{ type: 'text', text: 'OK' }] },
    });
    await expect(pending).resolves.toMatchObject({
      content: [{ type: 'text', text: 'OK' }],
    });
  });

  it('浏览器请求同样走壳连接；没有连接时明确失败，绝不回落执行到后端机器', async () => {
    const mod = await activate();
    await expect(mod.callDesktopCapability(
      'browser',
      'navigate',
      { url: 'https://example.com' },
      { userId: 'guest', timeoutMs: 1000 },
    )).rejects.toThrow(/没有可用的本机执行端/);

    const host = connect(mod);
    const pending = mod.callDesktopCapability(
      'browser',
      'navigate',
      { url: 'https://example.com' },
      { userId: 'guest', timeoutMs: 2000 },
    );
    const call = host.sent.find((m) => m.type === 'call' && m.capability === 'browser');
    host.receive({ type: 'result', id: call!.id, ok: true, result: { url: 'https://example.com' } });
    await expect(pending).resolves.toMatchObject({ url: 'https://example.com' });
  });

  it('壳曾连接过，掉线后 seen 标记保留，供 computer-use 拒绝静默回落', async () => {
    const mod = await activate();
    const host = connect(mod);
    expect(mod.desktopCapabilitySeen('guest')).toBe(true);
    expect(mod.desktopCapabilityAvailable('guest', 'computer')).toBe(true);
    host.close();
    expect(mod.desktopCapabilityAvailable('guest', 'computer')).toBe(false);
    expect(mod.desktopCapabilitySeen('guest')).toBe(true);
  });

  it('壳回传截图文件时落到后端临时区，并改写结果路径供 image_analyze 读取', async () => {
    const mod = await activate();
    const host = connect(mod);
    const pending = mod.callDesktopCapability(
      'computer',
      'computer_screenshot',
      {},
      { userId: 'guest', timeoutMs: 2000 },
    );
    const call = host.sent.find((m) => m.type === 'call');
    const sourcePath = 'C:\\Users\\shell\\screenshot-1.png';
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    host.receive({
      type: 'result',
      id: call!.id,
      ok: true,
      result: {
        content: [{ type: 'text', text: JSON.stringify({ file: sourcePath }) }],
        _meta: { path: sourcePath, name: 'screenshot-1.png' },
      },
      files: [{
        path: sourcePath,
        name: 'screenshot-1.png',
        mime: 'image/png',
        dataBase64: bytes.toString('base64'),
      }],
    });
    const result = await pending as { _meta: { path: string }; content: Array<{ text: string }> };
    expect(result._meta.path).not.toBe(sourcePath);
    expect(fs.readFileSync(result._meta.path).equals(bytes)).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ file: result._meta.path });
    fs.rmSync(result._meta.path, { force: true });
  });
});
