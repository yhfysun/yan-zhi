// 指标块 → PNG（Word「图片模式」用）
//
// 预览里的指标是圆角卡片，导成 Word 表格会明显掉档次；图片模式直接把卡片画出来，
// 与屏幕上看到的一致。布局与预览的 flex-wrap 对齐：每行最多 3 个，等宽。

import type { DocumentMetric } from './document-types';

const CARD_MIN_WIDTH = 140;
const CARD_HEIGHT = 84;
const GAP = 12;
const PADDING = 20;
const MAX_PER_ROW = 3;
const MAX_CARDS = 12;

export interface MetricsLayout {
  width: number;
  height: number;
  cards: Array<{ x: number; y: number; w: number; h: number }>;
}

/** 纯布局计算（无 DOM 依赖，便于单测）：返回画布尺寸与每张卡片的位置 */
export function layoutMetrics(count: number, contentWidth = 624): MetricsLayout {
  const n = Math.max(0, Math.min(MAX_CARDS, Math.floor(count) || 0));
  if (!n) return { width: contentWidth, height: 0, cards: [] };
  const inner = Math.max(CARD_MIN_WIDTH, contentWidth - PADDING * 2);
  const perRow = Math.max(
    1,
    Math.min(n, MAX_PER_ROW, Math.floor((inner + GAP) / (CARD_MIN_WIDTH + GAP))),
  );
  const cardW = (inner - GAP * (perRow - 1)) / perRow;
  const rows = Math.ceil(n / perRow);
  const cards: MetricsLayout['cards'] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    cards.push({
      x: PADDING + col * (cardW + GAP),
      y: PADDING + row * (CARD_HEIGHT + GAP),
      w: cardW,
      h: CARD_HEIGHT,
    });
  }
  return {
    width: contentWidth,
    height: PADDING * 2 + rows * CARD_HEIGHT + (rows - 1) * GAP,
    cards,
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const s = String(text || '');
  if (ctx.measureText(s).width <= maxWidth) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${s.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${s.slice(0, lo)}…` : '';
}

/** 把指标卡片画成 PNG dataURL；无 DOM（单测/SSR）或没有指标时返回空串 */
export function metricsToPng(
  items: DocumentMetric[],
  opts: { contentWidth?: number; scale?: number } = {},
): string {
  const list = (items || []).filter((m) => m && (m.label || m.value)).slice(0, MAX_CARDS);
  if (!list.length || typeof document === 'undefined') return '';

  const contentWidth = opts.contentWidth ?? 624;
  const scale = opts.scale ?? 2;
  const { width, height, cards } = layoutMetrics(list.length, contentWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const font = '"Microsoft YaHei", "PingFang SC", -apple-system, sans-serif';
  ctx.textBaseline = 'top';

  list.forEach((m, i) => {
    const c = cards[i];
    const innerW = c.w - 24;
    roundRect(ctx, c.x, c.y, c.w, c.h, 10);
    ctx.fillStyle = '#f5f7fa';
    ctx.fill();
    ctx.strokeStyle = '#e4e7ed';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#6b7280';
    ctx.font = `12px ${font}`;
    ctx.fillText(ellipsize(ctx, m.label, innerW), c.x + 12, c.y + 12);

    ctx.fillStyle = '#111827';
    ctx.font = `bold 22px ${font}`;
    ctx.fillText(ellipsize(ctx, m.value, innerW), c.x + 12, c.y + 34);

    if (m.hint) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = `11px ${font}`;
      ctx.fillText(ellipsize(ctx, m.hint, innerW), c.x + 12, c.y + 62);
    }
  });

  return canvas.toDataURL('image/png');
}
