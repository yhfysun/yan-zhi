// 空间记忆文件 —— 每个空间一份 MEMORY.md，跨会话、跨智能体共享。
// 与 memory 表（按 user/agent/type 组织）互补：空间记忆挂在 space 维度上，
// 该空间下的所有会话、任意智能体都会在系统提示词中收到同一份记忆文件。
// 文件位置：
//   - 空间绑定了本地目录（dir_path）→ <dir_path>/MEMORY.md（跟随空间目录，用户可直接编辑）
//   - 未绑定目录 → <serverState.workspaceDir>/spaces/<spaceId>/MEMORY.md
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { serverState } from '../state.js';
import { estimateTokens } from '@yan-zhi/shared';

const MEMORY_FILE_NAME = 'MEMORY.md';

/** 注入上下文时的单文件字符上限（防止空间记忆无限膨胀撑爆提示词） */
const INJECT_MAX_CHARS = 6000;

interface SpaceRow {
  id: string;
  user_id: string;
  name: string;
  dir_path: string | null;
}

function getSpaceRow(userId: string | null, spaceId: string): SpaceRow | null {
  const row = userId
    ? db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(spaceId, userId)
    : db.prepare('SELECT * FROM space WHERE id = ?').get(spaceId);
  return (row as SpaceRow) || null;
}

/** 解析空间记忆文件的落盘路径 */
export function getSpaceMemoryPath(space: Pick<SpaceRow, 'id' | 'dir_path'>): string {
  if (space.dir_path) return path.join(space.dir_path, MEMORY_FILE_NAME);
  return path.join(serverState.workspaceDir || process.cwd(), 'spaces', space.id, MEMORY_FILE_NAME);
}

/** 确保父目录存在（未绑定目录的空间按需创建 workspace/spaces/<id>/） */
async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

/** 读取空间记忆（带归属校验）。文件不存在时 exists=false、content='' */
export async function readSpaceMemory(
  userId: string,
  spaceId: string,
): Promise<{ spaceId: string; spaceName: string; path: string; content: string; exists: boolean }> {
  const space = getSpaceRow(userId, spaceId);
  if (!space) throw new Error('空间不存在或不属于当前用户');
  const filePath = getSpaceMemoryPath(space);
  let content = '';
  let exists = false;
  try {
    content = await readFile(filePath, 'utf-8');
    exists = true;
  } catch { /* 文件不存在，返回空内容 */ }
  return { spaceId: space.id, spaceName: space.name, path: filePath, content, exists };
}

/** 空间记忆文件的标准头部（新建时写入；与 appendSpaceMemory 保持同一格式） */
function spaceMemoryHeader(spaceName: string): string {
  return `# ${spaceName} · 空间记忆\n\n> 跨会话、所有智能体共享的长期记忆。每行一条，格式：- [日期] 内容`;
}

/** 日期（YYYY-MM-DD），既有空间记忆的条目格式 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 带时刻的戳（YYYY-MM-DD HH:mm）—— 任务进展多次追加，只有日期分不清先后 */
function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 条目行的**滚动保留上限**：同一「前缀特征」的条目最多保留这么多条，超出淘汰最旧的。
 *
 * ★★★ 为什么必须有（2026-10-09 实据诊断，P0）：
 *   `appendTaskProgress` 每次任务收尾（含**每次自动接力、每次达最大步数中断、每次失败**）
 *   都往 MEMORY.md 追加一条「任务【…】+ 一整套 markdown 总结」。
 *   实测生产目录 `小说推文/MEMORY.md`：**12786 字符 / 34 条正文行，其中 27 条任务进展行
 *   占 81%（10312 字，平均 381、最长 444 字）**，而注入上限仅 `INJECT_MAX_CHARS=6000`
 *   → 每次新会话开局都要把这一大坨回灌进 system prompt。
 *   ⇒ 形成正反馈：越断记忆越长 → 新会话开局越重 → 越容易再断。
 *   修法（双管）：① 注入版压成一行短摘要（见 appendTaskProgress）；
 *   ② 本处滚动淘汰——同一类条目只留最近 N 条，让文件**有界**。
 *
 * ★ 判据是「条目前缀特征」而不是按文件整体：决策记录/普通记忆不该被任务流水挤掉。
 */
