// 运行时插件模式：注册表 + 授权放行 / 会话校验的并入。
//
// 为什么单独测：后装 .yzp 带来的新模式不可能出现在构建期模式表里。
// 漏登记的表现很隐蔽 —— 插件启用、入口在，但会话一落库就被改判 office、或授权接口
// 不放行导致模式下拉里永远没有它。
import { describe, it, expect, afterEach } from 'vitest';
import {
  refreshRuntimeModes,
  setRuntimePluginModes,
  runtimePluginModes,
  isRuntimeMode,
} from '../src/plugins/runtime-modes.js';
import { allowedModes } from '../src/license.js';

const mgr = (plugins: Array<{ state: string; key?: string }>) => ({
  list: () =>
    plugins.map((p) => ({
      state: p.state,
      manifest: { contributes: p.key ? { mode: { key: p.key } } : undefined },
    })),
});

afterEach(() => setRuntimePluginModes([]));

describe('runtime-modes', () => {
  it('只登记 enabled 插件贡献的模式；停用即消失', () => {
    expect(refreshRuntimeModes(mgr([{ state: 'enabled', key: 'report' }]))).toEqual(['report']);
    expect(isRuntimeMode('report')).toBe(true);
    expect(refreshRuntimeModes(mgr([{ state: 'disabled', key: 'report' }]))).toEqual([]);
    expect(isRuntimeMode('report')).toBe(false);
  });

  it('未声明 contributes.mode 的插件不产生模式', () => {
    expect(refreshRuntimeModes(mgr([{ state: 'enabled' }]))).toEqual([]);
  });

  it('allowedModes 并入运行时插件模式（内置模式仍按 构建档 ∩ 授权档）', () => {
    // 内置：pro 构建 + basic 授权 → office/wf/dev
    expect(allowedModes('pro', 'basic')).toEqual(['office', 'wf', 'dev']);
    setRuntimePluginModes(['report']);
    expect(allowedModes('pro', 'basic')).toEqual(['office', 'wf', 'dev', 'report']);
    // 运行时模式不受授权档表约束（表里根本不可能有未知模式），由插件启停把关
    expect(allowedModes('lite', 'lite')).toEqual(['office', 'report']);
  });
});
