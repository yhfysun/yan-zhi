// 笔记媒体上传（业务唯一实现）—— docs/音乐双方向重构方案-2026-11-15.md §3.5。
// routes/notes.ts 只做 HTTP 编排。落 mediaTarget({kind:'images'}) 规范目录（笔记无 conversationId，
// 走两段式 /api/generated/images），URL 与工具产物同一通道，不另拼路径。
// ★ 安全收口：扩展名 + 魔数双白名单（png/jpeg/webp/svg）、≤10MB、文件名安全化、重名加序号不覆盖。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mediaTarget } from '../mcp/api-tool-executor.js';

export const NOTE_MEDIA_MAX = 10 * 1024 * 1024;

const NOTE_MEDIA_TYPES: Record<string, { mime: string; magic: (b: Buffer) => boolean }> = {
  '.png': { mime: 'image/png', magic: (b) => b[0] === 0x89 && b[1] === 0x50 },
  '.jpg': { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  '.jpeg': { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  '.webp': { mime: 'image/webp', magic: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  '.svg': { mime: 'image/svg+xml', magic: (b) => b.subarray(0, 300).toString('utf8').includes('<svg') || b.subarray(0, 300).toString('utf8').includes('<?xml') },
};

/** 文件名清洗 + 扩展名白名单（测试钉：路径穿越 / 非白名单扩展都拒） */
export function sanitizeNoteMediaName(name: string): { stem: string; ext: string } | null {
  const safe = String(name).replace(/[\\/]/g, '_').replace(/\.\./g, '_').slice(0, 180);
  const dot = safe.lastIndexOf('.');
  const ext = (dot > 0 ? safe.slice(dot).toLowerCase() : '');
  if (!NOTE_MEDIA_TYPES[ext] || !safe.slice(0, dot).trim()) return null;
  return { stem: safe.slice(0, dot), ext };
}

export type NoteMediaSaved = { url: string; file: string; bytes: number; mime: string };

/** 保存一张笔记图片；返回可访问 URL。魔数校验未过 / 超大小抛错（调用方转 400/413）。 */
export function saveNoteMedia(name: string, base64: string): NoteMediaSaved {
  const parsed = sanitizeNoteMediaName(name);
  if (!parsed) throw new Error('只允许 png / jpg / webp / svg 图片');
  const type = NOTE_MEDIA_TYPES[parsed.ext];
  let buf: Buffer;
  try { buf = Buffer.from(base64, 'base64'); } catch { throw new Error('base64 解码失败'); }
  if (!buf.length || buf.length > NOTE_MEDIA_MAX) throw new Error('图片为空或超过 10MB 上限');
  if (!type.magic(buf)) throw new Error('文件内容与扩展名不符（魔数校验未过）');
  const target = mediaTarget({ kind: 'images' });
  mkdirSync(target.dir, { recursive: true });
  let finalName = `${parsed.stem}${parsed.ext}`;
  let file = path.join(target.dir, finalName);
  for (let i = 2; existsSync(file) && i < 1000; i++) { finalName = `${parsed.stem} (${i})${parsed.ext}`; file = path.join(target.dir, finalName); }
  writeFileSync(file, buf);
  return { url: `${target.urlBase}/${encodeURIComponent(finalName)}`, file, bytes: buf.length, mime: type.mime };
}