export const PROGRESS_ENTRY_KEEP = 8;
/**
 * 任务进展条目的前缀特征（行首 `- ` + 时间戳 + 「任务【」），用于滚动淘汰分组；与 OUTCOME_LABEL 同族。
 * ★ 必须含行首 `- `：文件里每条都带 list 前缀，锚 `^\d{4}` 会一条都匹配不到（淘汰静默失效）。
 */
const PROGRESS_ENTRY_MARK = /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} 任务【/;

/**
 * 「**已终结**」的任务进展条目特征 —— 任务【已完成】/【被用户终止】/【失败中断】。
 * 这类条目只保留**最近 1 条**留痕，其余当场清理。
 *
 * ★★★ 为什么要单独处理（2026-10-09，用户诉求「完成了的没用了的该清理就清理」）：
 *   原 `PROGRESS_ENTRY_KEEP` 是一刀切保留最近 8 条，但**已完成**的任务收尾条目对"继续接力"
 *   毫无价值（活干完了），却和"达最大步数中断/空转中断"（还没干完）抢同一份注入预算。
 *   实测生产 `小说推文/MEMORY.md`：7 条收尾条目里 4 条是【已完成】/【被用户终止】/【失败中断】。
 *   ⇒ 已终结 → 只留最近 1 条；只有"没跑完"的才多留，把注入预算留给真正需要的活。
 * ★ 保留 1 条而非 0 条：留痕可追溯"这个任务上一轮做过、结果如何"，但不再累积。
 */
const TERMINAL_ENTRY_MARK = /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} 任务【(?:已完成|被用户终止|失败中断)/;

/**
 * 任务进展行按「已终结 / 未终结」分别滚动淘汰 —— 让注入文件**既有界、又把预算留给没干完的活**。
 *
 * 规则（与 PROGRESS_ENTRY_KEEP 配套）：
 *   · 已终结（【已完成/被用户终止/失败中断】）→ 只保留**最近 1 条**（无接力价值，只留痕）；
 *   · 未终结（【达最大步数中断】/【空转中断】= 还得接着干）→ 保留最近 `keep` 条；
 *   · 非任务进展行（头注/决策/普通记忆）→ 原样保留、保持相对顺序。
 * 文件是追加写：index 小的更旧 → 淘汰时丢"最旧的那批"。
 *
 * ★ 只动**匹配特征**的行；★ 放在写入路径而非读取路径：读取侧（selectMemoryLines）只是按预算选取，
 *   文件本身不缩水 → 每次读盘十几 KB、`api_space_memory_read` 全量返回。写入侧收口才是真的"文件有界"。
 */
function pruneEntriesByMark(content: string, keep: number): string {
  const lines = content.split('\n');
  const terminal: number[] = [];
  const open: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!PROGRESS_ENTRY_MARK.test(lines[i])) continue;
    (TERMINAL_ENTRY_MARK.test(lines[i]) ? terminal : open).push(i);
  }
  const drop = new Set<number>();
  if (terminal.length > 1) for (const i of terminal.slice(0, terminal.length - 1)) drop.add(i);
  if (open.length > keep) for (const i of open.slice(0, open.length - keep)) drop.add(i);
  if (drop.size === 0) return content;
  return lines.filter((_, i) => !drop.has(i)).join('\n');
}

/** 行前缀标记（可选）：传入时对**该标记**的行做滚动淘汰 */

/**
 * 往「一行一条」的记忆文件追加一行；文件不存在/为空时先写标准头部。
 *
 * 抽出来的原因：空间 MEMORY.md 与 .yan-zhi/task-memory/*.md 必须**同一套格式**，
 * 各自实现一份必然漂移（头部不同、换行处理不同）。
 *
 * @param keepPerMark 传入 { mark, keep } 时，追加后对该标记的条目做滚动淘汰（防文件无限膨胀）
 */
async function appendLineWithHeader(
  filePath: string,
  header: string,
  line: string,
  keepPerMark?: { mark: RegExp; keep: number },
): Promise<void> {
  await ensureParentDir(filePath);
  let existing = '';
  try { existing = await readFile(filePath, 'utf-8'); } catch { /* 新文件 */ }
  if (!existing.trim()) {
    await writeFile(filePath, `${header}\n\n- ${line}\n`, 'utf-8');
    return;
  }
  const base = existing.endsWith('\n') ? existing : `${existing}\n`;
  let next = `${base}- ${line}\n`;
  if (keepPerMark) next = `${pruneEntriesByMark(next, keepPerMark.keep)}\n`;
  await writeFile(filePath, next, 'utf-8');
}

