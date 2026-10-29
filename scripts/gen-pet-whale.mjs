// 原创宠物「大肥鱼（feiyu）」精灵图集生成器（2026-10-29）
//
// 用户想要"DeepSeek 那只"——即蓝色小鲸鱼的气质。游戏/品牌角色不能直接打包，
// 这里画一只**原创**的圆胖蓝鲸：蓝身、浅色肚皮、两个小鳍、头顶喷水，
// 轮廓与五官都是自己的，只借用"蓝色胖鲸鱼"这个题材。
//
// 输出：packages/ui/src/assets/pet-packs/feiyu-spritesheet.webp
//   192×208/帧、8 列 × 9 行（与现有 petdex 包同格式）
//   行语义：0 idle / 1 walking / 2 running / 3 ready / 4 needs-input /
//           5 error / 6 paused(nap) / 7 look / 8 未用
//
// 运行：node scripts/gen-pet-whale.mjs [--preview]
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'packages/ui/src/assets/pet-packs/feiyu-spritesheet.webp');
const PREVIEW = resolve(ROOT, 'packages/ui/src/assets/pet-packs/_feiyu-preview.png');

const FW = 192, FH = 208;
const COLS = 8, ROWS = 9;

const CX = 96, CY = 122;
const RX = 76, RY = 58;

const C = {
  line: '#22306A',
  body: '#4D6BFE',
  bodyDark: '#2F4BD8',
  belly: '#E9F0FF',
  ink: '#101A3A',
  iris: '#1B2E7A',
  blush: '#FF9DB1',
  water: '#8FD3FF',
  warn: '#FFB43B',
};

/** 每行的帧数与姿态参数：i=帧序号, n=本行有效帧数 */
const ROWS_CFG = {
  0: { n: 6 }, // idle
  1: { n: 8 }, // walking（摇摆挪步）
  2: { n: 8 }, // running（冲刺）
  3: { n: 4 }, // ready（跳起欢呼）
  4: { n: 5 }, // needs-input（举牌）
  5: { n: 8 }, // error（翻白眼冒汗）
  6: { n: 6 }, // paused / nap
  7: { n: 6 }, // look（左右张望）
};

