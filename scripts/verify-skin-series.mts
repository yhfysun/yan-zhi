/**
 * 内置系列皮肤校验脚本（正式校验入口，非临时脚本）
 * ------------------------------------------------------------------
 * 校验内容：
 *   1. 每个系列 11 个部位（壁纸深浅 + 9 个部件图）都是合法 svg data uri
 *   2. svg 内所有 url(#id) 引用都有对应 id 定义（漏 # 或写错 id 会导致图案整块不显示）
 *   3. apps/server/assets/plugin-assets/<skinId>/ 下 5 个真图资源齐全
 *
 * 用法：
 *   node --experimental-strip-types scripts/verify-skin-series.mts              # 只校验
 *   node --experimental-strip-types scripts/verify-skin-series.mts --preview    # 额外产出可视化预览 HTML
 *
 * 退出码：0 全部通过；1 有问题（CI 可直接接）
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_SKIN_SERIES } from '../packages/ui/src/styles/skinSeries.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const problems: string[] = [];

/** 每个皮肤包必须齐备的真图资源（缺一个 → 对应部位退化为纯色，用户会看到「背景没换」） */
const REQUIRED_ASSETS = ['wallpaper.webp', 'wallpaper-dark.webp', 'dialog-bg.webp', 'task-list-bg.webp', 'input-bg.webp', 'button-bg.webp'];

