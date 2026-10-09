// 领域经验档案（自进化经验层，2026-10-09）
// ─────────────────────────────────────────────────────────────
// 与既有记忆的职责划分（不互相合并）：
//   · memory 表            → 用户/画像事实（语义检索）
//   · 空间 MEMORY.md       → 空间长期结论 + 任务进展（注入）
//   · task-memory 下的 .md → 用户决策 + 逐批流水
//   · 本文件 experience/   → **可执行的操作经验**：⛔坑（踩过+规避）/ ✅步骤（验证过的做法）/ 📌事实（环境配置）
//
// 文件即真相源：<base>/.yan-zhi/experience/<topic>.md，人工可看可改可删。
// base 解析规则（与 space-memory 同口径）：
//   · 会话挂了空间且空间绑定目录 → <dir_path>/.yan-zhi/experience/
//   · 否则                       → <workspaceDir>/.yan-zhi/experience/（工作目录级共享，
//     让没挂空间的普通任务也能积累经验 —— "每次都从零来"是全任务类型的问题）
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { serverState } from '../state.js';

const EXPERIENCE_DIR = '.yan-zhi/experience';

export type ExperienceKind = 'pit' | 'step' | 'fact';

const KIND_LABEL: Record<ExperienceKind, string> = {
  pit: '⛔坑',
  step: '✅步骤',
  fact: '📌事实',
};

/** 注入预算（索引 + 命中文件正文，合计不超过这个字符量） */
const INJECT_MAX_CHARS = 3000;
/** 单条目 detail 上限（写入路径压平，防止一条经验写成长文撑爆文件） */
const DETAIL_MAX_CHARS = 500;

interface ExperienceBase { base: string }

/** skill 草稿目录：与经验层同一根（<root>/.yan-zhi/skill-drafts）—— 唯一定义处，别在别处复刻根解析 */
export function resolveSkillDraftsDir(
  conversationId: string | null | undefined,
  workspaceDir?: string | null,
): string {
  return path.join(resolveExperienceBase(conversationId, workspaceDir).base, '..', 'skill-drafts');
}

