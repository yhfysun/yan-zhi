/**
 * 轨道模型 v3（多轨 S1）单测：v2 → v3 迁移、v3 → v2 投影、轨道校验。
 *
 * ★★★ 为什么必须测：S1 的验收是「老工程读→存→出片零变化」。
 *   迁移/投影错一处，表现是字幕/画中画静默消失或时间轴漂移 —— 都是"不报错但画面错"。
 *   这里钉住三件事：映射口径、幂等 round-trip、脏数据拒绝。
 */
import { describe, it, expect } from 'vitest';
import { speedCurveDuration } from '@yan-zhi/shared';
import {
  layersFromV1Fields,
  type ClipProject,
  type ClipSegment,
} from '../src/services/clip-project';
import {
  MAX_COMPOUND_DEPTH,
  buildProjectV3ForWrite,
  compoundProjectAtPath,
  compoundItemAtTime,
  loadedFromV2,
  materializeTrackTimes,
  migrateV2ToV3,
  projectDepth,
  v2ViewsOfV3,
  validateProjectV3,
  type ClipProjectV3,
  type CompoundItem,
} from '../src/services/clip-project-v3';

function seg(id: string, extra: Partial<ClipSegment> = {}): ClipSegment {
  return { id, file: `C:/media/${id}.mp4`, ...extra };
}

function v2Fixture(): ClipProject {
  const clips: ClipSegment[] = [
    seg('c1', { trimStart: 0, trimEnd: 4 }),
    seg('c2', { trimStart: 1, trimEnd: 3, speed: 2 }),
  ];
  const texts = [{ id: 't1', text: '第一句', start: 0, end: 2 }];
  const overlays = [{ id: 'o1', file: 'C:/media/pip.png', start: 1, end: 3, pos: 'topleft', scale: 0.4 }];
  const audios = [{ id: 'a1', file: 'C:/media/whoosh.wav', start: 0.5, end: 1.5, volume: 0.6 }];
  const stickers = [{ id: 's1', file: 'C:/media/s.png', start: 2, end: 3, scale: 0.3 }];
  const effects = [{ id: 'e1', fx: 'flash', start: 0, end: 0.4, intensity: 0.7 }];
  return {
    version: 2,
    name: '老工程',
    updatedAt: 123,
    output: { size: '1080x1920', fps: 30, quality: 'high', interpolate: 'blend' },
    clips,
    layers: layersFromV1Fields(texts, overlays, audios, stickers, effects),
    texts,
    overlays,
    audios,
    stickers,
    effects,
    audioFx: ['denoise'],
    bgm: { file: 'C:/media/m.mp3', volume: 0.3, duck: true },
    multicamGroups: [{
      id: 'g1', files: ['C:/a.mp4', 'C:/b.mp4'], offsetsSec: [0, 1], headsSec: [1, 0],
      filmStart: 0, groupDurationSec: 4, slotSec: 2, slotAngles: [0, 1], clipIds: ['c1', 'c2'],
    }],
  };
}