for (const s of BUILTIN_SKIN_SERIES) {
  const parts: Array<[string, string]> = [
    ['wallpaper.light', s.wallpaper.light],
    ['wallpaper.dark', s.wallpaper.dark],
    ['catTag', s.surface.catTagPattern],
    ['taskList', s.surface.taskListPattern],
    ['input', s.surface.inputPattern],
    ['button', s.surface.buttonPattern],
    ['dialog', s.surface.dialogPattern],
    ['titlebar', s.surface.titlebarPattern],
    ['menu', s.surface.menuPattern],
    ['code', s.surface.codePattern],
    ['browser', s.surface.browserPattern],
  ];
  for (const [name, v] of parts) {
    if (!v || !v.startsWith('data:image/svg+xml')) { problems.push(`${s.id} ${name}: 非 svg data uri`); continue; }
    const svg = decodeURIComponent(v.slice('data:image/svg+xml;charset=utf-8,'.length));
    if (!svg.startsWith('<svg') || !svg.trimEnd().endsWith('</svg>')) problems.push(`${s.id} ${name}: svg 结构不完整`);
    const ids = new Set((svg.match(/id='[^']+'/g) || []).map((m) => m.slice(4, -1)));
    for (const ref of svg.match(/url\('#[^']+'\)|url\(#[A-Za-z0-9-]+\)/g) || []) {
      const id = ref.replace(/^url\(/, '').replace(/\)$/, '').replace(/^'/, '').replace(/'$/, '').replace(/^#/, '');
      if (id && !ids.has(id)) problems.push(`${s.id} ${name}: 引用未定义 id '${id}'`);
    }
  }
}

// ---- 真图资源完整性（覆盖内置样例 + 全部既有皮肤包）----
const assetsBase = join(ROOT, 'apps', 'server', 'assets', 'plugin-assets');
let checked = 0;
for (const ent of readdirSync(assetsBase, { withFileTypes: true })) {
  const dir = ent.name;
  if (!ent.isDirectory() || !dir.startsWith('skin-')) continue;
  const files = readdirSync(join(assetsBase, dir));
  for (const need of REQUIRED_ASSETS) {
    if (!files.includes(need)) problems.push(`资源缺失 ${dir}/${need}`);
  }
  checked += 1;
}

// ---- 配色兜底链校验（P0-2）：派生配色必须满足 WCAG 对比度 ----
// 背景：暗色下所有皮肤"灰蒙蒙"的根因之一是兜底色为硬编码中性灰。改为从 primary 派生后，
// 这里用同一套派生公式离线复算，保证任何皮肤（含第三方只填 primary 的）都不会产出不可读配色。
const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixHex = (a: string, b: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return '#' + [m(r1, r2), m(g1, g2), m(b1, b2)].map((v) => v.toString(16).padStart(2, '0')).join('');
};
const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
/** 与 settings.ts deriveSkinTokens 保持一致 */
function derive(primary: string, dark: boolean) {
  const p = primary;
  const base = dark ? '#0E0F12' : '#FBFBFB';
  const ink = dark ? '#FFFFFF' : '#141414';
  const text = mixHex(ink, p, 0.08);
  const textSecondary = dark ? mixHex(text, base, 0.28) : mixHex(text, '#FFFFFF', 0.32);
  const textTertiary = dark ? mixHex(text, base, 0.45) : mixHex(text, '#FFFFFF', 0.4);
  const surface = dark ? mixHex(base, p, 0.07) : mixHex(base, p, 0.06);
  const surfaceRaised = dark ? mixHex(base, p, 0.13) : mixHex('#FFFFFF', p, 0.025);
  const surfaceSunken = dark ? mixHex(base, '#000000', 0.3) : mixHex('#F1F0EE', p, 0.05);
  const surfaceActive = dark ? mixHex(p, surfaceRaised, 0.68) : mixHex(p, '#FFFFFF', 0.8);
  return { text, textSecondary, textTertiary, surface, surfaceRaised, surfaceSunken, surfaceActive };
}

const MIN_BODY = 4.5;
const MIN_SUB = 3.0;
/** 收集待校验皮肤主色：插件皮肤（skins.ts）+ 内置 5 套主题色（settings.ts THEMES） */
const skinPrimaries: Array<[string, string]> = [];
try {
  const src = readFileSync(join(ROOT, 'apps', 'server', 'src', 'plugins', 'skins.ts'), 'utf8');
  const re = /skinTheme\(\s*'([^']+)'[\s\S]*?primary:\s*'(#[0-9a-fA-F]{6})'/g;
  for (let m = re.exec(src); m; m = re.exec(src)) skinPrimaries.push([m[1], m[2]]);
} catch {
  problems.push('配色校验：读取 apps/server/src/plugins/skins.ts 失败');
}
try {
  const src = readFileSync(join(ROOT, 'packages', 'ui', 'src', 'stores', 'settings.ts'), 'utf8');
  const re = /^\s{2}(\w+):\s*\{\s*\r?\n\s*primary:\s*'(#[0-9a-fA-F]{6})'/gm;
  for (let m = re.exec(src); m; m = re.exec(src)) skinPrimaries.push([`内置主题色:${m[1]}`, m[2]]);
} catch {
  problems.push('配色校验：读取 packages/ui/src/stores/settings.ts 失败');
}

let contrastChecked = 0;
for (const [name, primary] of skinPrimaries) {
  for (const dark of [true, false]) {
    const d = derive(primary, dark);
    const checks: Array<[string, number, number]> = [
      ['正文/面板', contrast(d.text, d.surface), MIN_BODY],
      ['正文/弹窗', contrast(d.text, d.surfaceRaised), MIN_BODY],
      ['正文/输入框', contrast(d.text, d.surfaceSunken), MIN_BODY],
      ['次级/面板', contrast(d.textSecondary, d.surface), MIN_SUB],
      ['占位符/输入框', contrast(d.textTertiary, d.surfaceSunken), MIN_SUB],
      ['选中项文字', contrast(d.text, d.surfaceActive), MIN_SUB],
    ];
    for (const [label, ratio, min] of checks) {
      if (ratio < min) {
        problems.push(`对比度不足 ${name} [${dark ? '暗色' : '浅色'}] ${label}=${ratio.toFixed(2)} < ${min}`);
      }
    }
    contrastChecked += 1;
  }
}
console.log(`皮肤配色对比度检查：${skinPrimaries.length} 套 × 明暗两模式（${contrastChecked} 组），阈值 正文≥${MIN_BODY} / 次级≥${MIN_SUB}`);

console.log(`皮肤包资源检查：${checked} 个包`);
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'ALL SVG OK / ASSETS OK');

if (process.argv.includes('--preview')) {
  const cell = (title: string, bg: string, h = 44) => `
    <div><div class="t">${title}</div><div class="sw" style="height:${h}px;background-image:url(&quot;${bg}&quot;)"></div></div>`;
  const card = (s: (typeof BUILTIN_SKIN_SERIES)[number]) => `
  <section class="card">
    <h2>${s.name} <code>${s.id}</code></h2>
    <div class="grid2">
      <div class="row3"><div class="t">壁纸（浅色）</div><img src="${s.wallpaper.light}"/></div>
      ${cell('菜单', s.surface.menuPattern, 100)}
      ${cell('弹窗', s.surface.dialogPattern, 100)}
      <div class="row3"><div class="t">壁纸（深色）</div><img src="${s.wallpaper.dark}"/></div>
      ${cell('代码模式', s.surface.codePattern, 100)}
      ${cell('浏览器外壳', s.surface.browserPattern, 100)}
    </div>
    <div class="grid6">
      ${cell('分类标签', s.surface.catTagPattern)}
      ${cell('列表', s.surface.taskListPattern)}
      ${cell('输入框', s.surface.inputPattern)}
      ${cell('按钮', s.surface.buttonPattern)}
      ${cell('标题栏', s.surface.titlebarPattern)}
      <div><div class="t">滚动条</div><div class="sw" style="display:flex;align-items:center;justify-content:center"><span style="width:8px;height:36px;border-radius:4px;background:${s.surface.scrollbarThumb};display:inline-block"></span></div></div>
    </div>
  </section>`;
  // ---- 真图样例皮肤（apps/server/assets/plugin-assets/skin-sample-*/）：内嵌 base64，保证预览文件自包含 ----
  const samples = readdirSync(assetsBase, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('skin-sample-'))
    .map((e) => e.name)
    .sort();
  const rel = (p: string) => `data:image/webp;base64,${readFileSync(join(assetsBase, p)).toString('base64')}`;
  const sampleCard = (id: string) => `
  <section class="card">
    <h2>${id} <code>真图样例</code></h2>
    <div class="t">主壁纸</div>
    <img src="${rel(`${id}/wallpaper.webp`)}" style="width:100%;height:240px"/>
    <div class="grid4">
      ${['dialog-bg', 'task-list-bg', 'input-bg', 'button-bg'].map((f) => `
      <div><div class="t">${f}</div><img src="${rel(`${id}/${f}.webp`)}"/></div>`).join('')}
    </div>
  </section>`;
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>皮肤预览（内置系列 + 真图样例）</title>
<style>
body{font-family:system-ui,-apple-system,"Microsoft YaHei";max-width:1080px;margin:0 auto;padding:24px;background:#f6f6f4;color:#1f2328}
h1{font-size:20px}
.card{margin:24px 0;padding:16px;border:1px solid #e3e3df;border-radius:12px;background:#fff}
.card h2{margin:0 0 12px;font-size:16px}
.card code{font-size:11px;color:#888}
.t{font-size:11px;color:#666;margin-bottom:4px}
.sw{background-size:cover;background-position:center;border-radius:8px;border:1px solid #eee}
.grid2{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px}
.grid6{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:8px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}
.grid4 img{width:100%;height:120px;object-fit:cover;border-radius:8px;border:1px solid #eee}
.row3{grid-row:span 3}
.row3 img{width:100%;height:224px;object-fit:cover;border-radius:8px;border:1px solid #eee}
</style></head><body>
<h1>内置系列皮肤预览（${BUILTIN_SKIN_SERIES.length} 系列 × 11 部位）</h1>
${BUILTIN_SKIN_SERIES.map(card).join('\n')}
<h1 style="margin-top:40px">真图样例皮肤预览（${samples.length} 套 · 壁纸 + 4 部件图）</h1>
${samples.map(sampleCard).join('\n')}
</body></html>`;
  const out = join(ROOT, 'docs', 'skin-series-preview.html');
  writeFileSync(out, html, 'utf8');
  console.log(`PREVIEW WRITTEN ${out}`);
}

process.exit(problems.length ? 1 : 0);
