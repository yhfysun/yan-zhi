import { describe, expect, it, vi } from 'vitest';
import { BrowserAutomationAdapter } from '../src/services/automation-browser-adapter.js';

const baseContext = {
  runId: 'run1',
  userId: 'guest',
  conversationId: 'conv1',
  params: {},
  variables: {},
};

describe('BrowserAutomationAdapter', () => {
  it('把统一步骤映射到现有浏览器桥工具', async () => {
    const call = vi.fn(async (tool: string, args: Record<string, unknown>) => {
      if (tool === 'browser_get_visible_text') return { text: '导出完成' };
      return { success: true, args };
    });
    const adapter = new BrowserAutomationAdapter({ call });

    await adapter.execute(
      { id: 's1', type: 'browser.navigate', url: 'https://example.com' },
      baseContext,
    );
    await adapter.execute(
      {
        id: 's2',
        type: 'browser.click',
        target: { by: 'role', role: 'button', name: '导出' },
      },
      baseContext,
    );
    await adapter.execute(
      {
        id: 's3',
        type: 'browser.type',
        target: { by: 'label', label: '日期' },
        text: '2026-11-13',
        pressEnter: true,
      },
      baseContext,
    );
    await adapter.execute(
      { id: 's4', type: 'browser.assertText', text: '导出完成' },
      baseContext,
    );

    expect(call.mock.calls[0]).toEqual([
      'browser_navigate',
      { url: 'https://example.com' },
      45000,
    ]);
    expect(call.mock.calls[1][0]).toBe('browser_click');
    expect(call.mock.calls[1][1]).toMatchObject({
      target: { role: 'button', name: '导出' },
    });
    expect(call.mock.calls[2][0]).toBe('browser_type');
    expect(call.mock.calls[2][1]).toMatchObject({
      target: { label: '日期' },
      text: '2026-11-13',
      pressEnter: true,
    });
    expect(call.mock.calls[3][0]).toBe('browser_get_visible_text');
  });

  it('断言文本不存在时失败并返回现场片段', async () => {
    const call = vi.fn(async () => ({ text: '当前页面没有下载完成提示' }));
    const adapter = new BrowserAutomationAdapter({ call });

    await expect(
      adapter.execute(
        { id: 's1', type: 'browser.assertText', text: '导出完成' },
        baseContext,
      ),
    ).rejects.toThrow(/断言失败.*当前页面没有下载完成提示/);
  });

  it('浏览器桥返回 error 时转成失败', async () => {
    const call = vi.fn(async () => ({ error: '元素未找到' }));
    const adapter = new BrowserAutomationAdapter({ call });

    await expect(
      adapter.execute(
        { id: 's1', type: 'browser.click', target: { by: 'text', text: '导出' } },
        baseContext,
      ),
    ).rejects.toThrow('元素未找到');
  });

  it('MVP 明确拒绝桌面和文件步骤', async () => {
    const adapter = new BrowserAutomationAdapter({ call: vi.fn() });

    await expect(
      adapter.execute(
        {
          id: 's1',
          type: 'desktop.click',
          target: { by: 'uia', processName: 'notepad.exe', name: '保存' },
        },
        baseContext,
      ),
    ).rejects.toThrow(/尚未接入桌面执行器/);
  });
});
