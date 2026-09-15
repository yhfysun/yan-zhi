/**
 * 上下文窗口（contextWindow）档位与格式化 —— 单一约定。
 *
 * - 存储层一律存 token 数（与后端 `model.context_window`、`DEFAULT_CONTEXT_WINDOW` 一致）
 * - UI 展示统一走 formatContextWindow；模型配置页与模型选择器 hover 面板共用同一份口径
 */

/** 后端建模型时的默认上下文窗口：1M */
export const DEFAULT_CONTEXT_WINDOW = 1048576;

/**
 * 常用档位（token）。默认档 1M 与后端建模型的默认值一致，
 * 前后各留一档：小模型（本地 32K/64K）可收紧以免压缩不触发直接超限，大窗口模型沿用 1M。
 */
export const CONTEXT_WINDOW_PRESETS: Array<{ tokens: number; label: string }> = [
  { tokens: 32768, label: '32K' },
  { tokens: 65536, label: '64K' },
  { tokens: 131072, label: '128K' },
  { tokens: 262144, label: '256K' },
  { tokens: 524288, label: '512K' },
  { tokens: 1048576, label: '1M' },
];

/** token 数 → 展示文案（262144 → "256K"，1048576 → "1M"；非整 K 保留原值） */
export function formatContextWindow(n?: number): string {
  const v = Number(n) > 0 ? Number(n) : DEFAULT_CONTEXT_WINDOW;
  if (v >= 1048576) {
    const m = v / 1048576;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (v >= 1024) return `${Math.round(v / 1024)}K`;
  return String(v);
}

/** token 数 → K 值（面板自定义输入框回填用） */
export function toContextWindowK(n?: number): number {
  const v = Number(n) > 0 ? Number(n) : DEFAULT_CONTEXT_WINDOW;
  return Math.max(1, Math.round(v / 1024));
}
