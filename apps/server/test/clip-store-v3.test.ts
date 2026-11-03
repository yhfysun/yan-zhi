/**
 * 剪辑工程 v3 读写边界（多轨 S1）：老工程读→存→再读，出片计划必须逐字节一致。
 *
 * ★★★ 为什么必须测：这是 S1 的唯一硬验收。
 *   · 落盘只写 v3（tracks/timedLayers），v2 视图字段一律剥离；
 *   · 首次从 v2 迁移落盘留 `.v2.bak`，坏迁移可回退；
 *   · 迁移/校验失败**不写盘**，原文件不动；
 *   · 旧工程读→存→再读后的 buildRenderPlan 结果与迁移前完全相同。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readClipProject, writeClipProject, clipProjectPath } from '../src/services/clip-store.js';
import { layersFromV1Fields, type ClipProject } from '../src/services/clip-project.js';
import { buildRenderPlan, type RenderPlan } from '../src/services/clip-render.js';
import type { ClipProjectV3Loaded } from '../src/services/clip-project-v3.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-clip-store-v3-'));

vi.mock('../src/host-bridge.js', () => ({
  resolveArtifactDirFor: (arg: { conversationId?: string; category?: string }) => ({
    dir: path.join(TMP, arg.conversationId || 'no-conv', arg.category || 'intermediate'),
  }),
}));

beforeAll(() => {
  fs.mkdirSync(path.join(TMP, 'seed', 'intermediate'), { recursive: true });
});
afterAll(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
});

function convDir(id: string): void {
  fs.mkdirSync(path.join(TMP, id, 'intermediate'), { recursive: true });
}

/** 一个"什么都有"的 v2 工程：片段（裁剪/变速/曲线/图片）、字幕、画中画、贴纸、特效、音频、BGM、多机位。 */
function v2Fixture(): ClipProject {
  const texts = [
    { id: 't1', text: '第一句', start: 0, end: 2 },
    { id: 't2', text: '第二句', start: 2, end: 4, fontSizePx: 64, color: '#FFCC00', transform: { x: 0.1, y: -0.2, scale: 1.2 } },
  ];
  const overlays = [
    { id: 'o1', file: 'C:/media/pip.mp4', start: 1, end: 3, pos: 'topleft', scale: 0.4, blend: 'screen' as const, opacity: 0.8 },
  ];
  const audios = [
    { id: 'a1', file: 'C:/media/whoosh.wav', start: 0.5, end: 1.5, volume: 0.6, fadeIn: 0.1 },
    { id: 'a2', file: 'C:/media/sfx.wav', start: 1.2, end: 2.2 },
  ];
  const stickers = [{ id: 's1', file: 'C:/media/s.png', start: 2, end: 3, scale: 0.25, x: 0.1 }];
  const effects = [{ id: 'e1', fx: 'flash', start: 0, end: 0.4, intensity: 0.7 }];
  return {
    version: 2,
    name: '老工程',
    updatedAt: 1700000000000,
    output: { size: '1080x1920', fps: 30, quality: 'high', encoder: 'auto', interpolate: 'blend' },
    clips: [
      { id: 'c1', file: 'C:/media/a.mp4', trimStart: 0, trimEnd: 4, fadeIn: 0.2 },
      { id: 'c2', file: 'C:/media/b.mp4', trimStart: 1, trimEnd: 3, speed: 2, transition: { type: 'fade', duration: 0.4 } },
      { id: 'c3', file: 'C:/media/c.png', kenburns: { direction: 'in', duration: 2 } },
    ],
    layers: layersFromV1Fields(texts, overlays, audios, stickers, effects),
    texts,
    overlays,
    audios,
    stickers,
    effects,
    audioFx: ['denoise', 'loudnorm'],
    bgm: { file: 'C:/media/m.mp3', volume: 0.3, duck: true },
    multicamGroups: [{
      id: 'g1', files: ['C:/media/a.mp4', 'C:/media/b.mp4'], offsetsSec: [0, 1], headsSec: [1, 0],
      filmStart: 0, groupDurationSec: 4, slotSec: 2, slotAngles: [0, 1], clipIds: ['c1', 'c2'],
    }],
  };
}

