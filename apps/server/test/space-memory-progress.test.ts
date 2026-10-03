/**
 * 长任务收尾 → 空间记忆（progress）的守门测试。
 *
 * 背景（2026-09-27 用户报「长任务没完整需要总结记忆进入空间记忆啊」）：
 *   此前长任务的四条出口**没有一条**把结论写进空间记忆：
 *     · 正常完成 / 达最大步数 → 只写 memory 表（user/agent 维度）+ 一条对话消息；
 *     · 被终止 / 失败 → 连对话消息都没有。
 *   而空间 MEMORY.md 是**唯一**跨会话注入的记忆文件 → 同目录新开会话读到的是空的，
 *   「换会话继续同一个长任务」这一用户诉求实际不成立。
 *   同时 `api_space_memory_read/append` 只注册了 schema 与 executor，**没挂给任何智能体**
 *   → 模型看不到工具，系统提示词里那句"可调用 api_space_memory_append 追加"是空指令。
 *
 * 本测试钉三件事：
 *   ① 四个任务出口都必须真的调用 recordTaskProgress（漏一个 = 长任务断线的一种形态）；
 *   ② appendTaskProgress 真的往磁盘落两个文件（真实文件系统，不是断言源码里有这行字）；
 *   ③ 两个空间记忆工具必须全链路可达（挂载 + 权限），否则又是"写了没人能调"。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

let spaceDir = '';

vi.mock('../src/db.js', () => ({
  db: {
  // 2026-10-02：补齐 db.js 导出（手写白名单 mock 必须与生产代码同步，否则报
  //   `No "X" export is defined on the "../src/db.js" mock`，表象却是「任务 failed」）。
  MESSAGE_LIST_COLS:
  'id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at',
  deleteMessageSummariesAfter: () => 0,
  clearMessageSummaries: () => {},
    prepare: (sql: string) => ({
      get: (...a: unknown[]) => {
        if (/FROM\s+conversation/i.test(sql)) return { space_id: a[0] === 'conv_none' ? null : 'sp_test' };
        if (/FROM\s+space/i.test(sql)) return { id: 'sp_test', user_id: 'u1', name: '测试目录', dir_path: spaceDir };
        if (/FROM\s+agent/i.test(sql)) return { name: '小说改写助手' };
        return undefined;
      },
      all: () => [],
      run: () => {},
    }),
  },
  // 2026-10-02：services/context-view.ts（上下文组装唯一出口）新增依赖。
  // ★ 手写白名单 mock 必须同步补，否则 ESM 直接报 "does not provide an export"，
  //   表现为"任务 failed"，看不出真因（本文件此前已记录过同类教训）。
  getLatestMessageSummary: () => null,
  insertMessageSummary: () => "sum_test",
  hasSqliteVec: false,
}));
vi.mock('../src/mcp/index.js', () => ({ ensureToolsInitialized: () => {} }));
vi.mock('../src/state.js', () => ({ serverState: { workspaceDir: undefined } }));

const SERVER_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(SERVER_SRC, p), 'utf8');
/** ★ 剥注释 —— 不剥的话注释里提到函数名会让 `.not.toMatch` 断言假红（本项目踩过两次） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LTM = read('src/llm-task-manager.ts');
const SPACE_MEM = read('src/services/space-memory.ts');
const PERM = read('src/tool-permission.ts');
const DB = read('src/db.ts');
const TASK_AGENTS = read('src/builtin-task-mode-agents.ts');
const EXECUTOR = read('src/mcp/api-tool-executor.ts');

beforeEach(() => { spaceDir = mkdtempSync(join(tmpdir(), 'yz-spacemem-')); });
afterEach(() => { try { rmSync(spaceDir, { recursive: true, force: true }); } catch { /* 清理失败不影响断言 */ } });

