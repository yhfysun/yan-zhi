// 原创宠物「团子（tuanzi）」精灵图集生成器（2026-10-29）
//
// 为什么用程序化 SVG 而不是找美术：用户想要"红蓝圆团子"那种风格，
// 但游戏里的角色是他人素材，不能打包。这里画一只**原创**的圆团子：
// 同样的"红/蓝双色 + 白脸 + 大眼 + 短手脚"气质，轮廓、接缝、五官都是自己的。
//
// 输出：packages/ui/src/assets/pet-packs/tuanzi-spritesheet.webp
//   192×208/帧、8 列 × 9 行（与现有 petdex 包同格式）
//   行语义：0 idle / 1 walking / 2 running / 3 ready / 4 needs-input /
//           5 error / 6 paused(nap) / 7 look / 8 未用
//
// 运行：node scripts/gen-pet-blob.mjs [--preview]
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'packages/ui/src/assets/pet-packs/tuanzi-spritesheet.webp');
const PREVIEW = resolve(ROOT, 'packages/ui/src/assets/pet-packs/_tuanzi-preview.png');

const FW = 192, FH = 208, COLS = 8, ROWS = 9;
const CX = 96, CY = 116, R = 68;

const C = {
  line: '#2B2B33',
  red: '#E5483F',
  redDark: '#C7352E',
  blue: '#4EA6E9',
  blueDark: '#2F7FC4',
  white: '#FFFFFF',
  ink: '#1B2540',
  iris: '#2F6BD8',
  blush: '#FF8FA3',
  shade: 'rgba(0,0,0,0.10)',
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** 每行的动效参数：i=帧序号, n=本行有效帧数 */
const ROWS_CFG = {
  0: { n: 6 }, // idle
  1: { n: 8 }, // walking
  2: { n: 8 }, // running
  3: { n: 4 }, // ready
  4: { n: 5 }, // needs-input
  5: { n: 8 }, // error
  6: { n: 6 }, // paused / nap
  7: { n: 6 }, // look
};

/** 计算一帧的姿态 */
function pose(row, i, n) {
  const t = (i / n) * Math.PI * 2;
  const p = { dy: 0, dx: 0, sx: 1, sy: 1, rot: 0, eyeDx: 0, blink: false, wink: false, error: false, mouth: 0, armL: 0, armR: 0, legL: 0, legR: 0, extra: '' };
  if (row === 0) {
    p.dy = Math.sin(t) * 2;
    p.blink = i === 3;
    p.wink = i === 5;
    p.sy = 1 + Math.sin(t) * 0.012;
    p.sx = 1 - Math.sin(t) * 0.012;
  } else if (row === 1) {
    const s = Math.sin(t);
    p.dy = Math.abs(Math.sin(t * 2)) * -3;
    p.rot = s * 4;
    p.eyeDx = s * 2;
    p.armL = s * 6;
    p.armR = -s * 6;
    p.legL = s * 5;
    p.legR = -s * 5;
  } else if (row === 2) {
    const s = Math.sin(t);
    p.dy = Math.abs(Math.sin(t * 2)) * -5;
    p.rot = s * 7;
    p.sx = 1 + Math.abs(s) * 0.04;
    p.sy = 1 - Math.abs(s) * 0.04;
    p.armL = s * 12;
    p.armR = -s * 12;
    p.legL = s * 10;
    p.legR = -s * 10;
    p.extra = `<g stroke="${C.blueDark}" stroke-width="5" stroke-linecap="round" opacity="${0.25 + Math.abs(s) * 0.25}">
      <line x1="14" y1="96" x2="34" y2="96"/><line x1="8" y1="118" x2="30" y2="118"/><line x1="16" y1="140" x2="34" y2="140"/></g>`;
  } else if (row === 3) {
    const ys = [0, -12, -18, -6];
    p.dy = ys[i] || 0;
    const sq = [1, 1.04, 1.06, 0.96][i] || 1;
    p.sx = sq; p.sy = 2 - sq;
    p.armL = -10; p.armR = 10;
    p.mouth = 1;
  } else if (row === 4) {
    p.rot = -6;
    p.dx = -2;
    p.eyeDx = 3;
    p.armR = 16 + Math.sin(t) * 6;
    p.extra = `<g transform="translate(150 54)">
      <rect x="-13" y="-15" width="26" height="26" rx="13" fill="#FFF4D6" stroke="${C.line}" stroke-width="3"/>
      <path d="M0 3 L0 -7" stroke="#E88A2E" stroke-width="4" stroke-linecap="round"/>
      <circle cx="0" cy="7" r="2.4" fill="#E88A2E"/></g>`;
  } else if (row === 5) {
    p.sx = 1.06; p.sy = 0.92;
    p.dx = Math.sin(t * 3) * 2;
    p.blink = false; p.wink = false; p.error = true;
    p.mouth = -1;
  } else if (row === 6) {
    const s = Math.sin(t);
    p.sy = 0.94; p.sx = 1.05;
    p.dy = 2;
    p.blink = true;
    p.armL = 6; p.armR = -6;
    p.extra = `<g fill="${C.blueDark}" opacity=".55">
      <circle cx="150" cy="72" r="4"/><circle cx="160" cy="60" r="5"/><circle cx="172" cy="46" r="6"/></g>`;
    void s;
  } else if (row === 7) {
    const s = Math.sin(t);
    p.eyeDx = s * 6;
    p.dx = s * 3;
    p.rot = s * 2;
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
    <ellipse cx="${cx}" cy="${cy}" rx="15" ry="18" fill="${C.white}" stroke="${C.line}" stroke-width="3"/>
    <ellipse cx="${ix}" cy="${cy + 1}" rx="9" ry="11" fill="${C.iris}"/>
    <ellipse cx="${ix}" cy="${cy + 2}" rx="4.6" ry="6" fill="${C.ink}"/>
    <circle cx="${ix - 4}" cy="${cy - 5}" r="3.2" fill="${C.white}"/>
  </g>`;
}

function frameSVG(row, col) {
  const cfg = ROWS_CFG[row] || { n: 0 };
  if (!cfg.n || col >= cfg.n) return '';
  const p = pose(row, col, cfg.n);
  const gid = `cp-${row}-${col}`;
  // 双色接缝：从顶部到底部的锯齿线（原创轮廓，不是照抄游戏角色）
  const seam = 'M96 49 L84 78 L108 108 L86 138 L104 168 L96 184';
  const armL = `<ellipse cx="28" cy="140" rx="13" ry="17" fill="${C.red}" stroke="${C.line}" stroke-width="4" transform="translate(0 ${p.armL}) rotate(-18 28 140)"/>`;
  const armR = `<ellipse cx="164" cy="140" rx="13" ry="17" fill="${C.blue}" stroke="${C.line}" stroke-width="4" transform="translate(0 ${p.armR}) rotate(18 164 140)"/>`;
  const legL = `<ellipse cx="72" cy="186" rx="21" ry="12" fill="${C.redDark}" stroke="${C.line}" stroke-width="4" transform="translate(0 ${p.legL})"/>`;
  const legR = `<ellipse cx="120" cy="186" rx="21" ry="12" fill="${C.blueDark}" stroke="${C.line}" stroke-width="4" transform="translate(0 ${p.legR})"/>`;
  const mouth = p.mouth < 0
    ? `<path d="M80 154 Q96 146 112 154" fill="none" stroke="${C.line}" stroke-width="4" stroke-linecap="round"/>`
    : p.mouth > 0
      ? `<path d="M82 150 Q96 166 110 150" fill="none" stroke="${C.line}" stroke-width="4" stroke-linecap="round"/>`
      : `<path d="M88 152 Q96 158 104 152" fill="none" stroke="${C.line}" stroke-width="3.5" stroke-linecap="round"/>`;

  return `<g transform="translate(${col * FW} ${row * FH})">
    <defs><clipPath id="${gid}"><circle cx="${CX}" cy="${CY}" r="${R}"/></clipPath></defs>
    <ellipse cx="96" cy="197" rx="${54 * p.sx}" ry="9" fill="rgba(0,0,0,.16)"/>
    ${p.extra}
    ${legL}${legR}
    <g transform="translate(${p.dx} ${p.dy}) rotate(${p.rot} ${CX} ${CY})">
      ${armL}${armR}
      <g transform="translate(${CX} ${CY}) scale(${p.sx} ${p.sy}) translate(${-CX} ${-CY})">
        <g clip-path="url(#${gid})">
          <circle cx="${CX}" cy="${CY}" r="${R}" fill="${C.blue}"/>
          <path d="M96 49 L84 78 L108 108 L86 138 L104 168 L96 184 L20 184 L20 49 Z" fill="${C.red}"/>
          <circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#none)" />
          <ellipse cx="66" cy="86" rx="20" ry="14" fill="${C.shade}"/>
          <ellipse cx="126" cy="150" rx="24" ry="14" fill="${C.shade}"/>
        </g>
        <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${C.line}" stroke-width="5"/>
        <path d="${seam}" fill="none" stroke="rgba(43,43,51,.28)" stroke-width="2.5" stroke-linecap="round"/>
        <ellipse cx="96" cy="132" rx="46" ry="31" fill="${C.white}" stroke="${C.line}" stroke-width="2.5"/>
        ${eye(76, 112, p, 'l')}
        ${eye(116, 112, p, 'r')}
        <circle cx="50" cy="142" r="9" fill="${C.blush}" opacity=".85"/>
        <circle cx="142" cy="142" r="9" fill="${C.blush}" opacity=".85"/>
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
    const picks = [[0, 0], [1, 2], [2, 3], [3, 1], [4, 0], [5, 0], [6, 0], [7, 2]];
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
