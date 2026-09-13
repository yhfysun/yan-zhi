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
const REQUIRED_ASSETS = ['wallpaper.webp', 'dialog-bg.webp', 'task-list-bg.webp', 'input-bg.webp', 'button-bg.webp'];

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
