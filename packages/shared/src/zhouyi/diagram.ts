// 周易测算纯函数库 —— 图形数据转换：ZhouyiBlock → ZhouyiShape[]（纯数据，由前端画 SVG）。
// 坐标空间约定：680 × 460（左上原点，y 向下）。无 IO、无随机。

import type { ZhouyiBlock } from './types';
import { ZHOUYI_TRIGRAM_INFO, ZHOUYI_LUOSHU_GRID } from './tables';
import type { ZhouyiTrigram } from './types';

/** 单条图形指令（前端按 SVG 语义渲染：line 直线、rect 矩形、circle 圆、text 文本） */
export type ZhouyiShape =
  | { kind:'line'; x1:number; y1:number; x2:number; y2:number; color?:string; strokeWidth?:number; dashed?:boolean }
  | { kind:'rect'; x:number; y:number; w:number; h:number; fill?:string; stroke?:string }
  | { kind:'circle'; cx:number; cy:number; r:number; fill?:string; stroke?:string }
  | { kind:'text'; x:number; y:number; text:string; color?:string; fontSize?:number; anchor?:'start'|'middle'|'end'; bold?:boolean };

const INK = '#333333';
const YANG = '#2b2b2b';
const YIN = '#888888';
const MOVING = '#c0392b';
const SHENG = '#2e7d32';
const KE = '#b71c1c';
const LIGHT = '#f5f2e8';

const txt = (x:number, y:number, text:string, o:Partial<Extract<ZhouyiShape, { kind:'text' }>> = {}): ZhouyiShape =>
  ({ kind:'text', x, y, text, color:INK, fontSize:16, anchor:'middle', ...o });

/** 六爻卦画：6 条横线自下而上，阳爻一条长线、阴爻两段短线，动爻标圆点 */
function hexagramShapes(block:Extract<ZhouyiBlock, { kind:'hexagram' }>): ZhouyiShape[] {
  const out: ZhouyiShape[] = [];
  const cx = 340, halfW = 140, gap = 34, yBottom = 360;
  if (block.caption) out.push(txt(cx, 46, block.caption, { fontSize:18, bold:true }));
  for (let i = 0; i < 6; i++) { // 自下而上：i=0 为初爻
    const v = block.lines[i];
    const y = yBottom - i * gap;
    if (v === 1) out.push({ kind:'line', x1:cx - halfW, y1:y, x2:cx + halfW, y2:y, color:YANG, strokeWidth:5 });
    else {
      out.push({ kind:'line', x1:cx - halfW, y1:y, x2:cx - 14, y2:y, color:YIN, strokeWidth:5 });
      out.push({ kind:'line', x1:cx + 14, y1:y, x2:cx + halfW, y2:y, color:YIN, strokeWidth:5 });
    }
    if (block.moving === i + 1) out.push({ kind:'circle', cx:cx + halfW + 18, cy:y, r:7, fill:MOVING });
  }
  if (block.moving) out.push(txt(cx + halfW + 18, yBottom + 24, '动爻', { color:MOVING, fontSize:13 }));
  return out;
}

/** 八卦方位圆图：8 卦 + 卦画 + 方位标签（传统地图向：南上北下、东左西右） */
function baguaShapes(block:Extract<ZhouyiBlock, { kind:'bagua' }>): ZhouyiShape[] {
  const out: ZhouyiShape[] = [];
  const cx = 340, cy = 236;
  out.push({ kind:'circle', cx, cy, r:150, stroke:INK });
  out.push({ kind:'circle', cx, cy, r:70, stroke:'#bbbbbb' });
  out.push(txt(cx, cy + 6, block.scheme === '先天' ? '先天八卦' : '后天八卦', { fontSize:15 }));
  // 方位 → 屏幕位置（南上北下、东左西右）
  const pos: Record<string, [number, number]> = {
    南:[cx, cy - 150], 东南:[cx - 106, cy - 106], 东:[cx - 150, cy], 东北:[cx - 106, cy + 106],
    北:[cx, cy + 150], 西北:[cx + 106, cy + 106], 西:[cx + 150, cy], 西南:[cx + 106, cy - 106],
  };
  const trigrams = Object.keys(ZHOUYI_TRIGRAM_INFO) as ZhouyiTrigram[];
  for (const g of trigrams) {
    const info = ZHOUYI_TRIGRAM_INFO[g];
    const [x, y] = pos[info.houtian.replace('方', '')];
    const label = block.scheme === '先天' ? `${g}（${xiantianDir(g)}）` : `${g}（${info.houtian}）`;
    out.push(txt(x, y - 22, label, { fontSize:15, bold:true }));
    // 迷你卦画（三短线，自下而上）
    for (let k = 0; k < 3; k++) {
      const v = info.lines[k];
      const yy = y - k * 7 + 8;
      if (v === 1) out.push({ kind:'line', x1:x - 22, y1:yy, x2:x + 22, y2:yy, color:YANG, strokeWidth:3 });
      else {
        out.push({ kind:'line', x1:x - 22, y1:yy, x2:x - 6, y2:yy, color:YIN, strokeWidth:3 });
        out.push({ kind:'line', x1:x + 6, y1:yy, x2:x + 22, y2:yy, color:YIN, strokeWidth:3 });
      }
    }
    out.push(txt(x, y + 34, info.houtian, { fontSize:12, color:'#777777' }));
  }
  return out;
}
function xiantianDir(g:ZhouyiTrigram): string {
  const map: Record<string, string> = { 乾:'南', 兑:'东南', 离:'东', 震:'东北', 巽:'西南', 坎:'西', 艮:'西北', 坤:'北' };
  return map[g];
}