/** 整体写入空间记忆文件（覆盖） */
export async function writeSpaceMemory(
  userId: string,
  spaceId: string,
  content: string,
): Promise<{ spaceId: string; path: string; size: number }> {
  const space = getSpaceRow(userId, spaceId);
  if (!space) throw new Error('空间不存在或不属于当前用户');
  const filePath = getSpaceMemoryPath(space);
  await ensureParentDir(filePath);
  const text = String(content || '').replace(/\r\n/g, '\n');
  await writeFile(filePath, text, 'utf-8');
  return { spaceId: space.id, path: filePath, size: Buffer.byteLength(text, 'utf-8') };
}

/** 追加一条记忆（一行一条，带日期前缀）。文件不存在时先建标准头部 */
export async function appendSpaceMemory(
  userId: string,
  spaceId: string,
  entry: string,
): Promise<{ spaceId: string; path: string; appended: boolean }> {
  const space = getSpaceRow(userId, spaceId);
  if (!space) throw new Error('空间不存在或不属于当前用户');
  const line = String(entry || '').trim().replace(/\s*\n+\s*/g, ' '); // 追加语义=一行一条，压平换行
  if (!line) throw new Error('content 为必填项');
  const filePath = getSpaceMemoryPath(space);
  // ★ 顺手做一次任务进展行的滚动淘汰（2026-10-09）：人工/模型追加也是写入路径，
  //   同样应让文件有界 —— 否则只靠任务收尾时淘汰，长期不跑任务的档案会一直保留过期流水。
  await appendLineWithHeader(
    filePath,
    spaceMemoryHeader(space.name),
    `[${today()}] ${line}`,
    { mark: PROGRESS_ENTRY_MARK, keep: PROGRESS_ENTRY_KEEP },
  );
  return { spaceId: space.id, path: filePath, appended: true };
}

/** 任务侧（服务端上下文，免归属校验）：按会话解析所属空间并读取记忆文件 */
export function loadSpaceMemoryForConversation(
  conversationId: string | null | undefined,
): { spaceId: string; spaceName: string; content: string } | null {
  if (!conversationId) return null;
  const conv = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(conversationId) as
    | { space_id: string | null }
    | undefined;
  if (!conv?.space_id) return null;
  const space = getSpaceRow(null, conv.space_id);
  if (!space) return null;
  try {
    // 同步读（任务组装提示词是同步路径）；文件不存在或读失败都视为无空间记忆
    const content = readFileSync(getSpaceMemoryPath(space), 'utf-8');
    if (!content.trim()) return null;
    // ★ 这里**不再头部截断**（此前 `content.slice(0, INJECT_MAX_CHARS)` 会切掉最新的任务进展行，
    //   因为 MEMORY.md 是追加写、新内容在末尾）。截断统一交给 formatSpaceMemoryContext
    //   的按行优先级选取（P2-2）—— 两处各截一次必然漂移，且这处会先截错。
    return { spaceId: space.id, spaceName: space.name, content };
  } catch {
    return null;
  }
}

/** 空间记忆 → 系统提示词片段（按行优先级选取，不做无脑头部截断） */
export function formatSpaceMemoryContext(name: string, content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  const { text: clipped, dropped } = selectMemoryLines(trimmed, INJECT_MAX_CHARS);
  return [
    '## 空间记忆（本空间跨会话长期记忆，所有智能体共享）',
    `> 空间「${name}」的记忆文件，跨会话有效。与当前任务相关的条目应遵守；需要沉淀新的长期事实时可调用 api_space_memory_append 追加。`,
    '> ★ 条目里的「任务…【已完成/达最大步数中断/被用户终止/失败中断】」是系统自动记录的任务收尾进展' +
    '（做到哪、还剩什么）—— **继续本空间的长任务前先看这些条目**，别从头再来；' +
    '更细的逐批流水可用 api_space_memory_read 读（会一并返回进展明细）。',
    '',
    dropped > 0
      ? `${clipped}\n\n…（另有 ${dropped} 条较早的记忆因预算不足未注入；需要时用 api_space_memory_read 查看完整内容）`
      : clipped,
  ].join('\n');
}

