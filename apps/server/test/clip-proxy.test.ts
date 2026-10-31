/**
 * 段代理预览单测（apps/server/src/services/clip-proxy）。
 *
 * ★★★ 为什么必须测：缓存键与指纹是"改一段只重渲一段"的根基 ——
 *   键没随参数变化（漏字段/键序不稳）会让用户看到旧画面，且不报错。
 *   ffmpeg 实渲染无法在本机验证（无 ffmpeg），纯函数层是最便宜的可验证面。
 *
 * 覆盖：
 *   ① 段指纹/缓存键变化失效（改参数键必须变；同段同参数键稳定）
 *   ② 画幅换算（长边 480 / 偶数对齐 / 非法输入回落）
 *   ③ 段时长换算（裁剪/变速/曲线变速/图片段，与渲染口径一致）
 *   ④ 缓存清理（pruneProxyCache 真文件行为：只删 .mp4、淘汰最旧）
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  segmentFingerprint, proxyCacheKey, proxyTargetSize, proxySegmentSeconds,
  pruneProxyCache, proxyCacheDir, PROXY_CACHE_MAX,
} from '../src/services/clip-proxy';
import { createEmptyProject, applyClipOp, type ClipProject } from '../src/services/clip-project';

function proj(ops: Array<[string, Record<string, unknown>]>): ClipProject {
  let cur: ClipProject | null = createEmptyProject('t');
  for (const [op, args] of ops) {
    const r = applyClipOp(cur, op, args);
    if (!r.ok) throw new Error(`${op}: ${r.error}`);
    cur = r.project;
  }
  return cur!;
}

/** 铺一个假缓存文件（1 字节），供 prune 测试用。 */
function seedFile(name: string): void {
  fs.mkdirSync(proxyCacheDir(), { recursive: true });
  fs.writeFileSync(path.join(proxyCacheDir(), name), 'x');
}

afterAll(() => {
  // 测试铺的假文件整体清掉（正式缓存目录本来就是 tmpdir 下的可再生缓存）
  try { fs.rmSync(proxyCacheDir(), { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('segmentFingerprint / proxyCacheKey · 指纹变化失效', () => {
  it('★ 改了段参数 → 缓存键必须变', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    const seg = p.clips[0];
    const k1 = proxyCacheKey(seg, { w: 270, h: 480 }, 30);
    const k2 = proxyCacheKey({ ...seg, speed: 2 }, { w: 270, h: 480 }, 30);
    expect(k1).not.toBe(k2);
  });

  it('★ 每个画面/声音字段变化都失效（抽关键几项验证不漏）', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4', colorPreset: 'warm', adjust: { brightness: 0.1 } }] }]]);
    const seg = p.clips[0];
    const base = proxyCacheKey(seg, { w: 270, h: 480 }, 30);
    const variants = [
      { ...seg, trimStart: 1 },
      { ...seg, trimEnd: 5 },
      { ...seg, colorPreset: 'cold' },
      { ...seg, colorStrength: 0.5 },
      { ...seg, adjust: { brightness: 0.2 } },
      { ...seg, fx: 'shake' },
      { ...seg, fadeIn: 0.5 },
      { ...seg, fadeOut: 0.5 },
      { ...seg, mask: { shape: 'circle' } },
      { ...seg, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } },
      { ...seg, reverse: true },
      { ...seg, rotate: 90 },
      { ...seg, flip: 'h' as const },
      { ...seg, volume: 0.5 },
      { ...seg, audioFile: 'C:/dub.mp3' },
      { ...seg, kenburns: { direction: 'in' as const, duration: 4 } },
      { ...seg, keyframes: [{ t: 0, scale: 1.5 }] },
      { ...seg, speedCurve: [{ t: 0, speed: 0.5 }, { t: 1, speed: 2 }] },
    ];
    for (const v of variants) {
      expect(proxyCacheKey(v, { w: 270, h: 480 }, 30)).not.toBe(base);
    }
    expect(segmentFingerprint(seg)).toBeTruthy();
  });

  it('★ 同段同参数键稳定（两次计算一致）', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    const seg = p.clips[0];
    const k1 = proxyCacheKey(seg, { w: 270, h: 480 }, 30);
    const k2 = proxyCacheKey(seg, { w: 270, h: 480 }, 30);
    expect(k1).toBe(k2);
  });

  it('★ 改画幅或帧率 → 键必须变', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    const seg = p.clips[0];
    const k1 = proxyCacheKey(seg, { w: 270, h: 480 }, 30);
    const k2 = proxyCacheKey(seg, { w: 480, h: 270 }, 30);
    const k3 = proxyCacheKey(seg, { w: 270, h: 480 }, 25);
    expect(k2).not.toBe(k1);
    expect(k3).not.toBe(k1);
  });
});

describe('proxyTargetSize · 画幅换算', () => {
  it('★ 1080x1920（竖屏）→ 270x480', () => {
    expect(proxyTargetSize('1080x1920')).toEqual({ w: 270, h: 480 });
  });

  it('★ 1920x1080（横屏）→ 480x270', () => {
    expect(proxyTargetSize('1920x1080')).toEqual({ w: 480, h: 270 });
  });

  it('★ 1080x1080（方图）→ 480x480', () => {
    expect(proxyTargetSize('1080x1080')).toEqual({ w: 480, h: 480 });
  });

  it('★ 宽高都是偶数（yuv420p 要求）', () => {
    const cases = ['1080x1920', '1920x1080', '720x1280', '1000x1000', '853x480'];
    for (const c of cases) {
      const { w, h } = proxyTargetSize(c);
      expect(w % 2).toBe(0);
      expect(h % 2).toBe(0);
    }
  });

  it('★ 非法画幅回落 270x480', () => {
    expect(proxyTargetSize('')).toEqual({ w: 270, h: 480 });
    expect(proxyTargetSize('0x0')).toEqual({ w: 270, h: 480 });
    expect(proxyTargetSize('abc')).toEqual({ w: 270, h: 480 });
  });
});

