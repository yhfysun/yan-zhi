// 版本档授权分级（stores/mode.ts 的模式可见性）—— 回归测试。
//
// 钉住的契约：
//   1) 未拿到授权信息（首屏 / 接口失败）时**不做收敛** —— 全可见。
//      写成「默认全隐藏」会让首屏抖动，且授权接口偶发失败时用户以为功能没了。
//   2) setLicensedModes 写入后，visibleModeDefs 按放行清单收敛；
//   3) ★ 当前模式失权时必须回落 office —— 否则界面停在一个不该存在的模式上，
//      工作台会渲染成空壳（activeMode 指着已被隐藏的模式）。
//   4) 空数组 / null / 非数组一律视同「未拿到授权」而非「无任何权限」——
//      后者会把办公模式也关掉，用户直接无法使用任何功能。

import { describe, it, expect, beforeEach, vi } from 'vitest';
// 只取不可变的 MODE_DEFS 常量（模块顶层无副作用：localStorage 访问都在函数体内），
// 与下方 freshModule() 的隔离诉求不冲突。
import { MODE_DEFS } from './mode';

class LocalStorageStub {
  private map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
  clear(): void { this.map.clear(); }
}

type ModeModule = typeof import('./mode');

async function freshModule(): Promise<ModeModule> {
  vi.resetModules();
  return import('./mode');
}

// 注意顺序：前端可见顺序**始终跟随 MODE_DEFS**（office, dev, ops, sec, wf, clip），
// 与后端 allowedModes 的下发顺序（office, wf, dev…）无关 —— 界面顺序不该被接口返回顺序左右。
//
// ★★ 为什么从 MODE_DEFS 推导而不是硬编码（2026-10-08 实测教训）：
//   上一版这里是手写的 5 项清单。新增 `clip`（剪辑模式）时只改了 MODE_DEFS，
//   本文件的三条断言（含 length 比较）**集体变红**，而全量测试没跑就漏了。
//   硬编码清单与 MODE_DEFS 是同一语义的第二份真相 —— 新增模式必须两处改，必漏一处。
const ALL = MODE_DEFS.map((d) => d.key);

describe('版本档：模式可见性收敛', () => {
  let m: ModeModule;

  beforeEach(async () => {
    (globalThis as Record<string, unknown>).localStorage = new LocalStorageStub() as unknown as Storage;
    m = await freshModule();
    m.setLicensedModes(null);
  });

  it('未拿到授权信息时不收敛（首屏全可见，避免抖动与误判）', () => {
    expect(m.isModeLicensed('ops')).toBe(true);
    expect(m.isModeLicensed('sec')).toBe(true);
    expect(m.visibleModeDefs.value.map((d) => d.key)).toEqual(ALL);
  });

  it('阉割版：仅办公可见，且模式下拉只剩一项（组件据此整条隐藏）', () => {
    m.setLicensedModes(['office']);
    expect(m.visibleModeDefs.value.map((d) => d.key)).toEqual(['office']);
    expect(m.isModeLicensed('dev')).toBe(false);
    expect(m.isModeLicensed('ops')).toBe(false);
  });

  it('基础版：办公 + 工作流 + 开发', () => {
    m.setLicensedModes(['office', 'wf', 'dev']);
    // MODE_DEFS 顺序是 office, dev, ops, sec, wf → 过滤后为 office, dev, wf
    expect(m.visibleModeDefs.value.map((d) => d.key)).toEqual(['office', 'dev', 'wf']);
    expect(m.isModeLicensed('ops')).toBe(false);
    expect(m.isModeLicensed('sec')).toBe(false);
  });

  it('高级版：全量放行', () => {
    m.setLicensedModes(ALL);
    expect(m.visibleModeDefs.value.map((d) => d.key)).toEqual(ALL);
  });

  it('可见顺序始终跟随 MODE_DEFS，与后端下发顺序无关', () => {
    // 后端若换个顺序返回，界面顺序不该跟着乱跳（MODE_DEFS 顺序：office, dev, ops, sec, wf）
    m.setLicensedModes(['sec', 'office', 'dev']);
    expect(m.visibleModeDefs.value.map((d) => d.key)).toEqual(['office', 'dev', 'sec']);
  });

  it('★ 当前模式失权时回落 office（否则工作台渲染空壳）', () => {
    m.setLicensedModes(ALL);
    m.setMode('ops');
    expect(m.activeMode.value).toBe('ops');
    // 换成阉割版码
    m.setLicensedModes(['office']);
    expect(m.activeMode.value).toBe('office');
  });

  it('当前模式仍被放行时不受影响（不无谓重置用户位置）', () => {
    m.setLicensedModes(ALL);
    m.setMode('dev');
    m.setLicensedModes(['office', 'wf', 'dev']);
    expect(m.activeMode.value).toBe('dev');
  });

  it('★ 空数组/异常值视同「未拿到授权」而非「无任何权限」', () => {
    // 若当成后者，办公模式也会被隐藏 → 用户一个入口都没有，直接不可用。
    m.setLicensedModes([]);
    expect(m.visibleModeDefs.value.length).toBe(ALL.length);
    expect(m.isModeLicensed('office')).toBe(true);

    m.setLicensedModes(null);
    expect(m.visibleModeDefs.value.length).toBe(ALL.length);

    m.setLicensedModes(undefined as unknown as string[]);
    expect(m.visibleModeDefs.value.length).toBe(ALL.length);
  });

  it('放行清单被拷贝，外部改动不影响内部状态', () => {
    const list = ['office', 'wf'];
    m.setLicensedModes(list);
    list.push('ops');
    expect(m.isModeLicensed('ops')).toBe(false);
  });

  it('从收敛态回到「未拿到授权」时恢复全可见（掉授权后由路由守卫接手）', () => {
    m.setLicensedModes(['office']);
    expect(m.visibleModeDefs.value.length).toBe(1);
    m.setLicensedModes(null);
    expect(m.visibleModeDefs.value.length).toBe(ALL.length);
  });
});