/**
 * 记忆文件按**行优先级**选取（P2-2，2026-09-29）。
 *
 * ★★★ 为什么必须这样（此前是 `content.slice(0, MAX)` 的头部截断，有个真 bug）：
 *   MEMORY.md 是**追加写**的文件 —— 最新内容在**末尾**。
 *   头部截断 = 保留最旧的、丢掉**最新的** → 恰好把"上一批长任务做到哪"（最该被看到的）
 *   切掉，只留下早期流水账。而截断不报错，用户只会觉得"模型不知道我做到哪了"。
 *
 * 优先级（高 → 低）：
 *   1. **任务进展行**（含 `任务【…】`）—— 跨会话接力最依赖它（做到哪、还剩什么）；
 *   2. **决策记录/规则类**（`问：… → 答：`、非 `[日期]` 开头的正文）—— 用户拍板过的设定；
 *   3. 其余普通条目 —— 按**从新到旧**（末尾优先）；
 *   4. 文件头部注释（`#`/`>` 开头）—— 恒定占用最小、先输出，不必参与竞争。
 *
 * @returns text 选中的内容（保持原始相对顺序，便于人读）；dropped 被丢弃的行数
 */
function selectMemoryLines(content: string, maxChars: number): { text: string; dropped: number } {
  if (content.length <= maxChars) return { text: content, dropped: 0 };

  const lines = content.split('\n');
  const headers: string[] = [];
  const progress: string[] = [];   // 优先级 1
  const decisions: string[] = [];  // 优先级 2
  const normal: string[] = [];     // 优先级 3

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#') || t.startsWith('>')) { headers.push(t); continue; }
    if (/任务【/.test(t)) { progress.push(t); continue; }
    if (/问：.*→.*答：/.test(t)) { decisions.push(t); continue; }
    normal.push(t);
  }

  // 头注先占位（标题 + 说明行，量很小但语义必要）
  const picked: string[] = [...headers];
  let used = headers.join('\n').length;
  const take = (arr: string[], newestFirst: boolean): void => {
    const seq = newestFirst ? [...arr].reverse() : arr;
    for (const l of seq) {
      if (used + l.length + 1 > maxChars) continue;
      picked.push(l);
      used += l.length + 1;
    }
  };
  // ★ 三类**全部从新到旧**取。
  //   为什么决策行也不能保留原序（我第一版写错、被自检抓到）：
  //     决策文件是**追加写**的，若按原序取，超限时预算会被**最早的**几十条吃光，
  //     导致**最近拍板的设定被丢**（例如"成片要加标题"这种刚确认的）。
  //     与 MEMORY.md 的头部截断是同一类错误，只是换了层皮。
  //   反序取则保证"最近的设定一定进提示词"—— 这与用户直觉一致（刚说的最算数）。
  take(progress, true);
  take(decisions, true);
  take(normal, true);

  const total = progress.length + decisions.length + normal.length;
  const dropped = Math.max(0, total - (picked.length - headers.length));
  return { text: picked.join('\n'), dropped };
}

/** 注入用 token 预算参考（供上层决定是否跳过） */
export function estimateSpaceMemoryTokens(content: string): number {
  return estimateTokens(content || '');
}

// ── 任务决策记录（task-memory）────────────────────────────────────────────
// 用户在 ask_user / confirm_user 里确认过的内容必须落盘（硬性验收项）：
// 同一目录新开会话时注入摘要，模型先对照已确认设定再继续 —— 不再重复询问
// 人物形象、响应格式、风格等已经拍板过的东西。
// 文件位置（与空间记忆同规则）：
//   - 空间绑定目录 → <dir_path>/.yan-zhi/task-memory/decisions.md
//   - 未绑定目录   → <workspaceDir>/spaces/<spaceId>/.yan-zhi/task-memory/decisions.md

const TASK_MEMORY_DIR = '.yan-zhi/task-memory';
const DECISIONS_FILE = 'decisions.md';
/** 决策注入的字符上限（正文长任务确认多，但提示词预算有限；完整文件可用 api_space_memory_read 读） */
const DECISIONS_INJECT_MAX_CHARS = 3000;

function getTaskDecisionsPath(space: Pick<SpaceRow, 'id' | 'dir_path'>): string {
  if (space.dir_path) return path.join(space.dir_path, TASK_MEMORY_DIR, DECISIONS_FILE);
  return path.join(serverState.workspaceDir || process.cwd(), 'spaces', space.id, TASK_MEMORY_DIR, DECISIONS_FILE);
}

