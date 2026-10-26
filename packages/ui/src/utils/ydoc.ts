// .ydoc —— 言智文档中间格式（v1）
//
// 纯文本 JSON：可 diff、可校验、可导入导出。聊天里的 document 围栏与 .ydoc 文件**同构**，
// 渲染/导出共用同一个 DocumentInstance，避免出现两套模型。
// 标准输出（.docx）由 report-docx 生成，不发明二进制格式。

import type { DocumentInstance, DocumentSection } from './document-types';

export const YDOC_VERSION = 1;
export const YDOC_EXT = '.ydoc';
export const MAX_YDOC_SECTIONS = 60;

export interface YdocFile extends DocumentInstance {
  version: number;
}

const SECTION_KINDS = new Set<DocumentSection['kind']>([
  'heading', 'paragraph', 'metrics', 'table', 'chart', 'infographic', 'image', 'pageBreak',
]);

export type NormalizeResult =
  | { ok: true; doc: DocumentInstance }
  | { ok: false; error: string };

/** 校验并裁剪一个「形如 DocumentInstance」的对象（.ydoc 与聊天围栏共用） */
export function normalizeDocumentInstance(raw: unknown): NormalizeResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '文档必须是 JSON 对象' };
  const d = raw as Record<string, unknown>;
  if (typeof d.type !== 'string' || !d.type.trim()) return { ok: false, error: '缺少 type（文档类型 code）' };
  if (typeof d.title !== 'string' || !d.title.trim()) return { ok: false, error: '缺少 title' };
  if (!Array.isArray(d.sections) || d.sections.length === 0) return { ok: false, error: 'sections 必须是非空数组' };
  if (d.sections.length > MAX_YDOC_SECTIONS) return { ok: false, error: `sections 超过 ${MAX_YDOC_SECTIONS} 段，请精简` };

  const sections: DocumentSection[] = [];
  for (let i = 0; i < d.sections.length; i++) {
    const s = d.sections[i];
    if (!s || typeof s !== 'object') return { ok: false, error: `第 ${i + 1} 段不是对象` };
    const kind = (s as Record<string, unknown>).kind;
    if (typeof kind !== 'string' || !SECTION_KINDS.has(kind as DocumentSection['kind'])) {
      return { ok: false, error: `第 ${i + 1} 段 kind 非法：${String(kind)}` };
    }
    if (kind === 'infographic') {
      const syntax = (s as Record<string, unknown>).syntax;
      if (typeof syntax !== 'string' || !syntax.trim()) return { ok: false, error: `第 ${i + 1} 段 infographic 缺少 syntax` };
    }
    if (kind === 'chart') {
      const spec = (s as Record<string, unknown>).spec as Record<string, unknown> | undefined;
      if (!spec || typeof spec.dim !== 'string' || typeof spec.measure !== 'string') {
        return { ok: false, error: `第 ${i + 1} 段 chart 需要 spec.dim 与 spec.measure` };
      }
    }
    sections.push(s as DocumentSection);
  }

  return {
    ok: true,
    doc: {
      type: d.type.trim(),
      title: d.title.trim(),
      ...(typeof d.subtitle === 'string' && d.subtitle.trim() ? { subtitle: d.subtitle.trim() } : {}),
      ...(typeof d.author === 'string' && d.author.trim() ? { author: d.author.trim() } : {}),
      sections,
    },
  };
}

export function parseYdoc(text: string): NormalizeResult {
  let data: unknown;
  try {
    data = JSON.parse(String(text || ''));
  } catch (e) {
    return { ok: false, error: `JSON 解析失败：${e instanceof Error ? e.message : String(e)}` };
  }
  if (data && typeof data === 'object' && 'version' in (data as Record<string, unknown>)) {
    const v = Number((data as Record<string, unknown>).version);
    if (Number.isFinite(v) && v > YDOC_VERSION) {
      return { ok: false, error: `.ydoc 版本 ${v} 高于当前支持的 ${YDOC_VERSION}` };
    }
  }
  return normalizeDocumentInstance(data);
}

export function toYdoc(doc: DocumentInstance): string {
  const file: YdocFile = { version: YDOC_VERSION, ...doc };
  return JSON.stringify(file, null, 2);
}
