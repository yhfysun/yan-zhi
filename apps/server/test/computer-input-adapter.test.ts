import { describe, expect, it, vi } from 'vitest';
import {
  ComputerInputAdapter,
  pointInWindow,
  windowPointToPhysical,
} from '../src/plugins/computer-input-adapter.js';

function fakeAgent() {
  const calls: Array<{ op: Record<string, unknown>; timeout?: number }> = [];
  let running = false;
  return {
    calls,
    get running() { return running; },
    async start() { running = true; },
    stop() { running = false; },
    async call(op: Record<string, unknown>, timeout?: number) {
      calls.push({ op, timeout });
      if (op.fail) return { i: 1, ok: false, error: 'injected failure' };
      return { i: 1, ok: true };
    },
  };
}

describe('computer input adapter', () => {
  it('reuses one resident agent for click, scroll, key and Unicode text', async () => {
    const agent = fakeAgent();
    const adapter = new ComputerInputAdapter({ agent: agent as never, minimumRestartMs: 0 });
    await adapter.start();
    await adapter.click({ x: 20, y: 30 });
    await adapter.scroll({ x: 20, y: 30, deltaY: -120 });
    await adapter.pressKey(['Control', 'a']);
    await adapter.typeText('你好');

    expect(agent.calls.map((c) => c.op.op)).toEqual(['click', 'wheel', 'key', 'type']);
    expect(agent.calls[0].op).toMatchObject({ x: 20, y: 30, button: 'left', double: false });
    expect(agent.calls[3].op).toMatchObject({ text: '你好' });
  });

  it('implements drag as down, move and up on the same resident channel', async () => {
    const agent = fakeAgent();
    const adapter = new ComputerInputAdapter({ agent: agent as never, minimumRestartMs: 0 });
    await adapter.drag({ fromX: 10, fromY: 20, toX: 100, toY: 200 });
    expect(agent.calls.map((c) => c.op.op)).toEqual(['down', 'move', 'move', 'up']);
  });

  it('rejects blacklisted shortcuts and points outside the bound window', async () => {
    const agent = fakeAgent();
    const adapter = new ComputerInputAdapter({ agent: agent as never, minimumRestartMs: 0 });
    await expect(adapter.pressKey(['Alt', 'F4'])).rejects.toThrow(/黑名单|拒绝/);
    await expect(adapter.click({
      x: 500,
      y: 500,
      window: { id: 'w1', app: 'notepad.exe', title: 'x', rect: { x: 10, y: 20, width: 100, height: 100 } },
    })).rejects.toThrow(/outside/i);
    expect(agent.calls).toHaveLength(0);
  });

  it('fails closed after transport failure and can explicitly restart', async () => {
    const agent = fakeAgent();
    const adapter = new ComputerInputAdapter({ agent: agent as never, minimumRestartMs: 0 });
    await adapter.start();
    const originalCall = agent.call.bind(agent);
    Object.assign(agent, {
      call: async (op: Record<string, unknown>, timeout?: number) => {
        if (op.fail) return originalCall({ ...op, fail: true }, timeout);
        return originalCall(op, timeout);
      },
    });
    await expect(adapter.callRaw({ fail: true })).rejects.toThrow('injected failure');
    await expect(adapter.click({ x: 1, y: 2 })).rejects.toThrow(/restart/i);
    await adapter.restart();
    await expect(adapter.click({ x: 1, y: 2 })).resolves.toMatchObject({ ok: true });
  });
});

describe('window coordinate mapping', () => {
  it('maps window-relative DIP coordinates to physical screen pixels for DPI scales', () => {
    const window = { x: 100, y: 50, width: 800, height: 600 };
    expect(windowPointToPhysical(window, 10, 20, 1)).toEqual({ x: 110, y: 70 });
    expect(windowPointToPhysical(window, 10, 20, 1.25)).toEqual({ x: 113, y: 75 });
    expect(windowPointToPhysical(window, 10, 20, 1.5)).toEqual({ x: 115, y: 80 });
  });

  it('supports negative monitor origins and rejects out-of-window points', () => {
    const window = { x: -1920, y: -120, width: 1000, height: 700 };
    expect(pointInWindow(window, -1910, -115)).toBe(true);
    expect(windowPointToPhysical(window, 5, 5, 1.25)).toEqual({ x: -1914, y: -114 });
    expect(pointInWindow(window, 1001, 5)).toBe(false);
  });
});