/** 压平多行文本（决策记录一行一条） */
function flattenForDecision(s: string): string {
  return String(s || '').trim().replace(/\s*\n+\s*/g, ' ').slice(0, 500);
}

/**
 * 记录一条用户确认结果（服务端在 ask_user / confirm_user 结果回传时调用）。
 * 会话未挂空间（无 dir_path 且 spaceId 为空）时静默跳过 —— 长任务引导挂空间才有意义。
 */
export async function appendTaskDecision(
  userId: string,
  conversationId: string,
  question: string,
  answer: string,
): Promise<{ ok: boolean; path?: string }> {
  try {
    const conv = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(conversationId) as
      | { space_id: string | null }
      | undefined;
    if (!conv?.space_id) return { ok: false };
    const space = userId
      ? getSpaceRow(userId, conv.space_id)
      : getSpaceRow(null, conv.space_id);
    if (!space) return { ok: false };
    const q = flattenForDecision(question);
    const a = flattenForDecision(answer);
    if (!q || !a) return { ok: false };
    const filePath = getTaskDecisionsPath(space);
    await appendLineWithHeader(
      filePath,
      `# ${space.name} · 任务决策记录\n\n> 用户已确认过的设定。同目录新任务先对照本文件，已确认过的事项不要重复询问。`,
      `[${today()}] 问：${q} → 答：${a}`,
    );
    return { ok: true, path: filePath };
  } catch {
    // 决策落盘失败不阻塞用户回答主链路（回答已经送达模型）
    return { ok: false };
  }
}

/** 会话任务决策摘要（同步读，注入系统提示词用）。文件不存在返回 null */
export function loadTaskMemoryForConversation(conversationId: string | null | undefined): string | null {
  if (!conversationId) return null;
  const conv = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(conversationId) as
    | { space_id: string | null }
    | undefined;
  if (!conv?.space_id) return null;
  const space = getSpaceRow(null, conv.space_id);
  if (!space) return null;
  try {
    const content = readFileSync(getTaskDecisionsPath(space), 'utf-8');
    if (!content.trim()) return null;
    // ★ 同 loadSpaceMemoryForConversation：不在此处头部截断（决策记录也是追加写，
    //   头部截断会丢掉**最近拍板**的设定）。截断由 formatTaskMemoryContext 负责。
    return content;
  } catch {
    return null;
  }
}

/** 决策记录 → 系统提示词片段 */
export function formatTaskMemoryContext(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  // ★ 决策记录同样是**追加写**（新拍板在末尾）→ 超限时**保尾部**，别丢最近的决定。
  //   用同一个按行选取（决策行全归"高优先级"，普通行从新到旧）复用 P2-2 的口径。
  const { text: clipped, dropped } = selectMemoryLines(trimmed, DECISIONS_INJECT_MAX_CHARS);
  return [
    '## 任务决策记录（用户已确认过的内容）',
    '> 以下是本目录历史上用户在「向你提问/确认」环节拍板过的决定。继续任务或开新任务时先对照这里，已确认过的事项直接沿用，不要重复询问；除非用户主动要求更改。',
    '',
    dropped > 0 ? `${clipped}\n\n…（另有 ${dropped} 条较早的决策未注入）` : clipped,
  ].join('\n');
}

// ── 任务进展（progress）──────────────────────────────────────────────────
// ★★★ 为什么必须补这块（2026-09-27，用户报「长任务没完整需要总结记忆进入空间记忆」）：
//   此前长任务收尾只有两条通路，**都不进空间记忆**：
//     ① 正常完成 → extractMemoryFromConversation 只写 memory 表（user/agent 维度），
//        空间 MEMORY.md 一个字节都不写；
//     ② 达最大步数 / 被终止 / 失败 → 只往**对话**里塞一条总结消息
//        （被终止时连消息都没有）→ 同目录新开会话读到的仍是"空记忆"。
//   而 docs/目录任务模式-方案.md 设计里的 progress.md（做到第几段/第几镜）**从未实现**。
//   后果：用户换会话继续同一个长任务时，模型不知道上一批做到哪、还剩多少没做。
//
// 落盘位置：
//   · 空间 MEMORY.md（**注入**，所有会话/智能体共享）
//   · <dir>/.yan-zhi/task-memory/progress.md（**明细**，按需读，不自动注入 —— 防爆窗）
// 两条都写而不是只写一条：只写 MEMORY.md 会让主记忆被逐批流水账撑爆（注入上限 6000 字），
// 只写 progress.md 则同目录新会话根本看不到（它不参与注入）。

