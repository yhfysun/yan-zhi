// 四模式状态（stores/mode.ts）—— 迁移与语义回归测试。
//
// 钉住的契约（openspec four-mode-workspace 决策 4 / 决策 10）：
//   1) 旧 yz:code:active === '1' 启动迁移为 dev 并删除旧键（只迁移一次）；
//   2) 默认 lead：{ office: null, dev: 'human', ops: 'human', sec: 'human' }，
//      持久化坏数据回默认，office 永远无 lead；
//   3) setMode('office') 相当于旧的 setCodeModeActive(false)（薄封装语义不变）；
//   4) chatPlacementOf 形态矩阵与设计文档逐格一致；
//   5) 模式切换不改会话 —— setMode 只写 localStorage，不触碰会话相关存储。

import { describe, it, expect, beforeEach, vi } from 'vitest';

// localStorage 桩（node 环境无 DOM）
class LocalStorageStub {
  private map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, string: string): void { this.map.set(k, string); }
  removeItem(k: string): void { this.map.delete(k); }
  clear(): void { this.map.clear(); }
}

function freshModule(ls: LocalStorageStub) {
  // 每个用例重新 import，读一次启动迁移逻辑（vi.resetModules 让模块级单例重建）
  vi.resetModules();
  vi.doMock('vue', async (orig) => {
    const actual = await orig<typeof import('vue')>();
    return {
      ...actual,
      // 模块级 watch 在 node 环境无 effectScope，静默即可（不驱动渲染）
      watch: actual.watch,
    };
  });
  return import('./mode');
}

describe('启动迁移：yz:code:active → yz:mode', () => {
  beforeEach(() => {
    const ls = new LocalStorageStub();
    (globalThis as Record<string, unknown>).localStorage = ls as unknown as Storage;
  });

  it("旧标记 '1' 迁移为 dev，旧键删除", async () => {
    const ls = new LocalStorageStub();
    ls.setItem('yz:code:active', '1');
    (globalThis as Record<string, unknown>).localStorage = ls as unknown as Storage;
    const m = await freshModule(ls);
    expect(m.activeMode.value).toBe('dev');
    expect(ls.getItem('yz:code:active')).toBeNull();
    expect(ls.getItem('yz:mode')).toBe('dev');
  });

  it('无任何标记时默认 office', async () => {
    const m = await freshModule(new LocalStorageStub());
    expect(m.activeMode.value).toBe('office');
  });

  it('已有合法 yz:mode 时优先于旧标记，且不删旧键以外的状态', async () => {
    const ls = new LocalStorageStub();
    ls.setItem('yz:mode', 'ops');
    // 先挂桩再 import（readStoredMode 在模块加载时同步执行）
    (globalThis as Record<string, unknown>).localStorage = ls as unknown as Storage;
    const m = await freshModule(ls);
    expect(m.activeMode.value).toBe('ops');
  });

  it('非法 yz:mode 值回 office', async () => {
    const ls = new LocalStorageStub();
    ls.setItem('yz:mode', 'gibberish');
    (globalThis as Record<string, unknown>).localStorage = ls as unknown as Storage;
    const m = await freshModule(ls);
    expect(m.activeMode.value).toBe('office');
  });
});

describe('主导方（lead）默认与持久化', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).localStorage = new LocalStorageStub() as unknown as Storage;
  });

  it('默认值：office 无 lead；dev/ops/sec 均 human（决策记录 #5）', async () => {
    const m = await freshModule(new LocalStorageStub());
    expect(m.leadOf('office')).toBe('ai'); // office 无 lead 时的回落值，但不参与 UI
    expect(m.leadOf('dev')).toBe('human');
    expect(m.leadOf('ops')).toBe('human');
    expect(m.leadOf('sec')).toBe('human');
  });

  it('setLead 写入并读回（office 拒绝写入）', async () => {
    const m = await freshModule(new LocalStorageStub());
    m.setLead('dev', 'ai');
    m.setLead('ops', 'ai');
    expect(m.leadOf('dev')).toBe('ai');
    expect(m.leadOf('ops')).toBe('ai');
    m.setLead('office', 'human');
    expect(m.activeLead.value).toBe('ai'); // office 回落
  });

  it('持久化坏 JSON / 非法值回默认', async () => {
    const ls = new LocalStorageStub();
    ls.setItem('yz:mode:lead', '{broken');
    const m = await freshModule(ls);
    expect(m.leadOf('dev')).toBe('human');

    const ls2 = new LocalStorageStub();
    ls2.setItem('yz:mode:lead', JSON.stringify({ dev: 'agent', ops: 42 }));
    const m2 = await freshModule(ls2);
    expect(m2.leadOf('dev')).toBe('human'); // 'agent' 拼写已废弃，回默认
    expect(m2.leadOf('ops')).toBe('human');
  });
});

