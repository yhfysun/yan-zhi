import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 截图框选窗「点击穿透」防回归测试。
 *
 * 背景（真实故障）：Win10/Win11 上点截图按钮后「单击就退出」，日志断在 overlay shown
 * 之后没有任何后续记录。根因是 Windows 透明窗的**命中测试按像素 alpha 判定**：
 * alpha=0 的像素点击会直接穿透到下层应用，下层被激活 → 框选窗收到 blur →
 * finishSnip(cancelled) → 窗口消失。而 #dim / #winHi / #sel 都用「挖洞」方式
 * 留出全透明区域来压暗四周，洞的位置正是用户要点击的位置（窗口矩形内 / 选区内），
 * 于是必然穿透。又因为 blur 分支有 500ms 的 armedAt 保护期，表现为「时好时坏」。
 *
 * 修法：给 body 铺一层近乎不可见（alpha 极小但 > 0）的基底，保证任何像素 alpha 都 > 0。
 * 这些测试的作用就是钉住该不变量：谁把它改回 transparent，测试立刻变红。
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const htmlPath = path.join(REPO_ROOT, 'apps/desktop/snip-overlay.html');
const mainPath = path.join(REPO_ROOT, 'apps/desktop/main.cjs');

/** 剥掉 CSS 注释，避免注释里的示例被误当成真实声明 */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 把一个颜色值解析成 alpha（0~1）；无法识别返回 null */
function colorAlpha(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return 0;
  if (v === 'inherit' || v === 'initial' || v === 'unset') return null;
  const rgba = v.match(/^rgba?\(\s*([^)]+)\)$/);
  if (rgba) {
    const parts = rgba[1].split(/[,/]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 4) {
      const a = parts[3].endsWith('%')
        ? parseFloat(parts[3]) / 100
        : parseFloat(parts[3]);
      return Number.isFinite(a) ? a : null;
    }
    return 1; // rgb(...) 无 alpha 通道 → 不透明
  }
  const hex = v.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1];
    if (h.length === 4) return parseInt(h[3] + h[3], 16) / 255; // #RGBA
    if (h.length === 8) return parseInt(h.slice(6, 8), 16) / 255; // #RRGGBBAA
    return 1; // #RGB / #RRGGBB
  }
  return null; // 其它（变量、渐变等）不参与判定
}

/** 取所有 `body` 选择器命中的规则里最后一条 background[-color] 声明的 alpha */
function bodyBackgroundAlpha(css: string): number | null {
  const clean = stripCssComments(css);
  let last: number | null = null;
  for (const rule of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1];
    const decls = rule[2];
    // 选择器列表里是否含独立的 body（`html, body` / `body` / `html > body`）
    const hitsBody = selector
      .split(',')
      .some((sel) => /(^|[\s>+~])body($|[\s.:#[>+~])/.test(sel.trim() + ' '));
    if (!hitsBody) continue;
    for (const decl of decls.split(';')) {
      const m = decl.match(/^\s*background(?:-color)?\s*:\s*(.+?)\s*$/i);
      if (!m) continue;
      const a = colorAlpha(m[1]);
      if (a !== null) last = a;
    }
  }
  return last;
}

describe('截图框选窗：透明像素不得全透明（Windows 点击穿透防回归）', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');

  it('snip-overlay.html 存在且含 body 样式块', () => {
    expect(html).toContain('<style>');
    expect(html).toMatch(/body\s*\{/);
  });

  it('★ body 背景 alpha 必须 > 0（否则 Windows 点击穿透 → 单击即退出）', () => {
    const alpha = bodyBackgroundAlpha(html);
    expect(alpha).not.toBeNull();
    expect(alpha!).toBeGreaterThan(0);
  });

  it('★ body 基底必须近乎不可见（alpha ≤ 0.1），不能为了修穿透把画面压暗', () => {
    const alpha = bodyBackgroundAlpha(html)!;
    expect(alpha).toBeLessThanOrEqual(0.1);
  });

  it('不得把 body 背景写回 transparent（该写法正是穿透根因）', () => {
    const clean = stripCssComments(html);
    // 逐条 body 规则检查：不允许出现 alpha 为 0 的背景声明
    for (const rule of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const hitsBody = rule[1]
        .split(',')
        .some((sel) => /(^|[\s>+~])body($|[\s.:#[>+~])/.test(sel.trim() + ' '));
      if (!hitsBody) continue;
      for (const decl of rule[2].split(';')) {
        const m = decl.match(/^\s*background(?:-color)?\s*:\s*(.+?)\s*$/i);
        if (!m) continue;
        const a = colorAlpha(m[1]);
        if (a !== null) expect(a, `body 背景不得为全透明：background: ${m[1]}`).toBeGreaterThan(0);
      }
    }
  });

  it('「挖洞」压暗元素仍然存在（#dim / #winHi / #sel 是设计的一部分）', () => {
    for (const id of ['dim', 'winHi', 'sel']) {
      expect(html).toContain(`id="${id}"`);
    }
  });
});

describe('截图主进程：会话退出路径必须可诊断', () => {
  const main = fs.readFileSync(mainPath, 'utf8');

  it('★ finishSnip 必须统一记录会话如何结束（否则日志断在 "overlay shown" 无从排障）', () => {
    const idx = main.indexOf('function finishSnip(');
    expect(idx).toBeGreaterThan(-1);
    const segment = main.slice(idx, idx + 1400);
    // 三种结局（ok / cancelled / error）都要能在日志里区分开
    expect(segment).toContain('snipLog(');
    expect(segment).toContain("'ok'");
    expect(segment).toContain("'cancelled'");
    expect(segment).toContain("'error'");
  });

  it('★ blur 分支必须记录 elapsed 并保留 armedAt 保护期', () => {
    const idx = main.indexOf("overlay.on('blur'");
    expect(idx).toBeGreaterThan(-1);
    const segment = main.slice(idx, idx + 900);
    expect(segment).toContain('snipLog(');
    expect(segment).toContain('elapsed');
    expect(segment).toMatch(/armedAt/);
    expect(segment).toContain('500');
    expect(segment).toContain('finishSnip(');
  });
});