// 移动外壳判定（composables/useMobileShell.ts）—— 平台 × 视口 组合的契约测试。
//
// 背景：原先外壳判定用纯视口宽度断点（useIsMobile，<768px）。Capacitor 端横屏时
// 视口常达 800px+，于是底部 TabBar 与自绘顶栏一起消失、内容留白按桌面算 ——
// 触屏上丢掉底部导航很难用。本次改为「视口窄 **或** 跑在 Capacitor 端」取并集。
//
// 钉住的契约：
//   1) ★ Capacitor 端 + 宽视口 → true（本次修的核心 bug，转横屏后底部导航不再消失）
//   2) ★ 桌面/Web + 宽视口 → false —— 桌面端行为与改动前逐字一致（安全边界，不能破）
//   3) 桌面/Web + 窄视口 → true —— 保留原有的窄窗降级，改动不该把它弄丢
//   4) 平台适配器未就绪（抛错）→ 退化为纯宽度判定，不抛异常（首屏不能因此白屏）
//   5) 平台解析结果被冻结：同一模块实例内反复调用得到一致结果（不被时序抖动影响）
//
// 说明：useMobileShell 的平台判定是模块级缓存的，故每个用例都要 vi.resetModules()
// 重建模块，否则前一个用例的缓存会污染后一个（这本身就是被测的语义之一）。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** 本用例期望的运行时平台；由 mock 的 getPlatformAdapter 读取。 */
let currentPlatform: string = 'web';
/** getPlatformAdapter 是否应抛错（模拟适配器未初始化）。 */
let adapterThrows = false;

vi.mock('@yan-zhi/core', () => ({
  getPlatformAdapter: () => {
    if (adapterThrows) throw new Error('PlatformAdapter 未初始化');
    return { platform: currentPlatform };
  },
}));

/** 桩一个 window，其 matchMedia 按给定视口宽度返回是否命中窄屏断点。 */
function stubWindow(viewportWidth: number): void {
  const isNarrow = viewportWidth < 768;
  (globalThis as Record<string, unknown>).window = {
    matchMedia: () => ({
      matches: isNarrow,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  };
}

type ShellModule = typeof import('./useMobileShell');

async function freshModule(): Promise<ShellModule> {
  vi.resetModules();
  return import('./useMobileShell');
}

const ORIGINAL_WINDOW = (globalThis as Record<string, unknown>).window;

describe('移动外壳判定：平台 × 视口', () => {
  beforeEach(() => {
    currentPlatform = 'web';
    adapterThrows = false;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).window = ORIGINAL_WINDOW;
  });

  it('★ Capacitor 端 + 宽视口（横屏）→ 仍用移动外壳', async () => {
    // 这条就是本次修复点：2400x1080 @3x 的横屏视口约 800px，旧逻辑会误判成 Web
    stubWindow(800);
    currentPlatform = 'mobile';
    const m = await freshModule();
    expect(m.useMobileShell().value).toBe(true);
  });

  it('Capacitor 端 + 窄视口（竖屏）→ 移动外壳（与改动前一致）', async () => {
    stubWindow(390);
    currentPlatform = 'mobile';
    const m = await freshModule();
    expect(m.useMobileShell().value).toBe(true);
  });

  it('★ 桌面端 + 宽视口 → 不用移动外壳（桌面端行为不变，安全边界）', async () => {
    stubWindow(1920);
    currentPlatform = 'desktop';
    const m = await freshModule();
    expect(m.useMobileShell().value).toBe(false);
  });

  it('★ Web 端 + 宽视口 → 不用移动外壳（web 端行为不变）', async () => {
    stubWindow(1440);
    currentPlatform = 'web';
    const m = await freshModule();
    expect(m.useMobileShell().value).toBe(false);
  });

  it('桌面端窄窗口 → 仍降级为移动外壳（原有窄窗行为不能被弄丢）', async () => {
    stubWindow(600);
    currentPlatform = 'desktop';
    const m = await freshModule();
    expect(m.useMobileShell().value).toBe(true);
  });

  it('Web 端窄窗口 → 仍降级为移动外壳', async () => {
    stubWindow(375);
    currentPlatform = 'web';
    const m = await freshModule();
    expect(m.useMobileShell().value).toBe(true);
  });

  it('平台适配器未就绪（抛错）→ 退化为宽度判定且不抛异常', async () => {
    stubWindow(1920);
    adapterThrows = true;
    const m = await freshModule();
    // 宽视口 + 平台未知 → 按非移动端处理
    expect(() => m.useMobileShell().value).not.toThrow();
    expect(m.useMobileShell().value).toBe(false);
  });

  it('适配器未就绪时窄视口仍成立（兜底也要保留窄窗降级）', async () => {
    stubWindow(360);
    adapterThrows = true;
    const m = await freshModule();
    expect(m.useMobileShell().value).toBe(true);
  });

  it('平台解析结果被冻结：重复调用结果一致', async () => {
    stubWindow(800);
    currentPlatform = 'mobile';
    const m = await freshModule();
    const first = m.useMobileShell().value;
    // 解析后即便平台"变了"（模拟时序抖动），也不该影响已冻结的结果
    currentPlatform = 'web';
    expect(m.useMobileShell().value).toBe(first);
  });

  it('返回的是同一个 computed 实例（组件间共享，不重复建）', async () => {
    stubWindow(1920);
    currentPlatform = 'web';
    const m = await freshModule();
    expect(m.useMobileShell()).toBe(m.useMobileShell());
  });

  it('界值：767px 视为窄（移动外壳）', async () => {
    stubWindow(767);
    currentPlatform = 'web';
    const m = await freshModule();
    expect(m.useMobileShell().value).toBe(true);
  });

  it('界值：768px 视为宽（非移动外壳，与 useIsMobile 断点口径一致）', async () => {
    stubWindow(768);
    currentPlatform = 'web';
    const m = await freshModule();
    expect(m.useMobileShell().value).toBe(false);
  });
});