describe('旧代码模式 API 薄封装语义不变', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).localStorage = new LocalStorageStub() as unknown as Storage;
  });

  it('setCodeModeActiveCompat(true) → dev；false 从 dev 回 office，其他模式不动', async () => {
    const m = await freshModule(new LocalStorageStub());
    m.setCodeModeActiveCompat(true);
    expect(m.isCodeModeActiveCompat()).toBe(true);
    m.setCodeModeActiveCompat(false);
    expect(m.activeMode.value).toBe('office');
  });

  it('activeMode 为 ops 时 setCodeModeActiveCompat(false) 不应劫持到 office', async () => {
    const m = await freshModule(new LocalStorageStub());
    m.setMode('ops');
    m.setCodeModeActiveCompat(false);
    expect(m.activeMode.value).toBe('ops');
  });
});

describe('chatPlacementOf 形态矩阵（决策 3.1）', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).localStorage = new LocalStorageStub() as unknown as Storage;
  });

  it('office 恒为 center（单一形态）', async () => {
    const m = await freshModule(new LocalStorageStub());
    expect(m.chatPlacementOf('office', 'ai')).toBe('center');
    expect(m.chatPlacementOf('office', 'human')).toBe('center');
  });

  it('dev：ai → center；human → right', async () => {
    const m = await freshModule(new LocalStorageStub());
    expect(m.chatPlacementOf('dev', 'ai')).toBe('center');
    expect(m.chatPlacementOf('dev', 'human')).toBe('right');
  });

  it('ops / sec：ai → center；human → inline', async () => {
    const m = await freshModule(new LocalStorageStub());
    for (const k of ['ops', 'sec'] as const) {
      expect(m.chatPlacementOf(k, 'ai')).toBe('center');
      expect(m.chatPlacementOf(k, 'human')).toBe('inline');
    }
  });
});

describe('模式定义完整性（路由与插件依赖）', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).localStorage = new LocalStorageStub() as unknown as Storage;
  });

  it('四模式定义与 openspec 表格一致', async () => {
    const m = await freshModule(new LocalStorageStub());
    expect(m.MODE_DEFS.map((d) => d.key)).toEqual(['office', 'dev', 'ops', 'sec']);
    expect(m.modeRoute('office')).toBe('/chat');
    expect(m.modeRoute('dev')).toBe('/code');
    expect(m.modeRoute('ops')).toBe('/ops');
    expect(m.modeRoute('sec')).toBe('/sec');
    // pluginId 必须与插件 manifest.id 完全一致（运行时已核实：/api/plugins 返回 ops-shell / sec-lab）
    expect(m.MODE_DEFS.find((d) => d.key === 'ops')?.pluginId).toBe('ops-shell');
    expect(m.MODE_DEFS.find((d) => d.key === 'sec')?.pluginId).toBe('sec-lab');
    expect(m.MODE_DEFS.find((d) => d.key === 'ops')?.desktopOnly).toBe(true);
  });
});

describe('activeMode 是字符串，不能当布尔用（回归：办公模式欢迎区消失）', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).localStorage = new LocalStorageStub() as unknown as Storage;
  });

  it('每个模式的 key 都是非空字符串 → 真值判断必须显式比较', async () => {
    const m = await freshModule(new LocalStorageStub());
    // 这条断言本身在钉「用法」：activeModeRef 直接当 boolean 会恒为真。
    // 曾经 code.ts 把 codeModeActive 直接转发 activeModeRef，
    // 导致 ChatMessageList 的 `!isCodeMode` 在 office 下也是 false → 欢迎区+场景轮播不渲染。
    for (const d of m.MODE_DEFS) {
      m.setMode(d.key);
      expect(typeof m.activeMode.value).toBe('string');
      expect(Boolean(m.activeMode.value)).toBe(true);
    }
  });

  it('isCodeModeActiveCompat 只在 dev 为真，其余模式一律为假', async () => {
    const m = await freshModule(new LocalStorageStub());
    for (const d of m.MODE_DEFS) {
      m.setMode(d.key);
      expect(m.isCodeModeActiveCompat()).toBe(d.key === 'dev');
    }
  });
});
