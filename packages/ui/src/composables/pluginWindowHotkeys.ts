// 插件窗口全局快捷键（manifest contributes.windows[].accelerator）
//
// 分工：清单声明默认组合 → 用户在设置里可改/可禁用（settings.pluginHotkeys 覆盖）
// → 渲染层把「已启用插件的窗口 + 生效组合」整份同步给主进程 → 主进程差量注册。
// 纯函数部分（rows / specs）单独导出，便于不依赖 Electron 直接测。
import type { PluginManifest, PluginWindowContribution } from '@yan-zhi/core';

interface PluginLike {
  manifest: PluginManifest;
  state: string;
}

export interface PluginWindowHotkeyRow {
  /** `插件id/窗口id`（settings.pluginHotkeys 的键） */
  key: string;
  /** 设置页展示名：插件名 · 窗口名 */
  label: string;
  /** 清单里声明的默认组合 */
  defaultAccelerator: string;
  /** 当前生效组合（用户改过用覆盖值；空串 = 已禁用） */
  accelerator: string;
  window: PluginWindowContribution;
  pluginId: string;
}

export interface PluginWindowHotkeySpec {
  pluginId: string;
  windowId: string;
  entry: string;
  placement?: PluginWindowContribution['placement'];
  rect?: PluginWindowContribution['rect'];
  resizable?: boolean;
  accelerator: string;
  title: string;
}

export type HotkeyOverrides = Record<string, string>;

/**
 * 把 rect 拷成普通对象。
 * ★ 插件清单来自 pinia store，`w.rect` 是**响应式 Proxy**；Electron IPC 走结构化克隆，
 *   传 Proxy 会直接抛 "An object could not be cloned"（2026-10-29 实测：菜单点开窗口、
 *   快捷键注册两条链路都栽在这里，且表现分别是"点了没反应"和"按了没反应"）。
 */
export function plainRect(
  rect?: PluginWindowContribution['rect'],
): PluginWindowContribution['rect'] | undefined {
  if (!rect) return undefined;
  const out: Record<string, number> = {};
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    const n = Number(rect[k]);
    if (Number.isFinite(n)) out[k] = n;
  }
  return Object.keys(out).length ? (out as PluginWindowContribution['rect']) : undefined;
}

/** 生效组合：有覆盖用覆盖（含空串 = 禁用），否则用清单默认值 */
function effectiveAccelerator(
  key: string,
  declared: string | undefined,
  overrides: HotkeyOverrides,
): string {
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return String(overrides[key] || '');
  return String(declared || '');
}

/**
 * 设置页要列出的行：只列**清单声明了默认组合**的窗口。
 * 没声明组合的窗口不该突然在设置里冒出一行空快捷键。
 */
export function pluginWindowHotkeyRows(
  plugins: PluginLike[],
  overrides: HotkeyOverrides | undefined,
): PluginWindowHotkeyRow[] {
  const ov = overrides || {};
  const rows: PluginWindowHotkeyRow[] = [];
  for (const p of plugins) {
    if (p.state !== 'enabled') continue;
    for (const w of p.manifest.contributes?.windows || []) {
      const declared = String(w.accelerator || '').trim();
      if (!declared) continue;
      const key = `${p.manifest.id}/${w.id}`;
      rows.push({
        key,
        label: `${p.manifest.name} · ${w.label}`,
        defaultAccelerator: declared,
        accelerator: effectiveAccelerator(key, declared, ov),
        window: w,
        pluginId: p.manifest.id,
      });
    }
  }
  return rows;
}

/** 要注册到主进程的清单（只含生效组合非空的窗口） */
export function pluginWindowHotkeySpecs(
  plugins: PluginLike[],
  overrides: HotkeyOverrides | undefined,
): PluginWindowHotkeySpec[] {
  const specs: PluginWindowHotkeySpec[] = [];
  for (const row of pluginWindowHotkeyRows(plugins, overrides)) {
    if (!row.accelerator) continue;
    specs.push({
      pluginId: row.pluginId,
      windowId: row.window.id,
      entry: row.window.entry,
      placement: row.window.placement,
      rect: plainRect(row.window.rect),
      resizable: row.window.resizable,
      accelerator: row.accelerator,
      title: row.label,
    });
  }
  return specs;
}

interface PluginWindowApi {
  setHotkeys?: (list: PluginWindowHotkeySpec[]) => Promise<{
    ok?: boolean;
    registered?: Array<{ key: string; ok?: boolean; accelerator?: string; error?: string }>;
  }>;
}

/**
 * 把当前生效的清单同步给主进程。返回主进程的逐条结果（key 级），
 * 调用方（设置页）据此提示「这个组合被别的软件占了」。
 */
export async function syncPluginWindowHotkeys(
  plugins: PluginLike[],
  overrides: HotkeyOverrides | undefined,
): Promise<Array<{ key: string; ok?: boolean; accelerator?: string; error?: string }>> {
  const api = (window as unknown as { electronAPI?: { pluginWindow?: PluginWindowApi } }).electronAPI
    ?.pluginWindow;
  if (!api?.setHotkeys) return [];
  try {
    const r = await api.setHotkeys(pluginWindowHotkeySpecs(plugins, overrides));
    return r?.registered || [];
  } catch {
    return []; // 同步失败不阻断界面；下次插件/设置变化会再同步
  }
}