function pose(row, i, n) {
  const t = (i / n) * Math.PI * 2;
  const p = {
    dx: 0, dy: 0, rot: 0, sx: 1, sy: 1,
    eyeDx: 0, blink: false, wink: false, error: false, mouth: 0,
    finL: 0, finR: 0, tail: 0, spout: 0, extra: '',
  };
  if (row === 0) {
    // 游动的基准循环：身体左右轻摆 + 尾鳍甩动 + 双鳍划水，水柱周期上冒
    const s = Math.sin(t), s2 = Math.sin(t * 2);
    p.dy = s * 3 - 2;
    p.rot = s * 4;
    p.dx = s * 2;
    p.sy = 1 + s2 * 0.02;
    p.sx = 1 - s2 * 0.02;
    p.tail = s2 * 18;
    p.finL = s2 * 10; p.finR = -s2 * 10;
    p.eyeDx = s * 1.5;
    p.spout = (i / n) * 1.1;
    p.blink = i === 4;
    p.extra = bubbleLane(i, n);
  } else if (row === 1) {
    // 游着挪步：摆幅更大、尾巴甩得更狠
    const s = Math.sin(t), s2 = Math.sin(t * 2);
    p.dy = Math.abs(s2) * -4 - 2;
    p.rot = s * 6;
    p.dx = s * 4;
    p.tail = -s2 * 26;
    p.finL = s2 * 13; p.finR = -s2 * 13;
    p.eyeDx = s * 2;
    p.spout = (i / n) * 1.1;
    p.extra = bubbleLane(i, n);
  } else if (row === 2) {
    const s = Math.sin(t);
    p.dy = Math.abs(Math.sin(t * 2)) * -6;
    p.rot = s * 9;
    p.dx = s * 4;
    p.sx = 1 + Math.abs(s) * 0.05;
    p.sy = 1 - Math.abs(s) * 0.05;
    p.tail = -s * 22;
    p.finL = s * 16; p.finR = -s * 16;
    p.mouth = 1;
    p.extra = `<g stroke="${C.water}" stroke-width="5" stroke-linecap="round" opacity="${0.3 + Math.abs(s) * 0.3}">
      <line x1="12" y1="98" x2="34" y2="98"/><line x1="6" y1="122" x2="30" y2="122"/><line x1="14" y1="146" x2="34" y2="146"/></g>`;
  } else if (row === 3) {
    const ys = [0, -14, -20, -7];
    p.dy = ys[i] || 0;
    const sq = [1, 1.04, 1.07, 0.95][i] || 1;
    p.sx = sq; p.sy = 2 - sq;
    p.finL = -22; p.finR = 22;
    p.tail = [0, 16, 22, -12][i] || 0;
    p.mouth = 1;
    p.spout = [0, 0.5, 1, 0.7][i] || 0;
  } else if (row === 4) {
    p.rot = -6;
    p.dx = -3;
    p.eyeDx = 3;
    p.finR = 22 + Math.sin(t) * 6;
    p.tail = Math.sin(t) * 6;
    p.extra = `<g transform="translate(150 56)">
      <rect x="-14" y="-16" width="28" height="28" rx="9" fill="#FFF4D6" stroke="${C.line}" stroke-width="3"/>
      <path d="M0 4 L0 -7" stroke="${C.warn}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="0" cy="7" r="2.6" fill="${C.warn}"/></g>`;
  } else if (row === 5) {
    p.sx = 1.07; p.sy = 0.91;
    p.dx = Math.sin(t * 3) * 2.5;
    p.error = true;
    p.mouth = -1;
    p.finL = -14; p.finR = 14;
    p.tail = Math.sin(t * 3) * 10;
    p.extra = `<g fill="${C.water}" opacity=".65">
      <path d="M34 62 q6 8 0 14 q-6 -6 0 -14 Z"/><path d="M156 66 q6 8 0 14 q-6 -6 0 -14 Z"/></g>`;
  } else if (row === 6) {
    p.sy = 0.93; p.sx = 1.06;
    p.dy = 3;
    p.blink = true;
    p.finL = 8; p.finR = -8;
    p.tail = Math.sin(t) * 4;
    p.spout = 0.15;
    p.extra = `<g fill="${C.water}" opacity=".5">
      <text x="152" y="60" font-family="sans-serif" font-size="34" font-weight="700" fill="${C.water}">z</text>
      <text x="168" y="44" font-family="sans-serif" font-size="22" font-weight="700" fill="${C.water}">z</text></g>`;
  } else if (row === 7) {
    const s = Math.sin(t);
    p.eyeDx = s * 6;
    p.dx = s * 3;
    p.rot = s * 2.5;
    p.tail = -s * 8;
    p.wink = i === 3;
  }
  return p;
}

function eye(cx, cy, p, side) {
  if (p.error) {
    return `<g stroke="${C.line}" stroke-width="4.5" stroke-linecap="round">
      <line x1="${cx - 12}" y1="${cy - 12}" x2="${cx + 12}" y2="${cy + 12}"/>
      <line x1="${cx + 12}" y1="${cy - 12}" x2="${cx - 12}" y2="${cy + 12}"/></g>`;
  }
  if (p.blink) {
    return `<path d="M${cx - 15} ${cy} Q${cx} ${cy + 9} ${cx + 15} ${cy}" fill="none" stroke="${C.line}" stroke-width="4.5" stroke-linecap="round"/>`;
  }
  if (p.wink && side === 'r') {
    return `<path d="M${cx - 15} ${cy + 2} Q${cx} ${cy - 10} ${cx + 14} ${cy + 4}" fill="none" stroke="${C.line}" stroke-width="4.5" stroke-linecap="round"/>`;
  }
  const ix = cx + p.eyeDx;
  return `<g>
    <ellipse cx="${cx}" cy="${cy}" rx="15" ry="18" fill="#FFFFFF" stroke="${C.line}" stroke-width="3"/>
    <ellipse cx="${ix}" cy="${cy + 1}" rx="9.5" ry="11.5" fill="${C.iris}"/>
    <ellipse cx="${ix}" cy="${cy + 2}" rx="4.8" ry="6.2" fill="${C.ink}"/>
    <circle cx="${ix - 4}" cy="${cy - 5}" r="3.4" fill="#FFFFFF"/>
  </g>`;
}

