/**
 * 多机位编排 MVP（clip-multicam）测试。
 *
 * 覆盖三块：
 *   ① 规划（纯函数）：连续覆盖、时长、正负偏移、duration/switchEvery 夹取、机位不足；
 *   ② 生成（纯函数）：id 唯一、trim 正确、无转场/淡入淡出、label 标注机位；
 *   ③ 边界（IO 层，模块 mock）：confident=false 出 warning、无音轨/过短/对齐失败报可读错误。
 *
 * ★ 不跑 ffmpeg 实跑：音频对齐本身已有 test/clip-audio-sync.test.ts 覆盖；
 *   这里把「探测 / 对齐」两个 IO 依赖 mock 掉，专测编排逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  planMulticamCuts, buildMulticamSegments, buildMulticamFromFiles, insertMulticamSegments,
  rebuildMulticamCuts, rebuildMulticamGroup, multicamSlotCount, makeMulticamGroup,
  beatTimesToBoundaries, computeBeatBoundaries, validateSlotBoundaries,
  normalizeMulticamBoundaries, applyMulticamBoundaries,
  insertMulticamBoundary, removeMulticamBoundary,
  MULTICAM_DEFAULT_SWITCH_SEC, MULTICAM_MAX_BOUNDARIES,
} from '../src/services/clip-multicam.js';
import type { MulticamAngle, MulticamCut } from '../src/services/clip-multicam.js';
import type { ClipProject, MulticamGroup } from '../src/services/clip-project.js';
import { createEmptyProject, normalizeMulticamGroups } from '../src/services/clip-project.js';

// vi.mock 会被提升到文件顶部：可变状态必须放进 vi.hoisted。
const h = vi.hoisted(() => ({
  /** 每个机位探测结果（顺序消费）；空时用默认值 */
  probes: [] as Array<{ durationSec: number; hasAudio: boolean }>,
  /** syncAudioFiles 的实现（由用例替换） */
  sync: null as null | ((a: string, b: string) => unknown),
  /** analyzeBeats 的实现（由用例替换）；null = 未设置 */
  beats: null as null | { ok: boolean; beats?: number[]; bpm?: number; duration?: number; error?: string },
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, stat: vi.fn(async () => ({ isFile: () => true })) };
});

