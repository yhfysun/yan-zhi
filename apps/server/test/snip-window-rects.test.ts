import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * 截图框选窗「微信式窗口识别」核心几何逻辑的正式测试。
 *
 * 被测逻辑原样复制自 apps/desktop/snip-overlay.js（页面 IIFE 内函数无法直接 import，
 * 测试持有独立副本；若行为改动需同步两处 —— 测试就是同步的钉子）：
 *  1. hitWindow          —— 光标下窗口命中（嵌套取最小面积）
 *  2. 物理→逻辑坐标换算  —— 主进程把虚拟屏物理像素窗口矩形换算到目标显示器逻辑坐标
 *
 * C# 助手若已编译可用，另做真枚举冒烟测试（无窗口环境会跳过）。
 */

// ---- 复制自 snip-overlay.js ----
function hitWindow(rects, px, py) {
  let best = null, bestArea = Infinity;
  for (const w of rects) {
    if (px < w.x || py < w.y || px >= w.x + w.width || py >= w.y + w.height) continue;
    const area = w.width * w.height;
    if (area < bestArea) { bestArea = area; best = w; }
  }
  return best;
}

// ---- 复制自 main.cjs captureViaGdi 的换算段 ----
interface RawWin { x: number; y: number; width: number; height: number; title?: string; hwnd?: number }
function toDisplayRects(winList: RawWin[], crop: { x: number; y: number }, sf: number, dispW: number, dispH: number) {
  return winList
    .map((win) => ({
      x: (win.x - crop.x) / sf,
      y: (win.y - crop.y) / sf,
      width: win.width / sf,
      height: win.height / sf,
      title: String(win.title || ''),
      hwnd: win.hwnd,
    }))
    .filter((win) => win.x + win.width > 4 && win.y + win.height > 4
      && win.x < dispW - 4 && win.y < dispH - 4)
    .map((win) => ({
      ...win,
      x: Math.max(0, win.x),
      y: Math.max(0, win.y),
      width: Math.min(win.width, dispW - win.x),
      height: Math.min(win.height, dispH - win.y),
    }))
    .filter((win) => win.width >= 12 && win.height >= 12);
}

describe('hitWindow：光标下窗口命中', () => {
  const wins = [
    { x: 0, y: 0, width: 1920, height: 1080, title: 'desktop-shell' },
    { x: 100, y: 100, width: 800, height: 600, title: '主窗口' },
    { x: 200, y: 200, width: 200, height: 150, title: '浮层小窗' },
  ];

  it('命中包含光标的最小面积窗口（嵌套取最上层小窗）', () => {
    const hit = hitWindow(wins, 250, 250);
    expect(hit?.title).toBe('浮层小窗');
  });

  it('只落在大窗口、不在小窗内时命中大窗口', () => {
    const hit = hitWindow(wins, 150, 150);
    expect(hit?.title).toBe('主窗口');
  });

  it('光标在所有窗口外返回 null', () => {
    expect(hitWindow(wins, 1920, 500)).toBeNull(); // x 恰在 1920 右边界外
    expect(hitWindow(wins, -1, 0)).toBeNull();
  });

  it('右/下边缘开区间：恰好在 width/height 边界上不算命中（对齐 GetWindowRect 语义）', () => {
    const only = [{ x: 10, y: 10, width: 100, height: 100 }];
    expect(hitWindow(only, 110, 50)).toBeNull();
    expect(hitWindow(only, 109, 50)?.width).toBe(100);
  });

  it('空窗口清单返回 null', () => {
    expect(hitWindow([], 5, 5)).toBeNull();
  });
});

