// S5：多机位角度参考轨。主轨仍保存当前激活角度投影，角度轨保存全部机位的同步源。

import type { ClipProject, MulticamGroup } from './clip-project.js';
import type { ClipItem, ClipProjectV3, Track } from './clip-project-v3.js';

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function fileLabel(file: string): string {
  return String(file || '').split(/[\\/]/).filter(Boolean).pop() || file;
}

function groupEdges(group: MulticamGroup): number[] {
  const duration = round3(Number(group.groupDurationSec));
  if (!(duration > 0)) return [];
  const boundaries = (Array.isArray(group.slotBoundariesSec) ? group.slotBoundariesSec : [])
    .map((n) => round3(Number(n)))
    .filter((n) => Number.isFinite(n) && n > 0 && n < duration)
    .sort((a, b) => a - b);
  if (boundaries.length) return [0, ...boundaries, duration];
  const slot = Number(group.slotSec);
  if (!(slot > 0)) return [];
  const count = Math.max(1, Math.ceil(duration / slot - 1e-9));
  const edges = [0];
  for (let i = 1; i < count; i++) edges.push(round3(Math.min(duration, i * slot)));
  edges.push(duration);
  return edges;
}

export function multicamAngleTrackId(groupId: string, angleIndex: number): string {
  return `mc-${groupId}-a${angleIndex}`;
}

export function buildMulticamAngleTracks(group: MulticamGroup): Track[] {
  const files = Array.isArray(group.files) ? group.files.map((file) => String(file || '').trim()).filter(Boolean) : [];
  if (files.length < 2) return [];
  const heads = files.map((_, i) => Math.max(0, Number(group.headsSec?.[i]) || 0));
  const edges = groupEdges(group);
  if (edges.length < 2) return [];
  const filmStart = Math.max(0, Number(group.filmStart) || 0);

  return files.map((file, angleIndex) => {
    const trackId = multicamAngleTrackId(group.id, angleIndex);
    const items: ClipItem[] = [];
    for (let slot = 0; slot < edges.length - 1; slot++) {
      const filmSlotStart = edges[slot];
      const filmSlotEnd = edges[slot + 1];
      const duration = round3(filmSlotEnd - filmSlotStart);
      if (!(duration > 0)) continue;
      const sourceStart = round3(heads[angleIndex] + filmSlotStart);
      const sourceEnd = round3(heads[angleIndex] + filmSlotEnd);
      items.push({
        type: 'clip',
        id: `${trackId}-s${slot + 1}`,
        start: round3(filmStart + filmSlotStart),
        duration,
        segment: {
          id: `${trackId}-s${slot + 1}`,
          file,
          label: fileLabel(file),
          trimStart: sourceStart,
          trimEnd: sourceEnd,
        },
      });
    }
    return {
      id: trackId,
      kind: 'video',
      name: `机位 ${angleIndex + 1} · ${fileLabel(file)}`,
      hidden: true,
      locked: true,
      multicamGroupId: group.id,
      multicamAngleIndex: angleIndex,
      items,
    };
  });
}

function bindingsOf(group: MulticamGroup, tracks: Track[]): NonNullable<MulticamGroup['angleTracks']> {
  return tracks
    .filter((track) => track.multicamGroupId === group.id)
    .map((track) => ({
      trackId: track.id,
      angleIndex: Number(track.multicamAngleIndex),
      file: String(group.files[Number(track.multicamAngleIndex)] || ''),
    }))
    .filter((item) => Number.isInteger(item.angleIndex) && item.angleIndex >= 0 && item.angleIndex < group.files.length);
}

/**
 * 同步一个或全部多机位组的角度参考轨。
 * 同一函数同时用于新增、手动切换、读写补轨，保证轨道 id 与源时间口径不漂移。
 */
export function syncMulticamAngleTracks<T extends ClipProject>(project: T, groupId?: string): T {
  const v3 = project as unknown as ClipProjectV3;
  if (!Array.isArray(v3.tracks)) return project;
  const groups = Array.isArray(v3.multicamGroups) ? v3.multicamGroups : [];
  if (!groups.length) {
    const tracks = v3.tracks.filter((track) => !track.multicamGroupId);
    return tracks.length === v3.tracks.length ? project : { ...project, tracks } as T;
  }
  const targets = groupId ? groups.filter((group) => group.id === groupId) : groups;
  if (!targets.length) return project;
  const targetIds = new Set(targets.map((group) => group.id));
  const retained = v3.tracks.filter((track) => !track.multicamGroupId || !targetIds.has(track.multicamGroupId));
  const generated = targets.flatMap((group) => buildMulticamAngleTracks(group));
  const mainIndex = retained.findIndex((track) => track.kind === 'video');
  const insertAt = mainIndex >= 0 ? mainIndex + 1 : 0;
  const tracks = [...retained.slice(0, insertAt), ...generated, ...retained.slice(insertAt)];
  const multicamGroups = groups.map((group) => {
    if (!targetIds.has(group.id)) return group;
    const bindings = bindingsOf(group, generated);
    return {
      ...group,
      ...(bindings.length ? { angleTracks: bindings } : {}),
    };
  });
  return { ...project, tracks, multicamGroups } as T;
}

export function ensureMulticamAngleTracks<T extends ClipProject>(project: T): T {
  return syncMulticamAngleTracks(project);
}
