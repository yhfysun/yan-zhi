/**
 * 「不静默断流」+「前端工具分档超时」守门测试（2026-10-09，P0/P1 实据修复）。
 *
 * 背景（见 .workbuddy/memory/2026-10-09.md 与 docs/会话卡死与流式断流-根因与修复方案-20261009.md）：
 *   · 上游/代理用 TCP FIN 半途关 SSE 时 `reader.read()` 是**正常结束**而非抛错 →
 *     旧代码把半截流当"本轮完成"落库（content 空、reasoning 一半），emit task:completed。
 *     修复：core parseSSE 吐 `terminated` 标记，任务循环据此**续写 / 落可见提示**，绝不静默留白。
 *   · 前端工具（尤其 browser_*）此前**一刀切** 2 分钟超时，慢站/代理下频繁误杀。
 *     修复：按工具分档 + 串行排队宽限。
 *
 * 本测试钉：
 *   ① 超时解析器分档正确（browser_navigate 远高于旧的 2 分钟；只读快档更短；未知 browser_ 走慢档）；
 *   ② 源码层：2 分钟硬编码已从超时处移除，续写/可见提示/分档解析器都真实存在（防回退）。
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── 轻量 mock：llm-task-manager 顶层会拉起 db / core / mcp 等重依赖 ──
const noopStmt = () => ({ get: () => undefined, all: () => [], run: () => {} });
vi.mock('../src/db.js', () => ({
  db: { prepare: () => noopStmt(), exec: () => {}, pragma: () => {} },
  MESSAGE_LIST_COLS:
    'id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at',
  deleteMessageSummariesAfter: () => 0,
  clearMessageSummaries: () => {},
  getLatestMessageSummary: () => null,
  insertMessageSummary: () => 'sum_test',
  hasSqliteVec: false,
}));
vi.mock('@yan-zhi/core', () => ({
  runCodeDiagnostics: async () => ({ ran: [], projectRoot: null, problems: [], notes: [], durationMs: 0, text: '' }),
  invalidateDiagnosticsCache: () => {},
  SYNTHETIC_MESSAGE_IDS: new Set(['sys', 'summary', '__summary__']),
  isSyntheticMessageId: (id: string) => ['sys', 'summary', '__summary__'].includes(id),
  adviceForTruncatedArgs: () => ({ truncated: false, message: '' }),
  LlmClient: class { constructor() {} },
  getToolRegistry: () => ({ has: () => false, get: () => undefined, names: () => [], execute: async () => '', set: () => {} }),
  getApiToolRegistry: () => new Map(),
  ContextWindow: class {
    static forContextWindow() { return new this(); }
    static forBudget() { return new this(); }
    tokenCount() { return 0; }
    needsCompression() { return false; }
    compress(m: any[]) { return m; }
    setSummaryModel() {}
  },
  resolveToolPath: (input: unknown, ws?: string | null) => (typeof input === 'string' && input.trim()) || ws || '.',
  isAbsolutePath: (p: string) => /^([a-zA-Z]:[\\/]|[\\/]{2}|\/)/.test(String(p || '')),
  visibleMessages: (ms: any[]) => ms || [],
  resolveContextWindow: (n: any) => (typeof n === 'number' && n > 0 ? n : 32768),
}));
vi.mock('../src/mcp/index.js', () => ({ ensureToolsInitialized: () => {} }));
vi.mock('../src/mcp/api-tool-executor.js', () => ({
  executeApiTool: vi.fn(), SUPPORTED_API_TOOLS: [],
  isApiExecutableTool: (n: string) => typeof n === 'string' && n.startsWith('api_'),
}));
vi.mock('../src/services/ollama-embed.js', () => ({ embedText: vi.fn().mockResolvedValue([]) }));

import {
  resolveFrontendToolTimeout,
  FRONTEND_TOOL_TIMEOUT_MS,
  BROWSER_SLOW_TIMEOUT_MS,
  BROWSER_FAST_TIMEOUT_MS,
  BROWSER_QUEUE_GRACE_MS,
  UI_STATE_TIMEOUT_MS,
  UI_STATE_TOOLS,
  onFrontendToolTimeout,
  STREAM_TRUNCATE_MAX_RETRY,
  TRUNCATED_STREAM_NOTICE,
  isStreamUnterminated,
} from '../src/llm-task-manager.js';

const MGR_SRC = readFileSync(resolve(__dirname, '..', 'src', 'llm-task-manager.ts'), 'utf8');

describe('P1 前端工具分档超时', () => {
  it('★★ browser_navigate 的委托超时**远高于**旧的 2 分钟（慢站/代理不再误杀）', () => {
    const t = resolveFrontendToolTimeout('browser_navigate');
    expect(t, '★ 导航类仍卡在 2 分钟附近 —— 慢站必被误杀').toBeGreaterThan(FRONTEND_TOOL_TIMEOUT_MS);
    expect(t).toBe(BROWSER_SLOW_TIMEOUT_MS + BROWSER_QUEUE_GRACE_MS);
    expect(t).toBeGreaterThanOrEqual(7 * 60 * 1000);
  });

  it('只读/轻交互（get_page_content / screenshot）走快档，且**短于**导航档', () => {
    const fast = resolveFrontendToolTimeout('browser_get_page_content');
    const nav = resolveFrontendToolTimeout('browser_navigate');
    expect(fast).toBe(BROWSER_FAST_TIMEOUT_MS + BROWSER_QUEUE_GRACE_MS);
    expect(fast).toBeLessThan(nav);
    expect(resolveFrontendToolTimeout('browser_screenshot')).toBe(fast);
  });

  it('未登记的 browser_* 走慢档（宁可等久也不误杀新工具）', () => {
    expect(resolveFrontendToolTimeout('browser_some_future_tool')).toBe(BROWSER_SLOW_TIMEOUT_MS + BROWSER_QUEUE_GRACE_MS);
  });

  it('非浏览器工具仍用默认超时（分档不误伤普通前端委托工具）', () => {
    expect(resolveFrontendToolTimeout('some_frontend_tool')).toBe(FRONTEND_TOOL_TIMEOUT_MS);
  });

  it('★ 源码层：超时处不再裸用 2 分钟魔数，改走解析器', () => {
    // 旧的 `? timeoutMsOverride : FRONTEND_TOOL_TIMEOUT_MS` 必须被解析器取代
    expect(MGR_SRC, '★ 超时处仍在裸用 2 分钟常量（分档未生效）')
      .not.toMatch(/:\s*FRONTEND_TOOL_TIMEOUT_MS\s*\)/);
    expect(MGR_SRC, '★ 缺分档解析器').toMatch(/function resolveFrontendToolTimeout/);
  });
});

describe('P1b ★★★ 本地状态类（task_plan/task_step）不再干等 2 分钟，超时改由服务端落库（2026-10-15）', () => {
  it('★★★ 这两个工具走**本地状态档**，远低于默认 2 分钟', () => {
    for (const t of ['task_plan', 'task_step']) {
      expect(resolveFrontendToolTimeout(t), `★ ${t} 仍在等默认的 2 分钟 —— 一次进度更新白等 120 秒`)
        .toBe(UI_STATE_TIMEOUT_MS);
    }
    expect(UI_STATE_TIMEOUT_MS).toBeLessThan(FRONTEND_TOOL_TIMEOUT_MS / 4);
    expect([...UI_STATE_TOOLS].sort()).toEqual(['task_plan', 'task_step']);
    // ★ 别误伤：同为 UI_TOOLS 的 image_analyze 是**真的要跑视觉模型**的，必须留在默认档
    expect(resolveFrontendToolTimeout('image_analyze'), '★ 视觉分析被拉进短档 → 正常调用会被误杀')
      .toBe(FRONTEND_TOOL_TIMEOUT_MS);
  });

  it('★★★ 超时收口必须**先落库再回执**（而不是报失败诱导重试）', () => {
    const i = MGR_SRC.indexOf('async function onFrontendToolTimeout(');
    expect(i, '★ 锚点缺失：onFrontendToolTimeout').toBeGreaterThan(-1);
    const seg = MGR_SRC.slice(i, i + 2600);
    expect(seg, '★ 未调兜底实现').toMatch(/await fallback\(args\)/);
    expect(seg, '★ 有兜底却仍直接 reject → 白等之后还把这一步判成失败').toMatch(/pending\.resolve\(/);
    expect(seg, '★ 回执未明示"不要重试" → 模型会再发一次，白烧一轮').toMatch(/不要重试/);
    expect(seg, '★ 回执用了"工具执行失败"措辞 → 与"这一步其实已落库"矛盾').not.toMatch(/工具执行失败/);
  });

  it('★★ 定时器只负责转交收口（旧的"原地 reject"已移出定时器体）', () => {
    const i = MGR_SRC.indexOf('const timer = (interactive || noTimeout)');
    expect(i, '★ 锚点缺失：超时定时器').toBeGreaterThan(-1);
    const seg = MGR_SRC.slice(i, i + 700);
    expect(seg, '★ 定时器未转交 onFrontendToolTimeout')
      .toMatch(/onFrontendToolTimeout\(task, toolName, callId, args, effectiveTimeout, onTimeoutFallback\)/);
    expect(seg, '★ 定时器体内又出现原地 reject（收口被绕开）').not.toMatch(/pending\.reject\(/);
  });

  it('★★ 兜底实现**只有一份**（无人值守与超时两个场景共用，防平行实现漂移）', () => {
    expect(MGR_SRC, '★ 缺 localPlanFallback 收口').toMatch(/const localPlanFallback = /);
    const hits = (MGR_SRC.match(/backendTaskPlan\(task\.conversationId/g) || []).length;
    expect(hits, `★ backendTaskPlan(conv…) 出现 ${hits} 处（应为 1：只在那一个 localPlanFallback 里）`).toBe(1);
    expect(MGR_SRC, '★ 超时路径没拿到兜底 → 又回到"干等 2 分钟然后报失败"')
      .toMatch(/executeToolViaFrontend\(task, toolName, args, toolCallId, depth, undefined, localPlanFallback\)/);
  });

  /** 造一个只有 pendingToolCalls 的最小 task（emit/sync 都是 try/catch 包着的旁路） */
  function probeTask(id: string) {
    const settled: { ok?: string; err?: any } = {};
    const task: any = { id, conversationId: 'conv-probe', pendingToolCalls: new Map(), events: [] };
    task.settle = settled;
    return task;
  }
  function armPending(task: any, callId: string, toolName: string) {
    task.pendingToolCalls.set(callId, {
      toolName, callId, requestedAt: Date.now(),
      resolve: (v: string) => { task.settle.ok = v; },
      reject: (e: any) => { task.settle.err = e; },
    });
  }

  it('★★★ 【真跑】到点后**先落库、再以成功回执放行**（不拒绝、不诱导重试）', async () => {
    const task = probeTask('task-probe-1');
    armPending(task, 'c1', 'task_step');
    let gotArgs: any = null;
    await onFrontendToolTimeout(task, 'task_step', 'c1', { index: 2, status: 'done' }, UI_STATE_TIMEOUT_MS,
      async (a: any) => { gotArgs = a; return '已更新第 2 步状态为 done'; });
    expect(gotArgs, '★ 兜底没拿到原始入参 → 会落错步骤').toEqual({ index: 2, status: 'done' });
    expect(task.settle.err, '★ 有兜底却仍 reject → 白等之后还把这一步判成失败').toBeUndefined();
    expect(task.settle.ok, '★ 没给回执').toContain('已更新第 2 步');
    expect(task.settle.ok, '★ 回执没明示"不要重试" → 模型会再发一次，白烧一轮').toContain('不要重试');
    expect(task.pendingToolCalls.has('c1'), '★ 超时后没摘掉 pending → 表里留幽灵条目').toBe(false);
  });

  it('★★ 【真跑】无兜底的工具（如 image_analyze）到点仍然 reject —— 不能替真失败假装成功', async () => {
    const task = probeTask('task-probe-2');
    armPending(task, 'c2', 'image_analyze');
    await onFrontendToolTimeout(task, 'image_analyze', 'c2', {}, UI_STATE_TIMEOUT_MS, undefined);
    expect(task.settle.ok, '★ 无兜底却"成功"了 → 模型以为分析过了，其实没有').toBeUndefined();
    expect(task.settle.err?.message, '★ 未按"超时"语义收口').toMatch(/执行超时/);
  });

  it('★★ 【真跑】兜底自己也抛错 → 回落到"超时"语义（不能既没落库又假装成功）', async () => {
    const task = probeTask('task-probe-3');
    armPending(task, 'c3', 'task_step');
    await onFrontendToolTimeout(task, 'task_step', 'c3', { index: 1 }, UI_STATE_TIMEOUT_MS,
      async () => { throw new Error('DB 挂了'); });
    expect(task.settle.ok, '★ 兜底失败却仍返回成功 → 计划没落上而模型以为落了').toBeUndefined();
    expect(task.settle.err?.message).toMatch(/执行超时/);
  });

  it('★★★ 【真跑】前端**断连**与**超时**两种成因的措辞必须可区分（本项目吃过"混成一句谁都定位不了"的亏）', async () => {
    const task = probeTask('task-probe-4');
    armPending(task, 'c4', 'image_analyze');
    await onFrontendToolTimeout(task, 'image_analyze', 'c4', {}, 15000, undefined, 'disconnect');
    expect(task.settle.err?.message, '★ 断连被写成了"执行超时" → 现场分不清是前端掉了还是工具卡了')
      .toMatch(/前端断连/);
    expect(task.settle.err?.message, '★ 断连文案丢了"15 秒内重连"这个关键信息').toMatch(/重连/);
  });

  it('★★ 断连宽限与原始超时必须走**同一个收口**（两条路径各写一份 = 措辞与兜底必然漂移）', () => {
    const i = MGR_SRC.indexOf('pending.graceTimer = setTimeout(');
    expect(i, '★ 锚点缺失：断连宽限定时器').toBeGreaterThan(-1);
    const seg = MGR_SRC.slice(i, i + 400);
    expect(seg, '★ 宽限路径未走统一收口（又自己 reject 了一份）')
      .toMatch(/onFrontendToolTimeout\(task, p\.toolName \|\| '', id, p\.args, 15000, p\.onTimeoutFallback, 'disconnect'\)/);
    expect(seg, '★ 宽限路径未把兜底传下去 → 断连时本地状态类工具仍会白丢一步')
      .toMatch(/p\.onTimeoutFallback/);
  });
});