describe('migrateV2ToV3 · 映射口径', () => {
  it('★ clips → tracks[0]（video）：绝对 start 用段时长累加（裁剪/变速同渲染口径）', () => {
    const v3 = migrateV2ToV3(v2Fixture());
    expect(v3.version).toBe(3);
    const video = v3.tracks.filter((t) => t.kind === 'video');
    expect(video).toHaveLength(1);
    expect(video[0].items).toHaveLength(2);
    const [i1, i2] = video[0].items as Array<Record<string, unknown>>;
    expect(i1).toMatchObject({ type: 'clip', id: 'c1', start: 0, duration: 4 });
    // c2：trim 1~3 = 2s 源，speed 2 → 1s 成片，起点接在 c1 之后
    expect(i2).toMatchObject({ type: 'clip', id: 'c2', start: 4, duration: 1 });
    // segment 原样保留（渲染靠它，逐字段不能动）
    expect((i2.segment as ClipSegment).file).toBe('C:/media/c2.mp4');
  });

  it('★ 曲线变速：时长必须与 speedCurveDuration 同一份数学', () => {
    const curve = [{ t: 0, speed: 1 }, { t: 0.5, speed: 2 }, { t: 1, speed: 1 }];
    const p: ClipProject = {
      version: 2, name: 'p', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
      clips: [seg('c1', { trimStart: 0, trimEnd: 4, speedCurve: curve })],
      layers: [], texts: [],
    };
    const item = (migrateV2ToV3(p).tracks[0].items[0]) as { duration?: number };
    expect(item.duration).toBe(Math.round(speedCurveDuration(curve, 4) * 1e6) / 1e6);
  });

  it('★ 未写 trimEnd 的片段没有时长 → 自身起点可知、时长留空；后续起点留空（不猜假时间轴）', () => {
    const p: ClipProject = {
      version: 2, name: 'p', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
      clips: [seg('c1', { trimStart: 0, trimEnd: 2 }), seg('c2'), seg('c3', { trimStart: 0, trimEnd: 1 })],
      layers: [], texts: [],
    };
    const items = migrateV2ToV3(p).tracks[0].items as Array<{ id: string; start?: number; duration?: number }>;
    expect(items[0]).toMatchObject({ start: 0, duration: 2 });
    expect(items[1].start).toBe(2);             // 前一段时长已知 → 起点可知
    expect(items[1].duration).toBeUndefined();
    expect(items[2].start).toBeUndefined();     // 上段结束时间未知 → 接不上
    expect(items[2].duration).toBe(1);
  });

  it('★ 图片素材用 kenburns.duration 当段时长（渲染也是这么算的）', () => {
    const p: ClipProject = {
      version: 2, name: 'p', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
      clips: [seg('img', { file: 'C:/a.png', kenburns: { direction: 'in', duration: 3 } }), seg('c2', { trimStart: 0, trimEnd: 2 })],
      layers: [], texts: [],
    };
    const items = migrateV2ToV3(p).tracks[0].items as Array<{ start?: number; duration?: number }>;
    expect(items[0]).toMatchObject({ start: 0, duration: 3 });
    expect(items[1]).toMatchObject({ start: 3, duration: 2 });
  });

  it('★ audios → 一条 audio 轨（允许轨内重叠）；字幕/画中画/贴纸/特效 → timedLayers', () => {
    const p = v2Fixture();
    p.audios = [
      { id: 'a1', file: 'C:/a.wav', start: 0, end: 2 },
      { id: 'a2', file: 'C:/b.wav', start: 1, end: 3 },   // 与 a1 重叠：音频叠加是正常用法
    ];
    const v3 = migrateV2ToV3(p);
    const audio = v3.tracks.filter((t) => t.kind === 'audio');
    expect(audio).toHaveLength(1);
    expect(audio[0].items).toHaveLength(2);
    expect(audio[0].items[0]).toMatchObject({ type: 'audio', id: 'a1', start: 0, duration: 2 });
    // 定时图层里不能出现音频
    expect(v3.timedLayers.some((l) => l.kind === 'audio')).toBe(false);
    expect(v3.timedLayers.map((l) => l.kind).sort()).toEqual(['effect', 'sticker', 'text', 'video']);
    expect(v3.timedLayers.find((l) => l.id === 't1')).toMatchObject({ start: 0, duration: 2, track: 1 });
  });

  it('★ bgm / audioFx / multicamGroups / output 原样保留', () => {
    const src = v2Fixture();
    const v3 = migrateV2ToV3(src);
    expect(v3.bgm).toEqual(src.bgm);
    expect(v3.audioFx).toEqual(['denoise']);
    expect(v3.multicamGroups).toEqual(src.multicamGroups);
    expect(v3.output).toEqual(src.output);
    expect(v3.name).toBe('老工程');
    expect(v3.updatedAt).toBe(123);
  });
});

