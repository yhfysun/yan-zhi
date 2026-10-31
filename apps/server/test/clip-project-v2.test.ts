/**
 * 轨道模型 v2 单测（P0-1）：迁移、双向投影。
 *
 * ★★★ 为什么必须测：layers 是新唯一存储，投影或迁移错了会让字幕/画中画静默消失
 *   （读出来 v1 视图为空 → 渲染不出字幕，且不报错）—— 这是"不报错但画面错"的最高危类别。
 *   序列化 round-trip 由 clip-mode-plugin.test / readClipProject 集成路径覆盖。
 */
import { describe, it, expect } from 'vitest';
import {
  migrateV1ToV2,
  layersFromV1Fields,
  v1FieldsFromLayers,
  createEmptyProject,
  applyClipOp,
  type ClipProject,
  type ClipProjectV1,
  type ClipText,
  type ClipOverlay,
  type Layer,
} from '../src/services/clip-project';

describe('migrateV1ToV2 · v1 → v2 迁移', () => {
  it('★ texts → kind=text/track=1（id 与全部样式字段保留）', () => {
    const v1: ClipProjectV1 = {
      version: 1,
      name: '老工程',
      updatedAt: 123,
      output: { size: '1080x1920', fps: 30 },
      clips: [{ id: 'c1', file: 'C:/a.mp4' }],
      texts: [
        { id: 't1', text: '第一句', start: 0, end: 2 },
        { id: 't2', text: '第二句', start: 2, end: 4, position: 'center', animation: 'zoom' },
      ],
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.version).toBe(2);
    expect(v2.layers).toHaveLength(2);
    const l1 = v2.layers[0];
    expect(l1.id).toBe('t1');
    expect(l1.kind).toBe('text');
    expect(l1.track).toBe(1);
    expect(l1.text?.text).toBe('第一句');
    expect(l1.start).toBe(0);
    expect(l1.end).toBe(2);
    const l2 = v2.layers[1];
    expect(l2.text?.animation).toBe('zoom');
    expect(l2.text?.position).toBe('center');
  });

  it('★ overlays → kind=video/track=0，pos → transform.x/y 等价换算', () => {
    const v1: ClipProjectV1 = {
      version: 1, name: 'p', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
      clips: [], texts: [],
      overlays: [
        { id: 'o1', file: 'C:/p.mp4', start: 1, end: 3, pos: 'topleft', scale: 0.5 },
        { id: 'o2', file: 'C:/p2.mp4', start: 2, end: 4 },   // 无 pos → 缺省 bottomright
      ],
    };
    const v2 = migrateV1ToV2(v1);
    const l1 = v2.layers.find((l) => l.id === 'o1')!;
    expect(l1.kind).toBe('video');
    expect(l1.track).toBe(0);
    expect(l1.file).toBe('C:/p.mp4');
    expect(l1.transform.x).toBe(-0.25);
    expect(l1.transform.y).toBe(-0.25);
    expect(l1.transform.scale).toBe(0.5);
    const l2 = v2.layers.find((l) => l.id === 'o2')!;
    expect(l2.transform.x).toBe(0.25);
    expect(l2.transform.y).toBe(0.25);
  });

  it('★ bgm/audioFx 原样保留（P0-1 不迁移音频，诚实边界）', () => {
    const v1: ClipProjectV1 = {
      version: 1, name: 'p', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
      clips: [], texts: [],
      audioFx: ['denoise'],
      bgm: { file: 'C:/m.mp3', volume: 0.3, duck: true },
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.bgm).toEqual({ file: 'C:/m.mp3', volume: 0.3, duck: true });
    expect(v2.audioFx).toEqual(['denoise']);
  });

  it('★ 迁移不改源对象（不可变契约）', () => {
    const v1: ClipProjectV1 = {
      version: 1, name: 'p', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
      clips: [{ id: 'c1', file: 'C:/a.mp4' }],
      texts: [{ id: 't1', text: 'x', start: 0, end: 1 }],
    };
    const v2 = migrateV1ToV2(v1);
    expect(v1.version).toBe(1);          // 源不动
    expect(v1.texts).toHaveLength(1);
    expect(v2.version).toBe(2);
    expect(v2.clips[0]).not.toBe(v1.clips[0]);   // 深拷贝
    expect(v2.clips[0]).toEqual(v1.clips[0]);
  });
});

describe('layersFromV1Fields / v1FieldsFromLayers · 双向投影', () => {
  it('★ text 层 round-trip：text → layer → text 无损', () => {
    const texts: ClipText[] = [
      { id: 't1', text: 'a', start: 0, end: 2, animation: 'zoom' },
    ];
    const L = layersFromV1Fields(texts, []);
    expect(L).toHaveLength(1);
    expect(L[0].kind).toBe('text');
    expect(L[0].track).toBe(1);
    const back = v1FieldsFromLayers(L).texts[0];
    expect(back).toEqual(texts[0]);
  });

  it('★ overlay round-trip：pos → xy → pos 回到同一锚点', () => {
    for (const pos of ['topleft', 'top', 'topright', 'left', 'center', 'right', 'bottomleft', 'bottom', 'bottomright']) {
      const overlays: ClipOverlay[] = [{ id: 'o1', file: 'C:/p.mp4', start: 0, end: 1, pos }];
      const L = layersFromV1Fields([], overlays);
      const back = v1FieldsFromLayers(L).overlays[0];
      expect(back.pos).toBe(pos);
    }
  });

  it('★ 无 pos/scale 的 overlay 迁出后回落缺省（bottomright / 0.35）', () => {
    const overlays: ClipOverlay[] = [{ id: 'o1', file: 'C:/p.mp4', start: 0, end: 1 }];
    const back = v1FieldsFromLayers(layersFromV1Fields([], overlays)).overlays[0];
    expect(back.pos).toBe('bottomright');
    expect(back.scale).toBeUndefined();
  });

  it('★ 非 text/video 的 kind 不进 v1 视图（P0-2 起才接渲染，本期不丢即可）', () => {
    const L: Layer[] = [
      { id: 'x1', kind: 'sticker', file: 'C:/s.webp', start: 0, end: 1, track: 2, transform: {} },
    ];
    const { texts, overlays } = v1FieldsFromLayers(L);
    expect(texts).toHaveLength(0);
    expect(overlays).toHaveLength(0);
    expect(L).toHaveLength(1);   // 层本身没被消费掉
  });

  it('★ text 层缺 text 字段 → 跳过（不产坏视图）', () => {
    const L: Layer[] = [{ id: 'x1', kind: 'text', start: 0, end: 1, track: 1, transform: {} }];
    const { texts } = v1FieldsFromLayers(L);
    expect(texts).toHaveLength(0);
  });

  it('★ ops（applyClipOp）在 v2 工程上照常工作：add_text 仍写 texts 视图', () => {
    const v2 = migrateV1ToV2({
      version: 1, name: 'p', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
      clips: [], texts: [{ id: 't1', text: '老字幕', start: 0, end: 1 }],
    });
    const r = applyClipOp(v2, 'add_text', { texts: [{ text: '新字幕', start: 1, end: 2 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.texts).toHaveLength(2);
    expect(r.project.layers).toHaveLength(1);   // ops 只动视图；layers 在落盘时统一镜像
  });
});
