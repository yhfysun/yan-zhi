/**
 * 金箍棒滚动条素材生成器（服务端版，与 scripts/build-scrollbar-materials.mjs 同一套几何）
 * ---------------------------------------------------------------------------
 * 为什么服务端也要一份：每套皮肤的金箍棒材质不同（樱粉玉金 / 霓虹钨钢 / 竹青黄铜…），
 * 27 套 × 6 张 = 162 张素材，手工写 base64 不现实且必然漂移。这里按材质配色**参数化生成**。
 *
 * 设计模型（第四版定稿，详见 skin.css 同名注释）：
 *   滚动条不是「一个物件」，是「一段材质」。一个无缝循环节拍 = [金箍带 6px][乌铁段 18px]，
 *   沿轴 repeat 平铺 → **无论 thumb 多长**都是「金箍 + 棍身 + 金箍 + 棍身」的连续棍身。
 *
 * ⚠️ 竖版 / 横版**必须分素材**：
 *   · 竖版 body：8 宽 × 24 高，沿 Y 平铺 → 瓷砖内沿 X 做金属渐变（否则平铺轴两端不同色 → 黑缝）
 *   · 横版 body：24 宽 × 8 高，沿 X 平铺 → 瓷砖内沿 Y 做金属渐变
 *   复用竖版给横条（早期错法）会在每片瓷砖接缝处出现黑缝，横条碎成「一串小方块」。
 */
import type { ScrollbarMaterial } from './scrollbar-materials.js';

export const SCROLLBAR_TILE = 24;   // 一个节拍的轴向长度
export const SCROLLBAR_THICK = 8;   // 滚动条厚度
export const SCROLLBAR_BAND = 6;    // 节拍内金箍带的长度

type Stop = readonly [number, string];

/** 金属圆柱渐变（在**垂直平铺轴**的方向上做，保证平铺轴两端同色） */
function metalGrad(id: string, c: ScrollbarMaterial['cap'], axis: 'x' | 'y'): string {
  const dir = axis === 'x' ? 'x1="0" y1="0" x2="1" y2="0"' : 'x1="0" y1="0" x2="0" y2="1"';
  const stops: Stop[] = [
    [0, c.edge],
    [0.14, c.dark],
    [0.36, c.mid],
    [0.45, c.light],
    [0.52, c.hi],
    [0.64, c.light],
    [0.86, c.dark],
    [1, c.edge],
  ];
  return `<linearGradient id="${id}" ${dir}>${stops
    .map(([o, col]) => `<stop offset="${o}" stop-color="${col}"/>`)
    .join('')}</linearGradient>`;
}

const rect = (a: Record<string, string | number>): string =>
  `<rect ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`;

/**
 * 棍身瓷砖（含金箍带，无缝循环）。
 * 竖版：金箍带在**顶端**（水平条）；横版：金箍带在**左端**（竖直条）。
 * 两端同色由「平铺轴上不加任何渐变」保证 —— 金属渐变只在垂直轴做。
 */
function bodyTile(m: ScrollbarMaterial, dir: 'v' | 'h'): string {
  const w = dir === 'v' ? SCROLLBAR_THICK : SCROLLBAR_TILE;
  const h = dir === 'v' ? SCROLLBAR_TILE : SCROLLBAR_THICK;
  const axis: 'x' | 'y' = dir === 'v' ? 'x' : 'y';
  const parts: string[] = [
    rect({ x: 0, y: 0, width: w, height: h, fill: `url(#gb)`, }),
  ];
  // 金箍带
  if (dir === 'v') {
    parts.push(rect({ x: 0, y: 0, width: w, height: SCROLLBAR_BAND, fill: 'url(#gc)' }));
    parts.push(rect({ x: 0, y: '0.55', width: w, height: '0.75', fill: m.cap.edge, opacity: '0.9' }));
    parts.push(rect({ x: 0, y: SCROLLBAR_BAND - 1.3, width: w, height: '0.75', fill: m.cap.edge, opacity: '0.9' }));
    // 金箍带下沿的高光反射线：让金/铁衔接不生硬
    parts.push(rect({ x: 0, y: SCROLLBAR_BAND + 0.2, width: w, height: '0.5', fill: m.cap.hi, opacity: '0.22' }));
  } else {
    parts.push(rect({ x: 0, y: 0, width: SCROLLBAR_BAND, height: h, fill: 'url(#gc)' }));
    parts.push(rect({ x: '0.55', y: 0, width: '0.75', height: h, fill: m.cap.edge, opacity: '0.9' }));
    parts.push(rect({ x: SCROLLBAR_BAND - 1.3, y: 0, width: '0.75', height: h, fill: m.cap.edge, opacity: '0.9' }));
    parts.push(rect({ x: SCROLLBAR_BAND + 0.2, y: 0, width: '0.5', height: h, fill: m.cap.hi, opacity: '0.22' }));
  }
  // 注意：id 用固定名 gb/gc —— 每张 SVG 是独立文档，不会串
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>${metalGrad('gb', m.body, axis)}${metalGrad('gc', m.cap, axis)}</defs>` +
    parts.join('') +
    `</svg>`;
}

/** thumb 两端收口的金箍端头（长度 = 金箍带 6px，与 body 起始端同色 → 拼接自然） */
function endCap(m: ScrollbarMaterial, dir: 'v' | 'h', flip: boolean): string {
  const w = dir === 'v' ? SCROLLBAR_THICK : SCROLLBAR_BAND;
  const h = dir === 'v' ? SCROLLBAR_BAND : SCROLLBAR_THICK;
  const axis: 'x' | 'y' = dir === 'v' ? 'x' : 'y';
  const parts: string[] = [
    rect({ x: 0, y: 0, width: w, height: h, rx: 3, fill: 'url(#ge)' }),
  ];
  if (dir === 'v') {
    parts.push(rect({ x: 0, y: flip ? h - 1.3 : 0.55, width: w, height: '0.75', fill: m.cap.edge, opacity: '0.9' }));
  } else {
    parts.push(rect({ x: flip ? w - 1.3 : 0.55, y: 0, width: '0.75', height: h, fill: m.cap.edge, opacity: '0.9' }));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>${metalGrad('ge', m.cap, axis)}</defs>` +
    parts.join('') +
    `</svg>`;
}

const toUri = (svg: string): string =>
  `url("data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}")`;

export interface ScrollbarAssets {
  scrollbarVBody: string;
  scrollbarVCap: string;
  scrollbarVCapFlip: string;
  scrollbarHBody: string;
  scrollbarHCap: string;
  scrollbarHCapFlip: string;
}

/** 由材质配色生成一套 6 张滚动条素材（竖 3 + 横 3） */
export function buildScrollbarAssets(m: ScrollbarMaterial): ScrollbarAssets {
  return {
    scrollbarVBody: toUri(bodyTile(m, 'v')),
    scrollbarVCap: toUri(endCap(m, 'v', false)),
    scrollbarVCapFlip: toUri(endCap(m, 'v', true)),
    scrollbarHBody: toUri(bodyTile(m, 'h')),
    scrollbarHCap: toUri(endCap(m, 'h', false)),
    scrollbarHCapFlip: toUri(endCap(m, 'h', true)),
  };
}
