/**
 * P0 空间记忆瘦身 + P1 接力停滞 的守门测试（2026-10-09）。
 *
 * 背景（实据诊断，见 .workbuddy/memory/2026-10-09.md）：
 *   · 生产空间记忆 `小说推文/MEMORY.md` = 12786 字符，34 条正文行里 27 条是任务进展行
 *     （占 81%、平均 381 字），而注入上限仅 6000 → 新会话开局被超长流水账压垮。
 *   · 达单批步数上限后自动接力，但总批次数被 autoContinueMaxRounds(默认3) 一刀切 →
 *     长任务跑 3 批必停（用户体感"老断"）。
 *
 * 本测试钉：
 *   ① 注入版（MEMORY.md）必须**压成一行要点**、且任务进展行有**滚动淘汰上限**（文件有界）；
 *   ② 明细版（progress.md）保留完整总结，不被压扁丢掉；
 *   ③ 接力上限语义改为「停滞上限 + 硬顶」——两处常量、循环边界、decideAutoContinue 一致。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

let spaceDir = '';

vi.mock('../src/db.js', () => ({
  db: {
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
  getLatestMessageSummary: () => null,
  insertMessageSummary: () => 'sum_test',
  hasSqliteVec: false,
}));
vi.mock('../src/mcp/index.js', () => ({ ensureToolsInitialized: () => {} }));
vi.mock('../src/state.js', () => ({ serverState: { workspaceDir: undefined } }));

const SERVER_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(SERVER_SRC, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const LTM = read('src/llm-task-manager.ts');
const SPACE_MEM = read('src/services/space-memory.ts');

beforeEach(() => { spaceDir = mkdtempSync(join(tmpdir(), 'yz-spacemem2-')); });
afterEach(() => { try { rmSync(spaceDir, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('P0 空间记忆瘦身', () => {
  const LONG = '## 完成情况\n' + '这是一段很长的总结正文。'.repeat(120) + '\n## 成片路径\nC:\\Users\\Administrator\\Desktop\\小说推文\\03-output\\蟹堡王_ch01\\规则怪谈_script.mp4\n' + '尾巴'.repeat(200);

  it('★★ 注入版（MEMORY.md）必须压成一行要点：含产物路径、且远短于完整总结', async () => {
    const { appendTaskProgress } = await import('../src/services/space-memory');
    await appendTaskProgress('conv_1', 'max_steps', LONG, { steps: 200, agentName: '小说推文助手' });
    const mem = readFileSync(join(spaceDir, 'MEMORY.md'), 'utf8');
    const entryLines = mem.split('\n').filter((l) => l.startsWith('- '));
    expect(entryLines.length, '★ 注入版被写成了多行（一行一条的格式被破坏）').toBe(1);
    const line = entryLines[0];
    // 要点抽取：产物路径必须留存（跨会话接力最需要的字段）
    expect(line, '★ 注入版丢了产物路径（接力时不知道成片在哪）').toMatch(/规则怪谈_script\.mp4|03-output/);
    // 必须显著短于完整总结（≤ ~320 字：含前缀 + 300 上限）
    expect(line.length, `★ 注入版未瘦身（${line.length} 字，仍会把 system prompt 压垮）`).toBeLessThanOrEqual(340);
    // 收尾形态 + 智能体名仍在（模型据此判断能否接着做）
    expect(line).toMatch(/达最大步数中断/);
    expect(line).toMatch(/小说推文助手/);
  });

  it('★★ 明细版（progress.md）必须保留**完整**总结（不随注入版一起被压扁）', async () => {
    const { appendTaskProgress } = await import('../src/services/space-memory');
    await appendTaskProgress('conv_1', 'max_steps', LONG, { steps: 200 });
    const prog = readFileSync(join(spaceDir, '.yan-zhi', 'task-memory', 'progress.md'), 'utf8');
    expect(prog.length, '★ progress.md 也把总结压扁了（明细丢失，写下来没人能看全）').toBeGreaterThan(1200);
    expect(prog, '★ progress.md 未保留完整正文').toMatch(/完成情况/);
  });

  it('★★ 任务进展行必须滚动淘汰（文件有界，不再无限膨胀）', async () => {
    const { appendTaskProgress, PROGRESS_ENTRY_KEEP } = await import('../src/services/space-memory');
    const N = PROGRESS_ENTRY_KEEP + 5;
    for (let i = 1; i <= N; i++) {
      await appendTaskProgress('conv_1', 'max_steps', `第 ${i} 批完成，成片 C:\\out\\ch${i}.mp4`, { steps: 100 });
    }
    const mem = readFileSync(join(spaceDir, 'MEMORY.md'), 'utf8');
    const entries = mem.split('\n').filter((l) => l.startsWith('- '));
    expect(entries.length, `★ 任务进展行未淘汰（保留 ${entries.length} 条，应为 ${PROGRESS_ENTRY_KEEP}）`)
      .toBe(PROGRESS_ENTRY_KEEP);
    // 保留的是**最近的**（最旧的被淘汰）
    expect(mem, '★ 淘汰方向错误：最新一条不在文件里').toMatch(new RegExp(`ch${N}\\.mp4`));
    expect(mem, '★ 淘汰方向错误：最旧一条仍被保留').not.toMatch(/ch1\.mp4/);
    // 明细文件不受淘汰影响（它是流水底账）
    const prog = readFileSync(join(spaceDir, '.yan-zhi', 'task-memory', 'progress.md'), 'utf8');
    expect((prog.match(/^- /gm) || []).length, '★ 明细文件被误淘汰（流水底账应全量保留）').toBe(N);
  });

  it('★ 决策记录/普通记忆不得被任务进展行的淘汰逻辑误删', async () => {
    const { appendSpaceMemory, appendTaskProgress } = await import('../src/services/space-memory');
    await appendSpaceMemory('u1', 'sp_test', '这是一条需要长期保留的用户事实');
    for (let i = 0; i < 20; i++) await appendTaskProgress('conv_1', 'max_steps', `第 ${i} 批`, { steps: 10 });
    const mem = readFileSync(join(spaceDir, 'MEMORY.md'), 'utf8');
    expect(mem, '★ 普通记忆被任务进展行的淘汰逻辑误删').toMatch(/这是一条需要长期保留的用户事实/);
  });

  it('★★ 「已完成/被终止/失败」类条目只保留最近 1 条（用户：完成了的没用了该清理）', async () => {
    const { appendTaskProgress } = await import('../src/services/space-memory');
    // 混合写入：3 条**已终结**（完成/终止/失败）+ 4 条**未终结**（空转/达上限 = 还得接着干）
    await appendTaskProgress('conv_1', 'completed', '任务A完成，成片 C:\\out\\a.mp4', { steps: 10 });
    await appendTaskProgress('conv_1', 'aborted', '任务B被终止', { steps: 10 });
    await appendTaskProgress('conv_1', 'failed', '任务C失败', { steps: 10 });
    await appendTaskProgress('conv_1', 'empty_args_loop', '任务D空转', { steps: 10 });
    await appendTaskProgress('conv_1', 'max_steps', '任务E达上限，成片 C:\\out\\e.mp4', { steps: 10 });
    await appendTaskProgress('conv_1', 'max_steps', '任务F达上限', { steps: 10 });
    await appendTaskProgress('conv_1', 'max_steps', '任务G达上限', { steps: 10 });
    const mem = readFileSync(join(spaceDir, 'MEMORY.md'), 'utf8');
    const lines = mem.split('\n').filter((l) => l.startsWith('- ') && l.includes('任务【'));
    const terminal = lines.filter((l) => /任务【(已完成|被用户终止|失败中断)/.test(l));
    const open = lines.filter((l) => /任务【(达最大步数中断|空转中断)/.test(l));
    expect(terminal.length, `★ 已终结条目未清理（留了 ${terminal.length} 条，应只留最近 1 条）`).toBe(1);
    // 保留的是**最近**那条已终结（写入顺序最后的是「失败中断」）
    expect(terminal[0]).toMatch(/失败中断/);
    // 未终结（空转 + 达上限，还得接着干）**不该**被已终结的清理牵连（上限 8，这里 4 条全留）
    expect(open.length, '★ 未终结（还得接着干）的条目被误清理').toBe(4);
    expect(open.map((l) => l).join('\n'), '★ 空转中断（未干完）被当成已终结清掉了').toMatch(/空转中断/);
  });

  it('★ 源码层：注入版上限必须显著小于旧值 400，且存在淘汰常量', () => {
    const code = strip(SPACE_MEM);
    expect(code, '★ 缺 PROGRESS_ENTRY_KEEP（滚动淘汰上限）').toMatch(/PROGRESS_ENTRY_KEEP\s*=/);
    expect(code, '★ 缺淘汰实现').toMatch(/pruneEntriesByMark/);
    expect(code, '★ 注入版仍用旧的长上限（未瘦身）').toMatch(/PROGRESS_COMPACT_MAX/);
    expect(code, '★ MEMORY.md 写入未接淘汰（文件仍会无限膨胀）')
      .toMatch(/keep:\s*PROGRESS_ENTRY_KEEP/);
  });
});

describe('P1 接力上限改为「停滞上限 + 硬顶」', () => {
  it('★★ 必须定义总批次硬顶常量，且外层循环按它走（不再被 3 批卡死）', () => {
    expect(LTM, '★ 无 autoContinueHardCap 常量').toMatch(/autoContinueHardCap\s*=\s*\d+/);
    expect(LTM, '★ 外层批次循环未用硬顶（长任务仍被小上限一刀切）')
      .toMatch(/for\s*\(let batch = 0;\s*batch <= autoContinueHardCap;/);
  });

  it('★★ 必须有停滞计数器 + 进展判定（计划剩余步骤下降 = 有进展）', () => {
    const code = strip(LTM);
    expect(code, '★ 无 stallCount（停滞计数）').toMatch(/stallCount/);
    expect(code, '★ 无 lastPlanRemaining（跨批比较基准）').toMatch(/lastPlanRemaining/);
    expect(code, '★ 未按"计划剩余步骤是否下降"判定进展').toMatch(/planRemainingNow\s*<\s*lastPlanRemaining/);
    expect(code, '★ 停滞达上限未走收尾').toMatch(/stallCount\s*>=\s*autoContinueMaxRounds/);
  });

  it('★★ 停滞上限（autoContinueMaxRounds）仍可配置、0 = 关闭总开关（用户可控性不丢）', () => {
    expect(LTM, '★ 未读 config_json.autoContinueMaxRounds').toMatch(/autoContinueMaxRounds/);
    expect(LTM, '★ 未保留 0 = 关闭语义').toMatch(/autoContinueMaxRounds\s*<=\s*0/);
  });

  it('★★ decideAutoContinue 只判硬顶（停滞由调用方按进展判），不再用"总批次数 >= 3"掐断', () => {
    const i = strip(LTM).indexOf('async function decideAutoContinue');
    expect(i, '★ 找不到 decideAutoContinue').toBeGreaterThan(-1);
    const body = strip(LTM).slice(i, i + 2200);
    expect(body, '★ decideAutoContinue 未按硬顶判定').toMatch(/autoContinueHardCap/);
    expect(body, '★ decideAutoContinue 仍在按小上限(roundsExhausted)掐断')
      .not.toMatch(/continuationCount\s*>=\s*autoContinueMaxRounds/);
  });

  it('★ 既有契约不得回退：上限配置读取处仍在（getAgentLiveParams 回显）', () => {
    expect(LTM, '★ 智能体参数回显丢了 autoContinueMaxRounds').toMatch(/autoContinueMaxRounds/);
  });
});