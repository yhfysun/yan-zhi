/**
 * 滚动条材质（base64 SVG）生成器
 * ------------------------------------------------------------------
 * 设计模型（v4，2026-09-13）：
 *   滚动条 thumb 的长度 = 视口/内容比，是不确定的。v1 把滚动条当成
 *   "一根完整的金箍棒"（顶金箍 + 中乌铁身 + 底金箍，3 层 background
 *   定位在 thumb 的 top/bottom），结果内容只超一点时 thumb 只有 30~50px，
 *   两个金箍就把 thumb 占满 → 用户截图里说的"一串断开的小方块"。
 *   竖条同样病：短 thumb 渲染成"上面一个金胶囊 + 下面一截黑棍"。
 *
 * v4 正确模型：
 *   滚动条不是"一个物件"，是"一段材质"。要画的是金箍棒的材质沿轴向的
 *   剖面：金箍带（宽）→ 乌铁段 → 金箍带（细）→ 乌铁段 …… 无缝循环。
 *   这样无论 thumb 多长，看到的都是"金箍 + 乌铁 + 金箍 + 乌铁"的连续
 *   棍身，既像金箍棒，又天然表达"这是一根被拉长的棒子"。
 *
 * 关键工程约束：
 *   ① 瓷砖在平铺轴两端必须完全同色，否则每隔 N px 出现接缝 → 平铺轴用
 *      恒定色渐变，金属感放在垂直轴。
 *   ② 竖条 body 平铺轴 = Y → 瓷砖内沿 X 做金属渐变，沿 Y 纯色循环。
 *      横条 body 平铺轴 = X → 瓷砖内沿 Y 做金属渐变，沿 X 纯色循环。
 *      两者金箍带位置对齐同一个节拍 → 同一皮肤横竖观感一致。
 *
 * 尺寸：
 *   厚 8px。瓷砖 8×24（一个节拍 24px：金箍带 6px + 乌铁 18px）。
 *
 * 用法（CLI）：
 *   node scripts/build-scrollbar-materials.mjs                        # 打印默认金箍乌铁 set 的尺寸
 *   node scripts/build-scrollbar-materials.mjs --css                  # 打印 6 个 CSS 变量值
 *   node scripts/build-scrollbar-materials.mjs --all-skins [out.html] # 生成 27 套皮肤总预览页
 *   node scripts/build-scrollbar-materials.mjs --preview [out.html]   # 用 JINGU 默认配色生成预览
 *   node scripts/build-scrollbar-materials.mjs --dump                 # 打印原始 SVG
 *
 * 输入：apps/server/src/plugins/scrollbar-materials.ts 的 SCROLLBAR_MATERIALS 表。
 * 输出：单文件 HTML 预览页（每套皮肤 4 联：竖长/竖短/横长/横短），可直接在浏览器打开。
 *
 * 设计原则：
 *   • 不耦合 skins.ts（解析的是纯 mat() 字面量，调材质表不再要碰生成器）
 *   • 预览页用 "内容只比容器略多" 让 thumb 占轨道 60%~85%，节拍清晰可见
 *   • 不写资产文件、不动后端逻辑 —— 本脚本只产 HTML/CSS/SVG
 *
 * 配套代码：
 *   • 服务端镜象：apps/server/src/plugins/scrollbar-svg.ts（运行时用，相同的几何）
 *   • 注入入口：apps/server/src/plugins/skins.ts 的 buildScrollbarAssets(materialFor(id))
 *   • 前端消费：packages/ui/src/styles/skin.css 的 [data-skin=on] 段
 */

// ---------------- 配色表 ----------------
// cap   = 金箍带（亮金属）
// body  = 乌铁段（暗金属）
// 每色给 5 档：edge(极暗) / dark / mid / light / hi(高光)
const JINGU = {
  name: '金箍乌铁',
  cap:  { edge: '#140D02', dark: '#4A370C', mid: '#8A6F2E', light: '#CFB370', hi: '#F4E3AE' },
  body: { edge: '#000000', dark: '#141513', mid: '#33342F', light: '#84837F', hi: '#A3A29C' },
};
export { JINGU };