function planOf(project: ClipProject): RenderPlan {
  const r = buildRenderPlan({
    project,
    durations: { c1: 4, c2: 3, c3: 2 },
    hasAudio: { c1: true, c2: true, c3: false },
    workDir: 'C:/work',
    outFile: 'C:/work/out.mp4',
    imageFiles: ['C:/media/c.png'],
  });
  if (!r.ok) throw new Error(r.error);
  return r.plan;
}

describe('readClipProject · 老工程统一读成 v3 内存形态', () => {
  it('★ v2 文件读入：version=3 + tracks/timedLayers；v2 视图与迁移前逐字段相同', () => {
    const id = 'conv-v2';
    convDir(id);
    const src = v2Fixture();
    fs.writeFileSync(clipProjectPath(id).file, JSON.stringify(src), 'utf8');

    const p = readClipProject(id)!;
    expect(p.version).toBe(3);
    // 轨道：一条主视频轨 + 一条音频轨
    expect(p.tracks.filter((t) => t.kind === 'video')).toHaveLength(1);
    expect(p.tracks.find((t) => t.kind === 'audio')!.items).toHaveLength(2);
    // 定时图层：字幕/画中画/贴纸/特效（不含音频）
    expect(p.timedLayers.map((l) => l.kind).sort()).toEqual(['effect', 'sticker', 'text', 'text', 'video']);
    // 视图（渲染/UI/AI op 继续读这些）
    expect(p.clips).toEqual(src.clips);
    expect(p.texts).toEqual(src.texts);
    expect(p.overlays).toEqual(src.overlays);
    expect(p.audios).toEqual(src.audios);
    expect(p.stickers).toEqual(src.stickers);
    expect(p.effects).toEqual(src.effects);
    expect(p.bgm).toEqual(src.bgm);
    expect(p.audioFx).toEqual(src.audioFx);
    expect(p.multicamGroups).toEqual(src.multicamGroups);
  });

  it('★ v1 文件读入：迁移到 v3，且首次写盘留 .v1.bak（既有行为不回退）', () => {
    const id = 'conv-v1';
    convDir(id);
    const v1 = {
      version: 1, name: '更老的工程', updatedAt: 1,
      output: { size: '1080x1920', fps: 30 },
      clips: [{ id: 'c1', file: 'C:/media/a.mp4' }],
      texts: [{ id: 't1', text: '老字幕', start: 0, end: 2 }],
      bgm: { file: 'C:/m.mp3', volume: 0.3, duck: true },
    };
    fs.writeFileSync(clipProjectPath(id).file, JSON.stringify(v1), 'utf8');
    const p = readClipProject(id)!;
    expect(p.version).toBe(3);
    expect(p.texts).toHaveLength(1);
    expect(p.tracks[0].items).toHaveLength(1);

    writeClipProject(id, p);
    const bak = path.join(path.dirname(clipProjectPath(id).file), 'clip-project.v1.bak');
    expect(fs.existsSync(bak)).toBe(true);
    expect(JSON.parse(fs.readFileSync(bak, 'utf8')).version).toBe(1);
  });
});