describe('v2ViewsOfV3 · 反向投影', () => {
  it('★ migrate → project 对 v2 视图幂等（clips/texts/overlays/audios/stickers/effects 逐字段相等）', () => {
    const src = v2Fixture();
    const back = v2ViewsOfV3(migrateV2ToV3(src));
    expect(back.clips).toEqual(src.clips);
    expect(back.texts).toEqual(src.texts);
    expect(back.overlays).toEqual(src.overlays);
    expect(back.audios).toEqual(src.audios);
    expect(back.stickers).toEqual(src.stickers);
    expect(back.effects).toEqual(src.effects);
    expect(back.bgm).toEqual(src.bgm);
    expect(back.audioFx).toEqual(src.audioFx);
    expect(back.multicamGroups).toEqual(src.multicamGroups);
    expect(back.output).toEqual(src.output);
  });

  it('★ 二次 round-trip 稳定（v3 → 视图 → v3 不再漂移）', () => {
    const once = migrateV2ToV3(v2Fixture());
    const twice = migrateV2ToV3(v2ViewsOfV3(once));
    expect(twice).toEqual(once);
  });

  it('★ loadedFromV2 原样保留读盘视图（不经过默认值归一化）', () => {
    const src = v2Fixture();
    const loaded = loadedFromV2(src);
    expect(loaded.version).toBe(3);
    expect(loaded.clips).toBe(src.clips);
    expect(loaded.layers).toBe(src.layers);
    expect(loaded.texts).toBe(src.texts);
    expect(loaded.tracks[0].items).toHaveLength(2);
  });

  it('★ 未知图层 kind（将来版本写入的）迁移不丢', () => {
    const p = v2Fixture();
    p.layers = [...p.layers, { id: 'h1', kind: 'hologram' as never, file: 'C:/fx.mov', start: 0, end: 1, track: 3, transform: {} }];
    const v3 = migrateV2ToV3(p);
    expect(v3.timedLayers.some((l) => l.id === 'h1' && l.kind === 'hologram')).toBe(true);
    expect(v2ViewsOfV3(v3).layers.some((l) => l.id === 'h1')).toBe(true);
  });
});

describe('validateProjectV3 · 轨道校验', () => {
  function base(): ClipProjectV3 {
    return migrateV2ToV3(v2Fixture());
  }

  it('★ 空档允许：视频轨 items 之间留空不报错', () => {
    const p = base();
    const items = p.tracks[0].items as Array<{ id: string; start?: number; duration?: number }>;
    items[1].start = 10;
    expect(validateProjectV3(p).ok).toBe(true);
  });

  it('★ 同轨重叠拒绝（视频轨）', () => {
    const p = base();
    const items = p.tracks[0].items as Array<{ id: string; start?: number; duration?: number }>;
    items[1].start = 3;   // c1 占 0~4 → 重叠
    const r = validateProjectV3(p);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('重叠');
  });

  it('★ 音频轨重叠不拒绝（音效叠在音乐上是正常用法）', () => {
    const p = base();
    const audio = p.tracks.find((t) => t.kind === 'audio')!;
    audio.items = [
      { type: 'audio', id: 'a1', file: 'C:/a.wav', start: 0, duration: 3 },
      { type: 'audio', id: 'a2', file: 'C:/b.wav', start: 1, duration: 3 },
    ];
    expect(validateProjectV3(p).ok).toBe(true);
  });

  it('★ 脏值：时长为 0 / 负数起点 / 项类型放错轨道 → 拒绝', () => {
    const zero = base();
    (zero.tracks[0].items[0] as { duration?: number }).duration = 0;
    expect(validateProjectV3(zero).ok).toBe(false);

    const neg = base();
    (neg.tracks[0].items[0] as { start?: number }).start = -1;
    expect(validateProjectV3(neg).ok).toBe(false);

    const wrong = base();
    wrong.tracks[0].items.push({ type: 'audio', id: 'a9', file: 'C:/a.wav', start: 0, duration: 1 });
    expect(validateProjectV3(wrong).ok).toBe(false);
  });

  it('★ 版本/结构非法 → 拒绝', () => {
    expect(validateProjectV3({ ...base(), version: 2 as never }).ok).toBe(false);
    expect(validateProjectV3({ ...base(), tracks: [] }).ok).toBe(false);
    expect(validateProjectV3({ ...base(), timedLayers: undefined as never }).ok).toBe(false);
  });

  it(`★ 嵌套深度上限 ${MAX_COMPOUND_DEPTH}：2 层通过，超限拒绝`, () => {
    const inner = migrateV2ToV3(v2Fixture());
    const lvl2: ClipProjectV3 = {
      ...migrateV2ToV3(v2Fixture()),
      tracks: [{
        id: 'v1', kind: 'video', items: [{
          type: 'compound', id: 'cmp1', start: 0, duration: 2, project: inner,
        } as CompoundItem],
      }],
    };
    expect(projectDepth(lvl2)).toBe(2);
    expect(validateProjectV3(lvl2).ok).toBe(true);

    let deep = inner;
    for (let i = 0; i < MAX_COMPOUND_DEPTH; i++) {
      deep = {
        ...migrateV2ToV3(v2Fixture()),
        tracks: [{
          id: 'v1', kind: 'video', items: [{ type: 'compound', id: `cmp${i}`, start: 0, duration: 2, project: deep } as CompoundItem],
        }],
      };
    }
    expect(projectDepth(deep)).toBe(MAX_COMPOUND_DEPTH + 1);
    const r = validateProjectV3(deep);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('嵌套深度');
  });

  it('★ 复合片段内部同样执行同轨重叠校验', () => {
    const inner = migrateV2ToV3(v2Fixture());
    (inner.tracks[0].items[1] as { start?: number }).start = 1;
    const outer = base();
    outer.tracks[0].items = [{
      type: 'compound', id: 'cmp-inner', start: 0, duration: 2, project: inner,
    }];
    const r = validateProjectV3(outer);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('复合片段 cmp-inner');
    expect(r.ok === false && r.error).toContain('重叠');
  });
});