vi.mock('../src/mcp/ffmpeg-runtime.js', () => ({
  resolveFfmpeg: vi.fn(async () => ({ ok: true, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' })),
}));

vi.mock('../src/services/exec-cmd.js', () => ({
  runCmd: vi.fn(async () => {
    const p = h.probes.shift() ?? { durationSec: 10, hasAudio: true };
    const streams = [{ codec_type: 'video' }, ...(p.hasAudio ? [{ codec_type: 'audio' }] : [])];
    return { ok: true, stdout: JSON.stringify({ format: { duration: String(p.durationSec) }, streams }) };
  }),
}));

vi.mock('../src/services/clip-audio-sync.js', () => ({
  syncAudioFiles: vi.fn(async (a: string, b: string) => {
    if (!h.sync) throw new Error('syncAudioFiles 未设置');
    return h.sync(a, b);
  }),
}));

vi.mock('../src/services/clip-beats.js', () => ({
  analyzeBeats: vi.fn(async () => {
    if (!h.beats) throw new Error('analyzeBeats 未设置');
    return { beats: [], bpm: 0, duration: 0, ...h.beats };
  }),
}));

function angle(file: string, offsetSec: number, usableSec: number): MulticamAngle {
  return { file, offsetSec, usableSec };
}

function expectContinuous(cuts: MulticamCut[], groupDuration: number) {
  expect(cuts.length).toBeGreaterThan(0);
  expect(cuts[0].filmStart).toBeCloseTo(0, 6);
  for (let i = 1; i < cuts.length; i++) {
    expect(cuts[i].filmStart).toBeCloseTo(cuts[i - 1].filmEnd, 6);
  }
  expect(cuts[cuts.length - 1].filmEnd).toBeCloseTo(groupDuration, 6);
}

describe('planMulticamCuts · 规划', () => {
  it('两机位按 order 轮换，区间连续、总时长正确', () => {
    const r = planMulticamCuts({
      angles: [angle('a.mp4', 0, 10), angle('b.mp4', 0, 10)],
      switchEverySec: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.groupDurationSec).toBe(10);
    expectContinuous(r.cuts, 10);
    expect(r.cuts.map((c) => c.angleIndex)).toEqual([0, 1, 0, 1]);
    expect(r.cuts.map((c) => [c.filmStart, c.filmEnd])).toEqual([[0, 3], [3, 6], [6, 9], [9, 10]]);
    // 偏移 0：素材时间 = 组内时间
    expect(r.cuts[0].srcStart).toBe(0);
    expect(r.cuts[0].srcEnd).toBe(3);
  });

  it('★ 组 0 点取最晚开始机位：head_i = d_i - min(d)', () => {
    const r = planMulticamCuts({
      angles: [angle('a.mp4', 0, 12), angle('extra_head.mp4', 2, 14), angle('late_start.mp4', -1.5, 12)],
      switchEverySec: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // min(d)=-1.5：机位 0 补 1.5 头部、机位 1 补 3.5、机位 2（最晚开始）为 0
    expect(r.headSec).toEqual([1.5, 3.5, 0]);
    expect(r.groupDurationSec).toBe(10.5);
    // 第 2 段（k=1）轮到机位 1：srcStart = 3.5 + 3 = 6.5
    expect(r.cuts[1].angleIndex).toBe(1);
    expect(r.cuts[1].srcStart).toBe(6.5);
    expect(r.cuts[1].srcEnd).toBe(9.5);
    // 第 3 段（k=2）轮到机位 2：头部 0 → srcStart = 6
    expect(r.cuts[2].angleIndex).toBe(2);
    expect(r.cuts[2].srcStart).toBe(6);
  });

  it('组时长取各机位可用尾部的最小值', () => {
    const r = planMulticamCuts({
      angles: [angle('a.mp4', 0, 10), angle('b.mp4', 1, 6)],
      switchEverySec: 2,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // b 扣掉 1s 头部后只剩 5s
    expect(r.groupDurationSec).toBe(5);
    expectContinuous(r.cuts, 5);
  });

  it('显式 duration 夹到可用范围并给出 warning', () => {
    const r = planMulticamCuts({
      angles: [angle('a.mp4', 0, 10), angle('b.mp4', 0, 6)],
      durationSec: 99,
      switchEverySec: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.groupDurationSec).toBe(6);
    expect(r.warnings.some((w) => w.includes('超过可用上限'))).toBe(true);
    expectContinuous(r.cuts, 6);
  });

  it('显式 duration 更短时按请求值切', () => {
    const r = planMulticamCuts({
      angles: [angle('a.mp4', 0, 10), angle('b.mp4', 0, 10)],
      durationSec: 1,
      switchEverySec: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.groupDurationSec).toBe(1);
    expect(r.cuts).toHaveLength(1);
    expect(r.cuts[0].filmEnd).toBe(1);
  });

  it('switchEvery 夹到 0.5~30', () => {
    const tiny = planMulticamCuts({
      angles: [angle('a.mp4', 0, 2), angle('b.mp4', 0, 2)],
      switchEverySec: 0.01,
    });
    expect(tiny.ok).toBe(true);
    if (tiny.ok) {
      expect(tiny.cuts[0].filmEnd).toBe(0.5);
      expect(tiny.cuts).toHaveLength(4);
    }
    const huge = planMulticamCuts({
      angles: [angle('a.mp4', 0, 10), angle('b.mp4', 0, 10)],
      switchEverySec: 100,
    });
    expect(huge.ok).toBe(true);
    if (huge.ok) {
      expect(huge.cuts).toHaveLength(1);
      expect(huge.cuts[0].filmEnd).toBe(10);
    }
  });

  it('不传 switchEvery 用默认 3 秒', () => {
    const r = planMulticamCuts({ angles: [angle('a.mp4', 0, 7), angle('b.mp4', 0, 7)] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cuts[0].filmEnd).toBe(MULTICAM_DEFAULT_SWITCH_SEC);
  });

  it('机位少于 2 个直接报错', () => {
    const r = planMulticamCuts({ angles: [angle('a.mp4', 0, 10)] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('至少需要 2 个机位');
  });

  it('扣掉头部偏移后没有可用画面 → 报错', () => {
    const r = planMulticamCuts({
      angles: [angle('a.mp4', 0, 10), angle('b.mp4', 20, 10)],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('没有可用画面');
  });
});

describe('buildMulticamSegments · 生成', () => {
  const project = { clips: [{ id: 'c1', file: 'old.mp4' }] } as Pick<ClipProject, 'clips'>;

  const cuts: MulticamCut[] = [
    { angleIndex: 0, file: 'a.mp4', filmStart: 0, filmEnd: 2, srcStart: 0, srcEnd: 2 },
    { angleIndex: 1, file: 'b.mp4', filmStart: 2, filmEnd: 4, srcStart: 1.2, srcEnd: 3.2 },
  ];

  it('id 唯一（与工程已有 id 撞号时自动去重）', () => {
    const r = buildMulticamSegments(project, cuts, (i) => (i === 0 ? 'c1' : 'mc2'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments[0].id).toBe('c1-2');
    expect(r.segments[1].id).toBe('mc2');
    expect(new Set(r.segments.map((s) => s.id)).size).toBe(2);
  });

  it('trim 与源区间一致、label 标注机位、无转场/淡入淡出/音频替换', () => {
    const r = buildMulticamSegments(project, cuts, (i) => `mc${i + 1}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments[0]).toMatchObject({ file: 'a.mp4', label: '机位1', trimStart: 0, trimEnd: 2 });
    expect(r.segments[1]).toMatchObject({ file: 'b.mp4', label: '机位2', trimStart: 1.2, trimEnd: 3.2 });
    for (const s of r.segments) {
      expect(s.transition).toBeUndefined();
      expect(s.fadeIn).toBeUndefined();
      expect(s.fadeOut).toBeUndefined();
      expect(s.audioFile).toBeUndefined();
      expect(s.keepOriginalAudio).toBeUndefined();
      expect(s.speedCurve).toBeUndefined();
      expect(s.keyframes).toBeUndefined();
    }
  });

  it('空区间报错', () => {
    const bad: MulticamCut[] = [{ angleIndex: 0, file: 'a.mp4', filmStart: 0, filmEnd: 0, srcStart: 2, srcEnd: 2 }];
    const r = buildMulticamSegments(project, bad);
    expect(r.ok).toBe(false);
  });
});

describe('insertMulticamSegments · 插入主轨', () => {
  const makeProject = (): ClipProject => ({
    ...createEmptyProject('t'),
    clips: [
      { id: 'c1', file: 'a.mp4' },
      { id: 'c2', file: 'b.mp4' },
    ],
  });
  const segs = [{ id: 'mc1', file: 'x.mp4', trimStart: 0, trimEnd: 2 }];
  const durations = { c1: 5, c2: 5 };

  it('start 缺省 → 追加到末尾', () => {
    const r = insertMulticamSegments(makeProject(), segs);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.clips.map((c) => c.id)).toEqual(['c1', 'c2', 'mc1']);
  });

  it('start 落在段中间 → 插到覆盖该时刻的段之后', () => {
    const r = insertMulticamSegments(makeProject(), segs, { startSec: 3, durations });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.insertIndex).toBe(1);
      expect(r.effectiveStartSec).toBe(5);
      expect(r.project.clips.map((c) => c.id)).toEqual(['c1', 'mc1', 'c2']);
    }
  });

  it('start 正好在边界 → 插在边界处', () => {
    const r = insertMulticamSegments(makeProject(), segs, { startSec: 5, durations });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.clips.map((c) => c.id)).toEqual(['c1', 'mc1', 'c2']);
  });

  it('start 超出总时长 → 夹到末尾', () => {
    const r = insertMulticamSegments(makeProject(), segs, { startSec: 99, durations });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.clips.map((c) => c.id)).toEqual(['c1', 'c2', 'mc1']);
  });

  it('已有段时长未知且指定 start → 报错（不猜位置）', () => {
    const r = insertMulticamSegments(makeProject(), segs, { startSec: 3, durations: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('时长未知');
  });
});

describe('buildMulticamFromFiles · 边界', () => {
  beforeEach(() => {
    h.probes = [];
    h.sync = null;
  });

  it('confident=false 仍继续，但 warnings 列出机位与分数', async () => {
    h.probes = [{ durationSec: 10, hasAudio: true }, { durationSec: 10, hasAudio: true }];
    h.sync = () => ({ ok: true, offsetSec: 0.4, score: 0.2, confident: false, aUsedSec: 10, bUsedSec: 10 });
    const r = await buildMulticamFromFiles(['a.mp4', 'b.mp4']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offsetSec).toEqual([0, 0.4]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('机位 2');
    expect(r.warnings[0]).toContain('置信度低');
  });

  it('无音轨 → 可读错误', async () => {
    h.probes = [{ durationSec: 10, hasAudio: true }, { durationSec: 10, hasAudio: false }];
    const r = await buildMulticamFromFiles(['a.mp4', 'b.mp4']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('没有音轨');
  });

  it('素材过短 → 可读错误', async () => {
    h.probes = [{ durationSec: 0.4, hasAudio: true }, { durationSec: 10, hasAudio: true }];
    const r = await buildMulticamFromFiles(['a.mp4', 'b.mp4']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('过短');
  });

  it('对齐失败 → 带机位号的错误', async () => {
    h.probes = [{ durationSec: 10, hasAudio: true }, { durationSec: 10, hasAudio: true }];
    h.sync = () => ({ ok: false, error: 'B 是静音（或音量过低），无法对齐' });
    const r = await buildMulticamFromFiles(['a.mp4', 'b.mp4']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('机位 2');
      expect(r.error).toContain('静音');
    }
  });

  it('少于 2 个文件 → 报错', async () => {
    const r = await buildMulticamFromFiles(['a.mp4']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('至少需要 2 个机位');
  });
});

// ===== 手动切换（P2）：按槽位重建 =====

function groupFixture(over: Partial<MulticamGroup> = {}): MulticamGroup {
  return {
    id: 'g1',
    files: ['a.mp4', 'b.mp4', 'c.mp4'],
    offsetsSec: [0, 2, -1.5],
    headsSec: [1.5, 3.5, 0],
    filmStart: 5,
    groupDurationSec: 10.5,
    slotSec: 3,
    slotAngles: [0, 1, 2, 0],
    clipIds: ['mc1', 'mc2', 'mc3', 'mc4'],
    ...over,
  };
}

describe('rebuildMulticamCuts · 按槽位规划', () => {
  it('槽位数 = ceil(组时长/每段)；自定义 slotAngles 的源起点含头部偏移', () => {
    expect(multicamSlotCount({ groupDurationSec: 10.5, slotSec: 3 })).toBe(4);
    const r = rebuildMulticamCuts(groupFixture(), [2, 0, 1, 2]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cuts.map((c) => c.angleIndex)).toEqual([2, 0, 1, 2]);
    expect(r.cuts.map((c) => c.file)).toEqual(['c.mp4', 'a.mp4', 'b.mp4', 'c.mp4']);
    // 区间连续、总长 = 组时长
    expect(r.cuts[0].filmStart).toBe(0);
    for (let i = 1; i < r.cuts.length; i++) expect(r.cuts[i].filmStart).toBeCloseTo(r.cuts[i - 1].filmEnd, 6);
    expect(r.cuts[r.cuts.length - 1].filmEnd).toBeCloseTo(10.5, 6);
    // 机位 3（head=0）第 1 段 0→3；机位 1（head=1.5）第 2 段 4.5→7.5
    expect([r.cuts[0].srcStart, r.cuts[0].srcEnd]).toEqual([0, 3]);
    expect([r.cuts[1].srcStart, r.cuts[1].srcEnd]).toEqual([4.5, 7.5]);
    // 最后一段 9→10.5（机位 3）
    expect([r.cuts[3].filmStart, r.cuts[3].filmEnd]).toEqual([9, 10.5]);
    expect([r.cuts[3].srcStart, r.cuts[3].srcEnd]).toEqual([9, 10.5]);
  });

  it('最后一段可短于 slotSec（组时长不能被整除）', () => {
    const r = rebuildMulticamCuts(groupFixture({ groupDurationSec: 10, slotAngles: [] }), [0, 1, 2, 0]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cuts).toHaveLength(4);
    expect([r.cuts[3].filmStart, r.cuts[3].filmEnd]).toEqual([9, 10]);
  });

  it('槽位数量不符 → 可读错误', () => {
    const r = rebuildMulticamCuts(groupFixture(), [0, 1, 2]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('槽位数量应为 4');
  });

  it('机位下标越界/非整数 → 可读错误', () => {
    const out = rebuildMulticamCuts(groupFixture(), [0, 1, 3, 0]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('无效');
    const frac = rebuildMulticamCuts(groupFixture(), [0, 0.5, 1, 2]);
    expect(frac.ok).toBe(false);
  });

  it('组缺少机位/头部偏移 → 报错', () => {
    expect(rebuildMulticamCuts(groupFixture({ files: ['a.mp4'] }), [0]).ok).toBe(false);
    expect(rebuildMulticamCuts(groupFixture({ headsSec: [1] }), [0, 1, 2, 0]).ok).toBe(false);
  });
});

describe('rebuildMulticamGroup · 原地重建', () => {
  function makeProject(): ClipProject {
    return {
      ...createEmptyProject('t'),
      clips: [
        { id: 'pre', file: 'p.mp4', trimStart: 0, trimEnd: 2 },
        { id: 'mc1', file: 'a.mp4', trimStart: 1.5, trimEnd: 4.5 },
        { id: 'mc2', file: 'b.mp4', trimStart: 3.5, trimEnd: 6.5 },
        { id: 'mc3', file: 'c.mp4', trimStart: 0, trimEnd: 3 },
        { id: 'mc4', file: 'a.mp4', trimStart: 10.5, trimEnd: 12 },
        { id: 'post', file: 'q.mp4', trimStart: 0, trimEnd: 4 },
      ],
      layers: [{ id: 't1', kind: 'text', start: 0, end: 20, track: 1, transform: {} }],
      multicamGroups: [groupFixture()],
    };
  }

  const totalOf = (p: ClipProject) =>
    p.clips.reduce((s, c) => s + ((c.trimEnd ?? 0) - (c.trimStart ?? 0)), 0);

  it('★ 原地替换组内片段：id 不变、总时长不变、其他片段与图层不动', () => {
    const before = makeProject();
    const r = rebuildMulticamGroup(before, 'g1', [2, 2, 2, 2]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = r.project;
    // 位置与 id 不变（只换内容）
    expect(after.clips.map((c) => c.id)).toEqual(['pre', 'mc1', 'mc2', 'mc3', 'mc4', 'post']);
    expect(after.clips.slice(1, 5).map((c) => c.file)).toEqual(['c.mp4', 'c.mp4', 'c.mp4', 'c.mp4']);
    expect(after.clips.slice(1, 5).map((c) => c.label)).toEqual(['机位3', '机位3', '机位3', '机位3']);
    // 组时长不变（末段 1.5s）
    expect(after.clips.slice(1, 5).map((c) => [c.trimStart, c.trimEnd])).toEqual([
      [0, 3], [3, 6], [6, 9], [9, 10.5],
    ]);
    expect(totalOf(after)).toBeCloseTo(totalOf(before), 6);
    // 其他片段原样
    expect(after.clips[0]).toEqual(before.clips[0]);
    expect(after.clips[5]).toEqual(before.clips[5]);
    // 图层不动（同一引用即可；再断言时间）
    expect(after.layers).toBe(before.layers);
    expect(after.layers[0]).toMatchObject({ id: 't1', start: 0, end: 20 });
    // 组元数据更新
    expect(after.multicamGroups?.[0].slotAngles).toEqual([2, 2, 2, 2]);
    expect(after.multicamGroups?.[0].clipIds).toEqual(['mc1', 'mc2', 'mc3', 'mc4']);
  });

  it('组不存在 → 报错', () => {
    const r = rebuildMulticamGroup(makeProject(), 'nope', [0, 1, 2, 0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('不存在');
  });

  it('组内片段被删 → 报错（不猜位置）', () => {
    const p = makeProject();
    p.clips = p.clips.filter((c) => c.id !== 'mc2');
    const r = rebuildMulticamGroup(p, 'g1', [0, 1, 2, 0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('已被删除');
  });

  it('组内片段不再连续（中间插入其他片段）→ 报错', () => {
    const p = makeProject();
    p.clips.splice(3, 0, { id: 'x', file: 'x.mp4', trimStart: 0, trimEnd: 1 });
    const r = rebuildMulticamGroup(p, 'g1', [0, 1, 2, 0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('不再连续');
  });

  it('槽位校验失败时原样返回可读错误，不改工程', () => {
    const before = makeProject();
    const r = rebuildMulticamGroup(before, 'g1', [0, 1, 9, 0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('无效');
    expect(before.clips.map((c) => c.file)).toEqual(['p.mp4', 'a.mp4', 'b.mp4', 'c.mp4', 'a.mp4', 'q.mp4']);
  });
});

describe('makeMulticamGroup · add_multicam 组元数据', () => {
  it('从规划与生成结果固化：slotAngles/clipIds 派生、字段深拷贝、id 不与现有组冲突', () => {
    const cuts: MulticamCut[] = [
      { angleIndex: 0, file: 'a.mp4', filmStart: 0, filmEnd: 3, srcStart: 0, srcEnd: 3 },
      { angleIndex: 1, file: 'b.mp4', filmStart: 3, filmEnd: 6, srcStart: 2, srcEnd: 5 },
    ];
    const segments = [
      { id: 'mc1', file: 'a.mp4' },
      { id: 'mc2', file: 'b.mp4' },
    ];
    const files = ['a.mp4', 'b.mp4'];
    const g = makeMulticamGroup(
      { multicamGroups: [groupFixture()] },
      {
        files, offsetsSec: [0, 2], headsSec: [2, 0], filmStart: 7,
        groupDurationSec: 6, slotSec: 3, cuts, segments,
      },
    );
    expect(g.id).toMatch(/^mcg/);
    expect(g.id).not.toBe('g1');
    expect(g.files).toEqual(files);
    expect(g.files).not.toBe(files);
    expect(g.slotAngles).toEqual([0, 1]);
    expect(g.clipIds).toEqual(['mc1', 'mc2']);
    expect(g).toMatchObject({ filmStart: 7, groupDurationSec: 6, slotSec: 3, headsSec: [2, 0] });
    // 固化后可被 rebuild 直接消费
    const r = rebuildMulticamCuts(g, [1, 0]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cuts[0].srcStart).toBe(0);
  });

  it('跟节拍：slotBoundariesSec 固化进组，rebuild 按边界消费', () => {
    const cuts: MulticamCut[] = [
      { angleIndex: 0, file: 'a.mp4', filmStart: 0, filmEnd: 2, srcStart: 0, srcEnd: 2 },
      { angleIndex: 1, file: 'b.mp4', filmStart: 2, filmEnd: 3.5, srcStart: 0, srcEnd: 1.5 },
      { angleIndex: 0, file: 'a.mp4', filmStart: 3.5, filmEnd: 6, srcStart: 3.5, srcEnd: 6 },
    ];
    const g = makeMulticamGroup(
      { multicamGroups: [] },
      {
        files: ['a.mp4', 'b.mp4'], offsetsSec: [0, 0], headsSec: [0, 0], filmStart: 0,
        groupDurationSec: 6, slotSec: 3, cuts, segments: cuts.map((c, i) => ({ id: `mc${i + 1}`, file: c.file })),
        slotBoundariesSec: [2, 3.5],
      },
    );
    expect(g.slotBoundariesSec).toEqual([2, 3.5]);
    expect(multicamSlotCount(g)).toBe(3);
    const r = rebuildMulticamCuts(g, [1, 1, 0]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cuts.map((c) => [c.filmStart, c.filmEnd])).toEqual([[0, 2], [2, 3.5], [3.5, 6]]);
  });
});

// ===== 跟节拍（P2）：边界规划 / 拍点换算 / 回退 =====

describe('planMulticamCuts · 按边界切', () => {
  it('自定义边界：区间连续、总时长不变、首末段正确、机位按顺序轮换', () => {
    const r = planMulticamCuts({
      angles: [angle('a.mp4', 0, 12), angle('b.mp4', 0, 12)],
      slotBoundariesSec: [1, 2.5, 7],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.groupDurationSec).toBe(12);
    expect(r.slotBoundariesSec).toEqual([1, 2.5, 7]);
    expect(r.cuts.map((c) => [c.filmStart, c.filmEnd])).toEqual([[0, 1], [1, 2.5], [2.5, 7], [7, 12]]);
    expect(r.cuts.map((c) => c.angleIndex)).toEqual([0, 1, 0, 1]);
    expectContinuous(r.cuts, 12);
    // 头部偏移为 0：素材时间 = 组内时间
    expect([r.cuts[0].srcStart, r.cuts[0].srcEnd]).toEqual([0, 1]);
    expect([r.cuts[3].srcStart, r.cuts[3].srcEnd]).toEqual([7, 12]);
  });

  it('边界切点时 srcStart 仍带各机位头部偏移', () => {
    const r = planMulticamCuts({
      angles: [angle('a.mp4', 0.5, 10), angle('b.mp4', -0.5, 10)],
      slotBoundariesSec: [2, 4],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // min(d)=-0.5 → heads = [1, 0]
    expect(r.headSec).toEqual([1, 0]);
    expect([r.cuts[0].srcStart, r.cuts[0].srcEnd]).toEqual([1, 3]);
    expect([r.cuts[1].srcStart, r.cuts[1].srcEnd]).toEqual([2, 4]);
  });

  it('边界越界 / 非递增 → 可读错误', () => {
    const angles = [angle('a.mp4', 0, 10), angle('b.mp4', 0, 10)];
    const out = planMulticamCuts({ angles, slotBoundariesSec: [3, 20] });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('越过组范围');
    const inc = planMulticamCuts({ angles, slotBoundariesSec: [3, 2] });
    expect(inc.ok).toBe(false);
    if (!inc.ok) expect(inc.error).toContain('严格递增');
    const dup = planMulticamCuts({ angles, slotBoundariesSec: [3, 3] });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toContain('严格递增');
  });

  it('★ 无边界 / 空边界：等间隔默认路径完全不变', () => {
    const angles = [angle('a.mp4', 0, 10), angle('b.mp4', 0, 10)];
    const base = planMulticamCuts({ angles, switchEverySec: 3 });
    const empty = planMulticamCuts({ angles, switchEverySec: 3, slotBoundariesSec: [] });
    expect(empty).toEqual(base);
    expect(base.ok).toBe(true);
    if (base.ok) expect(base.slotBoundariesSec).toBeUndefined();
  });

  it('validateSlotBoundaries 规整：合法边界 round3、空数组 = 无边界', () => {
    const ok = validateSlotBoundaries([1.23456, 5], 10);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.boundaries).toEqual([1.235, 5]);
    const none = validateSlotBoundaries(undefined, 10);
    expect(none).toEqual({ ok: true, boundaries: [] });
  });
});

describe('beatTimesToBoundaries · 拍点 → 组内切点', () => {
  it('按 headsSec[0] 换算组内时间（拍点相对素材文件）', () => {
    const r = beatTimesToBoundaries([0, 1, 2, 3, 4], 1, 10);
    // 组内 = beat - 1 → [-1, 0, 1, 2, 3]；0 与负数贴边被过滤
    expect(r.boundaries).toEqual([1, 2, 3]);
    expect(r.beatsUsed).toBe(3);
    expect(r.beatsTotal).toBe(5);
  });

  it('贴边过滤：0.25 内与组尾前 0.25 内的拍点丢弃', () => {
    const r = beatTimesToBoundaries([0.2, 1, 2, 9.9], 0, 10);
    expect(r.boundaries).toEqual([1, 2]);
  });

  it('最小间隔 0.5s：相邻过密只保留前者', () => {
    const r = beatTimesToBoundaries([1, 1.2, 1.6, 3], 0, 10);
    expect(r.boundaries).toEqual([1, 1.6, 3]);
  });

  it('输入乱序也能排好；非有限值丢弃', () => {
    const r = beatTimesToBoundaries([3, Number.NaN, 1, 2], 0, 10);
    expect(r.boundaries).toEqual([1, 2, 3]);
    expect(r.beatsTotal).toBe(3);
  });
});

describe('computeBeatBoundaries · 分析节拍 + 回退', () => {
  beforeEach(() => {
    h.beats = null;
  });

  it('分析成功 → 返回组内边界与 bpm', async () => {
    h.beats = { ok: true, beats: [1, 2, 3, 4, 5], bpm: 120, duration: 10 };
    const r = await computeBeatBoundaries('ffmpeg', 'a.mp4', 0.5, 10);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.boundaries).toEqual([0.5, 1.5, 2.5, 3.5, 4.5]);
      expect(r.bpm).toBe(120);
    }
  });

  it('有效切点 < 2 → 明确失败（调用方据此回退等间隔）', async () => {
    h.beats = { ok: true, beats: [1, 20], bpm: 0, duration: 10 };
    const r = await computeBeatBoundaries('ffmpeg', 'a.mp4', 0, 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('音频节拍不足');
  });

  it('分析失败 → 带原始错误原文', async () => {
    h.beats = { ok: false, error: '该文件没有音轨', beats: [], bpm: 0, duration: 0 };
    const r = await computeBeatBoundaries('ffmpeg', 'a.mp4', 0, 10);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('音频节拍分析失败');
      expect(r.error).toContain('该文件没有音轨');
    }
  });

  it('节拍点被过滤时带 warning', async () => {
    h.beats = { ok: true, beats: [1, 1.1, 1.2, 2, 3], bpm: 100, duration: 10 };
    const r = await computeBeatBoundaries('ffmpeg', 'a.mp4', 0, 10);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.boundaries).toEqual([1, 2, 3]);
      expect(r.warnings.some((w) => w.includes('过滤'))).toBe(true);
    }
  });
});

describe('rebuildMulticamCuts · 带边界', () => {
  const beatGroup = (over: Partial<MulticamGroup> = {}): MulticamGroup =>
    groupFixture({ slotBoundariesSec: [2, 5, 8], slotAngles: [0, 1, 2, 0], ...over });

  it('槽位数 = 边界数+1，按边界切、源起点含头部偏移', () => {
    expect(multicamSlotCount(beatGroup())).toBe(4);
    const r = rebuildMulticamCuts(beatGroup(), [1, 2, 0, 1]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cuts.map((c) => [c.filmStart, c.filmEnd])).toEqual([[0, 2], [2, 5], [5, 8], [8, 10.5]]);
    expect(r.cuts.map((c) => c.angleIndex)).toEqual([1, 2, 0, 1]);
    // 机位 2（head=3.5）第 1 段 0→2 → 素材 3.5→5.5
    expect([r.cuts[0].srcStart, r.cuts[0].srcEnd]).toEqual([3.5, 5.5]);
    expect(r.cuts[r.cuts.length - 1].filmEnd).toBeCloseTo(10.5, 6);
  });

  it('槽位数量不符 → 错误里说明节拍切点数', () => {
    const r = rebuildMulticamCuts(beatGroup(), [0, 1, 2]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('按 3 个节拍切点共 4 段');
  });

  it('组里边界非法（越界/非递增）→ 可读错误，不回退静默重排', () => {
    const bad = rebuildMulticamCuts(beatGroup({ slotBoundariesSec: [5, 2] }), [0, 1, 2]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('严格递增');
    const out = rebuildMulticamCuts(beatGroup({ slotBoundariesSec: [2, 99] }), [0, 1, 2]);
    expect(out.ok).toBe(false);
  });

  it('原地重建：id 不变、组时长不变、其他片段与图层不动', () => {
    const project: ClipProject = {
      ...createEmptyProject('t'),
      clips: [
        { id: 'pre', file: 'p.mp4', trimStart: 0, trimEnd: 2 },
        { id: 'mc1', file: 'a.mp4', trimStart: 0, trimEnd: 2 },
        { id: 'mc2', file: 'b.mp4', trimStart: 2, trimEnd: 5 },
        { id: 'mc3', file: 'c.mp4', trimStart: 5, trimEnd: 8 },
        { id: 'mc4', file: 'a.mp4', trimStart: 8, trimEnd: 10.5 },
        { id: 'post', file: 'q.mp4', trimStart: 0, trimEnd: 4 },
      ],
      layers: [{ id: 't1', kind: 'text', start: 0, end: 20, track: 1, transform: {} }],
      multicamGroups: [beatGroup()],
    };
    const totalOf = (p: ClipProject) => p.clips.reduce((s, c) => s + ((c.trimEnd ?? 0) - (c.trimStart ?? 0)), 0);
    const r = rebuildMulticamGroup(project, 'g1', [2, 2, 2, 2]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = r.project;
    expect(after.clips.map((c) => c.id)).toEqual(['pre', 'mc1', 'mc2', 'mc3', 'mc4', 'post']);
    expect(after.clips.slice(1, 5).map((c) => [c.trimStart, c.trimEnd])).toEqual([
      [0, 2], [2, 5], [5, 8], [8, 10.5],
    ]);
    expect(after.clips.slice(1, 5).map((c) => c.file)).toEqual(['c.mp4', 'c.mp4', 'c.mp4', 'c.mp4']);
    expect(totalOf(after)).toBeCloseTo(totalOf(project), 6);
    expect(after.clips[0]).toEqual(project.clips[0]);
    expect(after.clips[5]).toEqual(project.clips[5]);
    expect(after.layers).toBe(project.layers);
    expect(after.multicamGroups?.[0].slotBoundariesSec).toEqual([2, 5, 8]);
  });
});

describe('normalizeMulticamGroups · 边界字段读写', () => {
  const raw = (over: Record<string, unknown> = {}) => ({
    id: 'g1', files: ['a.mp4', 'b.mp4'], offsetsSec: [0, 0], headsSec: [0, 0],
    filmStart: 0, groupDurationSec: 10, slotSec: 3, slotAngles: [0, 1, 0, 1], clipIds: ['mc1'],
    ...over,
  });

  it('合法边界保留；老工程无字段 → 不带该字段', () => {
    expect(normalizeMulticamGroups([raw({ slotBoundariesSec: [2, 5] })])[0].slotBoundariesSec).toEqual([2, 5]);
    expect(normalizeMulticamGroups([raw()])[0].slotBoundariesSec).toBeUndefined();
  });

  it('越界/非递增/含非数 → 整组退回等间隔（不保留脏边界）', () => {
    for (const bad of [[0, 5], [5, 2], [2, 10], [2, Number.NaN], [2, 5, 5]]) {
      expect(normalizeMulticamGroups([raw({ slotBoundariesSec: bad })])[0].slotBoundariesSec).toBeUndefined();
    }
  });
});

// ===== 逐切点拖拽：边界规整 + 服务路径 =====

describe('normalizeMulticamBoundaries · 拖拽规整', () => {
  it('乱序/越界：排序后严格递增，贴边值夹到 0.25 / 组时长-0.25', () => {
    const r = normalizeMulticamBoundaries([8, 1, 2.5, 99, -3], 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.boundaries).toEqual([0.25, 1, 2.5, 8, 9.75]);
    for (let i = 1; i < r.boundaries.length; i++) expect(r.boundaries[i]).toBeGreaterThan(r.boundaries[i - 1]);
    expect(r.warnings.some((w) => w.includes('夹到边界'))).toBe(true);
  });

  it('相邻过近 → 推开到最小间隔 0.5s 并给 warning（不超过组尾）', () => {
    const r = normalizeMulticamBoundaries([1, 1.2, 1.4], 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.boundaries).toEqual([1, 1.5, 2]);
    expect(r.warnings.some((w) => w.includes('最小间隔'))).toBe(true);
  });

  it('推开后越界 → 丢弃，并给 warning', () => {
    const r = normalizeMulticamBoundaries([9.6, 9.7], 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.boundaries).toEqual([9.6]);
    expect(r.warnings.some((w) => w.includes('丢弃'))).toBe(true);
  });

  it('非有限值丢弃；重复值合并', () => {
    const r = normalizeMulticamBoundaries([2, Number.NaN, 2, Infinity, 4], 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.boundaries).toEqual([2, 4]);
    expect(r.warnings.some((w) => w.includes('非数字'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('重复'))).toBe(true);
  });

  it('空数组 / 全无效 / 组时长过短 → ok:false（UI 据此保持原样）', () => {
    expect(normalizeMulticamBoundaries([], 10).ok).toBe(false);
    expect(normalizeMulticamBoundaries([Number.NaN], 10).ok).toBe(false);
    expect(normalizeMulticamBoundaries([0.3], 0.4).ok).toBe(false);
    expect(normalizeMulticamBoundaries([0.3], Number.NaN).ok).toBe(false);
  });
});

describe('applyMulticamBoundaries · 服务路径', () => {
  function makeProject(over: Partial<MulticamGroup> = {}): ClipProject {
    return {
      ...createEmptyProject('t'),
      clips: [
        { id: 'pre', file: 'p.mp4', trimStart: 0, trimEnd: 2 },
        { id: 'mc1', file: 'a.mp4', trimStart: 0, trimEnd: 2 },
        { id: 'mc2', file: 'b.mp4', trimStart: 2, trimEnd: 5 },
        { id: 'mc3', file: 'c.mp4', trimStart: 5, trimEnd: 8 },
        { id: 'mc4', file: 'a.mp4', trimStart: 8, trimEnd: 10.5 },
        { id: 'post', file: 'q.mp4', trimStart: 0, trimEnd: 4 },
      ],
      layers: [{ id: 't1', kind: 'text', start: 0, end: 20, track: 1, transform: {} }],
      multicamGroups: [groupFixture({ slotBoundariesSec: [2, 5, 8], ...over })],
    };
  }
  const totalOf = (p: ClipProject) => p.clips.reduce((s, c) => s + ((c.trimEnd ?? 0) - (c.trimStart ?? 0)), 0);

  it('★ 边界变化后原地重建：id/组时长不变，其他片段与图层不动', () => {
    const before = makeProject();
    const r = applyMulticamBoundaries(before, 'g1', [1.5, 4, 7]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.boundaries).toEqual([1.5, 4, 7]);
    expect(r.slotAngles).toEqual([0, 1, 2, 0]);
    expect(r.segments).toBe(4);
    const after = r.project;
    expect(after.clips.map((c) => c.id)).toEqual(['pre', 'mc1', 'mc2', 'mc3', 'mc4', 'post']);
    expect(after.clips.slice(1, 5).map((c) => [c.trimStart, c.trimEnd])).toEqual([
      [1.5, 3], [5, 7.5], [4, 7], [8.5, 12],
    ]);
    expect(totalOf(after)).toBeCloseTo(totalOf(before), 6);
    expect(after.clips[0]).toEqual(before.clips[0]);
    expect(after.clips[5]).toEqual(before.clips[5]);
    expect(after.layers).toBe(before.layers);
    expect(after.multicamGroups?.[0].slotBoundariesSec).toEqual([1.5, 4, 7]);
    expect(after.multicamGroups?.[0].slotAngles).toEqual([0, 1, 2, 0]);
  });

  it('原本等间隔（无边界）→ 本次转为边界模式', () => {
    const before = makeProject({ slotBoundariesSec: undefined });
    expect(before.multicamGroups?.[0].slotBoundariesSec).toBeUndefined();
    const r = applyMulticamBoundaries(before, 'g1', [3, 6, 9]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments).toBe(4);
    expect(r.project.multicamGroups?.[0].slotBoundariesSec).toEqual([3, 6, 9]);
    expect(totalOf(r.project)).toBeCloseTo(totalOf(before), 6);
  });

  it('slotAngles 缺省时按现有槽位循环补齐/截断；显式给则原样使用', () => {
    const before = makeProject({ slotAngles: [2] });
    const derived = applyMulticamBoundaries(before, 'g1', [2, 5, 8]);
    expect(derived.ok).toBe(true);
    if (derived.ok) expect(derived.slotAngles).toEqual([2, 2, 2, 2]);
    const explicit = applyMulticamBoundaries(before, 'g1', [2, 5, 8], [1, 0, 2, 1]);
    expect(explicit.ok).toBe(true);
    if (explicit.ok) expect(explicit.project.multicamGroups?.[0].slotAngles).toEqual([1, 0, 2, 1]);
  });

  it('一次增删超过 1 个切点（批量）→ 可读错误，不改工程', () => {
    const before = makeProject();
    const r = applyMulticamBoundaries(before, 'g1', [1, 2.5, 4, 6, 8]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('一次只支持增删一个切点');
    expect(before.multicamGroups?.[0].slotBoundariesSec).toEqual([2, 5, 8]);
  });

  it('slotAngles 长度/值域不合法 → 可读错误', () => {
    const before = makeProject();
    const badLen = applyMulticamBoundaries(before, 'g1', [2, 5, 8], [0, 1, 2]);
    expect(badLen.ok).toBe(false);
    if (!badLen.ok) expect(badLen.error).toContain('槽位数量应为 4');
    const badVal = applyMulticamBoundaries(before, 'g1', [2, 5, 8], [0, 1, 9, 0]);
    expect(badVal.ok).toBe(false);
    if (!badVal.ok) expect(badVal.error).toContain('无效');
  });

  it('组不存在 / 无有效切点 → 可读错误', () => {
    const before = makeProject();
    const missing = applyMulticamBoundaries(before, 'nope', [2, 5, 8]);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain('不存在');
    const empty = applyMulticamBoundaries(before, 'g1', []);
    expect(empty.ok).toBe(false);
  });
});

// ===== 切点增删：纯函数 + 与原地重建串联 =====

describe('insertMulticamBoundary · 加切点', () => {
  it('在最长的槽位中点插入；新槽位机位 = 左侧 +1（取模）', () => {
    // 槽位 [0,2] / [2,5] / [5,10]：最长是最后一段，中点 7.5
    const r = insertMulticamBoundary([2, 5], [0, 1, 2], 10, 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.boundaries).toEqual([2, 5, 7.5]);
    expect(r.slotAngles).toEqual([0, 1, 2, 0]); // 左槽机位 2 → (2+1)%3 = 0
    expect(r.note).toContain('最长一段');
  });

  it('最长段不在末尾时插在中间；机位 +1 回绕', () => {
    // 槽位 [0,3] / [3,8] / [8,10]：最长是中间 [3,8]，中点 5.5
    const r = insertMulticamBoundary([3, 8], [1, 1, 0], 10, 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.boundaries).toEqual([3, 5.5, 8]);
    expect(r.slotAngles).toEqual([1, 1, 0, 0]); // 左槽机位 1 → (1+1)%2 = 0
  });

  it('等间隔组（无切点）→ 在整段中点插一个切点', () => {
    const r = insertMulticamBoundary([], [0], 10, 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.boundaries).toEqual([5]);
    expect(r.slotAngles).toEqual([0, 1]);
  });

  it('组时长过短 → 可读错误', () => {
    const r = insertMulticamBoundary([], [0], 0.4, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('组时长过短');
  });

  it('切点数量上限 → 可读错误', () => {
    const many = Array.from({ length: MULTICAM_MAX_BOUNDARIES }, (_, i) =>
      Number((0.3 + i * 0.01).toFixed(3)));
    const r = insertMulticamBoundary(many, [0], 100, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('上限');
  });

  it('最长段太窄、中点被 normalize 丢弃 → 报错（不静默少加）', () => {
    const r = insertMulticamBoundary([0.5, 0.8], [0, 1, 2], 1.2, 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('无法再插入切点');
  });

  it('结果经 normalize 后仍合法（严格递增、贴边/最小间隔均满足）', () => {
    const r = insertMulticamBoundary([1, 4], [0, 1, 2], 9, 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = normalizeMulticamBoundaries(r.boundaries, 9);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.boundaries).toEqual(r.boundaries);
    for (let i = 1; i < r.boundaries.length; i++) {
      expect(r.boundaries[i] - r.boundaries[i - 1]).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
    expect(r.slotAngles).toHaveLength(r.boundaries.length + 1);
  });
});

describe('removeMulticamBoundary · 删切点', () => {
  it('删除第 index 个切点，合并时保留左侧槽位机位', () => {
    // 槽位 [0,2] [2,5] [5,10]，机位 [0,1,2]；删切点 1（5s）→ 保留左槽（机位1），丢掉右槽（机位2）
    const r = removeMulticamBoundary([2, 5], [0, 1, 2], 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.boundaries).toEqual([2]);
    expect(r.slotAngles).toEqual([0, 1]);
  });

  it('删除第一个切点：保留第 1 段的机位', () => {
    const r = removeMulticamBoundary([2, 5], [2, 0, 1], 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.boundaries).toEqual([5]);
    expect(r.slotAngles).toEqual([2, 1]);
  });

  it('索引越界 → 可读错误', () => {
    const r = removeMulticamBoundary([2, 5], [0, 1, 2], 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('不存在');
    expect(removeMulticamBoundary([2, 5], [0, 1, 2], -1).ok).toBe(false);
    expect(removeMulticamBoundary([2, 5], [0, 1, 2], 0.5).ok).toBe(false);
  });

  it('只剩一个槽位（没有切点）→ 报错', () => {
    const r = removeMulticamBoundary([], [0], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('只剩一个槽位');
  });

  it('至少保留一个切点（再删组内只剩一个槽位）→ 报错', () => {
    const r = removeMulticamBoundary([3], [0, 1], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('至少');
  });

  it('槽位数量与切点数不匹配 → 报错', () => {
    const r = removeMulticamBoundary([2, 5], [0, 1], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('不一致');
  });
});

describe('applyMulticamBoundaries · 增删切点串联重建', () => {
  function makeProject(): ClipProject {
    return {
      ...createEmptyProject('t'),
      clips: [
        { id: 'pre', file: 'p.mp4', trimStart: 0, trimEnd: 2 },
        { id: 'mc1', file: 'a.mp4', trimStart: 0, trimEnd: 2 },
        { id: 'mc2', file: 'b.mp4', trimStart: 2, trimEnd: 5 },
        { id: 'mc3', file: 'c.mp4', trimStart: 5, trimEnd: 8 },
        { id: 'mc4', file: 'a.mp4', trimStart: 8, trimEnd: 10.5 },
        { id: 'post', file: 'q.mp4', trimStart: 0, trimEnd: 4 },
      ],
      layers: [{ id: 't1', kind: 'text', start: 0, end: 20, track: 1, transform: {} }],
      multicamGroups: [groupFixture({ slotBoundariesSec: [2, 5, 8] })],
    };
  }
  const totalOf = (p: ClipProject) => p.clips.reduce((s, c) => s + ((c.trimEnd ?? 0) - (c.trimStart ?? 0)), 0);

  it('★ 加切点：段数 +1、新段发新 id、原 id 按位置复用、组时长与其他内容不变', () => {
    const before = makeProject();
    // 最长槽位 [8,10.5] 中点 9.25；左槽机位 0 + 1 = 机位 1（b.mp4）
    const r = applyMulticamBoundaries(before, 'g1', [2, 5, 8, 9.25], [0, 1, 2, 0, 1]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.boundaries).toEqual([2, 5, 8, 9.25]);
    expect(r.segments).toBe(5);
    const after = r.project;
    const ids = after.clips.map((c) => c.id);
    expect(ids.slice(0, 5)).toEqual(['pre', 'mc1', 'mc2', 'mc3', 'mc4']);
    expect(ids[5]).not.toBe('post'); // 新段拿到新 id
    expect(ids[6]).toBe('post');
    expect(after.clips.slice(1, 6).map((c) => [c.trimStart, c.trimEnd])).toEqual([
      [1.5, 3.5], [5.5, 8.5], [5, 8], [9.5, 10.75], [12.75, 14],
    ]);
    expect(after.clips[5]).toMatchObject({ file: 'b.mp4', label: '机位2' });
    expect(totalOf(after)).toBeCloseTo(totalOf(before), 6);
    expect(after.clips[0]).toEqual(before.clips[0]);
    expect(after.layers).toBe(before.layers);
    expect(after.multicamGroups?.[0].slotAngles).toEqual([0, 1, 2, 0, 1]);
    expect(after.multicamGroups?.[0].clipIds).toHaveLength(5);
  });

  it('★ 删切点：段数 -1、合并保留左槽片段 id、原右槽片段消失、组时长不变', () => {
    const before = makeProject();
    // 删切点 0（2s）：槽位 0 [0,2] 与槽位 1 [2,5] 合并，保留左槽机位 0
    const r = applyMulticamBoundaries(before, 'g1', [5, 8], [0, 2, 0]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments).toBe(3);
    const after = r.project;
    expect(after.clips.map((c) => c.id)).toEqual(['pre', 'mc1', 'mc3', 'mc4', 'post']);
    expect(after.clips.slice(1, 4).map((c) => c.file)).toEqual(['a.mp4', 'c.mp4', 'a.mp4']);
    expect(after.clips.slice(1, 4).map((c) => [c.trimStart, c.trimEnd])).toEqual([
      [1.5, 6.5], [5, 8], [9.5, 12],
    ]);
    expect(totalOf(after)).toBeCloseTo(totalOf(before), 6);
    expect(after.clips[0]).toEqual(before.clips[0]);
    expect(after.layers).toBe(before.layers);
    expect(after.multicamGroups?.[0].slotAngles).toEqual([0, 2, 0]);
    expect(after.multicamGroups?.[0].clipIds).toEqual(['mc1', 'mc3', 'mc4']);
  });
});