describe('writeClipProject · 只写 v3 并留 .v2.bak', () => {
  it('★ 落盘：version=3 + tracks/timedLayers；clips/layers/texts/overlays 全部剥离', () => {
    const id = 'conv-write';
    convDir(id);
    const src = v2Fixture();
    fs.writeFileSync(clipProjectPath(id).file, JSON.stringify(src), 'utf8');
    const p = readClipProject(id)!;

    writeClipProject(id, p);
    const raw = JSON.parse(fs.readFileSync(clipProjectPath(id).file, 'utf8')) as Record<string, unknown>;
    expect(raw.version).toBe(3);
    expect(Array.isArray(raw.tracks)).toBe(true);
    expect(Array.isArray(raw.timedLayers)).toBe(true);
    for (const k of ['clips', 'layers', 'texts', 'overlays', 'audios', 'stickers', 'effects']) {
      expect(raw[k]).toBeUndefined();
    }
    expect(raw.bgm).toEqual(src.bgm);
    expect(raw.audioFx).toEqual(src.audioFx);
    expect(raw.multicamGroups).toEqual(src.multicamGroups);
  });

  it('★ .v2.bak = 迁移前的原件（可回退）；只留一份，后续写盘不覆盖', () => {
    const id = 'conv-bak';
    convDir(id);
    const src = v2Fixture();
    fs.writeFileSync(clipProjectPath(id).file, JSON.stringify(src, null, 2), 'utf8');

    writeClipProject(id, readClipProject(id)!);
    const bak = path.join(path.dirname(clipProjectPath(id).file), 'clip-project.v2.bak');
    expect(fs.existsSync(bak)).toBe(true);
    expect(JSON.parse(fs.readFileSync(bak, 'utf8'))).toEqual(src);

    // 再写一次（此时磁盘已是 v3）：备份内容不变
    const before = fs.readFileSync(bak, 'utf8');
    writeClipProject(id, readClipProject(id)!);
    expect(fs.readFileSync(bak, 'utf8')).toBe(before);
  });

  it('★ 读→写→读→写 是不动点（磁盘 JSON 稳定，不会每次保存都漂移）', () => {
    const id = 'conv-fix';
    convDir(id);
    fs.writeFileSync(clipProjectPath(id).file, JSON.stringify(v2Fixture()), 'utf8');
    writeClipProject(id, readClipProject(id)!);
    const first = fs.readFileSync(clipProjectPath(id).file, 'utf8');
    writeClipProject(id, readClipProject(id)!);
    const second = fs.readFileSync(clipProjectPath(id).file, 'utf8');
    expect(second).toBe(first);
  });

  it('★ 未知图层 kind 经 v3 落盘→读回不丢', () => {
    const id = 'conv-future';
    convDir(id);
    const p = readClipProject(id);
    expect(p).toBeNull();
    const src = v2Fixture();
    src.layers = [...src.layers, { id: 'h1', kind: 'hologram' as never, file: 'C:/fx.mov', start: 0, end: 1, track: 3, transform: {} }];
    fs.writeFileSync(clipProjectPath(id).file, JSON.stringify(src), 'utf8');
    writeClipProject(id, readClipProject(id)!);
    expect(readClipProject(id)!.layers.some((l) => l.id === 'h1' && (l.kind as string) === 'hologram')).toBe(true);
  });

  it('★ 迁移/校验失败 → 抛错且原文件不动（不写坏草稿）', () => {
    const id = 'conv-fail';
    convDir(id);
    fs.writeFileSync(clipProjectPath(id).file, JSON.stringify(v2Fixture()), 'utf8');
    const before = fs.readFileSync(clipProjectPath(id).file, 'utf8');

    const p = readClipProject(id)!;
    // 构造一条同轨重叠的额外视频轨（S1 不允许；写盘校验必须拦住）
    p.tracks = [...p.tracks, {
      id: 'v2', kind: 'video', items: [
        { type: 'clip', id: 'x1', start: 0, duration: 2, segment: { id: 'x1', file: 'C:/x.mp4' } },
        { type: 'clip', id: 'x2', start: 1, duration: 2, segment: { id: 'x2', file: 'C:/y.mp4' } },
      ],
    }];
    expect(() => writeClipProject(id, p)).toThrow(/重叠/);
    expect(fs.readFileSync(clipProjectPath(id).file, 'utf8')).toBe(before);
  });
});

describe('出片计划冻结 · 老工程读→存→再读逐字段不变', () => {
  it('★ 迁移前后的 buildRenderPlan 完全一致（S1 的硬验收）', () => {
    const id = 'conv-plan';
    convDir(id);
    const src = v2Fixture();
    fs.writeFileSync(clipProjectPath(id).file, JSON.stringify(src), 'utf8');

    const before = readClipProject(id)!;           // 读入即 v3 内存 + v2 视图
    const planBefore = planOf(before);

    writeClipProject(id, before);                  // 存成 v3
    const after = readClipProject(id)!;            // 再从 v3 读回
    const planAfter = planOf(after);

    expect(planAfter).toEqual(planBefore);
    expect(JSON.stringify(planAfter)).toBe(JSON.stringify(planBefore));
  });

  it('★ 直接对原始 v2 工程算的计划也一致（视图没被归一化改动）', () => {
    const id = 'conv-plan2';
    convDir(id);
    const src = v2Fixture();
    fs.writeFileSync(clipProjectPath(id).file, JSON.stringify(src), 'utf8');
    const direct = planOf(src as ClipProject);
    const roundTripped = planOf(readClipProject(id)!);
    expect(JSON.stringify(roundTripped)).toBe(JSON.stringify(direct));
  });
});