describe('compoundProjectAtPath · 内部编辑预览路径', () => {
  it('★ 按 compound id 逐层进入内部工程；不存在返回 null', () => {
    const leaf = migrateV2ToV3(v2Fixture());
    const middle: ClipProjectV3 = {
      ...migrateV2ToV3(v2Fixture()),
      tracks: [{
        id: 'v1', kind: 'video',
        items: [{ type: 'compound', id: 'inner', start: 0, duration: 2, project: leaf }],
      }],
    };
    const root: ClipProjectV3 = {
      ...migrateV2ToV3(v2Fixture()),
      tracks: [{
        id: 'v1', kind: 'video',
        items: [{ type: 'compound', id: 'outer', start: 0, duration: 2, project: middle }],
      }],
    };
    expect(compoundProjectAtPath(root, ['outer', 'inner'])).toBe(leaf);
    expect(compoundProjectAtPath(root, ['outer', 'missing'])).toBeNull();
  });

  it('★ 播放头落在 compound 窗口内时能定位外层 compound', () => {
    const inner = migrateV2ToV3(v2Fixture());
    const root: ClipProjectV3 = {
      ...migrateV2ToV3(v2Fixture()),
      tracks: [{
        id: 'v1', kind: 'video',
        items: [{ type: 'compound', id: 'cmp-window', start: 1, duration: 2, project: inner }],
      }],
    };
    expect(compoundItemAtTime(root, 0.99)).toBeNull();
    expect(compoundItemAtTime(root, 1)).toMatchObject({ id: 'cmp-window', start: 1, duration: 2 });
    expect(compoundItemAtTime(root, 2.5)).toMatchObject({ id: 'cmp-window' });
    expect(compoundItemAtTime(root, 3)).toBeNull();
  });
});

