import { describe, expect, it } from 'vitest';
import { loadedFromV2, type ClipProjectV3Loaded } from '../src/services/clip-project-v3';
import {
  buildMulticamAngleTracks,
  syncMulticamAngleTracks,
} from '../src/services/clip-multicam-angle';
import { rebuildMulticamGroup } from '../src/services/clip-multicam';
import { buildRenderPlan, buildTrackPlan } from '../src/services/clip-render';
import { normalizeMulticamGroups, type MulticamGroup } from '../src/services/clip-project';

function group(): MulticamGroup {
  return {
    id: 'g1',
    files: ['C:/cam-a.mp4', 'C:/cam-b.mp4'],
    offsetsSec: [0, 1],
    headsSec: [0, 1],
    filmStart: 5,
    groupDurationSec: 4,
    slotSec: 2,
    slotAngles: [0, 1],
    clipIds: ['s1', 's2'],
  };
}

function project(): ClipProjectV3Loaded {
  return loadedFromV2({
    version: 2,
    name: 'p',
    updatedAt: 1,
    output: { size: '1080x1920', fps: 30 },
    clips: [{ id: 's1', file: 'C:/cam-a.mp4', trimStart: 0, trimEnd: 2 }],
    layers: [],
    texts: [],
  });
}

describe('multicam angle tracks', () => {
  it('builds one hidden reference track per angle, aligned to film time and source heads', () => {
    const tracks = buildMulticamAngleTracks(group());
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      id: 'mc-g1-a0',
      kind: 'video',
      hidden: true,
      locked: true,
      multicamGroupId: 'g1',
      multicamAngleIndex: 0,
    });
    expect(tracks[0].items).toHaveLength(2);
    expect(tracks[0].items[0]).toMatchObject({
      type: 'clip',
      start: 5,
      duration: 2,
      segment: {
        file: 'C:/cam-a.mp4',
        trimStart: 0,
        trimEnd: 2,
      },
    });
    expect(tracks[1].items[0]).toMatchObject({
      start: 5,
      duration: 2,
      segment: {
        file: 'C:/cam-b.mp4',
        trimStart: 1,
        trimEnd: 3,
      },
    });
    expect(tracks[1].items[1]).toMatchObject({
      start: 7,
      duration: 2,
      segment: {
        trimStart: 3,
        trimEnd: 5,
      },
    });
  });

  it('syncs angle tracks idempotently and records track bindings on the group', () => {
    const p = project();
    p.multicamGroups = [group()];
    const once = syncMulticamAngleTracks(p);
    const twice = syncMulticamAngleTracks(once);
    const angleTracks = twice.tracks.filter((track) => track.multicamGroupId === 'g1');
    expect(angleTracks.map((track) => track.id)).toEqual(['mc-g1-a0', 'mc-g1-a1']);
    expect(twice.multicamGroups![0].angleTracks).toEqual([
      { trackId: 'mc-g1-a0', angleIndex: 0, file: 'C:/cam-a.mp4' },
      { trackId: 'mc-g1-a1', angleIndex: 1, file: 'C:/cam-b.mp4' },
    ]);
    expect(twice.tracks.filter((track) => track.multicamGroupId === 'g1')).toHaveLength(2);
  });

  it('removes orphan angle tracks when their group metadata is deleted', () => {
    const p = project();
    p.multicamGroups = [group()];
    const synced = syncMulticamAngleTracks(p);
    const cleaned = syncMulticamAngleTracks({ ...synced, multicamGroups: [] });
    expect(cleaned.tracks.some((track) => track.multicamGroupId === 'g1')).toBe(false);
  });

  it('hidden angle tracks do not change the legacy render plan', () => {
    const p = project();
    p.multicamGroups = [group()];
    const synced = syncMulticamAngleTracks(p);
    const input = {
      project: synced,
      durations: { s1: 2 },
      hasAudio: { s1: true },
      workDir: 'C:/work',
      outFile: 'C:/work/out.mp4',
      imageFiles: [],
    };
    expect(buildTrackPlan(input)).toEqual(buildRenderPlan(input));
  });

  it('normalizes legacy groups without angleTracks and preserves valid new bindings', () => {
    const legacy = normalizeMulticamGroups([group()])[0];
    expect(legacy.angleTracks).toBeUndefined();
    const modern = normalizeMulticamGroups([{
      ...group(),
      angleTracks: [
        { trackId: 'mc-g1-a0', angleIndex: 0, file: 'C:/cam-a.mp4' },
        { trackId: 'mc-g1-a1', angleIndex: 1, file: 'C:/cam-b.mp4' },
        { trackId: 'bad', angleIndex: 9, file: 'C:/bad.mp4' },
      ],
    }])[0];
    expect(modern.angleTracks).toEqual([
      { trackId: 'mc-g1-a0', angleIndex: 0, file: 'C:/cam-a.mp4' },
      { trackId: 'mc-g1-a1', angleIndex: 1, file: 'C:/cam-b.mp4' },
    ]);
  });

  it('rebuilds the active main-track projection without dropping any angle track', () => {
    const p = project();
    p.clips = [
      { id: 's1', file: 'C:/cam-a.mp4', trimStart: 0, trimEnd: 2 },
      { id: 's2', file: 'C:/cam-b.mp4', trimStart: 2, trimEnd: 4 },
    ];
    p.multicamGroups = [group()];
    const rebuilt = rebuildMulticamGroup(p, 'g1', [1, 0], { segmentIds: ['s1', 's2'] });
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) return;
    expect(rebuilt.project.clips.map((clip) => [clip.id, clip.file])).toEqual([
      ['s1', 'C:/cam-b.mp4'],
      ['s2', 'C:/cam-a.mp4'],
    ]);
    expect(rebuilt.project.tracks.filter((track) => track.multicamGroupId === 'g1')).toHaveLength(2);
    expect(rebuilt.project.multicamGroups![0].slotAngles).toEqual([1, 0]);
  });
});
