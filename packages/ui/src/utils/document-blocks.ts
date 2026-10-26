// 文档围栏块解析（```document 或 ```ydoc + JSON）
//
// 模型输出一个 document 围栏块描述文档实例；聊天消息渲染前抽出，交给 DocumentCard。
// 内容与 .ydoc 文件**同构**，校验逻辑统一走 ydoc.ts，避免两套规则漂移。

import type { DocumentInstance } from './document-types';
import { parseYdoc } from './ydoc';

export type DocumentBlock =
  | { ok: true; doc: DocumentInstance }
  | { ok: false; error: string; raw: string };

const FENCE_RE = /```(?:document|ydoc)[ \t]*\r?\n([\s\S]*?)```/g;

function normalize(raw: string): DocumentBlock {
  const text = String(raw ?? '').trim();
  const result = parseYdoc(text);
  return result.ok
    ? { ok: true, doc: result.doc }
    : { ok: false, error: result.error, raw: text };
}

export function extractDocumentBlocks(markdown: string): DocumentBlock[] {
  const out: DocumentBlock[] = [];
  for (const m of String(markdown || '').matchAll(FENCE_RE)) {
    const raw = (m[1] || '').trim();
    if (!raw) continue;
    out.push(normalize(raw));
  }
  return out;
}

export function stripDocumentBlocks(markdown: string): string {
  return String(markdown || '')
    .replace(FENCE_RE, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
