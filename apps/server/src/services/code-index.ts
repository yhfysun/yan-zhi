// code-index.ts — 工作区代码语义索引（P1：语义代码检索，2026-10-03）
//
// ★ 为什么存在：file_grep/code_search 是纯文本/正则检索，回答不了"处理 token 轮换的逻辑在哪"
//   这类语义问题。embedding 管道（embedText：平台配置优先、Ollama 兜底）此前只服务知识库，
//   本模块把同一管道接到**代码库**上：按文件增量建索引（mtime+size 变化才重嵌），
//   余弦相似度检索，返回 文件:行号 + 代码片段。
//
// ★ 设计取向：
//   - 表懒创建（不在 db.ts 巨型 init 里加表，保持本模块自包含可删）；
//   - 按需构建：检索时索引为空才自动构建（带文件数/chunk 数上限，防大仓库首查卡死）；
//     `reindex: true` 强制全量重建；
//   - embedding 不可用（未配向量模型且无 Ollama）→ 明确报错给模型，不静默空结果。
//   - 已知边界：v1 不做 AST 切块/符号级 chunk（80 行窗口）；不做增量监听（reindex 手动刷新）。

import { normalizeForCompare } from './path-guard.js';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { db } from '../db.js';
import { embedText } from './ollama-embed.js';
import { createLogger } from './logger.js';
const logger = createLogger('code-index');

/** 参与索引的代码扩展名（与 core code-symbols.CODE_EXTS 的 TS 家族 + 常见后端语言一致） */
const CODE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'py', 'go', 'java', 'cs', 'php', 'rb']);
/** 跳过的目录（依赖/产物/版本库，与 core fs-walk.DEFAULT_SKIP_DIRS 同口径） */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', 'target', '.venv', 'venv', '__pycache__', '.idea', '.vscode', 'coverage']);
const MAX_INDEX_FILES = 400;
const MAX_NEW_CHUNKS_PER_BUILD = 1200;
const CHUNK_LINES = 80;

let tablesReady = false;
function ensureTables(): void {
  if (tablesReady) return;
  db.exec(`CREATE TABLE IF NOT EXISTS code_index_file (
    workspace TEXT NOT NULL, path TEXT NOT NULL, mtime_ms INTEGER NOT NULL DEFAULT 0, size INTEGER NOT NULL DEFAULT 0,
    chunks INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace, path)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS code_index_chunk (
    workspace TEXT NOT NULL, path TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL,
    content TEXT NOT NULL, embedding BLOB,
    PRIMARY KEY (workspace, path, start_line)
  )`);
  tablesReady = true;
}

function vecToBytes(v: number[]): Buffer {
  return Buffer.from(new Float32Array(v).buffer);
}
function bytesToVec(b: Buffer | Uint8Array | null): number[] | null {
  if (!b) return null;
  const buf = Buffer.isBuffer(b) ? b : Buffer.from(b);
  if (buf.length === 0 || buf.length % 4 !== 0) return null;
  return [...new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4)];
}
function cosine(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** 规整 workspace key（盘符大小写/斜杠方向统一，Windows 路径同一目录只建一份索引） */
function normWorkspace(p: string): string {
  return normalizeForCompare(p);
}

async function walkCodeFiles(root: string, maxFiles: number): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (out.length >= maxFiles || depth > 14) return;
    let entries: import('node:fs').Dirent[];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      if (e.name.startsWith('.') && e.isDirectory() && e.name !== '.yan-zhi') continue;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        await walk(path.join(dir, e.name), depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = (e.name.split('.').pop() || '').toLowerCase();
      if (!CODE_EXTS.has(ext)) continue;
      out.push(path.join(dir, e.name));
    }
  };
  await walk(root, 0);
  return out.slice(0, maxFiles);
}

function chunkFile(content: string): Array<{ startLine: number; endLine: number; text: string }> {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const chunks: Array<{ startLine: number; endLine: number; text: string }> = [];
  for (let i = 0; i < lines.length; i += CHUNK_LINES) {
    const seg = lines.slice(i, i + CHUNK_LINES);
    const text = seg.join('\n').trim();
    if (text) chunks.push({ startLine: i + 1, endLine: i + seg.length, text: text.slice(0, 6000) });
  }
  return chunks;
}

export interface CodeIndexBuildResult {
  ok: boolean;
  indexedFiles: number;
  embeddedChunks: number;
  skippedUnchanged: number;
  truncated: boolean;
  reason?: string;
}

