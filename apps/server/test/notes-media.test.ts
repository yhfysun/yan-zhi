// 笔记媒体上传回归（notes/media.ts，真落盘 —— DATA_DIR 由全局 setup 隔离到临时目录）。
// docs/音乐双方向重构方案-2026-11-15.md §八：白名单 / 魔数 / 路径穿越 / 重名不覆盖 / URL 通道。
// 这是「写文件 ≠ 安全」的主战场：v-html 面只吃本地 /api/generated/...，入口必须把非图片挡死。
import { describe, it, expect } from 'vitest';
import { sanitizeNoteMediaName, saveNoteMedia, NOTE_MEDIA_MAX } from '../src/notes/media';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8"/></svg>', 'utf8').toString('base64');
const EXE = Buffer.from('MZ(fake executable)').toString('base64');

describe('sanitizeNoteMediaName（文件名 + 扩展名白名单）', () => {
  it('★ 路径穿越被清洗：../ 与盘符分隔符全部换成 _', () => {
    const r = sanitizeNoteMediaName('../../etc/passwd.png');
    expect(r).not.toBeNull();
    expect(r!.stem).not.toContain('/');
    expect(r!.stem).not.toContain('..');
    expect(r!.ext).toBe('.png');
  });

  it('★ 非白名单扩展 / 无扩展名 / 无 stem → null', () => {
    expect(sanitizeNoteMediaName('a.exe')).toBeNull();
    expect(sanitizeNoteMediaName('a.html')).toBeNull();
    expect(sanitizeNoteMediaName('noext')).toBeNull();
    expect(sanitizeNoteMediaName('.png')).toBeNull();
    expect(sanitizeNoteMediaName('sheet.pdf')).toBeNull();
  });
});

describe('saveNoteMedia（落盘 + 魔数 + URL 通道）', () => {
  it('★ PNG 真落盘：URL 是本地 /api/generated/images 相对路径、mime 正确', () => {
    const r = saveNoteMedia(`note-${Date.now()}.png`, PNG);
    expect(r.url).toMatch(/^\/api\/generated\/images\/.+\.png$/);
    expect(r.mime).toBe('image/png');
    expect(r.bytes).toBeGreaterThan(0);
  });

  it('★ SVG 谱面图落盘（曲谱入笔记用同一条通道）', () => {
    const r = saveNoteMedia(`score-${Date.now()}.svg`, SVG);
    expect(r.url).toMatch(/^\/api\/generated\/images\/.+\.svg$/);
    expect(r.mime).toBe('image/svg+xml');
  });

  it('★ 魔数校验：扩展名 png 但内容是可执行 → 拒（写文件 ≠ 安全）', () => {
    expect(() => saveNoteMedia(`evil-${Date.now()}.png`, EXE)).toThrow(/魔数/);
  });

  it('★ 超大小 / 空 base64 → 拒', () => {
    const big = Buffer.alloc(NOTE_MEDIA_MAX + 1, 1).toString('base64');
    expect(() => saveNoteMedia(`big-${Date.now()}.png`, big)).toThrow(/10MB/);
    expect(() => saveNoteMedia(`empty-${Date.now()}.png`, '')).toThrow();
  });

  it('★ 重名加序号不覆盖（覆盖会让笔记里的图静默指向新内容）', () => {
    const stem = `dup-${Date.now()}`;
    const r1 = saveNoteMedia(`${stem}.png`, PNG);
    const r2 = saveNoteMedia(`${stem}.png`, PNG);
    expect(r1.url).not.toBe(r2.url);
    expect(decodeURIComponent(r2.url)).toMatch(/\(2\)\.png$/);
  });
});
