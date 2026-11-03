/**
 * 轻量壳浏览器执行守门：远程后端上没有 loopback browser bridge 时，
 * 只要壳能力连接在线，browser_* 仍必须路由到壳，而不是声称为 frontend。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const desktop = vi.hoisted(() => ({
  available: vi.fn(() => true),
  call: vi.fn(async () => ({ url: 'https://example.com', title: 'Example' })),
}));

vi.mock('../src/plugins/desktop-capability.js', () => ({
  desktopCapabilityAvailable: desktop.available,
  callDesktopCapability: desktop.call,
}));

afterEach(() => {
  desktop.available.mockReset();
  desktop.call.mockClear();
  delete process.env.YZ_BROWSER_BRIDGE_URL;
  delete process.env.YZ_BROWSER_BRIDGE_TOKEN;
});

describe('browser bridge · 轻量壳远程执行', () => {
  it('本机壳在线时即使后端没有 loopback 桥，也判定由 bridge 执行', async () => {
    desktop.available.mockReturnValue(true);
    const mod = await import('../src/browser-bridge.js');
    expect(mod.browserBridgeAvailable()).toBe(true);
    expect(mod.decideBrowserExecution('navigate')).toBe('bridge');
  });

  it('浏览器动作经桌面能力桥发到壳，并透传 conversation/flow', async () => {
    desktop.available.mockReturnValue(true);
    const mod = await import('../src/browser-bridge.js');
    const result = await mod.callBrowserBridgeRaw(
      'conv-1',
      'browser_navigate',
      { url: 'https://example.com' },
      5000,
      'flow-1',
    );
    expect(result).toMatchObject({ title: 'Example' });
    expect(desktop.call).toHaveBeenCalledWith(
      'browser',
      'navigate',
      expect.objectContaining({ url: 'https://example.com' }),
      expect.objectContaining({ conversationId: 'conv-1', timeoutMs: 5000 }),
    );
  });
});
