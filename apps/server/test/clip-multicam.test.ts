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
  MULTICAM_DEFAULT_SWITCH_SEC,
} from '../src/services/clip-multicam.js';
import type { MulticamAngle, MulticamCut } from '../src/services/clip-multicam.js';
import type { ClipProject, MulticamGroup } from '../src/services/clip-project.js';
import { createEmptyProject } from '../src/services/clip-project.js';

// vi.mock 会被提升到文件顶部：可变状态必须放进 vi.hoisted。
const h = vi.hoisted(() => ({
  /** 每个机位探测结果（顺序消费）；空时用默认值 */
  probes: [] as Array<{ durationSec: number; hasAudio: boolean }>,
  /** syncAudioFiles 的实现（由用例替换） */
  sync: null as null | ((a: string, b: string) => unknown),
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
});
