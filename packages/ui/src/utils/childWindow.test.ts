// 独立子窗口能力（utils/childWindow.ts）—— 降级与载荷通道的契约测试。
//
// 钉住的语义：
//   1) 桌面端（electronAPI.childWindow 可用）→ openChildWindow 返回 true（调用方不再开弹窗）；
//      其它环境一律返回 false，调用方必须降级为应用内弹窗。
//   2) 载荷：桌面端先 putPayload 再 open（顺序不能反，否则子窗口取不到数据）；
//      Web 降级走 sessionStorage 且**取一次即清**（避免刷新后串数据）。
//   3) 任何 IPC 抛错都不能把异常抛给调用方 —— 最差退化为 false，让 UI 走降级路径。
//
// 说明：utils/childWindow.ts 依赖 ../api/client（isElectron 在模块加载时读 window），
// 故这里用 vi.resetModules + 桩 window 的方式逐例重建模块。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type AnyRec = Record<string, unknown>;

interface ChildApiStub {
  open: ReturnType<typeof vi.fn>;
  isMaximized: ReturnType<typeof vi.fn>;
  focusMain: ReturnType<typeof vi.fn>;
  putPayload: ReturnType<typeof vi.fn>;
  takePayload: ReturnType<typeof vi.fn>;
}

/** 造一个 window 桩；传 childWindow 为 null 表示桌面端能力缺失（Web/移动端） */
function stubWindow(childWindow: ChildApiStub | null): AnyRec {
  const store = new Map<string, string>();
  return {
    electronAPI: childWindow
      ? { isElectron: true, childWindow, close: vi.fn(), maximize: vi.fn(), minimize: vi.fn() }
      : undefined,
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    },
    sessionStorage: {
      getItem: (k: string) => store.get('s:' + k) ?? null,
      setItem: (k: string, v: string) => { store.set('s:' + k, v); },
      removeItem: (k: string) => { store.delete('s:' + k); },
    },
    location: { hash: '#/chat' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

/**
 * 安装全局桩。
 * ★ 关键：`utils/childWindow` 间接依赖 `api/client`，后者在**模块加载时**就读取
 *   `localStorage`（node 测试环境没有该全局）→ 不挂桩会直接抛
 *   `localStorage is not defined`，表现为「全部用例一起失败」。
 *   所以 window 与 localStorage/sessionStorage 都要挂到 globalThis 上。
 */
function installGlobals(win: AnyRec): void {
  const g2 = globalThis as AnyRec;
  g2.window = win;
  g2.localStorage = win.localStorage;
  g2.sessionStorage = win.sessionStorage;
}

function clearGlobals(): void {
  const g2 = globalThis as AnyRec;
  delete g2.window;
  delete g2.localStorage;
  delete g2.sessionStorage;
}

function makeChildApi(overrides: Partial<ChildApiStub> = {}): ChildApiStub {
  return {
    open: vi.fn(async () => ({ ok: true, reused: false })),
    isMaximized: vi.fn(async () => false),
    focusMain: vi.fn(async () => true),
    putPayload: vi.fn(async () => true),
    takePayload: vi.fn(async () => null),
    ...overrides,
  };
}

/** 重建模块（isElectron 在加载时求值，必须逐例重来） */
async function loadModule(win: AnyRec) {
  vi.resetModules();
  installGlobals(win);
  return import('./childWindow');
}

const g = globalThis as AnyRec;

describe('supportsChildWindow：环境判定', () => {
  afterEach(() => { clearGlobals(); });

  it('有 electronAPI.childWindow → 支持', async () => {
    const m = await loadModule(stubWindow(makeChildApi()));
    expect(m.supportsChildWindow).toBe(true);
  });

  it('无 electronAPI（Web）→ 不支持', async () => {
    const m = await loadModule(stubWindow(null));
    expect(m.supportsChildWindow).toBe(false);
  });

  it('有 electronAPI 但无 childWindow（旧版主进程）→ 不支持', async () => {
    // 复用完整桩，只把 childWindow 摘掉（保持 localStorage 等全局齐备）
    const win = stubWindow(makeChildApi());
    (win.electronAPI as AnyRec).childWindow = undefined;
    const m = await loadModule(win);
    expect(m.supportsChildWindow).toBe(false);
  });
});

describe('openChildWindow：桌面端开真窗口', () => {
  afterEach(() => { clearGlobals(); });

  it('支持时返回 true，且先投递载荷再开窗（顺序不能反）', async () => {
    const calls: string[] = [];
    const api = makeChildApi({
      putPayload: vi.fn(async () => { calls.push('put'); return true; }),
      open: vi.fn(async () => { calls.push('open'); return { ok: true, reused: false }; }),
    });
    const m = await loadModule(stubWindow(api));
    const ok = await m.openChildWindow({
      key: 'diff-viewer', route: '/diff-window', payload: { diffText: 'a\nb' },
    });
    expect(ok).toBe(true);
    expect(calls).toEqual(['put', 'open']);
    expect(api.putPayload).toHaveBeenCalledWith('diff-viewer', { diffText: 'a\nb' });
    expect(api.open).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'diff-viewer', route: '/diff-window' }),
    );
  });

  it('无载荷时不调用 putPayload（避免写入 undefined）', async () => {
    const api = makeChildApi();
    const m = await loadModule(stubWindow(api));
    await m.openChildWindow({ key: 'diff-viewer', route: '/diff-window' });
    expect(api.putPayload).not.toHaveBeenCalled();
    expect(api.open).toHaveBeenCalledTimes(1);
  });

  it('不支持的环境返回 false（调用方据此降级为弹窗）', async () => {
    const m = await loadModule(stubWindow(null));
    const ok = await m.openChildWindow({ key: 'k', route: '/diff-window' });
    expect(ok).toBe(false);
  });

  it('主进程返回 ok:false（如主窗口未就绪）→ 返回 false，不抛异常', async () => {
    const api = makeChildApi({ open: vi.fn(async () => ({ ok: false, error: 'main window not ready' })) });
    const m = await loadModule(stubWindow(api));
    await expect(m.openChildWindow({ key: 'k', route: '/diff-window' })).resolves.toBe(false);
  });

  it('IPC 抛错 → 静默降级为 false（不能让 UI 崩）', async () => {
    const api = makeChildApi({ open: vi.fn(async () => { throw new Error('ipc down'); }) });
    const m = await loadModule(stubWindow(api));
    await expect(m.openChildWindow({ key: 'k', route: '/diff-window' })).resolves.toBe(false);
  });

  it('putPayload 抛错也不阻断（仍尝试开窗）', async () => {
    const api = makeChildApi({ putPayload: vi.fn(async () => { throw new Error('boom'); }) });
    const m = await loadModule(stubWindow(api));
    await expect(
      m.openChildWindow({ key: 'k', route: '/diff-window', payload: { a: 1 } }),
    ).resolves.toBe(false);
  });
});