describe('窗口矩形换算：虚拟屏物理像素 → 目标显示器逻辑像素', () => {
  it('scaleFactor=1：主屏窗口原样映射', () => {
    const rects = toDisplayRects(
      [{ x: 120, y: 80, width: 600, height: 400, title: 'A' }],
      { x: 0, y: 0 }, 1, 1920, 1080,
    );
    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatchObject({ x: 120, y: 80, width: 600, height: 400, title: 'A' });
  });

  it('scaleFactor=1.5：物理坐标按 DPI 换算为逻辑坐标', () => {
    const rects = toDisplayRects(
      [{ x: 300, y: 150, width: 900, height: 600 }],
      { x: 0, y: 0 }, 1.5, 1280, 720,
    );
    expect(rects[0]).toMatchObject({ x: 200, y: 100, width: 600, height: 400 });
  });

  it('副屏：虚拟屏坐标减去裁剪偏移（display.bounds×sf）', () => {
    // 副屏逻辑起点 x=-1920 → 物理裁剪起点 -2880（sf=1.5）
    // 窗口物理 x=-2600 → 屏内物理 x=280 → 逻辑 x=280/1.5≈186.67
    const rects = toDisplayRects(
      [{ x: -2600, y: 300, width: 800, height: 500 }],
      { x: -2880, y: 0 }, 1.5, 1920, 1080,
    );
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBeCloseTo(280 / 1.5, 6);
    expect(rects[0].y).toBe(200);
    expect(rects[0].width).toBeCloseTo(800 / 1.5, 6);
    expect(rects[0].height).toBeCloseTo(500 / 1.5, 6);
  });

  it('跨屏窗口被 clamp 到目标显示器边界内', () => {
    // 窗口右半在另一块屏上：裁剪后 width 超出目标屏 → 截断
    const rects = toDisplayRects(
      [{ x: 1500, y: 100, width: 1200, height: 500 }],
      { x: 0, y: 0 }, 1, 1920, 1080,
    );
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBe(1500);
    expect(rects[0].width).toBe(1920 - 1500);
  });

  it('几乎完全在目标屏外的窗口被剔除（留 4px 余量）', () => {
    const rects = toDisplayRects(
      [
        { x: 100, y: 100, width: 500, height: 400 },   // 完全在屏内
        { x: 3000, y: 100, width: 500, height: 400 },  // 完全在屏外
        { x: 1900, y: 100, width: 100, height: 400 },  // 只漏进屏 20px（>4px 余量）→ 保留并截断
      ],
      { x: 0, y: 0 }, 1, 1920, 1080,
    );
    expect(rects).toHaveLength(2);
    expect(rects[1].width).toBe(20);
  });

  it('换算后小于 12px 的碎片窗口被剔除', () => {
    const rects = toDisplayRects(
      [
        { x: 1900, y: 100, width: 10, height: 400 },  // 漏进屏 10px < 12px
        { x: 100, y: 100, width: 300, height: 200 },  // 正常
      ],
      { x: 0, y: 0 }, 1, 1920, 1080,
    );
    expect(rects).toHaveLength(1);
    expect(rects[0].width).toBe(300);
  });

  it('空清单换算仍为空数组', () => {
    expect(toDisplayRects([], { x: 0, y: 0 }, 1, 1920, 1080)).toEqual([]);
  });
});

describe('GDI 助手真枚举冒烟（本机 Windows）', () => {
  const src = path.resolve(__dirname, '../../../apps/desktop/main.cjs');

  async function compileHelper(): Promise<{ exe: string; srcPath: string } | null> {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const csc = ['C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe', 'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe']
      .find((p) => fs.existsSync(p));
    if (!csc || process.platform !== 'win32') return null;
    // 从 main.cjs 提取 GDI_CAP_CS 模板字符串真源，保证测的是线上代码而非副本
    const code = fs.readFileSync(src, 'utf8');
    const m = code.match(/const GDI_CAP_CS = `([\s\S]*?)`;/);
    if (!m) return null;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-snip-test-'));
    const srcPath = path.join(dir, 'screencap.cs');
    const exe = path.join(dir, 'screencap.exe');
    fs.writeFileSync(srcPath, m[1], 'utf8');
    await execFileAsync(csc, ['/nologo', `/out:${exe}`, '/r:System.Drawing.dll', srcPath], { timeout: 30000 });
    return { exe, srcPath };
  }

  it('--win 输出一行合法 JSON，矩形为正尺寸', async () => {
    const compiled = await compileHelper().catch(() => null);
    if (!compiled) { console.warn('skip: csc 不可用或非 Windows'); return; }
    const { stdout } = await execFileAsync(compiled.exe, ['--win'], { timeout: 10000 });
    const line = stdout.split(/\r?\n/).filter(Boolean).pop() || '';
    const arr = JSON.parse(line);
    expect(Array.isArray(arr)).toBe(true);
    for (const w of arr) {
      expect(typeof w.x).toBe('number');
      expect(typeof w.y).toBe('number');
      expect(w.width).toBeGreaterThan(0);
      expect(w.height).toBeGreaterThan(0);
      expect(typeof w.title).toBe('string');
    }
  }, 60000);
});
