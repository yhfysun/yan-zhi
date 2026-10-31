/**
 * 序列化边界 round-trip 单测（P0-1）：v1 文件 → readClipProject 迁移 → writeClipProject 落盘 → 再读。
 *
 * ★★★ 为什么必须测：read/writeClipProject 是"老工程能打开"（方案红线 5）的实际把关者。
 *   v1 备份、v2 派生视图、layers 重建（扩展字段保留）都钉在这里。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readClipProject, writeClipProject, clipProjectPath } from '../src/services/clip-store.js';
import type { ClipProjectV1, ClipProject } from '../src/services/clip-project.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-clip-store-test-'));
const CONV = 'conv-1';

vi.mock('../src/host-bridge.js', () => ({
  resolveArtifactDirFor: (arg: { conversationId?: string; category?: string }) => ({
    dir: path.join(TMP, arg.conversationId || 'no-conv', arg.category || 'intermediate'),
  }),
}));

beforeAll(() => {
  fs.mkdirSync(path.join(TMP, CONV, 'intermediate'), { recursive: true });
});

afterAll(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
});

function v1Fixture(): ClipProjectV1 {
  return {
    version: 1,
    name: '老工程',
    updatedAt: 123,
    output: { size: '1080x1920', fps: 30 },
    clips: [{ id: 'c1', file: 'C:/a.mp4' }],
    texts: [{ id: 't1', text: '老字幕', start: 0, end: 2 }],
    bgm: { file: 'C:/m.mp3', volume: 0.3, duck: true },
  };
}

describe('readClipProject / writeClipProject · v2 序列化边界', () => {
  it('★ v1 文件读入即迁移：version=2 + layers + texts 视图可用；首次写盘留 .v1.bak', () => {
    const { file } = clipProjectPath(CONV);
    fs.writeFileSync(file, JSON.stringify(v1Fixture()), 'utf8');
    const p = readClipProject(CONV);
    expect(p).not.toBeNull();
    expect(p!.version).toBe(2);
    expect(p!.layers).toHaveLength(1);
    expect(p!.layers[0].kind).toBe('text');
    expect(p!.texts).toHaveLength(1);
    expect(p!.texts[0].text).toBe('老字幕');
    expect(p!.bgm?.file).toBe('C:/m.mp3');
    // 备份在写盘边界触发（读入只迁移内存）：写一次后磁盘原件应被备份
    writeClipProject(CONV, p!);
    expect(fs.existsSync(path.join(path.dirname(file), 'clip-project.v1.bak'))).toBe(true);
    // 备份内容 = 原 v1 json（可回退）
    const bak = JSON.parse(fs.readFileSync(path.join(path.dirname(file), 'clip-project.v1.bak'), 'utf8')) as { version?: number };
    expect(bak.version).toBe(1);
  });

  it('★ v2 落盘只含 layers（texts/overlays 剥离）；再读派生视图一致', () => {
    let p = readClipProject(CONV)!;
    // 画中画视图 + 新字幕（走 op）
    p = { ...p, overlays: [{ id: 'o1', file: 'C:/p.mp4', start: 1, end: 3, pos: 'topleft', scale: 0.5 }] };
    writeClipProject(CONV, p);
    const raw = JSON.parse(fs.readFileSync(clipProjectPath(CONV).file, 'utf8')) as Record<string, unknown>;
    expect(raw.version).toBe(2);
    expect(raw.texts).toBeUndefined();
    expect(raw.overlays).toBeUndefined();
    expect(Array.isArray(raw.layers)).toBe(true);
    expect((raw.layers as unknown[]).length).toBe(2);

    const again = readClipProject(CONV)!;
    expect(again.texts).toHaveLength(1);
    expect(again.overlays).toHaveLength(1);
    expect(again.overlays![0].pos).toBe('topleft');
    expect(again.overlays![0].scale).toBe(0.5);
    // 双 round-trip 后内容稳定
    writeClipProject(CONV, again);
    const again2 = readClipProject(CONV)!;
    expect(again2.texts).toEqual(again.texts);
    expect(again2.overlays).toEqual(again.overlays);
  });

  // ★ P1-3 之后 effect 已是一等公民（有 effects 视图，视图权威）—— 这里改用真正未知的 kind
  //   来钉"未知图层原样保留"，特效的序列化由 clip-effect-layers.test.ts 覆盖。
  it('★ layers 里没有视图的未知 kind 落盘保留、再读不丢', () => {
    const p = readClipProject(CONV)!;
    const withFuture: ClipProject = {
      ...p,
      layers: [...p.layers, { id: 'h1', kind: 'hologram' as never, file: 'C:/fx.mov', start: 0, end: 1, track: 3, transform: {} }],
    };
    writeClipProject(CONV, withFuture);
    const again = readClipProject(CONV)!;
    expect(again.layers.some((l) => l.id === 'h1' && (l.kind as string) === 'hologram')).toBe(true);
  });

  it('★ 贴纸（P1-1）落盘进 layers[kind=sticker]，读回 stickers 视图一致', () => {
    const p = readClipProject(CONV)!;
    writeClipProject(CONV, {
      ...p,
      stickers: [{ id: 's1', file: 'C:/s.png', start: 1, end: 2, scale: 0.4, x: 0.1 }],
    });
    const again = readClipProject(CONV)!;
    expect(again.stickers).toEqual([{ id: 's1', file: 'C:/s.png', start: 1, end: 2, scale: 0.4, x: 0.1 }]);
    const raw = JSON.parse(fs.readFileSync(clipProjectPath(CONV).file, 'utf8'));
    expect(raw.stickers).toBeUndefined();                 // 视图字段不落盘
    expect(raw.layers.some((l: any) => l.kind === 'sticker')).toBe(true);
  });

  it('★ 损坏 json 返回 null（按"还没有工程"处理，不抛错）', () => {
    fs.writeFileSync(clipProjectPath(CONV).file, '{oops', 'utf8');
    expect(readClipProject(CONV)).toBeNull();
  });

  it('★ v2 文件缺 layers 字段 → 视图为空数组（不炸）', () => {
    // 用独立会话目录，避免与"损坏 json"用例共用状态
    const CONV2 = 'conv-2';
    fs.mkdirSync(path.join(TMP, CONV2, 'intermediate'), { recursive: true });
    fs.writeFileSync(
      clipProjectPath(CONV2).file,
      JSON.stringify({ version: 2, name: 'p', updatedAt: 1, output: { size: '1080x1920', fps: 30 }, clips: [] }),
      'utf8',
    );
    const p = readClipProject(CONV2)!;
    expect(p.version).toBe(2);
    expect(p.layers).toEqual([]);
    expect(p.texts).toEqual([]);
  });
});

describe('writeClipProject · 混合模式落盘与清除', () => {
  const CONV3 = 'conv-blend';
  beforeAll(() => {
    fs.mkdirSync(path.join(TMP, CONV3, 'intermediate'), { recursive: true });
  });

  it('★ blend 写进 layers[].transform.blend；从 overlays 移除后旧层残值不会复活', () => {
    const base: ClipProject = {
      version: 2, name: 'p', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
      clips: [{ id: 'c1', file: 'C:/a.mp4' }], texts: [], layers: [],
      overlays: [{ id: 'o1', file: 'C:/p.png', start: 0, end: 1, pos: 'center', scale: 0.4, blend: 'screen' }],
    };
    writeClipProject(CONV3, base);
    expect(readClipProject(CONV3)!.overlays![0].blend).toBe('screen');

    // 模拟 UI 改回「正常」：overlays 上删掉 blend，但内存 layers 仍是上一次读到的旧层。
    // ★ 如果序列化只做浅合并，旧层里的 blend=screen 会把用户的选择复活（静默回到滤色）。
    const staleLayers = readClipProject(CONV3)!.layers;
    writeClipProject(CONV3, {
      ...base,
      layers: staleLayers,
      overlays: [{ id: 'o1', file: 'C:/p.png', start: 0, end: 1, pos: 'center', scale: 0.4 }],
    });
    expect(readClipProject(CONV3)!.overlays![0].blend).toBeUndefined();
  });
});

describe('writeClipProject · 音频层落盘（P0-7）', () => {
  const CONV4 = 'conv-audio';
  beforeAll(() => {
    fs.mkdirSync(path.join(TMP, CONV4, 'intermediate'), { recursive: true });
  });

  it('★ audios 落进 layers[kind=audio]；读回视图一致；清空后旧层残值不会复活', () => {
    const base: ClipProject = {
      version: 2, name: 'p', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
      clips: [], texts: [], layers: [],
      audios: [{ id: 'a1', file: 'C:/whoosh.wav', start: 1, end: 2, volume: 0.5, fadeIn: 0.1 }],
    };
    writeClipProject(CONV4, base);
    expect(readClipProject(CONV4)!.audios).toEqual(base.audios);

    const raw = JSON.parse(fs.readFileSync(clipProjectPath(CONV4).file, 'utf8'));
    expect(raw.audios).toBeUndefined();               // 视图字段不落盘
    expect(raw.layers[0].kind).toBe('audio');
    expect(raw.layers[0].audio).toEqual({ volume: 0.5, fadeIn: 0.1 });

    // UI 删光音频后：视图为空 + 内存 layers 仍是上一次读到的旧层 → 不得复活
    const stale = readClipProject(CONV4)!.layers;
    writeClipProject(CONV4, { ...base, layers: stale, audios: [] });
    expect(readClipProject(CONV4)!.audios).toBeUndefined();
  });
});
