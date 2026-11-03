/**
 * 多轨时间轴纯逻辑（S3）单测：视图合成、镜像、保存前同步、空档夹取、吸附。
 *
 * ★★★ 为什么必须测：时间轴算术错了表现为"拖完位置跳回去/片段消失/保存后空档没了"，
 *   而 ffmpeg 渲染完全正常 —— 只能靠这里的确定性用例兜住。
 */
import { describe, it, expect } from 'vitest';
import {
  activeVideoOverlayLayers,
  applyAudioTrackVolume,
  applyVideoTrackComposition,
  clampWithinGaps,
  ensureTracks,
  isClipItem,
  mirrorAudiosFromMainTrack,
  mirrorClipsFromMainTrack,
  overlapsOthers,
  resolveAudioItems,
  resolveClipItems,
  snapStart,
  sortItems,
  syncProjectModel,
  viewAudioRows,
  viewVideoRows,
  type UiProject,
  type UiTrack,
} from './clipTracks';

const dur = (seg: { duration?: number }) => seg.duration ?? 2;

function project(): UiProject {
  return {
    version: 2,
    clips: [
      { id: 'c1', file: 'C:/a.mp4' },
      { id: 'c2', file: 'C:/b.mp4' },
    ],
    audios: [{ id: 'a1', file: 'C:/x.wav', start: 1, end: 2 }],
  };
}

function trackProject(): UiProject {
  return {
    version: 3,
    clips: [
      { id: 'c1', file: 'C:/a.mp4' },
      { id: 'c2', file: 'C:/b.mp4' },
    ],
    audios: [],
    tracks: [
      {
        id: 'v1', kind: 'video', items: [
          { type: 'clip', id: 'c1', start: 0, duration: 2, segment: { id: 'c1', file: 'C:/a.mp4' } },
          { type: 'clip', id: 'c2', start: 4, duration: 2, segment: { id: 'c2', file: 'C:/b.mp4' } },
        ],
      },
      { id: 'v2', kind: 'video', items: [] },
      {
        id: 'a1', kind: 'audio', items: [
          { type: 'audio', id: 'a1', file: 'C:/x.wav', start: 1, duration: 1, volume: 0.5 },
        ],
      },
    ],
  };
}

describe('viewVideoRows / viewAudioRows · 老工程合成视图', () => {
  it('★ 没有 tracks：按 clips/audios 合成一条主轨（顺序首尾相接）且不写回工程', () => {
    const p = project();
    const rows = viewVideoRows(p, dur);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('video');
    expect(rows[0].items.map((i) => ({ id: i.id, start: i.start, duration: i.duration }))).toEqual([
      { id: 'c1', start: 0, duration: 2 },
      { id: 'c2', start: 2, duration: 2 },
    ]);
    expect(p.tracks).toBeUndefined();
    expect(viewAudioRows(p)[0].items[0]).toMatchObject({ id: 'a1', start: 1, duration: 1 });
  });

  it('★ 有 tracks 时原样返回（只挑同类）', () => {
    const p = trackProject();
    expect(viewVideoRows(p, dur).map((t) => t.id)).toEqual(['v1', 'v2']);
    expect(viewAudioRows(p).map((t) => t.id)).toEqual(['a1']);
  });
});

