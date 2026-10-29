// @vitest-environment jsdom
/**
 * 插件窗口快捷键 · 渲染层组装与同步。
 *
 * 这层只做两件事：把「启用的插件 + 清单声明 + 用户覆盖」算成一份清单，
 * 整份推给主进程。算错了的表现是「快捷键点了没反应」或在停用插件后仍然占用全局键，
 * 所以把边界（停用 / 无声明 / 用户禁用 / 覆盖成别的键）逐条钉住。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { reactive, isProxy } from 'vue';
import {
  pluginWindowHotkeyRows,
  pluginWindowHotkeySpecs,
  syncPluginWindowHotkeys,
} from './pluginWindowHotkeys';

function plugin(id: string, state: string, windows: unknown[]) {
  return {
    manifest: { id, name: id, version: '0.1.0', contributes: { windows } },
    state,
  } as never;
}

const FENCE = {
  id: 'fence', label: '围栏', entry: 'frontend/fence.html', placement: 'desktop', accelerator: 'Control+Alt+D',
};
const WIDGETS = { id: 'widgets', label: '组件', entry: 'frontend/widgets.html', placement: 'overlay' };

afterEach(() => {
  delete (window as { electronAPI?: unknown }).electronAPI;
});

describe('清单组装', () => {
  it('只列已启用、且清单声明了默认组合的窗口', () => {
    const rows = pluginWindowHotkeyRows(
      [
        plugin('desktop-manager', 'enabled', [FENCE, WIDGETS]),
        plugin('disabled-plugin', 'disabled', [FENCE]),
      ],
      {},
    );
    expect(rows.map((r) => r.key)).toEqual(['desktop-manager/fence']);
    expect(rows[0].label).toBe('desktop-manager · 围栏');
    expect(rows[0].accelerator).toBe('Control+Alt+D');
  });

  it('用户覆盖优先；空串覆盖 = 主动禁用（行还在，但组合为空）', () => {
    const [row] = pluginWindowHotkeyRows(
      [plugin('desktop-manager', 'enabled', [FENCE])],
      { 'desktop-manager/fence': 'Control+Shift+F' },
    );
    expect(row.accelerator).toBe('Control+Shift+F');

    const [off] = pluginWindowHotkeyRows(
      [plugin('desktop-manager', 'enabled', [FENCE])],
      { 'desktop-manager/fence': '' },
    );
    expect(off.accelerator).toBe('');
  });

  it('要注册的清单跳过被禁用的窗口，并带上开窗所需字段', () => {
    const specs = pluginWindowHotkeySpecs(
      [plugin('desktop-manager', 'enabled', [FENCE, WIDGETS])],
      { 'desktop-manager/fence': '' },
    );
    expect(specs).toEqual([]);

    const live = pluginWindowHotkeySpecs(
      [plugin('desktop-manager', 'enabled', [FENCE])],
      {},
    );
    expect(live).toMatchObject([{
      pluginId: 'desktop-manager',
      windowId: 'fence',
      entry: 'frontend/fence.html',
      placement: 'desktop',
      accelerator: 'Control+Alt+D',
      title: 'desktop-manager · 围栏',
    }]);
  });
});

describe('同步给主进程', () => {
  it('★ 清单来自 pinia 响应式对象：传给 IPC 的必须不是 Proxy（否则 "An object could not be cloned"）', () => {
    const live = reactive(plugin('desktop-manager', 'enabled', [
      { ...FENCE, rect: { x: 10, y: 20, w: 640, h: 720 }, resizable: true },
    ]));
    const [spec] = pluginWindowHotkeySpecs([live], {});
    expect(isProxy(spec.rect)).toBe(false);
    expect(() => structuredClone(spec)).not.toThrow();
  });

  it('把整份清单交给 pluginWindow.setHotkeys，并回传逐条结果', async () => {
    const setHotkeys = vi.fn(async (_list: unknown) => ({ ok: true, registered: [{ key: 'desktop-manager/fence', ok: true }] }));
    (window as any).electronAPI = { pluginWindow: { setHotkeys } };

    const results = await syncPluginWindowHotkeys(
      [plugin('desktop-manager', 'enabled', [FENCE])],
      {},
    );
    expect(setHotkeys).toHaveBeenCalledTimes(1);
    expect(setHotkeys.mock.calls[0][0]).toMatchObject([
      { pluginId: 'desktop-manager', windowId: 'fence', accelerator: 'Control+Alt+D' },
    ]);
    expect(results).toEqual([{ key: 'desktop-manager/fence', ok: true }]);
  });

  it('非 Electron 宿主（web / 移动端）不发 IPC', async () => {
    expect(await syncPluginWindowHotkeys([plugin('desktop-manager', 'enabled', [FENCE])], {})).toEqual([]);
  });

  it('主进程报错不外抛，退回空结果（界面不因此崩）', async () => {
    (window as any).electronAPI = {
      pluginWindow: { setHotkeys: async () => { throw new Error('boom'); } },
    };
    expect(await syncPluginWindowHotkeys([plugin('desktop-manager', 'enabled', [FENCE])], {})).toEqual([]);
  });
});