describe('buildProjectV3ForWrite · 视图是编辑权威', () => {
  it('★ op 改了 clips 后落盘轨道跟着变（不会写回旧 tracks）', () => {
    const loaded = loadedFromV2(v2Fixture());
    loaded.clips = [...loaded.clips, seg('c3', { trimStart: 0, trimEnd: 2 })];
    const v3 = buildProjectV3ForWrite(loaded);
    const items = v3.tracks[0].items as Array<{ id: string; start?: number }>;
    expect(items.map((i) => i.id)).toEqual(['c1', 'c2', 'c3']);
    expect(items[2].start).toBe(5);   // c1=4 + c2=1
  });

  it('★ 额外轨道原样保留（S1 不开放多轨，但保存不能抹掉数据）', () => {
    const loaded = loadedFromV2(v2Fixture());
    const extra = { id: 'v2', kind: 'video' as const, name: 'B-roll', items: [{ type: 'clip' as const, id: 'b1', start: 0, duration: 2, segment: seg('b1', { trimEnd: 2 }) }] };
    loaded.tracks = [...loaded.tracks, extra];
    const v3 = buildProjectV3ForWrite(loaded);
    expect(v3.tracks.find((t) => t.id === 'v2')).toEqual(extra);
  });

  it('★ 多条音频轨：v2 视图只取第一条（读→写不会把额外轨并进主轨造成重复）', () => {
    const base = migrateV2ToV3(v2Fixture());
    const v3 = {
      ...base,
      tracks: [...base.tracks, {
        id: 'a2', kind: 'audio' as const,
        items: [{ type: 'audio' as const, id: 'a9', file: 'C:/x.wav', start: 0, duration: 1 }],
      }],
    };
    const loaded = v2ViewsOfV3(v3);
    expect(loaded.audios!.map((a) => a.id)).toEqual(['a1']);
    const written = buildProjectV3ForWrite(loaded);
    const audioTracks = written.tracks.filter((t) => t.kind === 'audio');
    expect(audioTracks.map((t) => t.items.map((i) => i.id))).toEqual([['a1'], ['a9']]);
  });

  it('★ 主轨含复合片段 → 保存时保留 compound，v2 视图只镜像普通片段', () => {
    const loaded = loadedFromV2(v2Fixture());
    loaded.tracks[0].items = [{
      type: 'compound', id: 'cmp1', start: 0, duration: 4, project: migrateV2ToV3(v2Fixture()),
    }];
    loaded.clips = [];
    const written = buildProjectV3ForWrite(loaded);
    expect(written.tracks[0].items).toEqual(loaded.tracks[0].items);
  });

  it('★ 主轨含 compound 时视图新增/修改普通片段，不得重建主轨丢 compound', () => {
    const loaded = loadedFromV2(v2Fixture());
    const inner = migrateV2ToV3(v2Fixture());
    loaded.tracks[0].items = [
      { type: 'clip', id: 'c1', start: 0, duration: 4, segment: seg('c1', { trimStart: 0, trimEnd: 4 }) },
      { type: 'compound', id: 'cmp1', start: 4, duration: 2, project: inner },
    ];
    loaded.clips = [seg('c1x', { trimStart: 0, trimEnd: 1 })];
    const written = buildProjectV3ForWrite(loaded);
    expect(written.tracks[0].items.some((it) => it.type === 'compound' && it.id === 'cmp1')).toBe(true);
  });

  it('★ audios 视图清空 → 主音频轨项清空但保留轨道（S3 允许空轨），额外音频轨保留', () => {
    const loaded = loadedFromV2(v2Fixture());
    loaded.audios = [];
    const written = buildProjectV3ForWrite(loaded);
    const audioTracks = written.tracks.filter((t) => t.kind === 'audio');
    expect(audioTracks).toHaveLength(1);
    expect(audioTracks[0].items).toEqual([]);

    const withExtra = loadedFromV2(v2Fixture());
    withExtra.audios = [];
    withExtra.tracks = [...withExtra.tracks, { id: 'a9', kind: 'audio', items: [] }];
    const w2 = buildProjectV3ForWrite(withExtra);
    expect(w2.tracks.filter((t) => t.kind === 'audio').map((t) => t.id)).toEqual(['a1', 'a9']);
  });
});

describe('materializeTrackTimes · 实测时长物化（S2 用）', () => {
  it('★ 只补未知项，不覆盖已知值', () => {
    const p: ClipProjectV3 = migrateV2ToV3({
      version: 2, name: 'p', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
      clips: [seg('c1', { trimStart: 0, trimEnd: 2 }), seg('c2'), seg('c3', { trimStart: 0, trimEnd: 1 })],
      layers: [], texts: [],
    });
    const out = materializeTrackTimes(p, { c2: 3, c3: 9 });
    const items = out.tracks[0].items as Array<{ id: string; start?: number; duration?: number }>;
    expect(items[0]).toMatchObject({ start: 0, duration: 2 });   // 已知值不动
    expect(items[1]).toMatchObject({ start: 2, duration: 3 });   // 探到 3s
    expect(items[2]).toMatchObject({ start: 5, duration: 1 });   // c3 自身已知 1s（不覆盖为 9）
    expect(p.tracks[0].items[1].duration).toBeUndefined();       // 纯函数：不改入参
  });
});