const PROGRESS_FILE = 'progress.md';
/** 进度明细文件的读取上限（按需读，不在注入路径上） */
const PROGRESS_READ_MAX_CHARS = 8000;

/** 任务终结形态 —— 决定写入的措辞（模型据此判断"能不能接着做"） */
export type TaskProgressOutcome = 'completed' | 'max_steps' | 'aborted' | 'failed' | 'empty_args_loop';

const OUTCOME_LABEL: Record<TaskProgressOutcome, string> = {
  completed: '已完成',
  max_steps: '达最大步数中断',
  aborted: '被用户终止',
  failed: '失败中断',
  // 空转断路器停下（连续多步工具参数为空）——也是一种"没跑完"，必须留痕否则同目录新会话
  // 完全不知道上一批是因为退化停下的（会以为任务从未开始）。
  empty_args_loop: '空转中断',
};

function getTaskProgressPath(space: Pick<SpaceRow, 'id' | 'dir_path'>): string {
  if (space.dir_path) return path.join(space.dir_path, TASK_MEMORY_DIR, PROGRESS_FILE);
  return path.join(serverState.workspaceDir || process.cwd(), 'spaces', space.id, TASK_MEMORY_DIR, PROGRESS_FILE);
}

/** 会话 → 所属空间 id（服务端上下文免归属校验）；未挂空间返回 '' */
export function resolveConversationSpaceId(conversationId: string | null | undefined): string {
  if (!conversationId) return '';
  try {
    const conv = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(conversationId) as
      | { space_id: string | null }
      | undefined;
    return conv?.space_id || '';
  } catch {
    return '';
  }
}

/** 摘要压成一行（记忆文件一行一条，换行会把一条切成多条） */
function flattenForProgress(s: string, max: number): string {
  return String(s || '').replace(/\s*\n+\s*/g, ' ').trim().slice(0, max);
}

/**
 * 完整明细（只进 progress.md，不注入）—— 可长；`api_space_memory_read` 按需读。
 * 读取侧另有 PROGRESS_READ_MAX_CHARS 兜底。
 */
const PROGRESS_FULL_MAX = 4000;
/**
 * 注入版单行上限（进 MEMORY.md → 会被回灌 system prompt）。
 *
 * ★★★ 为什么从 400 压到 300 且要"抽取要点"（2026-10-09，P0 实据）：
 *   实测生产 MEMORY.md 27 条任务进展行共 10312 字（平均 381 / 最长 444），占文件 81%，
 *   而注入预算只有 6000 → 一坨超长总结把预算吃光。改法：注入版**只留要点**，
 *   完整总结留在 progress.md（不在注入路径）。
 */
const PROGRESS_COMPACT_MAX = 300;

/** 要点抽取：优先"产物路径/落盘"这类跨会话接力最需要的字段，否则取首句 */
const KEY_POINT_PATTERNS: RegExp[] = [
  /(成片路径|产物路径|落盘|已写入|文件路径|输出路径)[：:][^。；;]{0,180}/,
  /(C:\\[^\s。；;]{6,180})/,
  /(\/[\w\-./]{8,180}\.(mp4|txt|json|md|mp3|srt))/,
];

/**
 * 把一整套 markdown 任务总结压成**一行要点**（注入版）。
 *
 * ★ 不是简单截断头部 —— 总结首句往往是寒暄（"两件事都完成了"），
 *   真正跨会话接力需要的是"做到哪 / 产物在哪"。按模式优先抽这些片段。
 */
function compactProgressSummary(summary: string, fullLine: string): string {
  const flat = fullLine; // 已压平换行
  for (const p of KEY_POINT_PATTERNS) {
    const m = flat.match(p);
    if (m && m[0] && m[0].trim().length >= 6) {
      const hit = m[0].trim();
      return hit.length > PROGRESS_COMPACT_MAX ? `${hit.slice(0, PROGRESS_COMPACT_MAX)}…` : hit;
    }
  }
  const firstSentence = flat.split(/[。；;]/)[0]?.trim() || flat;
  const head = firstSentence || flat;
  // 首句也常是寒暄（"两件事都完成了"）→ 太短就回退到整行截断，保证有信息量
  const use = head.length >= 24 ? head : flat;
  return use.length > PROGRESS_COMPACT_MAX ? `${use.slice(0, PROGRESS_COMPACT_MAX)}…` : use;
}

