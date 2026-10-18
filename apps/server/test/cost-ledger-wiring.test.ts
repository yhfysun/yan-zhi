/**
 * 费用账本接线测试（2026-10-18）—— **功能性为主、静态守卫为辅**。
 *
 * ★ 为什么必须有功能性部分（本项目的头号判据：断言"存在"≠断言"生效"）：
 *   静态源码断言只能证明"接线写着呢"，证明不了跑起来真记账、真提醒、真不停。
 *   这里用**真 temp DB**（db 单例，server 测试的既有环境）驱动：
 *   · `recordTaskUsage`（记账出口）→ 断言 usage_event / conversation_usage 真写了、金额是等式；
 *   · `noticeCostAtRoundEnd`（轮末判定）→ 断言真提醒、档位去重、**默认永不停**（D4 核心）。
 *
 * ★ 变异验证记录：
 *   · 把 `recordTaskUsage` 的估算分支删掉（missing usage 直接当 0）⇒ 估算用例打红；
 *   · 把 `noticeCostAtRoundEnd` 的 `checkAndSaveNotice` 换成每轮都发 ⇒ 去重用例打红；
 *   · 把 `>=` 改回 `>`（等长重发）⇒ tool-call-delta-accumulate 的回归用例打红（另一文件）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../src/db.js';
import { recordTaskUsage, noticeCostAtRoundEnd } from '../src/llm-task-manager.js';

const REPO = resolve(__dirname, '..', '..', '..');

function fakeTask(overrides: Record<string, unknown> = {}): any {
  return {
    id: 't_cost', conversationId: 'c_cost_wire', userId: 'guest',
    status: 'running', platformId: 'p_cost', modelId: 'deepseek-v4-pro',
    events: [] as any[], subscribers: new Set(), seq: 0, step: 3,
    abortController: new AbortController(), createdAt: Date.now(),
    pendingToolCalls: new Map(), pendingInjects: [], injectedByClientId: new Map(),
    ...overrides,
  };
}

function setCostBudget(cfg: Record<string, unknown>): void {
  db.prepare("INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES ('cost_budget', ?, ?)")
    .run(JSON.stringify(cfg), Date.now());
}

beforeEach(() => {
  db.prepare('DELETE FROM usage_event').run();
  db.prepare('DELETE FROM conversation_usage').run();
  db.prepare("DELETE FROM app_config WHERE key = 'cost_budget'").run();
});

// ─────────────────────────────────────────────────────────────────────────────
// 功能性：recordTaskUsage（记账出口）
// ─────────────────────────────────────────────────────────────────────────────

describe('recordTaskUsage：调用一次真记两行（明细 + 累计）', () => {
  it('★ 计价等式：600 全价输入 + 400 命中 + 200 输出，按内置参考价（9/0.3/27 元每百万）', () => {
    const task = fakeTask();
    recordTaskUsage(task, 'main',
      { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 },
      { platformId: 'p_cost', modelId: 'deepseek-v4-pro' },
      { content: 'x', reasoning: '' });

    const ev = db.prepare('SELECT * FROM usage_event WHERE conversation_id=?').all(task.conversationId) as any[];
    expect(ev.length).toBe(1);
    expect(ev[0].source).toBe('main');
    expect(ev[0].model_id).toBe('deepseek-v4-pro');
    expect(ev[0].estimated).toBe(0);
    // 等式断言，不是 > 0：600*9/1e6 + 400*0.3/1e6 + 200*27/1e6 = 0.01092
    expect(ev[0].cost_cny).toBeCloseTo(0.01092, 8);

    const acc = db.prepare('SELECT * FROM conversation_usage WHERE conversation_id=?').get(task.conversationId) as any;
    expect(acc.cost_cny).toBeCloseTo(0.01092, 8);
    expect(acc.input_tokens).toBe(600);
    expect(acc.cache_read_tokens).toBe(400);
    expect(acc.output_tokens).toBe(200);
    expect(acc.unpriced_calls).toBe(0);
    // 内存增量同步（展示用）
    expect(task.costCnyTotal).toBeCloseTo(0.01092, 8);
  });

  it('★ 坑 #13：上游没给 usage（detail undefined）⇒ 走估算并标 estimated，绝不当 ¥0 免费', () => {
    const task = fakeTask();
    recordTaskUsage(task, 'main', undefined, { platformId: 'p_cost', modelId: 'deepseek-v4-pro' },
      { messages: [{ role: 'user', content: '请帮我把这个长任务跑完，内容足够长以便估算出非零输入' }], content: '好的，已完成。', reasoning: '' });

    const ev = db.prepare('SELECT * FROM usage_event WHERE conversation_id=?').get(task.conversationId) as any;
    expect(ev.estimated, '★ 估算必须标 estimated（UI 显示 ≈）').toBe(1);
    expect(ev.input_tokens, '输入按消息序列化估算，应 > 0').toBeGreaterThan(0);
    expect(ev.output_tokens, '输出按实际产出估算，应 > 0').toBeGreaterThan(0);
  });

  it('★ 坑 #4：内置表也没收录的模型 ⇒ unpriced 计数 + ¥0（提示"金额偏低"，不当免费）', () => {
    const task = fakeTask({ modelId: 'no-such-model-xyz' });
    recordTaskUsage(task, 'main',
      { inputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 100 },
      { platformId: 'p_cost', modelId: 'no-such-model-xyz' }, { content: '', reasoning: '' });

    const acc = db.prepare('SELECT * FROM conversation_usage WHERE conversation_id=?').get(task.conversationId) as any;
    expect(acc.cost_cny).toBe(0);
    expect(acc.unpriced_calls).toBe(1);
    expect(task.costUnpricedCalls).toBe(1);
  });

  it('★ 故障转移后按 meta 的**实际**模型记账（不是任务快照的模型）', () => {
    const task = fakeTask({ modelId: 'snapshot-model' });
    recordTaskUsage(task, 'main',
      { inputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 5 },
      { platformId: 'p_other', modelId: 'deepseek-v4-flash' }, { content: '', reasoning: '' });

    const ev = db.prepare('SELECT * FROM usage_event WHERE conversation_id=?').get(task.conversationId) as any;
    expect(ev.model_id).toBe('deepseek-v4-flash');
    expect(ev.platform_id).toBe('p_other');
  });

  it('子智能体与主循环同库不同源（对账时能分开看）', () => {
    const task = fakeTask();
    recordTaskUsage(task, 'sub_agent',
      { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 },
      { platformId: 'p_cost', modelId: 'deepseek-v4-pro' }, { content: '', reasoning: '' });
    recordTaskUsage(task, 'main',
      { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 },
      { platformId: 'p_cost', modelId: 'deepseek-v4-pro' }, { content: '', reasoning: '' });

    const evs = db.prepare('SELECT source, cost_cny FROM usage_event WHERE conversation_id=? ORDER BY created_at').all(task.conversationId) as any[];
    expect(evs.map((e) => e.source)).toEqual(['sub_agent', 'main']);
    const acc = db.prepare('SELECT cost_cny FROM conversation_usage WHERE conversation_id=?').get(task.conversationId) as any;
    expect(acc.cost_cny).toBeCloseTo(0.02184, 8); // 两次相等累加
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 功能性：noticeCostAtRoundEnd（D4：只提醒，程序不停）
// ─────────────────────────────────────────────────────────────────────────────

describe('noticeCostAtRoundEnd：默认配置下**永不停**', () => {
  it('花 ¥0.01（远低于 ¥5 默认档）⇒ 不提醒，但仍 emit task:cost 累计', () => {
    const task = fakeTask();
    recordTaskUsage(task, 'main',
      { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 },
      { platformId: 'p_cost', modelId: 'deepseek-v4-pro' }, { content: '', reasoning: '' });

    const kind = noticeCostAtRoundEnd(task);
    expect(kind).toBeNull();
    const costEv = task.events.filter((e) => e.type === 'task:cost');
    expect(costEv.length).toBe(1);
    expect(costEv[0].usedCny).toBeCloseTo(0.01092, 8);
    expect(costEv[0].limitCny).toBe(5); // 默认档位
  });

  it('★ 跨档位 ⇒ 提醒一次（exceeded），且**再判定同档不重复**（整倍数去重，防刷屏）', () => {
    setCostBudget({ enabled: true, limitCny: 0.001, warnRatio: 0.8, hardStopCny: 0 });
    const task = fakeTask();
    const usage = { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 };
    recordTaskUsage(task, 'main', usage, { platformId: 'p_cost', modelId: 'deepseek-v4-pro' }, { content: '', reasoning: '' });

    const k1 = noticeCostAtRoundEnd(task);
    expect(k1).toBe('exceeded');
    const noticeEv = task.events.filter((e) => e.type === 'task:cost_notice');
    expect(noticeEv.length, '★ 跨档只提醒一次').toBe(1);
    expect(noticeEv[0].text).toContain('任务继续运行，不会自动停止');
    expect(noticeEv[0].usedCny).toBeCloseTo(0.01092, 8);

    // 同样金额再判一次（模拟下一轮）⇒ 档位没升，不得再提醒
    const k2 = noticeCostAtRoundEnd(task);
    expect(k2).toBeNull();
    expect(task.events.filter((e) => e.type === 'task:cost_notice').length).toBe(1);
  });

  it('★ 提醒**不落会话消息**（默认 persistWarningInChat=false ⇒ 不进上下文，坑 #15）', () => {
    setCostBudget({ enabled: true, limitCny: 0.001, warnRatio: 0.8, hardStopCny: 0 });
    const task = fakeTask();
    recordTaskUsage(task, 'main',
      { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 },
      { platformId: 'p_cost', modelId: 'deepseek-v4-pro' }, { content: '', reasoning: '' });
    noticeCostAtRoundEnd(task);
    expect(task.events.some((e) => e.type === 'message:added'), '★ 提醒不得进消息流（否则推高后续输入成本）').toBe(false);
  });

  it('★ 有未计价调用时，提醒文案恒定带「另有 N 次未计价」（防换未配价模型绕过，坑 #18）', () => {
    setCostBudget({ enabled: true, limitCny: 0.001, warnRatio: 0.8, hardStopCny: 0 });
    const task = fakeTask();
    recordTaskUsage(task, 'main',
      { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 },
      { platformId: 'p_cost', modelId: 'deepseek-v4-pro' }, { content: '', reasoning: '' });
    recordTaskUsage(task, 'main',
      { inputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 10 },
      { platformId: 'p_cost', modelId: 'unknown-model-abc' }, { content: '', reasoning: '' });
    noticeCostAtRoundEnd(task);
    const ev = task.events.find((e) => e.type === 'task:cost_notice');
    expect(ev.text).toContain('另有 1 次调用未配置价格');
  });

  it('★ enabled=false ⇒ 不提醒但仍记账（别做成"关了就不记账"）', () => {
    setCostBudget({ enabled: false, limitCny: 0.001, warnRatio: 0.8, hardStopCny: 0 });
    const task = fakeTask();
    recordTaskUsage(task, 'main',
      { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 },
      { platformId: 'p_cost', modelId: 'deepseek-v4-pro' }, { content: '', reasoning: '' });
    expect(noticeCostAtRoundEnd(task)).toBeNull();
    expect(task.events.some((e) => e.type === 'task:cost_notice')).toBe(false);
    const acc = db.prepare('SELECT cost_cny FROM conversation_usage WHERE conversation_id=?').get(task.conversationId) as any;
    expect(acc.cost_cny).toBeCloseTo(0.01092, 8);
  });
});

describe('noticeCostAtRoundEnd：hardStopCny 是 D4 唯一例外', () => {
  it('自填 hardStopCny 且触达 ⇒ 返回 hard_stop（走停止路径）；默认 0 时永不出现在这里', () => {
    setCostBudget({ enabled: true, limitCny: 5, warnRatio: 0.8, hardStopCny: 0.005 });
    const task = fakeTask();
    recordTaskUsage(task, 'main',
      { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 },
      { platformId: 'p_cost', modelId: 'deepseek-v4-pro' }, { content: '', reasoning: '' });
    expect(noticeCostAtRoundEnd(task), '★ 0.01092 > 0.005 ⇒ 硬停').toBe('hard_stop');
  });

  it('★ 出厂默认（无 app_config 行）⇒ hardStopCny=0，花多少钱都不停', () => {
    const task = fakeTask();
    // 不 setCostBudget ⇒ 读 DEFAULT_COST_BUDGET（hardStopCny=0）
    recordTaskUsage(task, 'main',
      { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 },
      { platformId: 'p_cost', modelId: 'deepseek-v4-pro' }, { content: '', reasoning: '' });
    expect(noticeCostAtRoundEnd(task)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 静态守卫：接线的**位置与形状**（这些判据功能性测试覆盖不到）
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('静态守卫：D4 硬约束（成本不进停止语义）', () => {
  const LTM = strip(read('apps/server/src/llm-task-manager.ts'));

  it('2026-10-18：token/墙钟预算闸已退役（checkTaskBudgetHit 不得残留在主循环）', () => {
    // 用户决策「不要程序自动停，费用提醒就好」→ 预算闸整体退役，stop 语义只剩费用硬停。
    expect(LTM, '★ 预算闸残留 —— "不要程序自动停"的决策被回退了？').not.toContain('checkTaskBudgetHit');
    // 反向：整个文件里不得出现 kind: 'cost' 的停止语义
    expect(LTM).not.toContain("kind: 'cost'");
  });

  it('noticeCostAtRoundEnd 挂在轮末（emittedStep++ 之前），是任务里唯一的费用类闸', () => {
    const noticeAt = LTM.indexOf('noticeCostAtRoundEnd(task)');
    const stepIncAt = LTM.indexOf('emittedStep++');
    expect(noticeAt).toBeGreaterThan(-1);
    expect(stepIncAt, '锚点失效？').toBeGreaterThan(-1);
    expect(noticeAt, '★ 必须在"继续下一轮 ReAct"之前').toBeLessThan(stepIncAt);
  });

  it('子智能体循环的工具累积已收敛到 accumulateToolCallDeltas（唯一实现，无第二份内联拼接）', () => {
    // 旧的第二份实现特征：裸拼接 arguments
    expect(LTM, '★ 不得再有第二份朴素拼接（Responses 等长重发会拼成非法 JSON）')
      .not.toContain('(prev.function?.arguments || \'\') + (tc.function!.arguments || \'\')');
    expect(LTM.split('accumulateToolCallDeltas(').length, '主循环 + 子循环两处调用')
      .toBeGreaterThanOrEqual(3);
  });

  it('子智能体用量同步进父任务 totalTokens（坑 #8）', () => {
    expect(LTM).toContain('task.totalTokens = (task.totalTokens || 0) + (usageTokens');
  });

  it('四类调用源都接了记账（main / sub_agent / summary / judge）', () => {
    // 主循环：usageRecorder 闭包 + streamOpts/重试两处都挂 onUsage
    expect(LTM, '主循环缺少 usageRecorder').toContain("const usageRecorder = (source: 'main' | 'sub_agent' | 'summary' | 'judge')");
    expect(LTM.split("onUsage: usageRecorder('main')").length - 1, '★ 主路径 + 文本模式重试两条都必须挂（漏一条那笔钱不进账）').toBe(2);
    // 子智能体：subUsageRecorder + 两条 chatStream 路径
    expect(LTM, '子智能体缺少 recorder').toContain('const subUsageRecorder =');
    expect(LTM.split('onUsage: subUsageRecorder').length - 1).toBe(2);
    // judge：decideAutoContinue + maybeReplanOnContinue
    expect(LTM, 'judge（结账自评）缺少记账').toContain("recordTaskUsage(task, 'judge'");
    expect(LTM, 'judge（计划重划）缺少记账').toContain("recordTaskUsage(args.task, 'judge'");
    // sub_agent：流式 recorder + 两处 summarizeOnMaxSteps 透传
    expect(LTM, 'sub_agent 流式缺少记账').toContain("recordTaskUsage(task, 'sub_agent'");
    expect(LTM.split("recordTaskUsage(task, 'sub_agent'").length - 1, '流式 + 两次 summarizeOnMaxSteps').toBe(3);
    // summary：经 summarizeOnMaxSteps 的 onUsage 参数透传
    expect(LTM).toContain('onUsage?:');
    expect(LTM).toContain('onUsage,');
  });

  it('提醒时先写进度再发文案（坑 #16：任务不停，"进度已写入"必须当下为真）', () => {
    const fn = strip(read('apps/server/src/llm-task-manager.ts'));
    const noticeIdx = fn.indexOf("appendTaskProgress(task.conversationId, 'cost_notice'");
    const emitIdx = fn.indexOf("type: 'task:cost_notice'");
    expect(noticeIdx).toBeGreaterThan(-1);
    expect(emitIdx).toBeGreaterThan(noticeIdx);
  });
});

describe('静态守卫：client 侧 onUsage 钩子形状', () => {
  const CLIENT = strip(read('packages/core/src/llm/client.ts'));

  it('chatStream 与 chat 的 options 都带 onUsage', () => {
    const streamSig = CLIENT.slice(CLIENT.indexOf('async *chatStream('), CLIENT.indexOf('private async *chatStreamInner('));
    expect(streamSig).toContain('onUsage?: UsageCallback');
    const chatSig = CLIENT.slice(CLIENT.indexOf('async chat('), CLIENT.indexOf('private async chatInner('));
    expect(chatSig).toContain('onUsage?: UsageCallback');
  });

  it('钩子用的是 usage-hook.ts 的纯函数实现（不是类内私有第三份）', () => {
    expect(CLIENT).toContain("from './usage-hook.js'");
    expect(CLIENT).toContain('yield* withUsageHook(inner, options.onUsage, this.usageMeta())');
  });

  it('非流式 OpenAI 路径也产出 detail（此前漏了，非流式调用全走估算）', () => {
    expect(CLIENT).toContain('detail: normalizeOpenAiUsage(data.usage)');
  });
});