/** 五行生克五点环形 + 箭头（相生环连线为绿、相克环连线为红） */
function wuxingShapes(block:Extract<ZhouyiBlock, { kind:'wuxing' }>): ZhouyiShape[] {
  const out: ZhouyiShape[] = [];
  const cx = 340, cy = 236, r = 128;
  const order: Array<'金'|'木'|'水'|'火'|'土'> = ['木','火','土','金','水']; // 顺时针为相生
  const pt = (i:number): [number, number] => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  };
  const arrow = (from:[number, number], to:[number, number], color:string, inset:number, mode:'生'|'克'): ZhouyiShape => {
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const len = Math.hypot(dx, dy);
    const shrink = inset / len;
    return { kind:'line', x1:from[0] + dx * shrink, y1:from[1] + dy * shrink, x2:to[0] - dx * shrink, y2:to[1] - dy * shrink, color, strokeWidth:mode === '生' ? 3 : 1.5, dashed:mode === '克' };
  };
  // 相生环（实线）
  for (let i = 0; i < 5; i++) out.push(arrow(pt(i), pt((i + 1) % 5), SHENG, 40, '生'));
  // 相克环（虚线五角星）
  for (let i = 0; i < 5; i++) out.push(arrow(pt(i), pt((i + 2) % 5), KE, 40, '克'));
  for (let i = 0; i < 5; i++) {
    const [x, y] = pt(i);
    out.push({ kind:'circle', cx:x, cy:y, r:22, fill:LIGHT, stroke:INK });
    out.push(txt(x, y + 7, order[i], { fontSize:18, bold:true }));
  }
  out.push(txt(cx, cy - 10, block.mode === '生' ? '相生环（实线）' : '相生 + 相克', { fontSize:14, color:SHENG }));
  out.push(txt(cx, cy + 12, '相克环（红色虚线）', { fontSize:14, color:KE }));
  out.push(txt(cx, 440, `${block.mode === '生' ? '相生：木→火→土→金→水→木' : '相克：木→土→水→火→金→木'}`, { fontSize:13, color:'#666666' }));
  return out;
}

/** 河图：1–10 点数分方位（北一六、南二七、东三八、西四九、中五十；奇数白圈、偶数黑点） */
function hetuShapes(): ZhouyiShape[] {
  const out: ZhouyiShape[] = [];
  const cx = 340, cy = 236;
  out.push({ kind:'rect', x:cx - 220, y:cy - 170, w:440, h:340, fill:'#fffcf5', stroke:'#cccccc' });
  const dotRow = (x:number, y:number, n:number, filled:boolean): void => {
    const r = 7, gap = 19;
    for (let i = 0; i < n; i++) {
      out.push({ kind:'circle', cx:x - ((n - 1) * gap) / 2 + i * gap, cy:y, r, fill:filled ? '#222222' : '#fffcf5', stroke:'#222222' });
    }
  };
  // 北（下）：1 白 + 6 黑；南（上）：2 黑 + 7 白；东（左）：3 白 + 8 黑；西（右）：4 黑 + 9 白；中：5 白 + 10 黑
  dotRow(cx, cy + 120, 1, false); dotRow(cx, cy + 145, 6, true);
  dotRow(cx, cy - 120, 2, true); dotRow(cx, cy - 145, 7, false);
  dotRow(cx - 130, cy, 3, false); dotRow(cx - 130, cy + 26, 8, true);
  dotRow(cx + 130, cy, 4, true); dotRow(cx + 130, cy + 26, 9, false);
  dotRow(cx, cy - 12, 5, false); dotRow(cx, cy + 14, 10, true);
  const label = (x:number, y:number, s:string): void => { out.push(txt(x, y, s, { fontSize:13, color:'#666666' })); };
  label(cx, cy + 170, '北：一六（水）'); label(cx, cy - 172, '南：二七（火）');
  label(cx - 130, cy - 40, '东：三八（木）'); label(cx + 130, cy - 40, '西：四九（金）');
  label(cx, cy + 40, '中：五十（土）');
  return out;
}