describe('载荷通道：桌面端走 IPC、Web 端走 sessionStorage', () => {
  afterEach(() => { clearGlobals(); });

  it('桌面端 takeChildWindowPayload 走 IPC', async () => {
    const api = makeChildApi({ takePayload: vi.fn(async () => ({ diffText: 'x' })) });
    const m = await loadModule(stubWindow(api));
    await expect(m.takeChildWindowPayload('diff-viewer')).resolves.toEqual({ diffText: 'x' });
    expect(api.takePayload).toHaveBeenCalledWith('diff-viewer');
  });

  it('Web 端降级：stash → take 能取回，且取一次即清', async () => {
    const m = await loadModule(stubWindow(null));
    m.stashChildWindowPayload('k1', { diffText: 'web' });
    await expect(m.takeChildWindowPayload('k1')).resolves.toEqual({ diffText: 'web' });
    // 第二次应为 null（已清除，避免刷新后串数据）
    await expect(m.takeChildWindowPayload('k1')).resolves.toBeNull();
  });

  it('Web 端坏 JSON 不抛异常，返回 null', async () => {
    const win = stubWindow(null);
    (win.sessionStorage as { setItem: (k: string, v: string) => void }).setItem('yz_child_payload_bad', '{oops');
    const m = await loadModule(win);
    await expect(m.takeChildWindowPayload('bad')).resolves.toBeNull();
  });
});

describe('isChildWindowContext：区分窗口上下文', () => {
  afterEach(() => { clearGlobals(); });

  it('hash 带 szwin=1 判定为子窗口', async () => {
    const win = stubWindow(null);
    (win as AnyRec).location = { hash: '#/diff-window?szwin=1' };
    const m = await loadModule(win);
    expect(m.isChildWindowContext()).toBe(true);
  });

  it('普通 hash 不算子窗口', async () => {
    const win = stubWindow(null);
    (win as AnyRec).location = { hash: '#/chat' };
    const m = await loadModule(win);
    expect(m.isChildWindowContext()).toBe(false);
  });

  it('szwin=1 后跟其它参数也能识别', async () => {
    const win = stubWindow(null);
    (win as AnyRec).location = { hash: '#/diff-window?szwin=1&k=diff-viewer' };
    const m = await loadModule(win);
    expect(m.isChildWindowContext()).toBe(true);
  });

  it('szwin=0 / szwin 前缀相似值不算（避免误判成子窗口）', async () => {
    for (const h of ['#/diff-window?szwin=0', '#/diff-window?szwin=10', '#/diff-window?xszwin=1']) {
      const win = stubWindow(null);
      (win as AnyRec).location = { hash: h };
      const m = await loadModule(win);
      expect(m.isChildWindowContext(), h).toBe(false);
    }
  });

  it('★ 形态判定的关键前提：桌面端主窗口（无 szwin）不能算子窗口', async () => {
    // 主窗口同样 supportsChildWindow = true；若不看 szwin 就渲染窗口控制，
    // 在主窗口点「关闭」会把主窗口关掉（隐藏到托盘）——这是必须防住的。
    const win = stubWindow(makeChildApi());
    (win as AnyRec).location = { hash: '#/diff-window' };
    const m = await loadModule(win);
    expect(m.supportsChildWindow).toBe(true);
    expect(m.isChildWindowContext()).toBe(false);
  });
});

describe('窗口操作：非桌面端必须安全 no-op', () => {
  beforeEach(() => { clearGlobals(); });
  afterEach(() => { clearGlobals(); });

  it('Web 端 toggleSelfMaximize / minimizeSelf 不抛异常', async () => {
    const m = await loadModule(stubWindow(null));
    expect(() => m.toggleSelfMaximize()).not.toThrow();
    expect(() => m.minimizeSelf()).not.toThrow();
  });

  it('Web 端 closeSelfWindow 返回 false（调用方需自行关弹窗）', async () => {
    const m = await loadModule(stubWindow(null));
    await expect(m.closeSelfWindow()).resolves.toBe(false);
  });

  it('Web 端 bindSelfWindowState 返回可调用的清理函数', async () => {
    const m = await loadModule(stubWindow(null));
    const off = m.bindSelfWindowState();
    expect(typeof off).toBe('function');
    expect(() => off()).not.toThrow();
  });

  it('桌面端 bindSelfWindowState 会注册并注销 resize 监听', async () => {
    const win = stubWindow(makeChildApi());
    const m = await loadModule(win);
    const off = m.bindSelfWindowState();
    expect(win.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    off();
    expect(win.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});