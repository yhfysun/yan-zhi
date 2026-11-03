/**
 * computer-use 的“执行位置”守门：本机壳在线时，工具必须先发到壳；
 * 只有没有壳连接时才允许回落到后端进程自己的本地执行器。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  available: vi.fn(() => true),
  seen: vi.fn(() => false),
  call: vi.fn(async () => ({ content: [{ type: 'text', text: 'REMOTE_OK' }] })),
}));

vi.mock('../src/plugins/desktop-capability.js', () => ({
  desktopCapabilityAvailable: bridge.available,
  desktopCapabilitySeen: bridge.seen,
  callDesktopCapability: bridge.call,
}));

import { computerUseModule } from '../src/plugins/computer-use.js';

afterEach(async () => {
  await computerUseModule.deactivate?.();
  bridge.available.mockReset();
  bridge.seen.mockReset();
  bridge.call.mockClear();
  delete process.env.YZ_DESKTOP_LOCAL_EXECUTION;
  delete process.env.YZ_ALLOW_BACKEND_COMPUTER_USE;
});

function activateWithTools(): Map<string, any> {
  const tools = new Map<string, any>();
  const ctx = {
    id: 'computer-use',
    config: {},
    log: () => undefined,
    storage: {
      get: async () => undefined,
      set: async () => undefined,
      delete: async () => undefined,
    },
    adapter: {
      shell: {
        exec: vi.fn(async () => ({ stdout: 'LOCAL_OK', stderr: '', exitCode: 0 })),
      },
    },
    registerTool: (def: any) => {
      tools.set(def.name, def);
      return { dispose() {} };
    },
    registerBackendRoute: () => ({ dispose() {} }),
    registerWebSocket: () => ({ dispose() {} }),
    emit: () => undefined,
    on: () => ({ dispose() {} }),
  };
  computerUseModule.activate(ctx as never);
  return tools;
}

describe('computer-use 桌面能力代理', () => {
  it('壳在线时鼠标工具走桌面桥，不执行后端机器的 PowerShell', async () => {
    bridge.available.mockReturnValue(true);
    const tools = activateWithTools();
    const result = await tools.get('computer_mouse_move').execute(
      { x: 10, y: 20 },
      { userId: 'guest', conversationId: 'conv-1' },
    );
    expect(result.content[0].text).toBe('REMOTE_OK');
    expect(bridge.call).toHaveBeenCalledWith(
      'computer',
      'computer_mouse_move',
      { x: 10, y: 20 },
      expect.objectContaining({ userId: 'guest', conversationId: 'conv-1' }),
    );
  });

  it('完整桌面包没有能力桥时，继续在后端本机执行', async () => {
    bridge.available.mockReturnValue(false);
    bridge.seen.mockReturnValue(false);
    process.env.YZ_DESKTOP_LOCAL_EXECUTION = '1';
    const tools = activateWithTools();
    const result = await tools.get('computer_mouse_move').execute(
      { x: 10, y: 20 },
      { userId: 'guest' },
    );
    expect(result.content[0].text).toContain('moved to');
    expect(bridge.call).not.toHaveBeenCalled();
  });

  it('连接过轻量壳后再掉线时明确失败，不静默回落后端机器', async () => {
    bridge.available.mockReturnValue(false);
    bridge.seen.mockReturnValue(true);
    const tools = activateWithTools();
    const result = await tools.get('computer_mouse_move').execute(
      { x: 10, y: 20 },
      { userId: 'guest' },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('本机执行端未连接');
    expect(bridge.call).not.toHaveBeenCalled();
  });
});