/**
 * 记录一次任务收尾（进展摘要 → 空间记忆 + 进度明细）。
 *
 * ★ 由服务端在任务出口**自动调用**，不依赖模型主动调 `api_space_memory_append` ——
 *   实测那条路是断的：两个空间记忆工具虽然注册了 schema 也实现了 executor case，
 *   却**没挂给任何智能体**（`builtin_tool_ids` 里没有）→ 模型根本看不到这两个工具，
 *   提示词里那句"可调用 api_space_memory_append 追加"是**空指令**。
 *   靠提示词约束"自己记得总结"永远不可靠，机械保证必须落在代码里。
 *
 * 设计取舍：
 *   · fail-safe：任何异常都静默返回 ok:false（收尾路径不能因为写记忆失败而报错给用户）；
 *   · 未挂空间的会话静默跳过（**绝不能**因此创建目录 —— 用户明确「没有任务类型默认目录不需要建立」）；
 *   · ★ 两份文件写**不同粒度**（2026-10-09，P0）：
 *       ① progress.md = **完整**总结（最多 4000 字，一行压平），**不参与注入**，按需读；
 *       ② MEMORY.md = **一行要点**（≤300 字，优先抽"产物路径/做到哪"），**会被注入**；
 *     且 MEMORY.md 的任务进展行做**滚动淘汰**（保留最近 PROGRESS_ENTRY_KEEP 条）。
 *     旧实现两份写同一长文本 → MEMORY.md 被逐批流水账撑爆（实测 81% 是任务进展行）。
 */
export async function appendTaskProgress(
  conversationId: string | null | undefined,
  outcome: TaskProgressOutcome,
  summary: string,
  extra?: { steps?: number; agentName?: string },
): Promise<{ ok: boolean; path?: string }> {
  try {
    const spaceId = resolveConversationSpaceId(conversationId);
    if (!spaceId) return { ok: false };
    const space = getSpaceRow(null, spaceId);
    if (!space) return { ok: false };
    const fullLine = flattenForProgress(summary, PROGRESS_FULL_MAX);
    if (!fullLine) return { ok: false };

    const stamp = nowStamp();
    const bits = [`【${OUTCOME_LABEL[outcome] ?? outcome}】`];
    if (extra?.steps) bits.push(`(${extra.steps} 步)`);
    if (extra?.agentName) bits.push(`${extra.agentName}：`);
    const prefix = `${stamp} 任务${bits.join('')}`;

    // ① 明细：完整总结，按需读、不参与注入（文件本身有界由读取侧 8000 字兜底）
    await appendLineWithHeader(
      getTaskProgressPath(space),
      `# ${space.name} · 任务进展\n\n> 每个长任务收尾时自动追加一条（做到哪、还剩什么）。按需读取，不自动注入。`,
      `${prefix}${fullLine}`,
    );
    // ② 空间记忆：**一行要点**（真正被注入系统提示词的那份）+ 滚动淘汰最近 N 条
    const compact = compactProgressSummary(summary, fullLine);
    await appendLineWithHeader(
      getSpaceMemoryPath(space),
      spaceMemoryHeader(space.name),
      `${prefix}${compact}`,
      { mark: PROGRESS_ENTRY_MARK, keep: PROGRESS_ENTRY_KEEP },
    );

    return { ok: true, path: getTaskProgressPath(space) };
  } catch {
    return { ok: false };
  }
}

/** 任务进展明细（同步读，供按需读取工具用）。文件不存在返回 null */
export function readTaskProgressForConversation(
  conversationId: string | null | undefined,
): { spaceId: string; spaceName: string; path: string; content: string; exists: boolean } | null {
  const spaceId = resolveConversationSpaceId(conversationId);
  if (!spaceId) return null;
  const space = getSpaceRow(null, spaceId);
  if (!space) return null;
  const filePath = getTaskProgressPath(space);
  try {
    const content = readFileSync(filePath, 'utf-8').slice(0, PROGRESS_READ_MAX_CHARS);
    return { spaceId: space.id, spaceName: space.name, path: filePath, content, exists: !!content.trim() };
  } catch {
    return { spaceId: space.id, spaceName: space.name, path: filePath, content: '', exists: false };
  }
}