describe('resolveClipItems · 缺时间时的顺排', () => {
  it('★ 未写 start/duration 的旧片段按前一段结束时间顺排', () => {
    const track: UiTrack = {
      id: 'v1', kind: 'video', items: [
        { type: 'clip', id: 'c1', segment: { id: 'c1', file: 'a' } },
        { type: 'clip', id: 'c2', segment: { id: 'c2', file: 'b', duration: 3 } },
      ],
    };
    const out = resolveClipItems(track, (seg) => seg.duration ?? 2);
    expect(out.map((i) => [i.id, i.start, i.duration])).toEqual([
      ['c1', 0, 2],
      ['c2', 2, 3],
    ]);
  });

  it('★ 有显式 start 时按 start 排序（空档保留）', () => {
    const track: UiTrack = {
      id: 'v1', kind: 'video', items: [
        { type: 'clip', id: 'b', start: 5, duration: 1, segment: { id: 'b', file: 'b' } },
        { type: 'clip', id: 'a', start: 0, duration: 1, segment: { id: 'a', file: 'a' } },
      ],
    };
    expect(resolveClipItems(track, dur).map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('activeVideoOverlayLayers · 非主轨代理叠放', () => {
  it('★ 播放头窗口内的 clip/compound 按轨道顺序返回，并带窗口内偏移/透明度/混合模式', () => {
    const overlayProject: UiProject = {
      version: 3,
      updatedAt: 1,
      output: { size: '1080x1920', fps: 30 },
      clips: [],
      tracks: [{ id: 'inner-v1', kind: 'video', items: [] }],
    };
    const tracks: UiTrack[] = [
      {
        id: 'v1', kind: 'video', items: [
          { type: 'clip', id: 'main', start: 0, duration: 6, segment: { id: 'main', file: 'main.mp4' } },
        ],
      },
      {
        id: 'v2', kind: 'video', name: 'B-roll', opacity: 0.45, blend: 'screen', items: [
          { type: 'clip', id: 'b1', start: 1, duration: 2, segment: { id: 'b1', file: 'b.mp4' } },
        ],
      },
      {
        id: 'v3', kind: 'video', name: '复合层', items: [
          {
            type: 'compound', id: 'cmp1', start: 2, duration: 2,
            project: overlayProject,
          },
        ],
      },
    ];

    expect(activeVideoOverlayLayers(tracks, 2.5, dur)).toEqual([
      {
        trackId: 'v2', trackName: 'B-roll', itemId: 'b1', itemType: 'clip',
        start: 1, duration: 2, offset: 1.5, opacity: 0.45, blend: 'screen',
      },
      {
        trackId: 'v3', trackName: '复合层', itemId: 'cmp1', itemType: 'compound',
        start: 2, duration: 2, offset: 0.5, opacity: 1,
      },
    ]);
  });

  it('★ 窗口外不返回；hidden/muted/opacity=0/多机位角度轨全部跳过', () => {
    const tracks: UiTrack[] = [
      {
        id: 'v1', kind: 'video', items: [
          { type: 'clip', id: 'main', start: 0, duration: 3, segment: { id: 'main', file: 'main.mp4' } },
        ],
      },
      {
        id: 'hidden', kind: 'video', hidden: true, items: [
          { type: 'clip', id: 'h', start: 0, duration: 3, segment: { id: 'h', file: 'h.mp4' } },
        ],
      },
      {
        id: 'muted', kind: 'video', muted: true, items: [
          { type: 'clip', id: 'm', start: 0, duration: 3, segment: { id: 'm', file: 'm.mp4' } },
        ],
      },
      {
        id: 'transparent', kind: 'video', opacity: 0, items: [
          { type: 'clip', id: 'o', start: 0, duration: 3, segment: { id: 'o', file: 'o.mp4' } },
        ],
      },
      {
        id: 'angle', kind: 'video', multicamGroupId: 'g1', multicamAngleIndex: 1, items: [
          { type: 'clip', id: 'a', start: 0, duration: 3, segment: { id: 'a', file: 'a.mp4' } },
        ],
      },
    ];

    expect(activeVideoOverlayLayers(tracks, 1, dur)).toEqual([]);
    expect(activeVideoOverlayLayers(tracks, 3, dur)).toEqual([]);
  });
});

describe('applyVideoTrackComposition · 视频轨透明度/混合模式', () => {
  it('★ 写入透明度与混合模式，并把脏值夹到 0~1', () => {
    const track: UiTrack = { id: 'v2', kind: 'video', items: [] };
    expect(applyVideoTrackComposition(track, { opacity: 0.7, blend: 'screen' })).toBe(true);
    expect(track.opacity).toBe(0.7);
    expect(track.blend).toBe('screen');
    expect(applyVideoTrackComposition(track, { opacity: -0.4 })).toBe(true);
    expect(track.opacity).toBe(0);
    expect(applyVideoTrackComposition(track, { opacity: 0.4567 })).toBe(true);
    expect(track.opacity).toBe(0.457);
  });

  it('★ 满透明度与 normal 混合不落冗余字段；音频轨不参与视频合成', () => {
    const track: UiTrack = { id: 'v2', kind: 'video', opacity: 0.4, blend: 'multiply', items: [] };
    expect(applyVideoTrackComposition(track, { opacity: 1, blend: 'normal' })).toBe(true);
    expect(track).not.toHaveProperty('opacity');
    expect(track).not.toHaveProperty('blend');
    expect(applyVideoTrackComposition(track, { opacity: 1, blend: 'normal' })).toBe(false);

    const audio: UiTrack = { id: 'a1', kind: 'audio', items: [] };
    expect(applyVideoTrackComposition(audio, { opacity: 0, blend: 'screen' })).toBe(false);
    expect(audio).not.toHaveProperty('opacity');
    expect(audio).not.toHaveProperty('blend');
  });
});

describe('applyAudioTrackVolume · 音频轨整体音量', () => {
  it('★ 写入 0~2 音量；1 删除冗余字段，视频轨不参与', () => {
    const track: UiTrack = { id: 'a2', kind: 'audio', items: [] };
    expect(applyAudioTrackVolume(track, 0.65)).toBe(true);
    expect(track.volume).toBe(0.65);
    expect(applyAudioTrackVolume(track, 9)).toBe(true);
    expect(track.volume).toBe(2);
    expect(applyAudioTrackVolume(track, -1)).toBe(true);
    expect(track.volume).toBe(0);
    expect(applyAudioTrackVolume(track, 1)).toBe(true);
    expect(track).not.toHaveProperty('volume');
    expect(applyAudioTrackVolume(track, 1)).toBe(false);

    const video: UiTrack = { id: 'v2', kind: 'video', items: [] };
    expect(applyAudioTrackVolume(video, 0.5)).toBe(false);
    expect(video).not.toHaveProperty('volume');
  });
});

describe('ensureTracks · 首次轨道编辑物化', () => {
  it('★ clips/audios → v3 轨道，并升版本', () => {
    const p = project();
    const tracks = ensureTracks(p, dur);
    expect(p.version).toBe(3);
    expect(tracks.map((t) => t.kind)).toEqual(['video', 'audio']);
    expect(tracks[0].items).toHaveLength(2);
    expect(tracks[1].items[0]).toMatchObject({ type: 'audio', id: 'a1', duration: 1 });
  });
});

describe('mirror · 轨道编辑 → v2 视图', () => {
  it('★ 主轨按起点排序镜像到 clips（顺序 = 播放顺序）', () => {
    const p = trackProject();
    const main = p.tracks![0];
    (main.items[0] as { start: number }).start = 6;   // c1 拖到 c2 之后
    mirrorClipsFromMainTrack(p, dur);
    expect(p.clips.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('★ 第一条音频轨镜像到 audios（end = start + duration）', () => {
    const p = trackProject();
    mirrorAudiosFromMainTrack(p);
    expect(p.audios).toEqual([{ id: 'a1', file: 'C:/x.wav', start: 1, end: 2, volume: 0.5 }]);
  });
});

describe('syncProjectModel · 保存前双向收敛', () => {
  it('★ 视图没变 → 以轨道布局为准（空档保留，clips 顺序跟随）', () => {
    const p = trackProject();
    syncProjectModel(p, dur);
    expect(p.clips.map((c) => c.id)).toEqual(['c1', 'c2']);
    const items = p.tracks![0].items.filter(isClipItem);
    expect(items[1].start).toBe(4);          // 空档仍在
  });

  it('★ 视图被既有 op 改过（片段被删）→ 主轨按视图重建（顺序首尾相接）', () => {
    const p = trackProject();
    p.clips = [p.clips[1]];                  // 模拟 removeClip 删了 c1
    syncProjectModel(p, dur);
    const items = p.tracks![0].items.filter(isClipItem);
    expect(items.map((i) => i.id)).toEqual(['c2']);
    expect(items[0].start).toBe(0);
  });

  it('★ audios 与音频轨不一致 → 以视图为准重建（不复活已删音频）', () => {
    const p = trackProject();
    p.audios = [];
    syncProjectModel(p, dur);
    expect(p.tracks![2].items).toEqual([]);
  });

  it('★ 主轨含 compound 时视图差异不得重建主轨丢 compound', () => {
    const p = trackProject();
    p.tracks![0].items = [
      { type: 'clip', id: 'c1', start: 0, duration: 2, segment: { id: 'c1', file: 'C:/a.mp4' } },
      {
        type: 'compound', id: 'cmp1', start: 2, duration: 2,
        project: {
          version: 3, name: 'inner', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
          clips: [], tracks: [{ id: 'v1', kind: 'video', items: [] }], timedLayers: [],
        },
      },
    ];
    p.clips = [{ id: 'c1-new', file: 'C:/new.mp4' }];
    syncProjectModel(p, dur);
    expect(p.tracks![0].items.some((it) => it.type === 'compound' && it.id === 'cmp1')).toBe(true);
  });

  it('★ audios 与音频轨一致 → 不重建（保留 volume 等字段）', () => {
    const p = trackProject();
    p.audios = [{ id: 'a1', file: 'C:/x.wav', start: 1, end: 2, volume: 0.5 }];
    syncProjectModel(p, dur);
    expect(p.tracks![2].items[0]).toMatchObject({ id: 'a1', volume: 0.5 });
  });

  it('★ 没有音频轨但 audios 有内容 → 自动补一条音频轨', () => {
    const p = trackProject();
    p.tracks = p.tracks!.filter((t) => t.kind !== 'audio');
    p.audios = [{ id: 'a9', file: 'C:/y.wav', start: 0, end: 1 }];
    syncProjectModel(p, dur);
    expect(p.tracks!.some((t) => t.kind === 'audio')).toBe(true);
  });
});

describe('clampWithinGaps · 同轨不许重叠', () => {
  const items = [
    { id: 'a', start: 0, duration: 2 },
    { id: 'b', start: 4, duration: 2 },
  ];

  it('★ 落在空档内 → 原样（保留间隙）', () => {
    expect(clampWithinGaps(items, 'x', 2.2, 1)).toBe(2.2);
  });

  it('★ 压到邻居 → 夹到最近的可行位置（贴住邻居边缘）', () => {
    // x 想从 3 开始、长 1.5：会压到 b(4~6) → 最近的可行位置是 2.5（终点正好贴住 b）
    expect(clampWithinGaps(items, 'x', 3, 1.5)).toBe(2.5);
  });

  it('★ 拖到负数 → 夹到最近的可行起点（0 被占时到第一段之后）', () => {
    expect(clampWithinGaps(items, 'x', -5, 1)).toBe(2);
    expect(clampWithinGaps([{ id: 'b', start: 4, duration: 2 }], 'x', -5, 1)).toBe(0);
  });

  it('★ 自身被排除（原地重算不冲突）', () => {
    expect(clampWithinGaps(items, 'a', 0.5, 2)).toBe(0.5);
  });

  it('★ 末尾总有空间（可以放到最后一段之后）', () => {
    const full = [
      { id: 'a', start: 0, duration: 5 },
      { id: 'b', start: 5, duration: 5 },
    ];
    expect(clampWithinGaps(full, 'x', 3, 6)).toBe(10);
  });
});

describe('snapStart / overlapsOthers / sortItems', () => {
  it('★ 起点吸附与终点吸附（贴邻居右边缘）', () => {
    const points = [0, 2, 6];
    expect(snapStart(2.1, 1, points, 0.2)).toBe(2);       // 起点对齐
    expect(snapStart(1.1, 1, points, 0.2)).toBe(1);       // 终点对齐到 2
    expect(snapStart(3, 1, points, 0.2)).toBe(3);         // 远离吸附点不动
  });

  it('★ 重叠判定排除自身', () => {
    const items = [{ id: 'a', start: 0, duration: 2 }];
    expect(overlapsOthers(items, 'x', 1, 2)).toBe(true);
    expect(overlapsOthers(items, 'x', 2, 2)).toBe(false);
    expect(overlapsOthers(items, 'a', 0, 2)).toBe(false);
  });

  it('★ 有未知起点时保持原顺序', () => {
    expect(sortItems([{ id: 'a' }, { id: 'b', start: 1 }]).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('★ resolveAudioItems 按起点排序并补齐 end', () => {
    const track: UiTrack = {
      id: 'a1', kind: 'audio', items: [
        { type: 'audio', id: 'x', file: 'x', start: 3, duration: 1 },
        { type: 'audio', id: 'y', file: 'y', start: 0, duration: 2 },
      ],
    };
    expect(resolveAudioItems(track).map((i) => i.id)).toEqual(['y', 'x']);
  });
});