describe('P0 断流不静默', () => {
  it('★ 定义了续写重试上限与可见提示文案', () => {
    expect(STREAM_TRUNCATE_MAX_RETRY).toBeGreaterThanOrEqual(1);
    expect(TRUNCATED_STREAM_NOTICE).toMatch(/中断/);
  });

  it('★ 源码层：消费流时跟踪收尾标记，且截断会触发续写', () => {
    expect(MGR_SRC, '★ 未跟踪流收尾标记（terminated）').toMatch(/chunk\.terminated/);
    expect(MGR_SRC, '★ 缺续写重试循环').toMatch(/STREAM_TRUNCATE_MAX_RETRY/);
  });

  it('★ 源码层：断流且无正文时落可见提示（不留空气泡）', () => {
    expect(MGR_SRC, '★ 缺"断流且无正文 → 落可见提示"的兜底')
      .toMatch(/fullContent\s*=\s*TRUNCATED_STREAM_NOTICE/);
  });

  it('★ 源码层：截断时 lastFinishReason 标为 truncated（供下游正确归因）', () => {
    expect(MGR_SRC).toMatch(/'truncated'/);
  });
});

/**
 * ★★★ 2026-10-10 实据回归：断流判据漏判导致"续写"变"静默完成"。
 *
 * 现场（用户实测 2026-10-10 20:21:23，会话 f0a901e3）：
 *   user 发「继续」→ assistant 落库 `content='' + reasoning=7269 字（尾部断在 "Then Call 2: publish ch"）`
 *   + tool_calls=None + step=0 → llm_task 被标 `completed`。用户体感「又断了」。
 *
 * 旧判据 `(terminated === false || (!finish && !content && !reasoning)) && !toolCalls` 为何失效：
 *   · 代理以 TCP FIN 半途关流时 core 的 `terminated` 可能**未送达**（保持默认 true）
 *     → 条件①不成立；
 *   · 推理模型**先吐 reasoning 后吐正文**，被掐时 reasoning 非空 → `!reasoning` 为假
 *     → 条件②不成立；
 *   ⇒ 整段跳过 → 落「无工具调用 → 完成」→ 空 content 被宣布完成。
 *
 * 修复：判据抽为 `isStreamUnterminated()`，以 **「无 finish_reason」为主判据**
 *   （正常流必带终态），覆盖"只有半截 reasoning、无正文"这一最典型形态。
 */
