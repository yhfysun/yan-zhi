// 浏览器记忆 —— 浏览使用记录 + 智能体浏览器操作的持久化记忆文件。
// 每天一份 Markdown：workspace/browser-memory/YYYY-MM-DD.md，一行一条：
//   - [HH:mm] [user|agent] 标题 — URL
// 来源：user=用户手动浏览（BrowserPanel 上报）；agent=智能体（pageAgent/主智能体）的浏览器操作。
// 用途：懒加载召回 —— 不自动注入系统提示词；智能体需要了解浏览背景时通过
//   api_browser_memory_read 工具按需拉取（跨会话）。
// 设计原则：记录写入绝不阻塞浏览/任务主流程（fire-and-forget + 全量吞错）。
import { mkdir, readFile, readdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const MEMORY_DIR = path.resolve(process.cwd(), 'workspace', 'browser-memory');
const ANALYSIS_FILE = path.resolve(process.cwd(), 'workspace', 'browser-analysis-latest.json');

/** 工具召回时的默认回看天数 */
const DEFAULT_DAYS = 3;
/** 召回时单日最多保留的行数（防单日超大文件撑爆输出） */
const MAX_LINES_PER_DAY = 60;

// ── 事件写入 ──

interface BrowserMemoryEvent {
  url: string;
  title?: string;
  source: 'user' | 'agent';
  /** 附加说明（如智能体操作类型） */
  note?: string;
}

/** 相同 url+source 的 60s 去重窗口（智能体反复刷新/重试时避免刷屏） */
let lastEvent = { key: '', at: 0 };

function dayFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.md`;
}

function hhmm(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 追加一条浏览器记忆（异步落盘、失败静默、绝不抛出） */
export async function recordBrowserMemoryEvent(entry: BrowserMemoryEvent): Promise<void> {
  try {
    const u = String(entry.url || '');
    if (!/^https?:\/\//i.test(u)) return;
    const key = `${entry.source}|${u}`;
    const now = Date.now();
    if (key === lastEvent.key && now - lastEvent.at < 60_000) return; // 60s 去重
    lastEvent = { key, at: now };

    await mkdir(MEMORY_DIR, { recursive: true });
    const file = path.join(MEMORY_DIR, dayFileName(new Date(now)));
    let exists = existsSync(file);
    if (!exists) {
      const date = dayFileName(new Date(now)).replace('.md', '');
      const header = `# 浏览器记忆 ${date}\n\n> 浏览使用记录与智能体浏览器操作（user=用户浏览 / agent=智能体操作），跨会话参考。\n\n`;
      await appendFile(file, header, 'utf-8');
      exists = true;
    }
    const host = (() => { try { return new URL(u).host; } catch { return u; } })();
    const title = String(entry.title || '').trim() || host;
    const note = entry.note ? `（${entry.note}）` : '';
    const line = `- [${hhmm(now)}] [${entry.source}] ${title} — ${u}${note}\n`;
    await appendFile(file, line, 'utf-8');
  } catch { /* 记忆记录失败不影响主流程 */ }
}

// ── 读取与注入 ──

/** 读近 N 天的浏览器记忆文件（拼接，按天分节，节内最多保留最新 MAX_LINES_PER_DAY 行） */
export async function readBrowserMemory(days = DEFAULT_DAYS): Promise<string> {
  let names: string[] = [];
  try { names = await readdir(MEMORY_DIR); } catch { return ''; }
  const cutoff = Date.now() - days * 86400000;
  const files = names
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n))
    .filter((n) => {
      const ts = new Date(n.replace('.md', 'T23:59:59')).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    })
    .sort();
  const parts: string[] = [];
  for (const f of files) {
    try {
      const raw = await readFile(path.join(MEMORY_DIR, f), 'utf-8');
      const lines = raw.split('\n').filter((l) => l.startsWith('- ['));
      if (!lines.length) continue;
      const kept = lines.slice(Math.max(lines.length - MAX_LINES_PER_DAY, 0));
      const more = lines.length - kept.length;
      parts.push(`### ${f.replace('.md', '')}（${lines.length} 条）\n${kept.join('\n')}${more > 0 ? `\n…（另有 ${more} 条更早记录）` : ''}`);
    } catch { /* 单文件读失败跳过 */ }
  }
  return parts.join('\n\n');
}

/** 读每日 AI 浏览分析（仅当天或昨天有效，过期忽略） */
async function readBrowserDailyAnalysis(): Promise<{ date: string; summary: string; highlights: string[] } | null> {
  try {
    if (!existsSync(ANALYSIS_FILE)) return null;
    const a = JSON.parse(await readFile(ANALYSIS_FILE, 'utf-8'));
    if (!a?.date || !a?.summary) return null;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (a.date !== today && a.date !== yesterday) return null;
    return { date: a.date, summary: String(a.summary), highlights: Array.isArray(a.highlights) ? a.highlights.slice(0, 5) : [] };
  } catch { return null; }
}

export interface BrowserMemoryOverview {
  days: number;
  content: string;
  analysis: { date: string; summary: string; highlights: string[] } | null;
}

/** 懒加载召回：浏览/操作记录（近 N 天）+ 每日 AI 分析摘要，一次拉取（供 api_browser_memory_read 工具用） */
export async function readBrowserMemoryOverview(days = DEFAULT_DAYS): Promise<BrowserMemoryOverview> {
  const [content, analysis] = await Promise.all([readBrowserMemory(days), readBrowserDailyAnalysis()]);
  return { days, content, analysis };
}