describe('① 四个任务出口都必须沉淀空间记忆', () => {
  it('★★ 完成 / 达最大步数 / 被终止 / 失败 —— 一个都不能漏', () => {
    const code = strip(LTM);
    const hits = [...code.matchAll(/recordTaskProgress\(task,\s*'([a-z_]+)'/g)].map((m) => m[1]);
    for (const outcome of ['completed', 'max_steps', 'aborted', 'failed']) {
      expect(hits, `★ 出口 ${outcome} 未调用 recordTaskProgress（长任务在这种收尾下无法沉淀记忆）`)
        .toContain(outcome);
    }
  });

  it('★ 达最大步数要复用已有总结（不能为此再花一次 LLM 调用）', () => {
    const code = strip(LTM);
    const idx = code.indexOf("recordTaskProgress(task, 'max_steps'");
    expect(idx, '★ 未找到 max_steps 的收尾调用').toBeGreaterThan(-1);
    // 该调用附近必须引用 tipText（已有总结），而不是重新做一次总结
    const near = code.slice(idx, idx + 200);
    expect(near, '★ max_steps 未复用 summarizeOnMaxSteps 的产物（会重复调用模型）').toMatch(/tipText/);
  });

  it('★★ 终止路径必须留痕 —— 此前 abort 连一条总结消息都没有', () => {
    const code = strip(LTM);
    // ⚠️ 锚点必须唯一：`isAbortError(e)` 在文件里有 6 处（有的是 `throw e` 的透传守卫），
    //    直接 indexOf 会抓到 1206 行那个无关块（本项目踩过的"indexOf 抓错块"）。
    const anchor = code.indexOf("if (isAbortError(e)) {\n      task.status = 'aborted';");
    expect(anchor, '★ 找不到 abort 收尾分支（源码结构变了，锚点需同步）').toBeGreaterThan(-1);
    const abortBlock = code.slice(anchor, anchor + 400);
    expect(abortBlock, '★ abort 分支未记录进展（被终止的长任务在空间记忆里完全无痕）')
      .toMatch(/recordTaskProgress\(task,\s*'aborted'/);
  });

  it('★ recordTaskProgress 必须 fail-safe（写记忆失败不能影响任务状态上报）', () => {
    const code = strip(LTM);
    const i = code.indexOf('async function recordTaskProgress');
    const body = code.slice(i, i + 1200);
    expect(body, '★ recordTaskProgress 无 try/catch').toMatch(/try\s*\{/);
    expect(body, '★ recordTaskProgress 抛错会污染任务收尾链路').toMatch(/catch\s*\{/);
  });
});

describe('② appendTaskProgress：真实文件系统落盘（不是"源码里有这行字"）', () => {
  it('★★ 值: 落 MEMORY.md + task-memory/progress.md 两个真实文件，内容可读回', async () => {
    const { appendTaskProgress } = await import('../src/services/space-memory');
    const r = await appendTaskProgress('conv_1', 'max_steps', '改写完成第 1-3 章，第 4 章待续。', { steps: 50, agentName: '小说改写助手' });
    expect(r.ok, '★ 落盘失败').toBe(true);

    const memPath = join(spaceDir, 'MEMORY.md');
    const progPath = join(spaceDir, '.yan-zhi', 'task-memory', 'progress.md');
    expect(existsSync(memPath), '★ 空间记忆 MEMORY.md 没写成（它才是被注入的那份）').toBe(true);
    expect(existsSync(progPath), '★ 进展明细 progress.md 没写成').toBe(true);

    const mem = readFileSync(memPath, 'utf8');
    expect(mem, '★ MEMORY.md 缺头部').toMatch(/空间记忆/);
    expect(mem, '★ MEMORY.md 未记录收尾形态（模型无法判断能否接着做）').toMatch(/达最大步数中断/);
    expect(mem, '★ MEMORY.md 未记录摘要正文').toMatch(/第 1-3 章/);
    expect(mem, '★ 未记录智能体名').toMatch(/小说改写助手/);

    const prog = readFileSync(progPath, 'utf8');
    expect(prog, '★ progress.md 缺头部').toMatch(/任务进展/);
    expect(prog, '★ progress.md 与 MEMORY.md 内容不一致').toMatch(/第 1-3 章/);
  });

  it('★ 多次追加必须都是独立一行（不能把上次的覆盖掉）', async () => {
    const { appendTaskProgress } = await import('../src/services/space-memory');
    await appendTaskProgress('conv_1', 'max_steps', '第一批完成');
    await appendTaskProgress('conv_1', 'completed', '第二批完成');
    const mem = readFileSync(join(spaceDir, 'MEMORY.md'), 'utf8');
    expect(mem, '★ 第一批记录被覆盖（长任务历史丢失）').toMatch(/第一批完成/);
    expect(mem, '★ 第二批记录缺失').toMatch(/第二批完成/);
  });

  it('★ 摘要里的换行必须压平（一行一条的文件格式，换行会把一条切成多条）', async () => {
    const { appendTaskProgress } = await import('../src/services/space-memory');
    await appendTaskProgress('conv_1', 'completed', '第一行\n第二行\n\n第三行');
    const mem = readFileSync(join(spaceDir, 'MEMORY.md'), 'utf8');
    const entryLines = mem.split('\n').filter((l) => l.startsWith('- '));
    expect(entryLines.length, `★ 一条摘要被写成了多行条目：${JSON.stringify(entryLines)}`).toBe(1);
  });

  it('★★ 未挂空间的会话必须静默跳过，且**不得创建任何文件/目录**', async () => {
    const { appendTaskProgress } = await import('../src/services/space-memory');
    const r = await appendTaskProgress('conv_none', 'completed', '不该被记录');
    expect(r.ok, '★ 未挂空间却报告成功').toBe(false);
    expect(existsSync(join(spaceDir, 'MEMORY.md')), '★ 未挂空间却写了 MEMORY.md').toBe(false);
    expect(existsSync(join(spaceDir, '.yan-zhi')), '★ 未挂空间却建了 .yan-zhi 目录（用户明确：没有任务类型不建默认目录）').toBe(false);
  });

  it('★ 空摘要不得写入（避免 MEMORY.md 里出现无信息空条目）', async () => {
    const { appendTaskProgress } = await import('../src/services/space-memory');
    const r = await appendTaskProgress('conv_1', 'completed', '   \n\n  ');
    expect(r.ok, '★ 空摘要被当成有效记录').toBe(false);
    expect(existsSync(join(spaceDir, 'MEMORY.md')), '★ 空摘要也建了文件').toBe(false);
  });

  it('★ appendTaskDecision 与 appendSpaceMemory 必须复用同一落盘原语（格式不漂移）', () => {
    const code = strip(SPACE_MEM);
    expect(code, '★ 三处追加各写一套逻辑（头部/换行处理必然漂移）').toMatch(/appendLineWithHeader/);
    // 三处调用点：空间记忆追加 / 决策记录 / 任务进展
    const uses = [...code.matchAll(/await appendLineWithHeader\(/g)].length;
    expect(uses, `★ appendLineWithHeader 只被 ${uses} 处使用（应为 3：空间记忆/决策记录/任务进展）`).toBeGreaterThanOrEqual(3);
  });
});

describe('③ 空间记忆工具必须全链路可达（防"注册了没人挂"再犯）', () => {
  it('★★ 四个任务模式智能体都要挂上空间记忆读写', async () => {
    const m = await import('../src/builtin-task-mode-agents');
    for (const key of ['NOVEL_AGENT_BUILTIN_TOOLS', 'SCRIPT_AGENT_BUILTIN_TOOLS', 'AUDIOBOOK_AGENT_BUILTIN_TOOLS', 'DUBBING_AGENT_BUILTIN_TOOLS'] as const) {
      const tools = (m as any)[key] as string[];
      expect(Array.isArray(tools), `★ ${key} 不存在`).toBe(true);
      expect(tools, `★ ${key} 未挂 api_space_memory_read（模型读不到空间记忆）`).toContain('api_space_memory_read');
      expect(tools, `★ ${key} 未挂 api_space_memory_append`).toContain('api_space_memory_append');
    }
  });

  it('★★ 默认助手也要挂（否则普通会话里长任务同样沉淀不进去）', () => {
    const code = strip(DB);
    const i = code.indexOf('DEFAULT_AGENT_BUILTIN_TOOLS');
    const block = code.slice(i, i + 3000);
    expect(block, '★ 默认助手未挂 api_space_memory_read').toMatch(/api_space_memory_read/);
    expect(block, '★ 默认助手未挂 api_space_memory_append').toMatch(/api_space_memory_append/);
  });

  it('★★ api_space_memory_append 必须在写清单（它往用户磁盘写文件）', () => {
    const code = strip(PERM);
    const writeSet = code.slice(code.indexOf('const WRITE_TOOLS'), code.indexOf('const UNCONTROLLABLE_PREFIXES'));
    expect(writeSet, '★ append 未登记为写工具 → 只读会话能往用户磁盘写文件')
      .toMatch(/'api_space_memory_append'/);
    const safeSet = code.slice(code.indexOf('const READONLY_SAFE_TOOLS'), code.indexOf('const RISKY_CODE_PATTERNS'));
    expect(safeSet, '★ read 未在只读白名单（只读会话读不到空间记忆）').toMatch(/'api_space_memory_read'/);
    expect(safeSet, '★ append 被误放进只读白名单').not.toMatch(/'api_space_memory_append'/);
  });

  it('★★ api_space_memory_read 必须一并返回进展明细（否则 progress.md 写了没人读）', () => {
    const code = strip(EXECUTOR);
    const i = code.indexOf("case 'api_space_memory_read'");
    const branch = code.slice(i, i + 900);
    expect(branch, '★ 读取分支未带出 progress 明细（写下来的流水无人可见）')
      .toMatch(/readTaskProgressForConversation/);
  });

  it('★ 空间记忆注入文案要告诉模型"看收尾条目接着做"', () => {
    const code = strip(SPACE_MEM);
    const i = code.indexOf('export function formatSpaceMemoryContext');
    const body = code.slice(i, i + 900);
    expect(body, '★ 注入文案未提示模型查看任务收尾进展（模型不会主动用）').toMatch(/任务/);
    expect(body, '★ 注入文案未要求"接着做而不是从头再来"').toMatch(/接着|不要从头|别从头/);
  });
});