// ---------------- 通用绘制 ----------------
const rect = (a) => `<rect ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`;

/**
 * 金属圆柱渐变（用于"垂直平铺轴"方向的横截面）。
 * @param {string} id
 * @param {object} c 色阶
 * @param {'x'|'y'} axis 渐变方向：'x' 表示从左到右做金属感（竖条用），'y' 表示从上到下（横条用）
 */
function metalGrad(id, c, axis) {
  const dir = axis === 'x' ? 'x1="0" y1="0" x2="1" y2="0"' : 'x1="0" y1="0" x2="0" y2="1"';
  // 高光偏 45% 位置（左上方受光的圆柱感），两端对称收暗
  return `<linearGradient id="${id}" ${dir}>
    <stop offset="0"    stop-color="${c.edge}"/>
    <stop offset="0.14" stop-color="${c.dark}"/>
    <stop offset="0.36" stop-color="${c.mid}"/>
    <stop offset="0.45" stop-color="${c.light}"/>
    <stop offset="0.52" stop-color="${c.hi}"/>
    <stop offset="0.64" stop-color="${c.light}"/>
    <stop offset="0.86" stop-color="${c.dark}"/>
    <stop offset="1"    stop-color="${c.edge}"/>
  </linearGradient>`;
}

/**
 * 生成 body 瓷砖（无缝循环，含金箍带）。
 * 竖条：8 宽 × TILE 高；横向金属渐变(x)；金箍带为水平条位于瓷砖顶部
 * 横条：TILE 宽 × 8 高；纵向金属渐变(y)；金箍带为竖直条位于瓷砖左侧
 * @param {object} P {cap, body}
 * @param {'v'|'h'} dir
 * @param {number} TILE 瓷砖轴向长度
 * @param {number} THICK 厚度(8)
 * @param {number} band 金箍带在瓷砖内的长度
 */
