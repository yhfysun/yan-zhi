// 移动端模式白名单（stores/mode.ts 的 isModeAvailable 平台维度）—— 回归测试。
//
// 背景（2026-11-17 调整）：手机开放「办公、店铺、运维、安全、学习」五个模式；
// 开发/工作流/自动化/剪辑仍保留桌面入口，不进入移动一级模式。
//
// 钉住的契约：
//   1) isCapacitor（原生壳）下：白名单外模式一律不可见/不可用 ——
//      包括构建期编译进包的模式（BUILD_MODES 含 dev/ops/...）与运行时插件模式；
//   2) 收口在 isModeAvailable：visibleModeDefs（下拉/侧栏数据源）随之收敛；
//   3) 当前模式失权回落：启动时 localStorage 停在白名单外模式（如 dev），
//      授权信息到达触发 setLicensedModes → 回落白名单内第一个模式（office）；
//   4) 桌面/Web（isCapacitor=false）不受白名单影响 —— 全量清单照旧。

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MODE_DEFS } from './mode';

class LocalStorageStub {
  private map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
  clear(): void { this.map.clear(); }
}

type ModeModule = typeof import('./mode');

const ALL = MODE_DEFS.map((d) => d.key);
// 白名单模式必须真的存在于构建期清单里：清单改名/删模式时这里第一时间变红
const MOBILE_ALLOWED = ALL.filter((k) => ['office', 'shop', 'ops', 'sec', 'learning'].includes(k));

const REAL_WINDOW = globalThis.window; // 原始 window 引用（测试间恢复，避免污染泄漏）

async function freshModule(
  native: boolean,
  storage: Storage = new LocalStorageStub() as unknown as Storage,
): Promise<ModeModule> {
  vi.resetModules();
  (globalThis as Record<string, unknown>).localStorage = storage;
  (globalThis as Record<string, unknown>).window = native
    ? { ...REAL_WINDOW, Capacitor: { isNativePlatform: true } } as unknown as Window & typeof globalThis
    : REAL_WINDOW;
  return import('./mode');
}

describe('移动端模式白名单（isCapacitor）', () => {
  it('★ 白名单模式存在性卫兵：五个移动模式必须在构建期清单里（清单漂移即红）', () => {
    expect(MOBILE_ALLOWED).toEqual(['office', 'ops', 'sec', 'shop', 'learning']);
  });

  it('原生壳下只显示五个移动模式，桌面重工作台不可见', async () => {
    const m = await freshModule(true);
    m.setLicensedModes(null); // 未拿到授权：桌面全可见，移动端仍收敛
    const keys = m.visibleModeDefs.value.map((d) => d.key);
    expect(keys).toEqual(MOBILE_ALLOWED);
    expect(m.isModeAvailable('dev')).toBe(false);
    expect(m.isModeAvailable('office')).toBe(true);
    expect(m.isModeAvailable('ops')).toBe(true);
    expect(m.isModeAvailable('sec')).toBe(true);
    expect(m.isModeAvailable('shop')).toBe(true);
    expect(m.isModeAvailable('learning')).toBe(true);
    expect(m.isModeAvailable('wf')).toBe(false);
    expect(m.isModeAvailable('rpa')).toBe(false);
    expect(m.isModeAvailable('clip')).toBe(false);
  });

  it('★ 启动时停在白名单外模式（如 dev）→ 授权到达后回落 office', async () => {
    const storage = new LocalStorageStub() as unknown as Storage;
    storage.setItem('yz:mode', 'dev'); // 模拟旧设备上残留的模式标记（同一实例，导入时才读）
    const m = await freshModule(true, storage);
    expect(m.activeMode.value).toBe('dev'); // 读取阶段不做收敛（与桌面同口径）
    m.setLicensedModes(ALL); // 移动端后端恒发全量档 → 触发可用性收敛
    expect(m.activeMode.value).toBe('office');
  });

  it('运行时插件贡献的白名单外模式同样被收敛（新 key 走 runtimeDefs）', async () => {
    const m = await freshModule(true);
    m.setRuntimeModeDefs([
      { key: 'douyin-x', label: '抖音', icon: 'Connection', desc: '', route: '/x' },
    ]);
    const keys = m.visibleModeDefs.value.map((d) => d.key);
    expect(keys).toEqual(MOBILE_ALLOWED);
    expect(m.isModeAvailable('douyin-x')).toBe(false);
  });

  it('桌面 / Web 不受白名单影响（全量清单照旧）', async () => {
    const m = await freshModule(false);
    m.setLicensedModes(null);
    expect(m.visibleModeDefs.value.map((d) => d.key)).toEqual(ALL);
    expect(m.isModeAvailable('dev')).toBe(true);
  });
});
