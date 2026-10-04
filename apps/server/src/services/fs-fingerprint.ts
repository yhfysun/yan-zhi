// 「mtime+size 指纹缓存」唯一实现（横切收敛 P0，2026-10-04）
//
// ★ 为什么必须单点：目录资产（项目技能 / 项目规则 / 后续任何 .yan-zhi 目录资产）
//   都需要"每轮 ReAct 构建提示词不重读盘"的缓存 —— 此前 project-skills 与
//   loadProjectRules 各写一份 mtime+size 指纹逻辑，已构成第三次复刻
//   （第一次是 loadProjectRules 自身）。凡是"同一件事多入口各写一遍"必漂移，
//   判据统一放这里。

import { statSync } from 'node:fs';

/**
 * 目录条目指纹：`key:mtimeMs:size` 用 `|` 连接；读不到的条目标记 missing（不中断）。
 * entries 的 key 用相对名或绝对路径均可（调用方自定，指纹内保持稳定即可）。
 */
export function dirEntryFingerprint(entries: Array<{ key: string; path: string }>): string {
  return entries.map((e) => {
    try {
      const st = statSync(e.path);
      return `${e.key}:${st.mtimeMs}:${st.size}`;
    } catch {
      return `${e.key}:missing`;
    }
  }).join('|');
}

export interface FingerprintCache<T> {
  /** 指纹命中返回缓存值；未命中（或首访）跑 compute 并写缓存 */
  get: (key: string, fingerprint: string, compute: () => T) => T;
  clear: () => void;
}

/**
 * 按 key（通常为 workspaceDir）+ 指纹的进程内缓存。
 * 上限防泄漏：不同 workspaceDir 会话多了以后 Map 无限涨 —— 超上限先清空
 * （指纹缓存丢了只是重读一次盘，正确性无损；不值得上 LRU 的复杂度）。
 */
export function makeFingerprintCache<T>(maxEntries = 16): FingerprintCache<T> {
  const map = new Map<string, { fingerprint: string; value: T }>();
  return {
    get(key, fingerprint, compute) {
      const cached = map.get(key);
      if (cached && cached.fingerprint === fingerprint) return cached.value;
      const value = compute();
      if (map.size >= maxEntries) map.clear();
      map.set(key, { fingerprint, value });
      return value;
    },
    clear() { map.clear(); },
  };
}