/** 洛书：九宫 1–9（戴九履一、左三右七、二四为肩、六八为足、五居中） */
function luoshuShapes(): ZhouyiShape[] {
  const out: ZhouyiShape[] = [];
  const size = 90, ox = 205, oy = 80;
  for (let i = 0; i < 9; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const x = ox + col * size, y = oy + row * size;
    out.push({ kind:'rect', x, y, w:size, h:size, fill:i === 4 ? '#efe9d9' : LIGHT, stroke:INK });
    out.push(txt(x + size / 2, y + size / 2 + 8, String(ZHOUYI_LUOSHU_GRID[i]), { fontSize:28, bold:true }));
  }
  out.push(txt(ox + (size * 3) / 2, oy + size * 3 + 30, '戴九履一，左三右七，二四为肩，六八为足，五居中宫', { fontSize:13, color:'#666666' }));
  return out;
}

/** 九宫飞星 3×3 格 + 数字（入参为洛书轨迹序：中5→乾6→兑7→艮8→离9→坎1→坤2→震3→巽4） */
function jiugongShapes(block:Extract<ZhouyiBlock, { kind:'jiugong' }>): ZhouyiShape[] {
  const out: ZhouyiShape[] = [];
  // 健壮性契约：非法/空数字走洛书标准盘兜底，不炸（UI 层漏校验时仍可渲染）
  const nums = Array.isArray(block.numbers) && block.numbers.length === 9
    ? block.numbers
    : [4, 9, 2, 3, 5, 7, 8, 1, 6];
  const size = 90, ox = 205, oy = 80;
  const traj = [5, 6, 7, 8, 9, 1, 2, 3, 4]; // 轨迹序对应的宫位数
  const palaceValue = new Map<number, number>();
  nums.forEach((v, i) => palaceValue.set(traj[i], v));
  for (let i = 0; i < 9; i++) {
    const palace = ZHOUYI_LUOSHU_GRID[i];
    const col = i % 3, row = Math.floor(i / 3);
    const x = ox + col * size, y = oy + row * size;
    out.push({ kind:'rect', x, y, w:size, h:size, fill:palace === 5 ? '#efe9d9' : LIGHT, stroke:INK });
    out.push(txt(x + size / 2, y + size / 2 + 9, String(palaceValue.get(palace)), { fontSize:26, bold:true }));
    out.push(txt(x + size / 2, y + 18, String(palace), { fontSize:11, color:'#999999' }));
  }
  out.push(txt(ox + (size * 3) / 2, oy + size * 3 + 30, '大字为飞星数，小字为宫位数（洛书轨迹序入中顺飞）', { fontSize:13, color:'#666666' }));
  return out;
}

/** 表格：转行列矩形与文本 */
function tableShapes(block:Extract<ZhouyiBlock, { kind:'table' }>): ZhouyiShape[] {
  const out: ZhouyiShape[] = [];
  const cols = Math.max(block.head.length, ...block.rows.map((r) => r.length));
  const colW = 680 / cols, rowH = 34, oy = 70;
  for (let c = 0; c < cols; c++) out.push({ kind:'rect', x:c * colW, y:oy, w:colW, h:rowH, fill:'#e5dfc9', stroke:INK });
  block.head.forEach((h, c) => out.push(txt(c * colW + colW / 2, oy + 23, h, { fontSize:15, bold:true })));
  block.rows.forEach((row, ri) => {
    const y = oy + (ri + 1) * rowH;
    for (let c = 0; c < cols; c++) out.push({ kind:'rect', x:c * colW, y, w:colW, h:rowH, fill:ri % 2 === 0 ? '#fffcf5' : '#f6f1e2', stroke:'#aaaaaa' });
    row.forEach((cell, c) => out.push(txt(c * colW + colW / 2, y + 23, cell ?? '', { fontSize:14 })));
  });
  return out;
}

/** ZhouyiBlock → 纯数据图形指令数组（由前端画 SVG；坐标空间 680×460） */
export function zhouyiBlockToShapes(block:ZhouyiBlock): ZhouyiShape[] {
  switch (block.kind) {
    case 'hexagram': return hexagramShapes(block);
    case 'bagua': return baguaShapes(block);
    case 'wuxing': return wuxingShapes(block);
    case 'hetu': return hetuShapes();
    case 'luoshu': return luoshuShapes();
    case 'jiugong': return jiugongShapes(block);
    case 'table': return tableShapes(block);
    default: {
      const b: never = block;
      throw new Error(`未知图块类型：${JSON.stringify(b)}`);
    }
  }
}
