import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computerControlOverlayAvailable,
  pulseComputerControl,
  shouldShowComputerControl,
  stopComputerControl,
} from '../src/computer-control-bridge.js';

const OLD_URL = process.env.YZ_COMPUTER_CONTROL_URL;
const OLD_TOKEN = process.env.YZ_COMPUTER_CONTROL_TOKEN;

afterEach(() => {
  vi.unstubAllGlobals();
  if (OLD_URL == null) delete process.env.YZ_COMPUTER_CONTROL_URL;
  else process.env.YZ_COMPUTER_CONTROL_URL = OLD_URL;
  if (OLD_TOKEN == null) delete process.env.YZ_COMPUTER_CONTROL_TOKEN;
  else process.env.YZ_COMPUTER_CONTROL_TOKEN = OLD_TOKEN;
});

describe('computer control overlay bridge', () => {
  it('shows the control frame only for visual observation and input tools', () => {
    expect(shouldShowComputerControl('computer_screenshot')).toBe(true);
    expect(shouldShowComputerControl('computer_get_ui_tree')).toBe(true);
    expect(shouldShowComputerControl('computer_mouse_click')).toBe(true);
    expect(shouldShowComputerControl('computer_type')).toBe(true);
    expect(shouldShowComputerControl('computer_list_windows')).toBe(false);
    expect(shouldShowComputerControl('computer_system_info')).toBe(false);
  });

  it('is unavailable without desktop bridge environment', () => {
    delete process.env.YZ_COMPUTER_CONTROL_URL;
    delete process.env.YZ_COMPUTER_CONTROL_TOKEN;
    expect(computerControlOverlayAvailable()).toBe(false);
  });

  it('sends authenticated pulse and stop requests to the desktop bridge', async () => {
    process.env.YZ_COMPUTER_CONTROL_URL = 'http://127.0.0.1:3333/v1/computer-control/overlay';
    process.env.YZ_COMPUTER_CONTROL_TOKEN = 'secret-token';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await pulseComputerControl({
      sessionId: 'conv-1',
      toolName: 'computer_mouse_click',
      phase: 'before',
    });
    await stopComputerControl('conv-1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0] as unknown[];
    expect(first[0]).toBe(process.env.YZ_COMPUTER_CONTROL_URL);
    expect(first[1]).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-yz-control-token': 'secret-token',
      },
    });
    expect(JSON.parse(String((first[1] as RequestInit).body))).toEqual({
      op: 'pulse',
      sessionId: 'conv-1',
      toolName: 'computer_mouse_click',
      phase: 'before',
    });
  });

  it('treats overlay delivery as best effort and never blocks the desktop action', async () => {
    process.env.YZ_COMPUTER_CONTROL_URL = 'http://127.0.0.1:3333/v1/computer-control/overlay';
    process.env.YZ_COMPUTER_CONTROL_TOKEN = 'secret-token';
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('bridge offline');
    }));

    await expect(pulseComputerControl({ sessionId: 'conv-1', toolName: 'computer_type' })).resolves.toBe(false);
  });
});