/** 构建工作区代码索引（增量：mtime+size 未变的文件跳过）。forceReindex=true 清空重建。 */
export async function buildCodeIndex(workspaceDir: string, forceReindex = false): Promise<CodeIndexBuildResult> {
  ensureTables();
  const ws = normWorkspace(workspaceDir);
  const result: CodeIndexBuildResult = { ok: false, indexedFiles: 0, embeddedChunks: 0, skippedUnchanged: 0, truncated: false };

  // embedding 可用性先探（一条短文本），不可用直接报因 —— 不建半截索引
  const probe = await embedText('code index probe');
  if (!probe) {
    result.reason = 'embedding 不可用：未配置向量模型（设置→知识库→embedding 模型）且 Ollama 兜底失败';
    return result;
  }

  if (forceReindex) {
    db.prepare('DELETE FROM code_index_chunk WHERE workspace = ?').run(ws);
    db.prepare('DELETE FROM code_index_file WHERE workspace = ?').run(ws);
  }

  const files = await walkCodeFiles(workspaceDir, MAX_INDEX_FILES);
  const now = Date.now();
  let newChunks = 0;

  for (const abs of files) {
    let stat: import('node:fs').Stats;
    let content: string;
    try {
      stat = await fsp.stat(abs);
      if (stat.size > 512 * 1024) continue; // 超大文件不索引
      content = await fsp.readFile(abs, 'utf-8');
      if (content.includes('\u0000')) continue; // 二进制
    } catch { continue; }

    const prev = db.prepare('SELECT mtime_ms, size FROM code_index_file WHERE workspace = ? AND path = ?').get(ws, abs) as any;
    if (prev && Number(prev.mtime_ms) === Math.floor(stat.mtimeMs) && Number(prev.size) === stat.size) {
      result.skippedUnchanged++;
      continue;
    }

    const chunks = chunkFile(content);
    if (newChunks + chunks.length > MAX_NEW_CHUNKS_PER_BUILD) {
      result.truncated = true; // 本轮 embedding 配额用尽，下次调用继续增量
      if (chunks.length === 0) continue;
    }
    db.prepare('DELETE FROM code_index_chunk WHERE workspace = ? AND path = ?').run(ws, abs);
    let stored = 0;
    for (const c of chunks) {
      if (newChunks >= MAX_NEW_CHUNKS_PER_BUILD) break;
      const vec = await embedText(c.text.slice(0, 2000));
      if (!vec) continue;
      db.prepare('INSERT OR REPLACE INTO code_index_chunk (workspace, path, start_line, end_line, content, embedding) VALUES (?, ?, ?, ?, ?, ?)')
        .run(ws, abs, c.startLine, c.endLine, c.text, vecToBytes(vec));
      newChunks++;
      stored++;
    }
    db.prepare('INSERT OR REPLACE INTO code_index_file (workspace, path, mtime_ms, size, chunks, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ws, abs, Math.floor(stat.mtimeMs), stat.size, stored, now);
    result.indexedFiles++;
    result.embeddedChunks += stored;
  }

  // 清掉已删除文件的残留
  const known = new Set(files.map((f) => f));
  const stale = (db.prepare('SELECT path FROM code_index_file WHERE workspace = ?').all(ws) as any[])
    .filter((r) => !known.has(String(r.path)));
  for (const r of stale) {
    db.prepare('DELETE FROM code_index_file WHERE workspace = ? AND path = ?').run(ws, r.path);
    db.prepare('DELETE FROM code_index_chunk WHERE workspace = ? AND path = ?').run(ws, r.path);
  }

  result.ok = true;
  return result;
}

export interface CodeIndexHit {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
}

// ───────────────────────── 读时惰性增量（P2-4，2026-10-03）─────────────────────────
// 不做文件系统监听：检索时做轻量新鲜度抽查，过期则**后台**增量重建（当次查询照常用
// 现有索引返回，附 note）—— 检索延迟零增加，索引最终一致。
//   · 抽样：索引里最多 40 个文件 stat 比对（mtime+size），缺文件/变更即判过期；
//   · 数量：walk 文件总数 > 索引行数 → 有新文件未索引（walk 有 maxFiles 上限，开销可接受）；
//   · 节流：同一 workspace 5 分钟内只查一次新鲜度、只起一个后台重建。

const FRESHNESS_CHECK_INTERVAL_MS = 5 * 60_000;
const freshnessCheckedAt = new Map<string, number>();
const refreshing = new Set<string>();

async function isIndexStale(workspaceDir: string, ws: string): Promise<boolean> {
  const sampled = db.prepare('SELECT path, mtime_ms, size FROM code_index_file WHERE workspace = ? ORDER BY updated_at DESC LIMIT 40').all(ws) as any[];
  for (const row of sampled) {
    try {
      const st = await fsp.stat(String(row.path));
      if (Math.floor(st.mtimeMs) !== Number(row.mtime_ms) || st.size !== Number(row.size)) return true;
    } catch {
      return true; // 索引里的文件已被删除
    }
  }
  // 新文件检测：walk 数量（含已索引的）超过索引行数 → 有未索引文件
  const files = await walkCodeFiles(workspaceDir, MAX_INDEX_FILES);
  const indexedCount = Number((db.prepare('SELECT COUNT(DISTINCT path) AS n FROM code_index_file WHERE workspace = ?').get(ws) as any)?.n || 0);
  return files.length > indexedCount;
}

export interface CodeIndexSearchResult {
  ok: boolean;
  hits: CodeIndexHit[];
  reason?: string;
  totalChunks: number;
}

/** 语义检索工作区代码。索引为空时自动增量构建。 */
export async function searchWorkspaceCode(workspaceDir: string, query: string, topK = 8, reindex = false): Promise<CodeIndexSearchResult> {
  ensureTables();
  const ws = normWorkspace(workspaceDir);
  const limit = Math.min(Math.max(topK, 1), 30);
  const out: CodeIndexSearchResult = { ok: false, hits: [], totalChunks: 0 };

  let count = Number((db.prepare('SELECT COUNT(*) AS n FROM code_index_chunk WHERE workspace = ?').get(ws) as any)?.n || 0);
  if (reindex || count === 0) {
    const built = await buildCodeIndex(workspaceDir, reindex);
    if (!built.ok) { out.reason = built.reason; return out; }
    count = Number((db.prepare('SELECT COUNT(*) AS n FROM code_index_chunk WHERE workspace = ?').get(ws) as any)?.n || 0);
    if (built.truncated) out.reason = `索引为部分构建（本轮上限 ${MAX_NEW_CHUNKS_PER_BUILD} chunks），再次检索会继续增量`;
  }
  out.totalChunks = count;
  if (count === 0) {
    out.reason = '没有可索引的代码文件（工作区为空或全部是超大/二进制文件）';
    return out;
  }

  // ★ 读时惰性增量（P2-4）：节流新鲜度抽查，过期则**后台**重建（当次查询照常用现有索引）。
  const now = Date.now();
  const lastCheck = freshnessCheckedAt.get(ws) || 0;
  if (now - lastCheck > FRESHNESS_CHECK_INTERVAL_MS && !refreshing.has(ws)) {
    freshnessCheckedAt.set(ws, now);
    void isIndexStale(workspaceDir, ws)
      .then((stale) => {
        if (!stale) return;
        refreshing.add(ws);
        logger.info(`[code-index] 索引已过期，后台增量重建: ${ws}`);
        return buildCodeIndex(workspaceDir, false)
          .then((r) => {
            out.reason = [out.reason, '索引更新中，本次结果基于重建前索引'].filter(Boolean).join('；');
            logger.info(`[code-index] 后台重建完成: +${r.indexedFiles} files, +${r.embeddedChunks} chunks`);
          })
          .catch((e) => logger.warn('[code-index] 后台重建失败:', e?.message || e))
          .finally(() => refreshing.delete(ws));
      })
      .catch(() => { /* 抽查失败不影响本次检索 */ });
  }

  const qVec = await embedText(query);
  if (!qVec) {
    out.reason = 'embedding 不可用：未配置向量模型（设置→知识库→embedding 模型）且 Ollama 兜底失败';
    return out;
  }

  const rows = db.prepare('SELECT path, start_line, end_line, content, embedding FROM code_index_chunk WHERE workspace = ?').all(ws) as any[];
  const scored = rows
    .map((r) => {
      const v = bytesToVec(r.embedding);
      if (!v) return null;
      return { r, score: cosine(qVec, v) };
    })
    .filter((x): x is { r: any; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  out.hits = scored.map((x) => ({
    path: String(x.r.path),
    startLine: Number(x.r.start_line),
    endLine: Number(x.r.end_line),
    score: Math.round(x.score * 1000) / 1000,
    snippet: String(x.r.content || '').split('\n').slice(0, 12).join('\n'),
  }));
  out.ok = true;
  return out;
}

/** 供测试清理 */
export function resetCodeIndex(): void {
  ensureTables();
  db.prepare('DELETE FROM code_index_chunk').run();
  db.prepare('DELETE FROM code_index_file').run();
}