describe('P0 断流判据（2026-10-10 实据回归：续写不再漏判成"正常完成"）', () => {
  const base = { terminated: true, hasToolCalls: false, contentLen: 0, reasoningLen: 0 };

  it('★★ 实测现场：无 finish_reason + 只有半截 reasoning + 无正文 → 必须判为未收尾', () => {
    expect(
      isStreamUnterminated({ ...base, finishReason: undefined, reasoningLen: 7269 }),
      '★ 这正是 2026-10-10 20:21 用户的失败现场 —— 漏判就会带着空 content 宣布完成',
    ).toBe(true);
  });

  it('★ 首轮（step=0）就被掐断同样要判为未收尾（旧兜底的 step>0 限制会漏掉它）', () => {
    // isStreamUnterminated 本身无 step 概念 —— 这里钉"无终态即未收尾"，与 step 无关
    expect(isStreamUnterminated({ ...base, finishReason: undefined, reasoningLen: 120 })).toBe(true);
  });

  it('core 明确报 terminated=false → 未收尾（即使有 finish_reason 也以明确截断为准）', () => {
    expect(isStreamUnterminated({ ...base, terminated: false, finishReason: 'stop' })).toBe(true);
  });

  it('无任何产出（content 与 reasoning 皆空、无终态）→ 未收尾', () => {
    expect(isStreamUnterminated({ ...base, finishReason: undefined })).toBe(true);
  });

  it('正常收尾（有 finish_reason=stop + 有正文）→ **不**判截断（防误伤正常流）', () => {
    expect(isStreamUnterminated({ ...base, finishReason: 'stop', contentLen: 500 })).toBe(false);
  });

  it('finish_reason=length 是"正常收尾的一种"→ 不整轮重来（交给下游按截断参数处理）', () => {
    expect(
      isStreamUnterminated({ ...base, finishReason: 'length', contentLen: 30 }),
      '★ length 属收尾态，整轮重发是错的（同样长度必然再截断），应由 adviceForTruncatedArgs 处理',
    ).toBe(false);
  });

  it('有工具调用 → 不整轮重来（交给下层按 finish_reason 走参数续跑/报错，与既有口径一致）', () => {
    expect(isStreamUnterminated({ ...base, hasToolCalls: true, finishReason: undefined })).toBe(false);
  });

  it('★ 源码层：续写与可见提示两处防线都改用新判据（防回退到 terminated===false）', () => {
    expect(MGR_SRC, '★ 续写分支未使用 isStreamUnterminated').toMatch(/const\s+unterminated\s*=\s*isStreamUnterminated\(/);
    expect(MGR_SRC, '★ 可见提示仍钉死在 terminated===false —— 代理半关流时标记不送达，兜底会静默失效')
      .not.toMatch(/!fullContent\.trim\(\)\s*&&\s*streamFlag\.terminated\s*===\s*false/);
    expect(MGR_SRC, '★ 可见提示未改用新判据').toMatch(/!fullContent\.trim\(\)\s*&&\s*unterminated/);
  });

  it('★ 源码层：空回复兜底不得再被 step>0 限制（首轮被掐也要提示）', () => {
    expect(MGR_SRC, '★ 空回复兜底仍有 step>0 限制 —— 首轮被掐断时用户会看到空白')
      .not.toMatch(/if\s*\(\s*!fullContent\s*&&\s*!fullReasoning\s*&&\s*step\s*>\s*0\s*\)/);
  });
});