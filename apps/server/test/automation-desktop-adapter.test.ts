import { describe, expect, it, vi } from 'vitest';
import { DesktopAutomationAdapter } from '../src/services/automation-desktop-adapter.js';

const context = { runId: 'run1', userId: 'guest', params: {}, variables: {} };

function toolText(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

describe('DesktopAutomationAdapter', () => {
  it('先按进程和标题找窗口，再点击窗口相对坐标', async () => {
    const execute = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'computer_list_windows') {
        return toolText({
          windows: [
            {
              pid: 123,
              process: 'notepad',
              title: '工作记录.txt - 记事本',
              rect: { left: 100, top: 50, right: 900, bottom: 650 },
            },
          ],
        });
      }
      if (name === 'computer_activate_window') return toolText({ ok: true, pid: args.pid });
      if (name === 'computer_mouse_click') return toolText({ ok: true, x: args.x, y: args.y });
      return toolText({ ok: true });
    });
    const adapter = new DesktopAutomationAdapter({ execute });

    const out = await adapter.execute(
      {
        id: 's1',
        type: 'desktop.click',
        target: { by: 'windowPoint', x: 200, y: 120 },
      },
      context,
    );

    expect(execute.mock.calls.map((call) => call[0])).toEqual([
      'computer_list_windows',
      'computer_activate_window',
      'computer_mouse_click',
    ]);
    expect(execute.mock.calls[2][1]).toMatchObject({ x: 300, y: 170, button: 'left' });
    expect(out.output).toMatchObject({ x: 300, y: 170, pid: 123 });
  });

  it('窗口激活步骤会按 process/title 找到 pid 并激活', async () => {
    const execute = vi.fn(async (name: string) => {
      if (name === 'computer_list_windows') {
        return toolText({ windows: [{ pid: 456, process: 'Weixin', title: '微信', rect: { left: 0, top: 0, right: 10, bottom: 10 } }] });
      }
      return toolText({ ok: true });
    });
    const adapter = new DesktopAutomationAdapter({ execute });

    const out = await adapter.execute(
      { id: 's1', type: 'desktop.activateWindow', processName: 'Weixin', titleContains: '微信' },
      context,
    );

    expect(execute).toHaveBeenLastCalledWith('computer_activate_window', expect.objectContaining({ pid: 456 }));
    expect(out.output).toMatchObject({ pid: 456 });
  });

  it('找不到目标窗口时拒绝盲点', async () => {
    const adapter = new DesktopAutomationAdapter({
      execute: async () => toolText({ windows: [] }),
    });

    await expect(
      adapter.execute(
        { id: 's1', type: 'desktop.click', target: { by: 'windowPoint', x: 1, y: 2 } },
        context,
      ),
    ).rejects.toThrow(/未找到可绑定的桌面窗口/);
  });
});