/** 头顶喷水：t=0..1 是这一轮水柱的进度（0 刚喷出，1 落回） */
function spoutLayer(t) {
  if (!t) return '';
  const k = Math.min(1, t);
  const h = 14 + k * 40;
  const o = (0.98 - k * 0.62).toFixed(2);
  const spread = 6 + k * 13;
  return `<g opacity="${o}" transform="translate(96 ${CY - RY + 6})">
    <ellipse cx="0" cy="2" rx="${(10 + k * 6).toFixed(1)}" ry="4.2" fill="${C.water}" opacity=".9"/>
    <path d="M0 0 C-6 -${h * 0.45} -10 -${h * 0.75} -7 -${h} M0 0 C6 -${h * 0.45} 10 -${h * 0.75} 7 -${h}"
      fill="none" stroke="${C.water}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="${(-spread).toFixed(1)}" cy="${(-h + 4).toFixed(1)}" r="5.4" fill="${C.water}"/>
    <circle cx="${spread.toFixed(1)}" cy="${(-h + 4).toFixed(1)}" r="5.4" fill="${C.water}"/>
    <circle cx="0" cy="${(-h - 8).toFixed(1)}" r="6.4" fill="${C.water}"/>
    <circle cx="${(-spread * 0.45).toFixed(1)}" cy="${(-h - 14).toFixed(1)}" r="3.4" fill="${C.water}"/>
    <circle cx="${(spread * 0.45).toFixed(1)}" cy="${(-h - 12).toFixed(1)}" r="3" fill="${C.water}"/>
  </g>`;
}

/** 水里的气泡：沿左侧上浮，帧间错位形成流动感 */
function bubbleLane(i, n) {
  const k = i / n;
  const bub = (x, y0, r, phase) => {
    const yy = y0 - ((k + phase) % 1) * 58;
    return `<circle cx="${x}" cy="${yy.toFixed(1)}" r="${r}" fill="#BFE4FF" opacity=".8"/>`;
  };
  return `<g>${bub(24, 178, 3.4, 0)}${bub(37, 188, 2.6, 0.45)}${bub(15, 170, 2.2, 0.75)}</g>`;
}

