// 独立窗口能力（桌面端）——把「像 IDE 那样另开一个窗口承载 diff / 冲突解决」封装成统一入口。
//
// 设计要点：
//   · 桌面端（Electron）→ 真·独立窗口：可最小化/最大化/还原、可拖边改大小、可拖到另一块屏幕。
//   · Web / 移动端 → 降级为应用内弹窗（不做窗口级操作，避免"看起来能拖其实拖不动"）。
//   · 子窗口加载同一应用的专用 hash 路由，数据通过主进程 payload 中转（窗口间无法直接传 Vue 状态）。
//
// 之所以用「路由 + payload」而不是新开打包入口：
//   应用是单页 + hash 路由，子窗口复用同一份产物即可，打包配置零改动。
import { ref } from 'vue';
import { isElectron, isCapacitor } from '../api/client';

interface ElectronChildWindowApi {
  open: (opts: { key: string; route: string; width?: number; height?: number }) => Promise<{ ok: boolean; reused?: boolean; error?: string }>;
  isMaximized: () => Promise<boolean>;
  focusMain: () => Promise<boolean>;
  putPayload: (key: string, payload: unknown) => Promise<boolean>;
  takePayload: (key: string) => Promise<unknown>;
}

function childApi(): ElectronChildWindowApi | null {
  const w = window as unknown as { electronAPI?: { childWindow?: ElectronChildWindowApi } };
  return w.electronAPI?.childWindow ?? null;
}

/** 当前环境是否支持真·独立窗口 */
export const supportsChildWindow = isElectron && !!childApi();

export interface OpenChildWindowOptions {
  /** 窗口唯一键：同 key 重复打开会聚焦已有窗口而不是再开一个 */
  key: string;
  /** 应用内 hash 路由，如 '/diff-window' */
  route: string;
  /** 初始载荷（diff 文本 / 冲突仓库与文件等），子窗口用 takePayload 取走 */
  payload?: unknown;
  width?: number;
  height?: number;
}

/**
 * 打开独立窗口。
 * 返回 true = 已交给桌面端开真窗口（调用方**不要**再开弹窗）；
 * 返回 false = 当前环境不支持，调用方应降级为应用内弹窗。
 */
export async function openChildWindow(opts: OpenChildWindowOptions): Promise<boolean> {
  const api = childApi();
  if (!supportsChildWindow || !api) return false;
  try {
    // 先投递载荷再开窗：子窗口挂载后立刻 take，避免时序竞争
    if (opts.payload !== undefined) await api.putPayload(opts.key, opts.payload);
    const r = await api.open({
      key: opts.key,
      route: opts.route,
      width: opts.width,
      height: opts.height,
    });
    return !!r?.ok;
  } catch {
    return false;
  }
}

/** 子窗口内取初始载荷（在子窗口路由组件里调用） */
export async function takeChildWindowPayload<T = unknown>(key: string): Promise<T | null> {
  const api = childApi();
  if (!api) {
    // Web 端降级：载荷走 sessionStorage（同标签页内可靠）
    try {
      const raw = sessionStorage.getItem('yz_child_payload_' + key);
      if (!raw) return null;
      sessionStorage.removeItem('yz_child_payload_' + key);
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  try {
    return (await api.takePayload(key)) as T | null;
  } catch {
    return null;
  }
}

/** 在应用内弹窗里预存载荷，供降级路径读取（Web 端） */
export function stashChildWindowPayload(key: string, payload: unknown): void {
  try {
    sessionStorage.setItem('yz_child_payload_' + key, JSON.stringify(payload));
  } catch { /* 隐私模式/超配额忽略 */ }
}

/** 关闭当前窗口（子窗口内调用；Web 端降级为 no-op，由调用方关弹窗） */
export async function closeSelfWindow(): Promise<boolean> {
  const api = childApi();
  if (!api || !supportsChildWindow) return false;
  try {
    (window as unknown as { electronAPI?: { close?: () => void } }).electronAPI?.close?.();
    return true;
  } catch {
    return false;
  }
}

/** 当前窗口是否最大化（子窗口标题栏按钮图标用） */
export async function isSelfMaximized(): Promise<boolean> {
  const api = childApi();
  if (!api || !supportsChildWindow) return false;
  try { return await api.isMaximized(); } catch { return false; }
}

/** 最大化 / 还原切换 */
export function toggleSelfMaximize(): void {
  try {
    (window as unknown as { electronAPI?: { maximize?: () => void } }).electronAPI?.maximize?.();
  } catch { /* 非桌面端忽略 */ }
}

/** 最小化当前窗口 */
export function minimizeSelf(): void {
  try {
    (window as unknown as { electronAPI?: { minimize?: () => void } }).electronAPI?.minimize?.();
  } catch { /* 非桌面端忽略 */ }
}

/** 是否运行在独立子窗口里（路由 query 标记 szwin=1） */
export function isChildWindowContext(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  return /[?&]szwin=1(&|$)/.test(hash);
}

/** 独立的响应式最大化解，供子窗口标题栏绑定 */
export const selfMaximized = ref(false);

/** 绑定窗口尺寸变化 → 同步最大化状态（子窗口标题栏 onMounted 调用即可） */
export function bindSelfWindowState(): () => void {
  if (!supportsChildWindow) return () => { /* noop */ };
  const sync = async () => { selfMaximized.value = await isSelfMaximized(); };
  void sync();
  window.addEventListener('resize', sync);
  return () => window.removeEventListener('resize', sync);
}

export { isCapacitor };