// 看板围栏块解析（```ydash + JSON）
// 内容与 .ydash 文件同构，校验统一走 ydash.ts。
import type { YdashFile } from './ydash';
import { parseYdash } from './ydash';

export type DashboardBlock =
  | { ok: true; dash: YdashFile }
  | { ok: false; error: string; raw: string };

const FENCE_RE = /```ydash[ \t]*\r?\n([\s\S]*?)```/g;

export function extractDashboardBlocks(markdown: string): DashboardBlock[] {
  const out: DashboardBlock[] = [];
  for (const m of String(markdown || '').matchAll(FENCE_RE)) {
    const raw = (m[1] || '').trim();
    if (!raw) continue;
    const r = parseYdash(raw);
    out.push(r.ok ? { ok: true, dash: r.dash } : { ok: false, error: r.error, raw });
  }
  return out;
}

export function stripDashboardBlocks(markdown: string): string {
  return String(markdown || '')
    .replace(FENCE_RE, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const TOOL_MARK_RE = /\[ydash\]([\s\S]*?)\[\/ydash\]/g;

/** 工具结果里的看板定义：build_dashboard_dsl 返回 [ydash]{...}[/ydash]（数据不进上下文） */
export function extractToolDashboardBlocks(texts: Array<string | undefined | null>): YdashFile[] {
  const out: YdashFile[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const m of String(text).matchAll(TOOL_MARK_RE)) {
      const raw = (m[1] || '').trim();
      if (!raw) continue;
      const r = parseYdash(raw);
      if (r.ok) out.push(r.dash);
    }
  }
  return out;
}
