/**
 * 矢量图层素材白名单单测（P1-10 / C-1）。
 *
 * ★ 为什么重要：这个白名单是浏览器 <img>/<video> 读本机文件的**唯一闸门**。
 *   判定写成前缀/目录包含就会被 ../ 或同前缀路径绕过（等于开放整盘读取）；
 *   写成"任意路径"更糟。这里逐条钉住"精确路径 + 规范化 + Windows 大小写"。
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createEmptyProject, type ClipProject } from '../src/services/clip-project';
import { projectSourcePaths, isProjectSourcePath, normalizeFsPath } from '../src/services/clip-layer-media';

function media(name: string): string {
  return path.resolve('/media', name);
}

function sampleProject(): ClipProject {
  const p = createEmptyProject('t');
  p.clips = [
    { id: 'c1', file: media('a.mp4'), audioFile: media('a-voice.wav') },
    { id: 'c2', file: media('b.mp4') },
  ];
  p.overlays = [{ id: 'o1', file: media('pip.mp4'), start: 0, end: 1 }];
  p.stickers = [{ id: 's1', file: media('sticker.png'), start: 0, end: 1 }];
  p.audios = [{ id: 'a1', file: media('sfx.wav'), start: 0, end: 1 }];
  p.bgm = { file: media('bgm.mp3'), volume: 0.3, duck: false };
  return p;
}

describe('projectSourcePaths · 工程引用收集', () => {
  it('收集主轨/配音/画中画/贴纸/定时音频/BGM，且去重', () => {
    const p = sampleProject();
    p.audios = [
      { id: 'a1', file: media('sfx.wav'), start: 0, end: 1 },
      { id: 'a2', file: media('sfx.wav'), start: 1, end: 2 },   // 同一文件重复引用
    ];
    const list = projectSourcePaths(p);
    expect(list).toContain(media('a.mp4'));
    expect(list).toContain(media('a-voice.wav'));
    expect(list).toContain(media('pip.mp4'));
    expect(list).toContain(media('sticker.png'));
    expect(list).toContain(media('sfx.wav'));
    expect(list).toContain(media('bgm.mp3'));
    expect(new Set(list).size).toBe(list.length);
  });

  it('空工程/空字段不产生条目', () => {
    expect(projectSourcePaths(null)).toEqual([]);
    const p = createEmptyProject('t');
    p.clips = [{ id: 'c1', file: '' }];
    expect(projectSourcePaths(p)).toEqual([]);
  });
});

describe('isProjectSourcePath · 精确匹配', () => {
  it('引用的路径放行', () => {
    const p = sampleProject();
    expect(isProjectSourcePath(p, media('a.mp4'))).toBe(true);
    expect(isProjectSourcePath(p, media('sticker.png'))).toBe(true);
    expect(isProjectSourcePath(p, media('bgm.mp3'))).toBe(true);
  });

  it('★ 未引用的路径一律拒绝（同目录/同前缀都不算）', () => {
    const p = sampleProject();
    expect(isProjectSourcePath(p, media('secret.mp4'))).toBe(false);
    expect(isProjectSourcePath(p, `${media('a.mp4')}.bak`)).toBe(false);
    expect(isProjectSourcePath(p, path.join(path.dirname(media('a.mp4')), '..', 'secret.mp4'))).toBe(false);
    expect(isProjectSourcePath(p, '')).toBe(false);
    expect(isProjectSourcePath(null, media('a.mp4'))).toBe(false);
  });

  it('允许相对写法但按绝对路径规范化后比较', () => {
    const p = sampleProject();
    const rel = path.relative(process.cwd(), media('a.mp4'));
    expect(isProjectSourcePath(p, rel)).toBe(true);
  });

  it('Windows 大小写不敏感、POSIX 敏感（与文件系统一致）', () => {
    const p = sampleProject();
    const upper = media('A.MP4');
    if (process.platform === 'win32') expect(isProjectSourcePath(p, upper)).toBe(true);
    else expect(isProjectSourcePath(p, upper)).toBe(false);
  });

  it('normalizeFsPath：绝对化 + Windows 小写', () => {
    const n = normalizeFsPath(media('x.mp4'));
    expect(path.isAbsolute(n)).toBe(true);
    expect(process.platform === 'win32' ? n === n.toLowerCase() : n === n).toBe(true);
  });
});