function frameSVG(row, col) {
  const cfg = ROWS_CFG[row] || { n: 0 };
  if (!cfg.n || col >= cfg.n) return '';
  const p = pose(row, col, cfg.n);
  const gid = `wh-${row}-${col}`;

  const finL = `<ellipse cx="22" cy="148" rx="14" ry="22" fill="${C.bodyDark}" stroke="${C.line}" stroke-width="4"
    transform="translate(0 ${p.finL}) rotate(-26 22 148)"/>`;
  const finR = `<ellipse cx="170" cy="148" rx="14" ry="22" fill="${C.bodyDark}" stroke="${C.line}" stroke-width="4"
    transform="translate(0 ${p.finR}) rotate(26 170 148)"/>`;

  // 尾鳍：从身侧向右伸出的扇形尾，随 p.tail 摆动
  const tail = `<g transform="translate(150 126) rotate(${(p.tail * 0.6).toFixed(1)})">
    <ellipse cx="16" cy="-16" rx="24" ry="12" fill="${C.bodyDark}" stroke="${C.line}" stroke-width="4" transform="rotate(-26)"/>
    <ellipse cx="16" cy="16" rx="24" ry="12" fill="${C.bodyDark}" stroke="${C.line}" stroke-width="4" transform="rotate(26)"/>
  </g>`;

  const mouth = p.mouth < 0
    ? `<path d="M80 150 Q96 142 112 150" fill="none" stroke="${C.line}" stroke-width="4" stroke-linecap="round"/>`
    : p.mouth > 0
      ? `<path d="M82 146 Q96 162 110 146" fill="none" stroke="${C.line}" stroke-width="4" stroke-linecap="round"/>`
      : `<path d="M88 148 Q96 154 104 148" fill="none" stroke="${C.line}" stroke-width="3.5" stroke-linecap="round"/>`;

  return `<g transform="translate(${col * FW} ${row * FH})">
    <defs><clipPath id="${gid}">
      <ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}"/>
    </clipPath></defs>
    <ellipse cx="96" cy="196" rx="${54 * p.sx}" ry="9" fill="rgba(0,0,0,.16)"/>
    ${p.extra}
    ${spoutLayer(p.spout)}
    <g transform="translate(${p.dx} ${p.dy}) rotate(${p.rot} ${CX} ${CY})">
      ${tail}
      ${finL}${finR}
      <g transform="translate(${CX} ${CY}) scale(${p.sx} ${p.sy}) translate(${-CX} ${-CY})">
        <ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}" fill="${C.body}"/>
        <g clip-path="url(#${gid})">
          <ellipse cx="${CX}" cy="${CY + 40}" rx="52" ry="30" fill="${C.belly}"/>
          <ellipse cx="58" cy="88" rx="22" ry="14" fill="rgba(255,255,255,.18)"/>
          <path d="M96 64 q10 6 10 16" fill="none" stroke="${C.bodyDark}" stroke-width="3" stroke-linecap="round" opacity=".7"/>
        </g>
        <ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}" fill="none" stroke="${C.line}" stroke-width="5"/>
        ${eye(70, 112, p, 'l')}
        ${eye(122, 112, p, 'r')}
        <circle cx="44" cy="138" r="8.5" fill="${C.blush}" opacity=".8"/>
        <circle cx="148" cy="138" r="8.5" fill="${C.blush}" opacity=".8"/>
        ${mouth}
      </g>
    </g>
  </g>`;
}

async function main() {
  const parts = [];
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) parts.push(frameSVG(row, col));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FW * COLS}" height="${FH * ROWS}" viewBox="0 0 ${FW * COLS} ${FH * ROWS}">${parts.join('')}</svg>`;
  mkdirSync(dirname(OUT), { recursive: true });
  await sharp(Buffer.from(svg)).webp({ quality: 92, effort: 6 }).toFile(OUT);
  console.log('written', OUT);

  if (process.argv.includes('--preview')) {
    const picks = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 0], [1, 3]];
    const cells = picks.map(([r, c], idx) => {
      const x = (idx % 4) * FW;
      const y = Math.floor(idx / 4) * FH;
      // frameSVG 自带 (col*FW,row*FH) 的外层位移，预览格里要抵消掉
      return `<g transform="translate(${x - c * FW} ${y - r * FH})">
      <rect x="${c * FW}" y="${r * FH}" width="${FW}" height="${FH}" fill="#F3F5F8"/>
      ${frameSVG(r, c)}
    </g>`;
    }).join('');
    const pv = `<svg xmlns="http://www.w3.org/2000/svg" width="${FW * 4}" height="${FH * 2}" viewBox="0 0 ${FW * 4} ${FH * 2}">${cells}</svg>`;
    await sharp(Buffer.from(pv)).png().toFile(PREVIEW);
    console.log('preview', PREVIEW);
  }
}

await main();
