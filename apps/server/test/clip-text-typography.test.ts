/**
 * 字幕排版（P1-2）单测：字体 / 字距 / 行距 / 加粗斜体 / 花字底板。
 *
 * ★ 关键不变量：
 *   ① 没有排版字段的字幕仍走 SRT+force_style（老工程出片不变）；
 *   ② 排版字段必须进 ASS（\fn / \fsp / \b1 / \i1），字体 id 必须在注册表里；
 *   ③ 花字底板用"大描边"撑圆角块，分两层渲染（底板层 + 文字层）；
 *   ④ 行距（ASS 无原生行距）按行拆条 + \pos 定位，只在无动画/无变换时生效。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { applyClipOp, type ClipProject } from '../src/services/clip-project';
import { buildRenderPlan, runRenderPlan, buildSubtitleAssets, textHasTypography } from '../src/services/clip-render';
import { hexToAss } from '../src/services/clip-render';

function run(base: ClipProject | null, ops: Array<[string, Record<string, unknown>]>): ClipProject {
  let cur = base;
  for (const [op, args] of ops) {
    const r = applyClipOp(cur, op, args);
    if (!r.ok) throw new Error(`[${op}] ${r.error}`);
    cur = r.project;
  }
  return cur!;
}

const baseProject = () => run(null, [
  ['create', { size: '320x568', fps: 30 }],
  ['add_clip', { clips: [{ file: 'C:/a.mp4' }] }],
]);

const textProject = (patch: Record<string, unknown>): ClipProject =>
  run(baseProject(), [['add_text', { texts: [{ text: '排版测试', start: 0, end: 2, position: 'center', ...patch }] }]]);

describe('P1-2 · 归一化', () => {
  it('字体进注册表才收；字距/底板厚度钳制；负数行距丢弃', () => {
    let p = textProject({
      fontFamily: 'kaiti', letterSpacingPx: 300, lineSpacingPx: -5,
      bold: true, italic: true, plateColor: '#E23A1A', platePaddingPx: 999,
    });
    const t = p.texts[0];
    expect(t.fontFamily).toBe('kaiti');
    expect(t.letterSpacingPx).toBe(100);
    expect(t.lineSpacingPx).toBeUndefined();
    expect(t.bold).toBe(true);
    expect(t.italic).toBe(true);
    expect(t.plateColor).toBe('#E23A1A');
    expect(t.platePaddingPx).toBe(80);

    // 未知字体：丢弃（libass 会静默回退，不能让"选了没反应"发生）
    const bad = textProject({ fontFamily: 'Comic Sans MS' });
    expect(bad.texts[0].fontFamily).toBeUndefined();

    // 非法底板色丢弃
    const badPlate = textProject({ plateColor: 'red' });
    expect(badPlate.texts[0].plateColor).toBeUndefined();

    // 显式 false 能清掉加粗；空底板色清掉底板
    p = run(p, [['update_text', { id: 't1', patch: { bold: false, plateColor: '' } }]]);
    expect(p.texts[0].bold).toBeUndefined();
    expect(p.texts[0].plateColor).toBeUndefined();
    expect(p.texts[0].platePaddingPx).toBeUndefined();
  });

  it('textHasTypography 只认排版字段', () => {
    expect(textHasTypography({ id: 't', text: 'x', start: 0, end: 1 })).toBe(false);
    expect(textHasTypography({ id: 't', text: 'x', start: 0, end: 1, bold: true })).toBe(true);
    expect(textHasTypography({ id: 't', text: 'x', start: 0, end: 1, plateColor: '#000000CC' })).toBe(true);
  });
});

describe('P1-2 · ASS 生成', () => {
  it('★ 无排版字段 → 只出 SRT（老工程渲染路径不变）', () => {
    const built = buildSubtitleAssets(textProject({}), 320, 568);
    expect(built.ass).toBeUndefined();
    expect(built.srt).toContain('排版测试');
  });

  it('字体/字距/加粗/斜体 → \\fn / \\fsp / \\b1 / \\i1（值按 resY/1920 换算）', () => {
    const p = textProject({ fontFamily: 'kaiti', letterSpacingPx: 30, bold: true, italic: true });
    const built = buildSubtitleAssets(p, 320, 568);
    expect(built.ass).toBeTruthy();
    const ass = built.ass!;
    expect(ass).toContain('\\fnKaiTi');
    expect(ass).toContain('\\b1');
    expect(ass).toContain('\\i1');
    // 30 * 568/1920 = 8.875 → 9
    expect(ass).toContain('\\fsp9');
  });

  it('花字底板：同一 cue 出两条 Dialogue（底板层 + 文字层），颜色转 ASS', () => {
    const p = textProject({ plateColor: '#E23A1A', platePaddingPx: 30 });
    const ass = buildSubtitleAssets(p, 320, 568).ass!;
    const lines = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(lines).toHaveLength(2);
    // 30 * 568/1920 ≈ 8.875 → 9
    expect(lines[0]).toContain('\\bord9');
    expect(lines[0]).toContain('\\3c&H001A3AE2&');   // #E23A1A → &H001A3AE2&
    expect(lines[1]).not.toContain('\\3c&H001A3AE2&');
    expect(lines[1]).toContain('排版测试');
  });

  it('多行 + 行距：按行拆条，两条 \\pos 的 y 不同（\\an2 底部对齐）', () => {
    const p = run(baseProject(), [['add_text', { texts: [{
      text: '第一行\n第二行', start: 0, end: 2, position: 'bottom', lineSpacingPx: 40,
    }] }]]);
    const ass = buildSubtitleAssets(p, 320, 568).ass!;
    const lines = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('\\an2\\pos(160,');
    expect(lines[1]).toContain('\\an2\\pos(160,');
    const ys = lines.map((l) => Number(/\\pos\(160,(\d+)\)/.exec(l)![1]));
    expect(ys[0]).toBeLessThan(ys[1]);   // 第一行在上（y 更小）
  });

  it('动画字样也能带字体/字距（typo 合进动画标签）', () => {
    const p = run(baseProject(), [['add_text', { texts: [{
      text: '弹跳', start: 0, end: 2, animation: 'pop', fontFamily: 'simhei',
    }] }]]);
    const ass = buildSubtitleAssets(p, 320, 568).ass!;
    expect(ass).toContain('\\fnSimHei');
    expect(ass).toContain('\\fscx70');   // pop 的原有动画标签还在
  });
});

describe('P1-2 · hexToAss', () => {
  it('6 位=不透明；8 位按"不透明度→透明度"换算（此前 8 位一直回落）', () => {
    expect(hexToAss('#E23A1A', '&H7F000000&')).toBe('&H001A3AE2&');
    // CC=80% 不透明 → ASS alpha=0x33（51）
    expect(hexToAss('#000000CC', '&H7F000000&')).toBe('&H33000000&');
    expect(hexToAss('', '&H7F000000&')).toBe('&H7F000000&');
  });
});

// ===== ffmpeg 实跑 =====
const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);

function lumaAtRegion(file: string, at: number, w: number, h: number, x: number, y: number): number {
  const r = spawnSync(FFMPEG, [
    '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '1',
    '-vf', `crop=${w}:${h}:${x}:${y},signalstats,metadata=print:file=-`, '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const m = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(r.stdout || '');
  if (!m) throw new Error(`没取到亮度：${(r.stdout || '').slice(-200)}`);
  return Number(m[1]);
}

async function renderText(outDir: string, patch: Record<string, unknown>, base: string, expectAss = true): Promise<string> {
  const p = run(null, [
    ['create', { size: '320x568', fps: 30 }],
    ['add_clip', { clips: [{ file: base }] }],
    ['add_text', { texts: [{ text: '排版测试', start: 0, end: 2, position: 'center', ...patch }] }],
  ]);
  const workDir = path.join(outDir, 'work');
  const outFile = path.join(outDir, 'out.mp4');
  fs.mkdirSync(workDir, { recursive: true });
  const plan = buildRenderPlan({ project: p, durations: { [base]: 2 }, hasAudio: { [base]: false }, workDir, outFile, cover: false });
  if (!plan.ok) throw new Error(plan.error);
  for (const a of plan.plan.assets) fs.writeFileSync(a.file, a.content, 'utf8');
  // 有排版时必须走 ASS 烧录
  const subStep = plan.plan.steps.find((s) => s.label.includes('字幕'));
  expect(subStep, '缺少字幕步骤').toBeTruthy();
  expect(subStep!.args.join(' ')).toContain(expectAss ? '.ass' : '.srt');
  const r = await runRenderPlan(FFMPEG, plan.plan.steps);
  if (!r.ok) throw new Error(`${r.failedLabel}: ${r.stderr}`);
  return outFile;
}

describe.skipIf(!HAS_FFMPEG)('P1-2 · ffmpeg 实跑', () => {
  it('花字底板让中心区域变亮/变彩；换字体会改变字形像素', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-typo-e2e-'));
    try {
      const base = path.join(tmp, 'base.mp4');
      execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x568:d=2:r=30',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', base]);

      const plain = await renderText(path.join(tmp, 'plain'), { fontSizePx: 88, color: '#FFFFFF' }, base, false);
      const plate = await renderText(path.join(tmp, 'plate'), {
        fontSizePx: 88, color: '#FFFFFF', plateColor: '#E23A1A', platePaddingPx: 40,
      }, base);
      const kaiti = await renderText(path.join(tmp, 'kaiti'), { fontSizePx: 88, color: '#FFFFFF', fontFamily: 'kaiti' }, base);

      // 底板：中心区域（文字+底板）明显比只有白字时更亮（红色底板面积大）
      const center = [100, 80, 60, 244] as const;
      expect(lumaAtRegion(plate, 1.0, ...center)).toBeGreaterThan(lumaAtRegion(plain, 1.0, ...center) + 5);
      // 换字体：字形像素不同（同一句话的渲染结果不应逐像素相同）
      const a = spawnSync(FFMPEG, ['-v', 'error', '-ss', '1', '-i', plain, '-ss', '1', '-i', kaiti, '-frames:v', '1',
        '-filter_complex', '[0:v][1:v]blend=all_mode=difference,signalstats,metadata=print:file=-', '-f', 'null', '-'],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      const m = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(a.stdout || '');
      expect(m, '没取到字体差异').toBeTruthy();
      expect(Number(m![1])).toBeGreaterThan(0.5);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }, 180000);
});
