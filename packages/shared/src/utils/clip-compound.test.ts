import { describe, expect, it } from 'vitest';
import {
  COMPOUND_MAX_DEPTH,
  compoundCacheKey,
  compoundProjectDepth,
  packMainTrackRange,
  unpackCompound,
  type CompoundProjectLike,
} from './clip-compound';

function project(): CompoundProjectLike {
  return {
    version: 3,
    name: 'root',
    updatedAt: 1,
    output: { size: '1080x1920', fps: 30 },
    tracks: [
      {
        id: 'v1',
        kind: 'video',
        items: [
          { type: 'clip', id: 'c1', start: 0, duration: 2, segment: { id: 'c1', file: 'a.mp4', trimStart: 0, trimEnd: 2 } },
          { type: 'clip', id: 'c2', start: 2, duration: 2, segment: { id: 'c2', file: 'b.mp4', trimStart: 0, trimEnd: 2 } },
          { type: 'clip', id: 'c3', start: 4, duration: 2, segment: { id: 'c3', file: 'c.mp4', trimStart: 0, trimEnd: 2 } },
        ],
      },
      {
        id: 'v2',
        kind: 'video',
        items: [
          { type: 'clip', id: 'b1', start: 1, duration: 2, segment: { id: 'b1', file: 'broll.mp4', trimStart: 0, trimEnd: 2 } },
        ],
      },
      {
        id: 'a1',
        kind: 'audio',
        items: [
          { type: 'audio', id: 'a1', file: 'voice.wav', start: 0.5, duration: 2 },
        ],
      },
    ],
    timedLayers: [
      {
        id: 't1', kind: 'text', start: 1, duration: 2, track: 1, transform: {},
        text: { id: 't1', text: 'hello', start: 1, end: 3 },
      },
    ],
  };
}

describe('compound clip mapping', () => {
  it('packs a continuous main-track range into one compound and preserves inner tracks/layers/audio', () => {
    const root = project();
    const packed = packMainTrackRange(root, {
      clipIds: ['c1', 'c2'],
      compoundId: 'cmp1',
    });

    const main = packed.project.tracks!.find((t) => t.id === 'v1')!;
    expect(main.items.map((it) => [it.type, it.id, it.start, it.duration])).toEqual([
      ['compound', 'cmp1', 0, 4],
      ['clip', 'c3', 4, 2],
    ]);
    const innerMain = packed.compound.project.tracks!.find((t) => t.id === 'v1')!;
    expect(innerMain.items.map((it) => [it.id, it.start, it.duration])).toEqual([
      ['c1', 0, 2],
      ['c2', 2, 2],
    ]);
    expect((packed.compound.project.clips as Array<{ id: string }>).map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(packed.compound.project.tracks!.find((t) => t.id === 'v2')!.items[0]).toMatchObject({
      id: 'b1', start: 1, duration: 2,
    });
    expect(packed.compound.project.tracks!.find((t) => t.id === 'a1')!.items[0]).toMatchObject({
      id: 'a1', start: 0.5, duration: 2,
    });
    expect(packed.compound.project.timedLayers![0]).toMatchObject({ id: 't1', start: 1, duration: 2 });
    expect((packed.compound.project.texts as Array<{ id: string }>)[0].id).toBe('t1');
    expect((packed.compound.project.layers as Array<{ id: string }>)[0].id).toBe('t1');
    expect(packed.project.clips!.map((c: { id: string }) => c.id)).toEqual(['c3']);
  });

  it('unpacks the compound back to ordinary main-track clips with absolute starts restored', () => {
    const packed = packMainTrackRange(project(), {
      clipIds: ['c1', 'c2'],
      compoundId: 'cmp1',
    });
    const unpacked = unpackCompound(packed.project, 'cmp1');
    const main = unpacked.project.tracks!.find((t) => t.id === 'v1')!;
    expect(main.items.map((it) => [it.type, it.id, it.start, it.duration])).toEqual([
      ['clip', 'c1', 0, 2],
      ['clip', 'c2', 2, 2],
      ['clip', 'c3', 4, 2],
    ]);
    expect(unpacked.restoredMainItemIds).toEqual(['c1', 'c2']);
    expect((unpacked.project.texts as Array<{ id: string }>)[0].id).toBe('t1');
  });

  it('packs a specified time range and trims source handles to the interval', () => {
    const packed = packMainTrackRange(project(), {
      start: 0.5,
      end: 3.5,
      compoundId: 'cmp-range',
    });
    expect(packed.compound).toMatchObject({ start: 0.5, duration: 3 });
    const main = packed.compound.project.tracks!.find((t) => t.id === 'v1')!;
    expect(main.items[0]).toMatchObject({ id: 'c1', start: 0, duration: 1.5 });
    expect(main.items[0].segment).toMatchObject({ trimStart: 0.5, trimEnd: 2 });
    expect(main.items[1]).toMatchObject({ id: 'c2', start: 1.5, duration: 1.5 });
  });

  it('rejects an empty range that contains no main-track content', () => {
    expect(() => packMainTrackRange(project(), {
      start: 10,
      end: 11,
      compoundId: 'cmp-empty',
    })).toThrow(/范围内没有主轨内容/);
  });

  it('rejects a range that extends beyond the main track end', () => {
    expect(() => packMainTrackRange(project(), {
      start: 4,
      end: 7,
      compoundId: 'cmp-past-end',
    })).toThrow(/超出主轨范围/);
  });

  it('rejects packing when the resulting root would exceed depth 3', () => {
    const deep = project();
    const level3: CompoundProjectLike = {
      ...project(),
      tracks: [
        {
          id: 'v1', kind: 'video', items: [{
            type: 'compound', id: 'inner', start: 0, duration: 1,
            project: project(),
          }],
        },
      ],
      timedLayers: [],
    };
    const level2: CompoundProjectLike = {
      ...project(),
      tracks: [
        {
          id: 'v1', kind: 'video', items: [{
            type: 'compound', id: 'middle', start: 0, duration: 1,
            project: level3,
          }],
        },
      ],
      timedLayers: [],
    };
    deep.tracks![0].items = [{
      type: 'compound', id: 'outer', start: 0, duration: 1, project: level3,
    }];
    expect(compoundProjectDepth(deep)).toBe(COMPOUND_MAX_DEPTH);
    expect(() => packMainTrackRange(deep, {
      start: 0,
      end: 1,
      compoundId: 'too-deep',
    })).toThrow(/嵌套深度/);
  });

  it('keeps cache keys stable across object-key order and invalidates on inner project changes', () => {
    const a = project();
    const b: CompoundProjectLike = {
      timedLayers: a.timedLayers,
      tracks: a.tracks,
      output: a.output,
      updatedAt: a.updatedAt,
      name: a.name,
      version: a.version,
    };
    const keyA = compoundCacheKey('cmp1', a, { size: '1080x1920', fps: 30, quality: 'std' });
    const keyB = compoundCacheKey('cmp1', b, { quality: 'std', fps: 30, size: '1080x1920' });
    expect(keyA).toBe(keyB);
    const projected: CompoundProjectLike = {
      ...a,
      clips: [{ id: 'view-only' }],
      layers: [{ id: 'layer-view' }],
      texts: [],
    };
    expect(compoundCacheKey('cmp1', projected, { size: '1080x1920', fps: 30, quality: 'std' })).toBe(keyA);
    b.tracks!.find((t) => t.id === 'v1')!.items[0].segment.trimEnd = 1.5;
    const changed = compoundCacheKey('cmp1', b, { size: '1080x1920', fps: 30, quality: 'std' });
    expect(changed).not.toBe(keyA);
  });
});