describe('proxySegmentSeconds · 段时长换算', () => {
  it('★ 未裁剪段 = 素材全长', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    expect(proxySegmentSeconds(p.clips[0], 10)).toBeCloseTo(10);
  });

  it('★ 裁剪 2~6s → 4s', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4', trimStart: 2, trimEnd: 6 }] }]]);
    expect(proxySegmentSeconds(p.clips[0], 10)).toBeCloseTo(4);
  });

  it('★ 裁剪 2~6s + 2 倍速 → 2s', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4', trimStart: 2, trimEnd: 6, speed: 2 }] }]]);
    expect(proxySegmentSeconds(p.clips[0], 10)).toBeCloseTo(2);
  });

  it('★ trimEnd 超源长被夹住（10s 素材裁 0~99s → 10s）', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4', trimStart: 0, trimEnd: 99 }] }]]);
    expect(proxySegmentSeconds(p.clips[0], 10)).toBeCloseTo(10);
  });

  it('★ 曲线变速段时长 = 曲线下面积（慢速段贡献更大）', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4', speedCurve: [{ t: 0, speed: 0.5 }, { t: 1, speed: 2 }] }] }]]);
    const d = proxySegmentSeconds(p.clips[0], 10);
    expect(d).not.toBeNull();
    // 0.5~2 速线性混合：时长必在「全程 0.5 速=20s」与「全程 2 速=5s」之间
    expect(d!).toBeGreaterThan(5);
    expect(d!).toBeLessThan(20);
  });

  it('★ 素材时长探测失败（rawDur=0）→ null（代理拒绝生成）', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    expect(proxySegmentSeconds(p.clips[0], 0)).toBeNull();
  });

  it('★ 图片段（kenburns）用其 duration，不看 rawDur', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/pic.png', kenburns: { direction: 'in', duration: 4 } }] }]]);
    expect(proxySegmentSeconds(p.clips[0], 0)).toBeCloseTo(4);
  });

  it('★ kenburns duration 非法（0）→ null（纯函数边界；op 层会先钳到 1，这里绕过 op 直构）', () => {
    const seg = { id: 'c1', file: 'C:/pic.png', kenburns: { direction: 'none' as const, duration: 0 } };
    expect(proxySegmentSeconds(seg, 0)).toBeNull();
  });
});

describe('pruneProxyCache · 缓存清理', () => {
  it('★ 未超上限 → 一个都不删', async () => {
    seedFile('aa000000000000000001.mp4');
    seedFile('aa000000000000000002.mp4');
    seedFile('aa000000000000000003.mp4');
    await pruneProxyCache();
    expect(fs.existsSync(path.join(proxyCacheDir(), 'aa000000000000000001.mp4'))).toBe(true);
    expect(fs.existsSync(path.join(proxyCacheDir(), 'aa000000000000000002.mp4'))).toBe(true);
    expect(fs.existsSync(path.join(proxyCacheDir(), 'aa000000000000000003.mp4'))).toBe(true);
  });

  it('★ 超上限 → 按 mtime 淘汰最旧，只留 .mp4（tmp-* 目录不动）', async () => {
    // 铺 PROXY_CACHE_MAX + 10 个文件，mtime 递增 1s（显式 utimes，避免文件系统 mtime 分辨率问题）
    const n = PROXY_CACHE_MAX + 10;
    const base = Date.now() - n * 1000;
    for (let i = 0; i < n; i++) {
      const name = `bb${String(i).padStart(18, '0')}.mp4`;
      seedFile(name);
      fs.utimesSync(path.join(proxyCacheDir(), name), new Date(base + i * 1000), new Date(base + i * 1000));
    }
    // 一个非 mp4 干扰项（不应被清理逻辑触碰）
    fs.mkdirSync(path.join(proxyCacheDir(), 'tmp-probe'), { recursive: true });
    fs.writeFileSync(path.join(proxyCacheDir(), 'tmp-probe', 'inner.txt'), 'x');

    await pruneProxyCache();

    // 保留数 = floor(500 * 0.75) = 375；最旧的 135 个应被删
    const keep = Math.floor(PROXY_CACHE_MAX * 0.75);
    const mp4s = fs.readdirSync(proxyCacheDir()).filter((f) => f.endsWith('.mp4'));
    expect(mp4s.length).toBe(keep);
    // 最新的（bb…509）保留，最旧的（bb…000）删除
    expect(fs.existsSync(path.join(proxyCacheDir(), `bb${String(n - 1).padStart(18, '0')}.mp4`))).toBe(true);
    expect(fs.existsSync(path.join(proxyCacheDir(), 'bb000000000000000000.mp4'))).toBe(false);
    // tmp-* 目录仍在
    expect(fs.existsSync(path.join(proxyCacheDir(), 'tmp-probe', 'inner.txt'))).toBe(true);
  });
});