describe('v3 文件读取校验', () => {
  it('★ 轨道重叠的 v3 文件读回 null（坏结构不进入编辑链路）', () => {
    const id = 'conv-badv3';
    convDir(id);
    const bad = {
      version: 3, name: 'bad', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
      tracks: [{
        id: 'v1', kind: 'video', items: [
          { type: 'clip', id: 'x1', start: 0, duration: 3, segment: { id: 'x1', file: 'C:/a.mp4' } },
          { type: 'clip', id: 'x2', start: 1, duration: 3, segment: { id: 'x2', file: 'C:/b.mp4' } },
        ],
      }],
      timedLayers: [],
    };
    fs.writeFileSync(clipProjectPath(id).file, JSON.stringify(bad), 'utf8');
    expect(readClipProject(id)).toBeNull();
  });

  it('★ 损坏 json 返回 null；空目录返回 null', () => {
    const id = 'conv-broken';
    convDir(id);
    fs.writeFileSync(clipProjectPath(id).file, '{oops', 'utf8');
    expect(readClipProject(id)).toBeNull();
    expect(readClipProject('conv-not-exist')).toBeNull();
  });

  it('★ v3 读写 round-trip（含定时图层）视图一致', () => {
    const id = 'conv-v3rt';
    convDir(id);
    fs.writeFileSync(clipProjectPath(id).file, JSON.stringify(v2Fixture()), 'utf8');
    const once = readClipProject(id)!;
    writeClipProject(id, once);
    const twice: ClipProjectV3Loaded = readClipProject(id)!;
    expect(twice.clips).toEqual(once.clips);
    expect(twice.texts).toEqual(once.texts);
    expect(twice.overlays).toEqual(once.overlays);
    expect(twice.audios).toEqual(once.audios);
    expect(twice.stickers).toEqual(once.stickers);
    expect(twice.effects).toEqual(once.effects);
    expect(twice.tracks).toEqual(once.tracks);
  });

  it('★ 主轨 compound 原样落盘；v2 clips 只镜像普通片段', () => {
    const id = 'conv-compound';
    convDir(id);
    fs.writeFileSync(clipProjectPath(id).file, JSON.stringify(v2Fixture()), 'utf8');
    const project = readClipProject(id)!;
    const inner = {
      version: 3 as const,
      name: 'inner',
      updatedAt: 1,
      output: project.output,
      tracks: [{
        id: 'v1', kind: 'video' as const,
        items: [{ type: 'clip' as const, id: 'inner-c1', start: 0, duration: 2, segment: { id: 'inner-c1', file: 'C:/inner.mp4' } }],
      }],
      timedLayers: [],
    };
    project.tracks[0].items = [
      { type: 'clip', id: 'outer-c1', start: 0, duration: 2, segment: { id: 'outer-c1', file: 'C:/outer.mp4' } },
      { type: 'compound', id: 'cmp1', start: 2, duration: 2, project: inner },
    ];
    project.clips = [{ id: 'outer-c1', file: 'C:/outer.mp4' }];

    writeClipProject(id, project);
    const raw = JSON.parse(fs.readFileSync(clipProjectPath(id).file, 'utf8')) as {
      tracks: Array<{ id: string; items: Array<{ type: string; id: string; project?: unknown }> }>;
    };
    const compound = raw.tracks.find((track) => track.id === 'v1')!.items
      .find((item) => item.type === 'compound');
    expect(compound).toMatchObject({ id: 'cmp1', project: inner });

    const again = readClipProject(id)!;
    expect(again.clips.map((clip) => clip.id)).toEqual(['outer-c1']);
    expect(again.tracks[0].items.some((item) => item.type === 'compound' && item.id === 'cmp1')).toBe(true);
  });
});