function makeBodyTile(P, dir, TILE = 24, THICK = 8, band = 6) {
  const w = dir === 'v' ? THICK : TILE;
  const h = dir === 'v' ? TILE : THICK;
  const gBody = `gb${dir}`, gCap = `gc${dir}`;
  const axis = dir === 'v' ? 'x' : 'y';

  // 乌铁段：整片铺金属渐变
  const parts = [
    rect({ x: 0, y: 0, width: w, height: h, fill: `url(#${gBody})` }),
  ];

  // 金箍带：位于瓷砖起始端，长度 band
  if (dir === 'v') {
    parts.push(rect({ x: 0, y: 0, width: w, height: band, fill: `url(#${gCap})` }));
    // 金箍带两端压深线（做出"一片金片包住棍身"的实体边缘）
    parts.push(rect({ x: 0, y: '0.55', width: w, height: '0.75', fill: P.cap.edge, opacity: '0.9' }));
    parts.push(rect({ x: 0, y: (band - 1.3), width: w, height: '0.75', fill: P.cap.edge, opacity: '0.9' }));
    // 金箍带下沿的高光反射线（金片在乌铁上的反光，让衔接不突兀）
    parts.push(rect({ x: 0, y: (band + 0.2), width: w, height: '0.5', fill: P.cap.hi, opacity: '0.22' }));
  } else {
    parts.push(rect({ x: 0, y: 0, width: band, height: h, fill: `url(#${gCap})` }));
    parts.push(rect({ x: '0.55', y: 0, width: '0.75', height: h, fill: P.cap.edge, opacity: '0.9' }));
    parts.push(rect({ x: (band - 1.3), y: 0, width: '0.75', height: h, fill: P.cap.edge, opacity: '0.9' }));
    parts.push(rect({ x: (band + 0.2), y: 0, width: '0.5', height: h, fill: P.cap.hi, opacity: '0.22' }));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  ${metalGrad(gBody, P.body, axis)}
  ${metalGrad(gCap, P.cap, axis)}
</defs>
${parts.join('\n')}
</svg>`;
}

/**
 * 生成两端收口素材（thumb 的起点/终点），横竖各一张。
 * 做成"金箍带 + 端头倒角"的样子，长度与 body 的 band 一致 → 拼接自然。
 */
function makeEnd(P, dir, THICK = 8, len = 6, flip = false) {
  const w = dir === 'v' ? THICK : len;
  const h = dir === 'v' ? len : THICK;
  const g = `ge${dir}${flip ? 'f' : ''}`;
  const axis = dir === 'v' ? 'x' : 'y';
  const parts = [
    rect({ x: 0, y: 0, width: w, height: h, rx: Math.min(3, w / 2), fill: `url(#${g})` }),
  ];
  if (dir === 'v') {
    if (flip) parts.push(rect({ x: 0, y: h - 1.3, width: w, height: '0.75', fill: P.cap.edge, opacity: '0.9' }));
    else      parts.push(rect({ x: 0, y: '0.55', width: w, height: '0.75', fill: P.cap.edge, opacity: '0.9' }));
  } else {
    if (flip) parts.push(rect({ x: w - 1.3, y: 0, width: '0.75', height: h, fill: P.cap.edge, opacity: '0.9' }));
    else      parts.push(rect({ x: '0.55', y: 0, width: '0.75', height: h, fill: P.cap.edge, opacity: '0.9' }));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  ${metalGrad(g, P.cap, axis)}
</defs>
${parts.join('\n')}
</svg>`;
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const uri = (s) => `url("data:image/svg+xml;base64,${b64(s)}")`;

export const TILE = 24;
export const THICK = 8;
export const BAND = 6;

/** 由配色方案生成一套完整素材 */
export function buildSet(palette, opts = {}) {
  const TILE_L = opts.tile || TILE;
  const P = palette;
  return {
    v: {
      body: uri(makeBodyTile(P, 'v', TILE_L, THICK, BAND)),
      cap: uri(makeEnd(P, 'v', THICK, BAND, false)),
      capFlip: uri(makeEnd(P, 'v', THICK, BAND, true)),
    },
    h: {
      body: uri(makeBodyTile(P, 'h', TILE_L, THICK, BAND)),
      cap: uri(makeEnd(P, 'h', THICK, BAND, false)),
      capFlip: uri(makeEnd(P, 'h', THICK, BAND, true)),
    },
    raw: {
      v: { body: makeBodyTile(P, 'v', TILE_L, THICK, BAND) },
      h: { body: makeBodyTile(P, 'h', TILE_L, THICK, BAND) },
    },
    tile: TILE_L,
  };
}

export const SCHEMES = { 'jingu-default': JINGU };

/**
 * 生成一个独立预览页：每套皮肤一块，竖条 + 横条（长/短 thumb）对照。
 *
 * ⚠️ 演示容器的尺寸学问：
 *   滚动条 thumb 长度 = 视口尺寸 / 内容尺寸。第一版容器小（竖 110×170、横 300×26）
 *   而内容极大（200 行 / 300 列）→ thumb 只有几像素，看上去就是一个小色块，
 *   完全看不出"金箍 + 乌铁"的节拍，白测。
 *   正确做法：让"内容只比容器多一点"→ thumb 占轨道 60%~85%，节拍清晰可见。
 *   竖条：容器 190 高，内容 14 行 × 22px = 308 → thumb ≈ 61%
 *   横条：容器 470 宽，内容约 620px → thumb ≈ 76%
 */
export function buildPreviewHTML(schemes = SCHEMES, opts = {}) {
  const TILE_L = opts.tile || TILE;
  const entries = Object.entries(schemes);
  // ⚠️ 坑：素材值是 url("data:...")，内含**双引号**；直接塞进 HTML 属性
  //    style="--body:url("data:...")" 会在第一个内层 " 处提前闭合属性，
  //    导致 --body 变量根本没生效、预览页全黑无滚动条。
  //    修法：写进内联样式时把双引号换成单引号（CSS url('...') 同样合法）。
  const inline = (u) => u.replace(/^url\("/, "url('").replace(/"\)$/, "')");
  const VROWS = 14;   // 竖条内容行数
  const HCOLS = 42;   // 横条内容列数
  const blocks = entries.map(([k, P]) => {
    const s = buildSet(P, { tile: TILE_L });
    return `
  <section class="demo">
    <h2>${P.name} <code>${k}</code></h2>
    <div class="grid">
      <div>
        <div class="cap">竖 · thumb 长</div>
        <div class="vdemo" style="--body:${inline(s.v.body)};--cap:${inline(s.v.cap)};--capf:${inline(s.v.capFlip)}">
          ${Array.from({ length: VROWS }, (_, i) => `<div class="li">行 ${i + 1}</div>`).join('')}
        </div>
      </div>
      <div>
        <div class="cap">竖 · thumb 短</div>
        <div class="vshort" style="--body:${inline(s.v.body)};--cap:${inline(s.v.cap)};--capf:${inline(s.v.capFlip)}">
          ${Array.from({ length: 22 }, (_, i) => `<div class="li">行 ${i + 1}</div>`).join('')}
        </div>
      </div>
      <div>
        <div class="cap">横 · thumb 长</div>
        <div class="hdemo" style="--body:${inline(s.h.body)};--cap:${inline(s.h.cap)};--capf:${inline(s.h.capFlip)}">
          ${Array.from({ length: HCOLS }, (_, i) => `<span class="cw">列 ${i + 1}z</span>`).join('')}
        </div>
      </div>
      <div>
        <div class="cap">横 · thumb 短</div>
        <div class="hshort" style="--body:${inline(s.h.body)};--cap:${inline(s.h.cap)};--capf:${inline(s.h.capFlip)}">
          ${Array.from({ length: 90 }, (_, i) => `<span class="cw">列 ${i + 1}z</span>`).join('')}
        </div>
      </div>
    </div>
  </section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>金箍棒滚动条 · ${entries.length} 套皮肤材质</title>
<style>
  body{background:#12100e;color:#e8e2d8;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif;margin:0;padding:18px 24px}
  h1{font-size:16px;margin:0 0 14px;color:#cfb370;font-weight:600}
  h1 small{color:#8a8578;font-weight:400;font-size:12px;margin-left:8px}
  .demo{border-bottom:1px solid #2a2622;padding:12px 0}
  h2{font-size:13px;margin:0 0 8px;color:#cfb370}
  h2 code{color:#8a8578;font-size:10px;font-weight:400;margin-left:6px}
  .grid{display:grid;grid-template-columns:120px 120px 490px 490px;gap:20px;align-items:start}
  .cap{color:#8a8578;font-size:11px;margin-bottom:4px}
  .li{padding:0 6px;font-size:11px;height:22px;line-height:22px}
  .cw{font-size:11px}
  .vdemo,.vshort{height:190px;overflow-y:scroll;overflow-x:hidden;background:#1b1917;border:1px solid #302b26;border-radius:5px}
  .hdemo,.hshort{height:30px;overflow-x:scroll;overflow-y:hidden;background:#1b1917;border:1px solid #302b26;border-radius:5px;white-space:nowrap}
  .vdemo::-webkit-scrollbar,.vshort::-webkit-scrollbar{width:8px;height:8px}
  .hdemo::-webkit-scrollbar,.hshort::-webkit-scrollbar{width:8px;height:8px}
  .vdemo::-webkit-scrollbar-track,.vshort::-webkit-scrollbar-track,
  .hdemo::-webkit-scrollbar-track,.hshort::-webkit-scrollbar-track{background:transparent}
  .vdemo::-webkit-scrollbar-thumb,.vshort::-webkit-scrollbar-thumb{
    background-image:var(--capf),var(--cap),var(--body)!important;
    background-size:100% ${BAND}px,100% ${BAND}px,100% ${TILE_L}px!important;
    background-repeat:no-repeat,no-repeat,repeat-y!important;
    background-position:center bottom,center top,center center!important;
    background-color:transparent!important;border-radius:999px!important;
  }
  .hdemo::-webkit-scrollbar-thumb,.hshort::-webkit-scrollbar-thumb{
    background-image:var(--capf),var(--cap),var(--body)!important;
    background-size:${BAND}px 100%,${BAND}px 100%,${TILE_L}px 100%!important;
    background-repeat:no-repeat,no-repeat,repeat-x!important;
    background-position:right center,left center,center center!important;
    background-color:transparent!important;border-radius:999px!important;
  }
</style></head><body>
<h1>金箍棒滚动条 · 每套皮肤一套材质 <small>${entries.length} 套 · 竖/横 × thumb 长/短 四联对照</small></h1>
${blocks}
</body></html>`;
}

// ---------------- CLI ----------------
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const REPO = path.resolve(HERE, '..');
const MAT_PATH = path.join(REPO, 'apps/server/src/plugins/scrollbar-materials.ts');
const DEFAULT_OUT_HTML = path.join(REPO, 'docs/scrollbar-materials-preview.html');
const DEFAULT_OUT_ONE = path.join(REPO, 'docs/scrollbar-preview.html');

/**
 * 从 scrollbar-materials.ts 解析所有 mat(...) 字面量为 {cap:{...5 档}, body:{...5 档}, name}
 * 不耦合类型，只看字面量；改了材质表自动跟上。
 */
export function parseMaterialsFromSource(src) {
  const blockStart = src.indexOf('export const SCROLLBAR_MATERIALS');
  const blockEnd = src.indexOf('\n};', blockStart);
  if (blockStart < 0 || blockEnd < 0) return {};
  const block = src.slice(blockStart, blockEnd);
  const schemes = {};
  for (const m of block.matchAll(/'([\w-]+)':\s*mat\(([^)]*)\)/gs)) {
    const key = m[1];
    const nums = [...m[2].matchAll(/'#([0-9A-Fa-f]{6})'/g)].map((x) => '#' + x[1]);
    if (nums.length !== 10) { console.error('BAD mat for', key, nums.length); continue; }
    schemes[key] = {
      name: key.replace('skin-', ''),
      cap: { edge: nums[0], dark: nums[1], mid: nums[2], light: nums[3], hi: nums[4] },
      body: { edge: nums[5], dark: nums[6], mid: nums[7], light: nums[8], hi: nums[9] },
    };
  }
  return schemes;
}

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

if (args.includes('--all-skins')) {
  const out = argValue('--all-skins', DEFAULT_OUT_HTML);
  const src = fs.readFileSync(MAT_PATH, 'utf8');
  const schemes = parseMaterialsFromSource(src);
  console.log('parsed schemes:', Object.keys(schemes).length);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buildPreviewHTML(schemes), 'utf8');
  console.log('written:', out);
} else if (args.includes('--preview')) {
  const out = argValue('--preview', DEFAULT_OUT_ONE);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buildPreviewHTML(), 'utf8');
  console.log('written:', out);
} else if (args.includes('--dump')) {
  const s = buildSet(JINGU);
  console.log('=== V body ===\n' + s.raw.v.body);
  console.log('=== H body ===\n' + s.raw.h.body);
} else if (args.includes('--css')) {
  const s = buildSet(JINGU);
  console.log(`--skin-scrollbar-v-body: ${s.v.body};`);
  console.log(`--skin-scrollbar-v-cap: ${s.v.cap};`);
  console.log(`--skin-scrollbar-v-capflip: ${s.v.capFlip};`);
  console.log(`--skin-scrollbar-h-body: ${s.h.body};`);
  console.log(`--skin-scrollbar-h-cap: ${s.h.cap};`);
  console.log(`--skin-scrollbar-h-capflip: ${s.h.capFlip};`);
} else {
  const s = buildSet(JINGU);
  console.log('Jingu default set built. tile=', TILE, 'band=', BAND);
  console.log('v.body len', s.v.body.length, '| h.body len', s.h.body.length);
}