/** 解析经验目录根（会话空间绑定目录优先，回退全局工作目录） */
export function resolveExperienceBase(
  conversationId: string | null | undefined,
  workspaceDir?: string | null,
): ExperienceBase {
  let base = workspaceDir || serverState.workspaceDir || process.cwd();
  try {
    if (conversationId) {
      const conv = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(conversationId) as
        | { space_id: string | null }
        | undefined;
      if (conv?.space_id) {
        const space = db.prepare('SELECT dir_path FROM space WHERE id = ?').get(conv.space_id) as
          | { dir_path: string | null }
          | undefined;
        if (space?.dir_path) base = space.dir_path;
      }
    }
  } catch { /* 解析失败回退工作目录 */ }
  return { base: path.join(base, EXPERIENCE_DIR) };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** topic → 安全相对路径（允许 sites/<domain> 这种子目录形态；拒绝越界） */
function sanitizeTopic(topic: string): string | null {
  const t = String(topic || '').trim().toLowerCase().replace(/\\/g, '/');
  if (!t) return null;
  const parts = t.split('/').filter(Boolean);
  if (!parts.length || parts.some((p) => p === '.' || p === '..' || /[<>:"|?*\x00-\x1f]/.test(p))) return null;
  return parts.join('/');
}

function filePathFor(base: string, topic: string): string {
  return path.join(base, `${topic}.md`);
}

function fileHeader(topic: string): string {
  return [
    `# 经验档案：${topic}`,
    '',
    '> 自进化经验：⛔坑（踩过 + 规避）｜✅步骤（验证过的做法）｜📌事实（环境/配置/路径）。',
    '> 同主题任务开工先读本文件，命中就直接复用，不要重新摸索。格式：条目以 `- [` 开头，续行缩进两格。',
  ].join('\n');
}

/** 解析文件为条目块（每个块首行以 `- [` 开头，续行缩进） */
function parseEntries(content: string): string[] {
  const blocks: string[] = [];
  const lines = content.split('\n');
  let cur: string[] | null = null;
  for (const line of lines) {
    if (line.startsWith('- [')) {
      if (cur) blocks.push(cur.join('\n'));
      cur = [line];
    } else if (cur && /^\s{2,}\S/.test(line)) {
      cur.push(line);
    } else if (cur && !line.trim()) {
      cur.push(line);
    } else if (cur) {
      blocks.push(cur.join('\n'));
      cur = null;
    }
  }
  if (cur) blocks.push(cur.join('\n'));
  return blocks;
}

/** 条目首行里已有多少次计数（`（×3` 形式）；无计数视为 1 */
function entryCount(block: string): number {
  const m = block.match(/（×(\d+)/);
  return m ? Number(m[1]) : 1;
}

function bumpCount(block: string, n: number): string {
  const first = block.split('\n')[0];
  const m = first.match(/（×(\d+)）?/);
  let newFirst: string;
  if (m) {
    newFirst = first.replace(/（×\d+）?/, `（×${n}）`);
  } else {
    // 无计数标记：在标题后追加（插入在首个 ` | ` 分隔的标题段末尾）
    newFirst = first.replace(/((?:⛔坑|✅步骤|📌事实)\s*\|\s*[^（\n]*)/, (_s, p1) => `${p1}（×${n}）`);
  }
  return [newFirst, ...block.split('\n').slice(1)].join('\n');
}

function refreshDate(block: string): string {
  return block.replace(/\[\d{4}-\d{2}-\d{2}\]/, `[${today()}]`);
}

/** 标题相似度：字符 bigram Jaccard（CJK 友好，无需分词） */
function titleSimilarity(a: string, b: string): number {
  const norm = (s: string) => String(s || '').toLowerCase().replace(/[\s\p{P}]+/gu, '');
  const sa = norm(a);
  const sb = norm(b);
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    if (s.length === 1) set.add(s);
    return set;
  };
  const ga = grams(sa);
  const gb = grams(sb);
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / (ga.size + gb.size - inter);
}

export interface ExperienceWriteInput {
  kind: ExperienceKind;
  topic: string;
  title: string;
  detail?: string;
  source?: string;
}

export interface ExperienceWriteResult {
  ok: boolean;
  path: string;
  topic: string;
  /** true = 命中既有条目（计数 +1），false = 新增 */
  deduped: boolean;
  totalEntries: number;
  /** 本条目自身累计成功次数（去重合并后；新条目为 1）—— P1 skill 提炼的触发判据 */
  entryCount: number;
}

/** 追加/去重合并一条经验。任何写失败都抛错（调用方 fail-safe） */
export async function appendExperienceEntry(
  base: string,
  input: ExperienceWriteInput,
): Promise<ExperienceWriteResult> {
  const kind = (['pit', 'step', 'fact'] as const).includes(input.kind as ExperienceKind) ? input.kind : 'step';
  const topic = sanitizeTopic(input.topic);
  if (!topic) throw new Error('topic 非法（不能为空、不能包含 .. 等越界字符）');
  const title = String(input.title || '').trim().replace(/\s*\n+\s*/g, ' ').slice(0, 120);
  if (!title) throw Error('title 必填');
  const detail = String(input.detail || '').trim().replace(/\s*\n+\s*/g, ' ').slice(0, DETAIL_MAX_CHARS);
  const filePath = filePathFor(base, topic);

  await mkdir(path.dirname(filePath), { recursive: true });
  let existing = '';
  try { existing = await readFile(filePath, 'utf-8'); } catch { /* 新文件 */ }

  let blocks = existing.trim() ? parseEntries(existing) : [];
  // 去重：同文件内同类型 + 标题相似 ≥0.62 视为同一条 → 计数 +1、刷新日期
  const idx = blocks.findIndex((b) =>
    b.split('\n')[0].includes(KIND_LABEL[kind]) && titleSimilarity(firstLineTitle(b), title) >= 0.62);
  let deduped = false;
  let cnt = 1;
  if (idx >= 0) {
    deduped = true;
    const n = entryCount(blocks[idx]) + 1;
    cnt = n;
    blocks[idx] = refreshDate(bumpCount(blocks[idx], n));
  } else {
    const bits = [`- [${today()}] ${KIND_LABEL[kind]} | ${title}`];
    if (detail) bits.push(`  ${detail}`);
    if (input.source) bits.push(`  （来源：${String(input.source).slice(0, 80)}）`);
    blocks.push(bits.join('\n'));
  }

  const header = existing.trim() ? '' : `${fileHeader(topic)}\n\n`;
  await writeFile(filePath, `${header}${blocks.join('\n')}\n`, 'utf-8');
  return { ok: true, path: filePath, topic, deduped, totalEntries: blocks.length, entryCount: cnt };
}

function firstLineTitle(block: string): string {
  // `- [日期] ⛔坑 | 标题（×2...` → `标题`
  // ★ 正则坑：`\|` 分隔不能与 kind 的 alternation 混写，否则「或」边界吃掉捕获组
  const m = block.split('\n')[0].match(/(?:⛔坑|✅步骤|📌事实)\s*\|\s*([^（\n]*)/);
  return (m?.[1] || '').trim();
}

// ── 读取 / 匹配 ────────────────────────────────────────────────

export interface ExperienceFileSummary {
  topic: string;
  path: string;
  title: string;
  entryCount: number;
}

/** 列出经验目录下所有档案摘要（递归，含 sites/ 子目录） */
export function listExperienceSummaries(base: string): ExperienceFileSummary[] {
  const out: ExperienceFileSummary[] = [];
  const walk = (dir: string, rel: string) => {
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const full = path.join(dir, name);
      const relName = rel ? `${rel}/${name}` : name;
      let isDir = false;
      try { isDir = statSync(full).isDirectory(); } catch { continue; }
      if (isDir) { walk(full, relName); continue; }
      if (!name.endsWith('.md')) continue;
      try {
        const content = readFileSync(full, 'utf-8');
        const entries = parseEntries(content).filter((b) => b.trim());
        out.push({
          topic: relName.replace(/\.md$/, ''),
          path: full,
          title: (content.match(/^# (.+)$/m)?.[1] || relName).replace(/^经验档案：/, ''),
          entryCount: entries.length,
        });
      } catch { /* 读失败跳过 */ }
    }
  };
  walk(base, '');
  return out;
}

/** 读单个经验档案全文（按需查询路径） */
export function readExperienceFile(base: string, topic: string): { topic: string; path: string; content: string } | null {
  const t = sanitizeTopic(topic);
  if (!t) return null;
  const p = filePathFor(base, t);
  try {
    return { topic: t, path: p, content: readFileSync(p, 'utf-8') };
  } catch {
    return null;
  }
}

/** 从任务文本抽取匹配关键词：ASCII 词（≥3）+ CJK bigram */
function keywordsOf(text: string | null | undefined): string[] {
  const t = String(text || '');
  const out = new Set<string>();
  for (const w of t.split(/[^\p{L}\p{N}_-]+/u)) {
    if (/^[a-z0-9_-]{3,}$/i.test(w)) out.add(w.toLowerCase());
  }
  const cjk = t.match(/[\u4e00-\u9fff]+/g) || [];
  for (const seg of cjk) {
    for (let i = 0; i < seg.length - 1; i++) out.add(seg.slice(i, i + 2));
  }
  return [...out];
}

/** 给定任务文本，挑最相关的档案（文件名/topic + 条目标题命中计分），返回拼好的正文 */
function selectRelevantContent(
  base: string,
  taskText: string | null | undefined,
  summaries: ExperienceFileSummary[],
  budgetChars: number,
): string {
  const kws = keywordsOf(taskText);
  if (!kws.length) return '';
  const scored = summaries
    .map((s) => {
      let score = 0;
      const topicNorm = s.topic.toLowerCase();
      for (const k of kws) if (topicNorm.includes(k)) score += 3;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return '';
  const parts: string[] = [];
  let used = 0;
  for (const { s } of scored.slice(0, 3)) {
    const file = readExperienceFile(base, s.topic);
    if (!file) continue;
    // 每个文件最多吃 1600 字（保尾部：新经验在末尾，与 MEMORY.md 同理）
    const body = file.content.length > 1600 ? `…（前文略）\n${file.content.slice(-1600)}` : file.content;
    if (used + body.length > budgetChars) break;
    parts.push(body);
    used += body.length;
  }
  return parts.join('\n\n---\n\n');
}

/**
 * 任务启动时的经验注入（同步，提示词组装路径）。
 * 结构 = 全量档案索引（轻，模型知道"有什么经验可查"）+ 命中档案正文。
 * 没有任何经验文件时返回 ''（不注入空段落）。
 */
export function buildExperienceContextForConversation(
  conversationId: string | null | undefined,
  taskText: string | null | undefined,
  workspaceDir?: string | null,
): string {
  const { base } = resolveExperienceBase(conversationId, workspaceDir);
  const summaries = listExperienceSummaries(base);
  if (!summaries.length) return '';

  const indexLines = summaries.map((s) => `- ${s.topic}（${s.entryCount} 条）`);
  let indexPart = ['### 经验档案索引', '>', '> 以下是本工作目录积累的任务经验（坑/步骤/事实），相关主题先读再干：', ...indexLines].join('\n');
  if (indexPart.length > 1200) indexPart = indexPart.slice(0, 1200) + '\n…';

  const matched = selectRelevantContent(base, taskText, summaries, INJECT_MAX_CHARS - indexPart.length);

  const sections = [
    '## 领域经验（自进化档案，同主题先复用别重摸）',
    '> 这是历史上任务沉淀的可执行经验：⛔坑含规避方法、✅步骤是验证过的做法、📌事实是环境配置。当前任务命中主题时**直接按经验执行**；遇到新的坑/验证出的好路径，用 api_experience_write 当场记一条；需要完整内容用 api_experience_read 查。',
    '',
    indexPart,
  ];
  if (matched) sections.push('', '### 命中主题的经验正文', matched);
  return sections.join('\n');
}
