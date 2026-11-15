/**
 * RPA 工作台按钮 hover 真实渲染自测（独立 node 进程，手动跑，不进 CI）
 *
 *   node scripts/rpa-button-hover-smoke.cjs
 *
 * 为什么要真 Chromium：jsdom 不实现 CSS 层叠/特异性，用户实报的
 * 「主按钮 hover 后浅灰底 + 白字 = 看不见」只有在真浏览器里量 computed style 才测得出来。
 * 这里从 AutomationWorkbench.vue 抽真实 <style scoped> + tokens.css 的 :root 变量渲染，
 * 用 page.hover() 触发 :hover，量背景/文字/边框与文字对比度。
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const { loadPlaywright, findChromium } = require('./find-chromium.cjs');
const { chromium } = loadPlaywright(REPO);

const VIEW = fs.readFileSync(path.join(REPO, 'packages/ui/src/views/AutomationWorkbench.vue'), 'utf8');
const TOKENS = fs.readFileSync(path.join(REPO, 'packages/ui/src/styles/tokens.css'), 'utf8');
const styleMatch = VIEW.match(/<style scoped>([\s\S]*?)<\/style>/);
const rootMatch = TOKENS.match(/:root\s*\{([\s\S]*?)\}/);
if (!rootMatch || (!styleMatch && !process.env.RPA_HOVER_CSS_FILE)) throw new Error('抽不到 <style scoped> 或 :root 变量');
// 变异验证用：RPA_HOVER_CSS_FILE=<旧版 CSS 文件> node ... 应当跑出 FAIL，
// 证明这份自测真的能抓住「hover 白底白字」，不是假绿。
const CSS = process.env.RPA_HOVER_CSS_FILE
  ? fs.readFileSync(process.env.RPA_HOVER_CSS_FILE, 'utf8')
  : styleMatch[1];

const HTML = `<!doctype html><html><head>
<style>:root {${rootMatch[1]}}</style>
<style>${CSS}</style>
</head><body>
  <div class="rpa-page"><div class="rpa-body">
    <button class="rpa-btn primary" id="primary">手动创建</button>
    <button class="rpa-btn ghost" id="ghost">让 AI 设计</button>
    <button class="rpa-btn primary" id="top">新建脚本</button>
    <button class="rpa-btn publish" id="publish">发布</button>
  </div></div>
</body></html>`;

// Chromium 对 color-mix() 的 computed value 返回 color(srgb 0.26 0.23 0.76 / 0.28)，
// 不是 rgb()：只认 rgb 会把亮度算成 0，自测会「假绿」（判据：断言存在≠断生效）。
function parseColor(str) {
  const s = String(str);
  let m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((v) => parseFloat(v.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  m = s.match(/color\(srgb\s+([^)]+)\)/);
  if (m) {
    const p = m[1].trim().split(/[\s/]+/).filter(Boolean).map(Number);
    return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
  }
  return null;
}
function onWhite(str) {
  const c = parseColor(str);
  if (!c) return { r: 0, g: 0, b: 0 };
  if (c.a >= 1) return c;
  return { r: c.r * c.a + 255 * (1 - c.a), g: c.g * c.a + 255 * (1 - c.a), b: c.b * c.a + 255 * (1 - c.a) };
}
function luminance(str) {
  const c = onWhite(str);
  const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function check(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
}

async function stylesOf(page, id) {
  return page.$eval('#' + id, (el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, color: s.color, border: s.borderColor, shadow: s.boxShadow };
  });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: findChromium(),
    args: ['--no-sandbox'],
    timeout: 30000,
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  try {
    await page.setContent(HTML);
    const normal = {
      primary: await stylesOf(page, 'primary'),
      ghost: await stylesOf(page, 'ghost'),
      top: await stylesOf(page, 'top'),
      publish: await stylesOf(page, 'publish'),
    };
    const hovered = {};
    for (const id of ['primary', 'ghost', 'top', 'publish']) {
      await page.hover('#' + id);
      await page.waitForTimeout(60);
      hovered[id] = await stylesOf(page, id);
      await page.mouse.move(880, 480);
    }

    console.log('\n=== 正常态 → hover 态（真实 computed style）===');
    for (const id of Object.keys(normal)) {
      const a = normal[id], b = hovered[id];
      console.log(`${id.padEnd(8)} bg ${a.bg.padEnd(22)} → ${b.bg.padEnd(30)} color ${a.color.padEnd(18)} → ${b.color}`);
    }

    const p = hovered.primary, pn = normal.primary;
    const ratio = contrast(p.bg, p.color);
    console.log(`\n主按钮 hover 文字对比度 = ${ratio.toFixed(2)}:1\n`);

    // ★ 回归核心：以前 .rpa-btn:hover:not(:disabled) 特异性压过 .rpa-btn.primary，
    //   hover 把紫底刷成 #F0F2F7、白字留在浅底上（对比度 ~1.1:1），按钮等于消失。
    check('主按钮 hover 后仍是深色底（不是浅灰）', luminance(p.bg) < 0.35, `亮度 ${luminance(p.bg).toFixed(3)}`);
    check('主按钮 hover 后文字仍是白色', parseColor(p.color).r > 240 && parseColor(p.color).g > 240 && parseColor(p.color).b > 240, p.color);
    check('主按钮 hover 文字对比度 ≥ 4.5:1', ratio >= 4.5, `${ratio.toFixed(2)}:1`);
    check('主按钮 hover 与正常态背景有可感知差异', p.bg !== pn.bg, `${pn.bg} → ${p.bg}`);
    check('主按钮 hover 有阴影反馈', p.shadow !== 'none' && p.shadow !== pn.shadow, p.shadow);
    check('顶栏主按钮表现与空状态一致', hovered.top.bg === p.bg && hovered.top.color === p.color);

    const g = hovered.ghost, gn = normal.ghost;
    check('ghost 按钮 hover 背景变化可见', g.bg !== gn.bg, `${gn.bg} → ${g.bg}`);
    check('ghost 按钮 hover 文字变主色', g.color === pn.bg, `${gn.color} → ${g.color}`);
    check('ghost 按钮 hover 边框变化可见', g.border !== gn.border, `${gn.border} → ${g.border}`);

    const pub = hovered.publish, pubn = normal.publish;
    check('发布按钮 hover 不被通用规则刷成灰底', pub.bg !== pubn.bg && pub.bg !== g.bg, `${pubn.bg} → ${pub.bg}`);
  } finally {
    await browser.close();
  }
  console.log(process.exitCode ? '\n有失败项' : '\n全部通过');
})().catch((e) => {
  console.error('SMOKE ERROR', e && e.stack || e);
  process.exit(1);
});
