/**
 * 运行时插件贡献的模式 key（后装/随包插件都算，不看构建期模式表）。
 *
 * 为什么需要：`build/modes.catalog.json` 与 `scripts/select-modes.cjs` 生成的是**构建期**
 * 模式表 —— 它们不可能预知用户后来安装的 .yzp 里声明了什么模式。而授权放行
 * （license.ts 的 allowedModes）、会话校验（routes/conversations.ts）、
 * 模型工具（api-tool-executor 的 set-conversation）都以这份集合为准，
 * 漏登记的表现是「插件装了、模式能切，但随后会话落回 office / 码不放行」。
 *
 * 登记时机：插件系统初始化完成后一次，以及每次启用/停用/安装/卸载后刷新。
 * 只登记 **enabled** 插件的 contributes.mode.key —— 停用即从集合里消失。
 */
export interface RuntimeModeHost {
  list(): Array<{ state: string; manifest: { contributes?: { mode?: { key?: string } } } }>;
}

const keys = new Set<string>();

/** 用插件管理器当前状态重建集合（幂等）。 */
export function refreshRuntimeModes(mgr: RuntimeModeHost): string[] {
  keys.clear();
  for (const p of mgr.list()) {
    if (p.state !== 'enabled') continue;
    const key = p.manifest?.contributes?.mode?.key;
    if (typeof key === 'string' && key) keys.add(key);
  }
  return [...keys];
}

/** 直接写入（测试 / 特殊场景）；正常运行请用 refreshRuntimeModes。 */
export function setRuntimePluginModes(list: string[]): void {
  keys.clear();
  for (const k of list || []) if (typeof k === 'string' && k) keys.add(k);
}

/** 运行时插件贡献的模式 key（排序稳定，便于断言与下发）。 */
export function runtimePluginModes(): string[] {
  return [...keys].sort();
}

export function isRuntimeMode(mode: string): boolean {
  return keys.has(mode);
}
