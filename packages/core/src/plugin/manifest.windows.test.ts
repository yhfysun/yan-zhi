/**
 * 清单校验 · contributes.windows（插件桌面窗口声明）。
 *
 * 安装期校验是唯一闸门：宿主会拿 entry 直接拼 yz:// 地址交给窗口层，
 * 这里放过去的非法值（绝对路径 / 越界 / 非 html）没有第二道防线。
 */
import { describe, it, expect } from 'vitest';
import { validateManifest, ManifestError } from './manifest';

const base = { id: 'demo', name: '示例', version: '1.0.0' };
const withWindows = (windows: unknown) => ({ ...base, contributes: { windows } });

describe('validateManifest · contributes.windows', () => {
  it('合法的窗口声明原样通过', () => {
    const m = validateManifest(
      withWindows([
        { id: 'panel', label: '设置', entry: 'frontend/settings.html', placement: 'normal' },
        { id: 'fence', label: '围栏', entry: 'frontend/fence.html', placement: 'desktop', accelerator: 'Control+Alt+D' },
      ]),
    );
    expect(m.contributes?.windows).toHaveLength(2);
  });

  it('没声明 windows 的老清单不受影响', () => {
    expect(() => validateManifest(base)).not.toThrow();
    expect(() => validateManifest({ ...base, contributes: {} })).not.toThrow();
  });

  it('窗口 id 必须是 kebab-case，且不允许重复', () => {
    expect(() => validateManifest(withWindows([{ id: 'Panel', label: 'x', entry: 'a.html' }]))).toThrow(ManifestError);
    expect(() =>
      validateManifest(withWindows([
        { id: 'a', label: 'x', entry: 'a.html' },
        { id: 'a', label: 'y', entry: 'b.html' },
      ])),
    ).toThrow(/重复/);
  });

  it('entry 只接受插件包内相对 html 路径（挡掉越界与非页面）', () => {
    for (const entry of ['/abs/settings.html', '../escape.html', 'frontend/x.mjs', '']) {
      expect(() => validateManifest(withWindows([{ id: 'a', label: 'x', entry }])), `应拒绝 ${entry}`).toThrow(ManifestError);
    }
  });

  it('placement 只允许三档，accelerator 不得为空串', () => {
    expect(() => validateManifest(withWindows([{ id: 'a', label: 'x', entry: 'a.html', placement: 'top' }]))).toThrow(/placement/);
    expect(() => validateManifest(withWindows([{ id: 'a', label: 'x', entry: 'a.html', accelerator: '  ' }]))).toThrow(/accelerator/);
  });

  it('rect 只认 x/y/w/h 且必须是数字，resizable 必须是布尔', () => {
    expect(() => validateManifest(withWindows([{ id: 'a', label: 'x', entry: 'a.html', rect: { x: 1, y: 2, w: 300, h: 200 } }]))).not.toThrow();
    expect(() => validateManifest(withWindows([{ id: 'a', label: 'x', entry: 'a.html', rect: { w: 'wide' } }]))).toThrow(/必须为数字/);
    expect(() => validateManifest(withWindows([{ id: 'a', label: 'x', entry: 'a.html', rect: { width: 300 } }]))).toThrow(/只支持/);
    expect(() => validateManifest(withWindows([{ id: 'a', label: 'x', entry: 'a.html', resizable: 'yes' }]))).toThrow(/resizable/);
  });

  it('windows 不是数组直接拒绝', () => {
    expect(() => validateManifest(withWindows({ id: 'a' }))).toThrow(/必须为数组/);
  });

  it('menu / icon 只接受布尔与非空字符串', () => {
    expect(() => validateManifest(withWindows([{ id: 'a', label: 'x', entry: 'a.html', menu: true, icon: 'Monitor' }]))).not.toThrow();
    expect(() => validateManifest(withWindows([{ id: 'a', label: 'x', entry: 'a.html', menu: 'yes' }]))).toThrow(/menu/);
    expect(() => validateManifest(withWindows([{ id: 'a', label: 'x', entry: 'a.html', icon: '' }]))).toThrow(/icon/);
  });
});
