/**
 * 智能竖屏重构（P2-4 MVP）测试。
 *
 * 覆盖两块：
 *   ① 纯函数 computeFaceCenteredCrop：单脸居中 / 多脸中位 / 目标画幅窗口与边界夹取 /
 *      zoom 夹取 / 无人脸回退 + warning / 非法输入；
 *   ② IO reframeVertical（模块 mock）：文件不存在、脚本缺失、cv2 不可用、成功路径、
 *      片段时间区间透传。ffprobe / Python 一律 mock，不依赖本机媒体环境。
 *   ③ 可选实跑：本机 python 若真带 Haar 级联，就跑一次真实脚本（无人脸视频应返回空数组）。
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeFaceCenteredCrop, parseTargetAspect, reframeVertical, TARGET_ASPECTS,
  buildFaceTrack, trackToCropExpr,
} from '../src/services/clip-reframe.js';
import { buildSegmentFilters } from '../src/services/clip-render.js';
import type { ClipSegment } from '../src/services/clip-project.js';

const h = vi.hoisted(() => ({
  probe: { durationSec: 10, width: 1920, height: 1080 },
  scriptPath: '/fake/face_center.py' as string | null,
  scriptStdout: '',
  scriptStderr: '',
  scriptExit: 0,
  runs: 0,
  lastArgs: [] as string[],
}));

vi.mock('../src/mcp/ffmpeg-runtime.js', () => ({
  resolveFfmpeg: vi.fn(async () => ({ ok: true, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' })),
}));

vi.mock('../src/services/exec-cmd.js', () => ({
  runCmd: vi.fn(async () => ({
    ok: true,
    code: 0,
    stdout: JSON.stringify({
      format: { duration: String(h.probe.durationSec) },
      streams: [{ codec_type: 'video', width: h.probe.width, height: h.probe.height }],
    }),
    stderr: '',
    error: '',
    timedOut: false,
  })),
  // 测试里不投递 PATH 探测：候选解释器只有 findPython 返回的一个
  lookupOnPath: vi.fn(async () => null),
}));

vi.mock('@yan-zhi/core', () => ({
  findPython: vi.fn(async () => 'python'),
  getPythonScript: vi.fn(() => h.scriptPath),
  runPythonScript: vi.fn(async (_script: string, args: string[]) => {
    h.runs += 1;
    h.lastArgs = args;
    return { stdout: h.scriptStdout, stderr: h.scriptStderr, exitCode: h.scriptExit };
  }),
}));

// ════════════════════════════════════════════════════════════════════════════
// 纯函数
// ════════════════════════════════════════════════════════════════════════════

describe('computeFaceCenteredCrop · 人脸居中', () => {
  it('单脸：裁切窗口中心落在人脸中心', () => {
    const r = computeFaceCenteredCrop({
      frameW: 1920, frameH: 1080,
      faces: [{ t: 1, x: 860, y: 440, w: 200, h: 200 }],
      targetAspect: TARGET_ASPECTS['9:16'],
    });
    // 16:9 素材 → 9:16：高度撑满，宽度 = 1080*9/16
    expect(r.crop.h).toBeCloseTo(1, 4);
    expect(r.crop.w).toBeCloseTo(0.3164, 3);
    expect(r.crop.x + r.crop.w / 2).toBeCloseTo(0.5, 3);
    expect(r.crop.y + r.crop.h / 2).toBeCloseTo(0.5, 3);
    expect(r.warning).toBeUndefined();
  });

  it('多脸：取中位中心（对离群脸不敏感）', () => {
    const r = computeFaceCenteredCrop({
      frameW: 1080, frameH: 1920,
      faces: [
        { x: 200, y: 500, w: 200, h: 200 },   // 中心 (300, 600)
        { x: 440, y: 800, w: 200, h: 200 },   // 中心 (540, 900) ← 中位
        { x: 700, y: 1100, w: 200, h: 200 },  // 中心 (800, 1200)
      ],
      targetAspect: 1,
    });
    // 1:1 窗口 = 1080×1080：x 居中，y 跟着中位中心
    expect(r.crop.w).toBeCloseTo(1, 4);
    expect(r.crop.h).toBeCloseTo(0.5625, 4);
    expect(r.crop.x).toBeCloseTo(0, 4);
    expect(r.crop.y).toBeCloseTo(0.1875, 4);
  });

  it('目标 9:16 的窗口保持宽高比', () => {
    const r = computeFaceCenteredCrop({
      frameW: 1080, frameH: 1920,
      faces: [{ x: 440, y: 860, w: 200, h: 200 }],
      targetAspect: TARGET_ASPECTS['9:16'],
    });
    const pxW = r.crop.w * 1080;
    const pxH = r.crop.h * 1920;
    expect(pxW / pxH).toBeCloseTo(9 / 16, 3);
  });

  it('人脸靠边时窗口夹到画面内（x+w ≤ 1）', () => {
    const r = computeFaceCenteredCrop({
      frameW: 1000, frameH: 1000,
      faces: [{ x: 900, y: 450, w: 100, h: 100 }],  // 中心 x=950
      targetAspect: TARGET_ASPECTS['9:16'],
    });
    expect(r.crop.x).toBeCloseTo(0.4375, 4);
    expect(r.crop.x + r.crop.w).toBeCloseTo(1, 4);
    expect(r.crop.y + r.crop.h).toBeLessThanOrEqual(1);
  });

  it('zoom 夹到 0.6~1，窗口按比例缩小', () => {
    const base = { frameW: 1920, frameH: 1080, faces: [{ x: 860, y: 440, w: 200, h: 200 }], targetAspect: 9 / 16 };
    const tight = computeFaceCenteredCrop({ ...base, zoom: 0.1 });
    expect(tight.crop.w).toBeCloseTo(0.3164 * 0.6, 3);
    expect(tight.warning).toMatch(/zoom/);
    const wide = computeFaceCenteredCrop({ ...base, zoom: 5 });
    expect(wide.crop.w).toBeCloseTo(0.3164, 3);
    expect(wide.warning).toMatch(/zoom/);
  });

  it('无人脸：回退画面中心 + warning，confidence=0', () => {
    const r = computeFaceCenteredCrop({ frameW: 1920, frameH: 1080, faces: [], targetAspect: 1 });
    expect(r.crop.x).toBeCloseTo(0.2188, 3);
    expect(r.crop.y).toBeCloseTo(0, 4);
    expect(r.crop.w).toBeCloseTo(0.5625, 4);
    expect(r.crop.h).toBeCloseTo(1, 4);
    expect(r.confidence).toBe(0);
    expect(r.warning).toContain('未检测到人脸');
  });

  it('confidence = 检出帧占比（传入 sampleCount 时）', () => {
    const faces = Array.from({ length: 4 }, (_, i) => ({ x: 800 + i, y: 400, w: 200, h: 200 }));
    const r = computeFaceCenteredCrop({ frameW: 1920, frameH: 1080, faces, targetAspect: 9 / 16, sampleCount: 10 });
    expect(r.confidence).toBeCloseTo(0.4, 4);
  });

  it('非法输入：画幅非正数抛错；非法画幅/人脸走兜底并 warning', () => {
    expect(() => computeFaceCenteredCrop({ frameW: 0, frameH: 1080, faces: [], targetAspect: 1 })).toThrow();
    expect(() => computeFaceCenteredCrop({ frameW: 1920, frameH: -1, faces: [], targetAspect: 1 })).toThrow();

    const badAspect = computeFaceCenteredCrop({
      frameW: 1920, frameH: 1080, faces: [], targetAspect: Number.NaN,
    });
    expect(badAspect.warning).toContain('目标画幅无效');
    expect(badAspect.crop.w).toBeCloseTo(0.3164, 3);

    // 越界 / 负数 / 超大（>90% 画面）/ 非数值的人脸全部忽略 → 等同于无人脸
    const invalid = computeFaceCenteredCrop({
      frameW: 1920, frameH: 1080,
      faces: [
        { x: Number.NaN, y: 0, w: 100, h: 100 },
        { x: -500, y: 400, w: 100, h: 100 },
        { x: 0, y: 0, w: 1900, h: 1000 },
        { x: 900, y: 400, w: -20, h: 100 },
      ],
      targetAspect: 1,
    });
    expect(invalid.warning).toContain('未检测到人脸');
    expect(invalid.confidence).toBe(0);

    // faces 不是数组也不炸
    const notArray = computeFaceCenteredCrop({
      frameW: 1920, frameH: 1080, faces: null as unknown as [],
      targetAspect: 1,
    });
    expect(notArray.warning).toContain('未检测到人脸');
  });
});

describe('buildFaceTrack · 动态跟随路径', () => {
  const FRAME = { frameW: 1920, frameH: 1080 };
  const face = (t: number, cx: number) => ({ t, x: cx - 100, y: 440, w: 200, h: 200 });

  it('按时间排序 + 首尾端点覆盖 + 窗口中心随人脸移动', () => {
    const r = buildFaceTrack(
      [face(10, 1000), face(0, 500), face(5, 750), face(2, 600), face(8, 900)],
      FRAME.frameW, FRAME.frameH, 10,
      { targetAspect: 9 / 16, sampleCount: 5 },
    );
    expect(r.track.length).toBeGreaterThanOrEqual(2);
    // 首尾显式 t=0 / t=1（脚本的抽样点通常不落在端点）
    expect(r.track[0].t).toBe(0);
    expect(r.track[r.track.length - 1].t).toBe(1);
    // t 单调递增
    for (let i = 1; i < r.track.length; i++) expect(r.track[i].t).toBeGreaterThan(r.track[i - 1].t);
    // 人脸从左往右 → 窗口中心也向右（9:16 窗口宽 607.5，画面两侧留白）
    expect(r.track[r.track.length - 1].x).toBeGreaterThan(r.track[0].x);
    expect(r.confidence).toBeCloseTo(1, 4);
    expect(r.warnings.join('')).not.toMatch(/未检测到人脸/);
  });

  it('无窗口平滑中值：单帧误检被邻点拉回', () => {
    const r = buildFaceTrack(
      [face(0, 600), face(5, 1400), face(10, 600)],   // 中间一帧跳出去
      FRAME.frameW, FRAME.frameH, 10,
      { targetAspect: 9 / 16, sampleCount: 3, smoothWindow: 3, maxStep: 0.5 },
    );
    const mid = r.track.find((p) => Math.abs(p.t - 0.5) < 0.001);
    expect(mid).toBeDefined();
    // 中值平滑后中间点应落回两侧附近的构图（而不是紧跟误检的 1400）
    expect(mid!.x).toBeLessThan(0.6);
  });

  it('单步位移限幅：大跳被拆成每步 ≤ maxStep', () => {
    const r = buildFaceTrack(
      [face(0, 300), face(10, 1600)],
      FRAME.frameW, FRAME.frameH, 10,
      { targetAspect: 9 / 16, sampleCount: 2, smoothWindow: 1, maxStep: 0.05 },
    );
    const [a, b] = r.track;
    expect(b.x - a.x).toBeCloseTo(0.05, 6);
  });

  it('无人脸 / 单帧人脸 → 空轨迹 + warning（回退静态）', () => {
    const none = buildFaceTrack([], FRAME.frameW, FRAME.frameH, 10, { targetAspect: 9 / 16 });
    expect(none.track).toEqual([]);
    expect(none.warnings.join('')).toContain('未检测到人脸');

    const one = buildFaceTrack([face(5, 900)], FRAME.frameW, FRAME.frameH, 10, { targetAspect: 9 / 16, sampleCount: 1 });
    expect(one.track).toEqual([]);
    expect(one.warnings.join('')).toContain('只检出 1 帧');
  });

  it('区间外的采样点被丢弃；区间时长无效时不给轨迹', () => {
    const r = buildFaceTrack(
      [face(5, 500), face(20, 1200), face(9, 800)],   // 20s 在[2,10)区间外
      FRAME.frameW, FRAME.frameH, 8,
      { targetAspect: 9 / 16, windowStartSec: 2, sampleCount: 3 },
    );
    // 2 个区间内采样 + 首尾补齐 = 4 点（区间外的 20s 点被丢弃）
    expect(r.track.length).toBe(4);
    expect(r.track[0].t).toBe(0);
    expect(r.track[r.track.length - 1].t).toBe(1);
    const bad = buildFaceTrack([face(1, 500)], FRAME.frameW, FRAME.frameH, 0, { targetAspect: 9 / 16 });
    expect(bad.track).toEqual([]);
    expect(bad.warnings.join('')).toContain('时长无效');
  });
});

describe('trackToCropExpr · crop 表达式', () => {
  const tr = [
    { t: 0, x: 0.3, y: 0.5 },
    { t: 0.5, x: 0.6, y: 0.4 },
    { t: 1, x: 0.8, y: 0.5 },
  ];

  it('生成分段线性 if/lerp 表达式，归一化到段长（时间基准 = 段内输出时间）', () => {
    const e = trackToCropExpr(tr, { w: 0.4, h: 0.9, dur: 6 });
    expect(e).not.toBeNull();
    // 时间基准：t/dur（crop 在 setpts 之后，t 是变速后的段内秒数）
    expect(e!.x).toContain('(t/6)');
    expect(e!.y).toContain('(t/6)');
    expect(e!.x).toContain('if(lt(');
    expect(e!.x).toContain('lerp(');
    // 中心 → 左上角，并按 iw/ih/ow/oh 夹到画面内
    expect(e!.x).toContain('min(max(iw*(');
    expect(e!.x).toContain('iw-ow');
    expect(e!.y).toContain('min(max(ih*(');
    expect(e!.y).toContain('ih-oh');
    // 表达式里有逗号，必须靠调用方单引号保护（渲染层测试覆盖）
    expect(e!.x).toContain(',');
  });

  it('缺端点时自动补 t=0 / t=1（首尾不钳错位置）', () => {
    const e = trackToCropExpr([{ t: 0.2, x: 0.2, y: 0.3 }, { t: 0.8, x: 0.7, y: 0.6 }], { w: 0.5, h: 1, dur: 2 });
    expect(e).not.toBeNull();
    expect(e!.x).toContain('(t/2)');
    // 第一个区间从 t=0 开始（端点补齐）
    expect(e!.x).toMatch(/if\(lt\(\(t\/2\),0\.2\),lerp\(0\.2,0\.2,\(\(t\/2\)-0\)\/0\.2\)/);
  });

  it('非法输入返回 null；点数上限 24', () => {
    expect(trackToCropExpr([], { w: 0.5, h: 0.5, dur: 3 })).toBeNull();
    expect(trackToCropExpr([{ t: 0.5, x: 0.5, y: 0.5 }], { w: 0.5, h: 0.5, dur: 3 })).toBeNull();
    expect(trackToCropExpr(tr, { w: 0, h: 0.5, dur: 3 })).toBeNull();
    expect(trackToCropExpr(tr, { w: 0.5, h: 0.5, dur: 0 })).toBeNull();
    // 非法点（NaN）被丢弃后仍可生成
    const withBad = trackToCropExpr([
      { t: 0, x: 0.3, y: 0.5 }, { t: Number.NaN, x: 0.5, y: 0.5 }, { t: 1, x: 0.8, y: 0.5 },
    ], { w: 0.5, h: 0.5, dur: 3 });
    expect(withBad).not.toBeNull();

    const many = Array.from({ length: 100 }, (_, i) => ({ t: i / 99, x: i / 99, y: 0.5 }));
    const e = trackToCropExpr(many, { w: 0.5, h: 0.5, dur: 10 })!;
    // 24 点 → 最多 23 个 if（每段一个）
    expect((e.x.match(/if\(/g) || []).length).toBeLessThanOrEqual(23);
  });
});

describe('buildSegmentFilters · 动态裁剪渲染', () => {
  const segWithCrop = (crop: ClipSegment['crop']): ClipSegment => ({ id: 'c1', file: 'C:/a.mp4', crop });
  const opts = { segDur: 4, isImage: false, W: 1080, H: 1920, fps: 30 };

  it('无 track：滤镜串与历史静态写法逐字节一致', () => {
    const filters = buildSegmentFilters({
      ...opts,
      seg: segWithCrop({ x: 0.1, y: 0, w: 0.4, h: 1 }),
    });
    const cropFilter = filters.find((f) => f.startsWith('crop=iw*'));
    expect(cropFilter).toBe('crop=iw*0.4000:ih*1.0000:iw*0.1000:ih*0.0000');
    expect(filters.join(',')).not.toContain('if(lt(');
  });

  it('有 track（≥2 点）：x/y 换成表达式，逗号被单引号包住', () => {
    const filters = buildSegmentFilters({
      ...opts,
      seg: segWithCrop({
        x: 0.1, y: 0, w: 0.4, h: 1,
        track: [{ t: 0, x: 0.3, y: 0.5 }, { t: 1, x: 0.7, y: 0.5 }],
      }),
    });
    const cropFilter = filters.find((f) => f.startsWith('crop=iw*'))!;
    expect(cropFilter).toContain("x='");
    expect(cropFilter).toContain('if(lt(');
    expect(cropFilter).toContain('(t/4)');
    expect(cropFilter).toMatch(/crop=iw\*0\.4000:ih\*1\.0000:x='/);
  });

  it('track 只有 1 点：按静态处理（表达式不生效）', () => {
    const filters = buildSegmentFilters({
      ...opts,
      seg: segWithCrop({ x: 0.1, y: 0, w: 0.4, h: 1, track: [{ t: 0.5, x: 0.5, y: 0.5 }] }),
    });
    const cropFilter = filters.find((f) => f.startsWith('crop=iw*'))!;
    expect(cropFilter).toBe('crop=iw*0.4000:ih*1.0000:iw*0.1000:ih*0.0000');
  });
});

describe('parseTargetAspect', () => {
  it('字符串键 / 正数 / 缺省 / 非法', () => {
    expect(parseTargetAspect('9:16')).toBeCloseTo(0.5625, 6);
    expect(parseTargetAspect('1:1')).toBe(1);
    expect(parseTargetAspect('16:9')).toBeCloseTo(16 / 9, 6);
    expect(parseTargetAspect(undefined)).toBeCloseTo(0.5625, 6);
    expect(parseTargetAspect(2)).toBe(2);
    expect(parseTargetAspect(-1)).toBeNull();
    expect(parseTargetAspect('4:3')).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// IO 层（ffprobe / Python 全 mock）
// ════════════════════════════════════════════════════════════════════════════

describe('reframeVertical · IO 错误路径与成功路径', () => {
  let tmpDir = '';
  let video = '';

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yz-reframe-'));
    video = path.join(tmpDir, 'clip.mp4');
    // 内容无关紧要（ffprobe 被 mock），但服务会先做 existsSync
    writeFileSync(video, 'not-a-real-video');
  });

  afterAll(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('文件不存在 → 400 可读错误，不起 Python', async () => {
    h.runs = 0;
    const r = await reframeVertical({ file: path.join(tmpDir, 'nope.mp4') });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(r.error).toContain('不存在');
    expect(h.runs).toBe(0);
  });

  it('脚本缺失 → 500 且说明随包脚本缺失', async () => {
    h.scriptPath = null;
    const r = await reframeVertical({ file: video });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    expect(r.error).toContain('face_center.py');
    h.scriptPath = '/fake/face_center.py';
  });

  it('cv2 不可用 → 可读错误 + 安装 opencv-python 指引', async () => {
    h.runs = 0;
    h.scriptPath = '/fake/face_center.py';
    h.scriptExit = 1;
    h.scriptStdout = JSON.stringify({
      ok: false,
      error: '当前 cv2 不含人脸检测能力（缺少 objdetect / CascadeClassifier）',
    });
    const r = await reframeVertical({ file: video });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('人脸检测失败');
    expect(r.need).toBe('opencv');
    expect(r.hint).toContain('opencv-python');
    expect(h.runs).toBe(1);
  });

  it('成功：透传片段区间、返回 crop/faces，宽高取自探测', async () => {
    h.runs = 0;
    h.scriptExit = 0;
    h.scriptStdout = JSON.stringify({
      ok: true, width: 1920, height: 1080,
      faces: [{ t: 1.2, x: 860, y: 440, w: 200, h: 200 }],
    });
    const r = await reframeVertical({
      file: video, targetAspect: '9:16', start: 2, duration: 4, samples: 8,
    });
    expect(r.ok).toBe(true);
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
    expect(r.faces).toHaveLength(1);
    expect(r.sampleCount).toBe(8);
    expect(r.crop!.w).toBeCloseTo(0.3164, 3);
    // 默认 static：不多返回轨迹（旧行为）
    expect(r.track).toBeUndefined();
    // 只分析片段实际使用的区间
    expect(h.lastArgs).toEqual(expect.arrayContaining(['--start', '2', '--duration', '4']));
    expect(h.lastArgs).toEqual(expect.arrayContaining(['--samples', '8']));
  });

  it('mode=track：返回归一化轨迹（t 相对片段区间，x 随人脸移动）', async () => {
    h.runs = 0;
    h.scriptExit = 0;
    h.scriptStdout = JSON.stringify({
      ok: true, width: 1920, height: 1080,
      faces: [
        { t: 2.2, x: 400, y: 440, w: 200, h: 200 },
        { t: 4.0, x: 700, y: 440, w: 200, h: 200 },
        { t: 5.8, x: 1000, y: 440, w: 200, h: 200 },
      ],
    });
    const r = await reframeVertical({
      file: video, targetAspect: '9:16', mode: 'track', start: 2, duration: 4, samples: 3,
    });
    expect(r.ok).toBe(true);
    expect(r.track).toBeDefined();
    expect(r.track!.length).toBeGreaterThanOrEqual(2);
    expect(r.track![0].t).toBe(0);
    expect(r.track![r.track!.length - 1].t).toBe(1);
    expect(r.track![r.track!.length - 1].x).toBeGreaterThan(r.track![0].x);
    // track 默认更密采样（未显式传 samples 时）
    h.lastArgs = [];
    await reframeVertical({ file: video, mode: 'track', start: 0, duration: 10 });
    expect(h.lastArgs).toEqual(expect.arrayContaining(['--samples', '28']));
  });

  it('脚本输出非 JSON（进程崩了）→ 可读错误，不抛异常', async () => {
    h.runs = 0;
    h.scriptExit = 1;
    h.scriptStdout = 'Traceback (most recent call last):\nMemoryError';
    h.scriptStderr = 'MemoryError';
    const r = await reframeVertical({ file: video });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('人脸检测失败');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 可选实跑：本机 python 真带 Haar 级联时，生成一段无人脸视频跑脚本
// ════════════════════════════════════════════════════════════════════════════

function detectCascadePython(): string | null {
  const probe = 'import cv2, os; assert hasattr(cv2, "CascadeClassifier"); '
    + 'assert os.path.isfile(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))';
  for (const cmd of ['python', 'python3']) {
    const r = spawnSync(cmd, ['-I', '-c', probe], { encoding: 'utf8', timeout: 20000 });
    if (r.status === 0) return cmd;
  }
  return null;
}

const CASCADE_PY = detectCascadePython();
const here = path.dirname(fileURLToPath(import.meta.url));
const FACE_SCRIPT = path.resolve(here, '../../../packages/core/src/tool/builtin/python-scripts/clip_reframe/face_center.py');

describe.skipIf(!CASCADE_PY)('face_center.py · Python 实跑（检测到 cv2+Haar 才跑）', () => {
  it('纯色无人脸视频 → ok=true、faces=[]', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'yz-facepy-'));
    try {
      const avi = path.join(dir, 'solid.avi');
      const gen = [
        'import sys, cv2, numpy as np',
        'w, h = 320, 240',
        "vw = cv2.VideoWriter(sys.argv[1], cv2.VideoWriter_fourcc(*'MJPG'), 10, (w, h))",
        'for _ in range(10):',
        '    vw.write(np.full((h, w, 3), 120, np.uint8))',
        'vw.release()',
      ].join('\n');
      const g = spawnSync(CASCADE_PY!, ['-I', '-c', gen, avi], { encoding: 'utf8', timeout: 30000 });
      expect(g.status, g.stderr).toBe(0);

      const r = spawnSync(CASCADE_PY!, ['-I', FACE_SCRIPT, '--video', avi, '--samples', '4'], {
        encoding: 'utf8', timeout: 60000,
      });
      const last = String(r.stdout || '').trim().split(/\r?\n/).pop() || '{}';
      const parsed = JSON.parse(last) as { ok?: boolean; width?: number; height?: number; faces?: unknown[] };
      expect(parsed.ok).toBe(true);
      expect(parsed.width).toBe(320);
      expect(parsed.height).toBe(240);
      expect(parsed.faces).toEqual([]);
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});
