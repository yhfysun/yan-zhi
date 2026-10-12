/**
 * tool 回执 · 组头相邻性判定 —— 守门测试（2026-10-12）。
 *
 * ★★★ 背景（会话 f0a901e3 实锤上游 400 `messages 参数非法` / code 1214）：
 *   并发 `call_agent` 的组头先落库、主循环被追加消息推进新轮次，子结果 109 秒后才回来
 *   → 组头 #1183 与回执 #1200 之间夹了 16 条 → OpenAI 相邻约束被破坏 → 整轮 400 失败。
 *
 * 本文件两部分：
 *   A. 纯逻辑 `gapBetweenToolHeadAndReceipt` 的行为测试（真实的「夹了多少条」判定）
 *   B. 源码守卫：`insertToolMessageAndEmit` 必须真的调它 + 必须打 warn（防接线被删）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  gapBetweenToolHeadAndReceipt,
  shouldWarnOnGap,
  type AdjacencyProbe,
} from '../src/services/tool-receipt-adjacency.js';

const head = (id: string): AdjacencyProbe => ({ role: 'assistant', toolCalls: [{ id }] });
const tool = (id: string): AdjacencyProbe => ({ role: 'tool', toolCallId: id });
const user: AdjacencyProbe = { role: 'user' };

describe('gapBetweenToolHeadAndReceipt · 纯逻辑（2026-10-12）', () => {
  it('★★★ 真实现场：组头之后夹 18 条 → gap=18（需告警）', () => {
    // 组头 h1 → user(1) → 8 组 assistant/tool(16) → 结论正文(1) = 18 条；然后才落回执
    const middle: AdjacencyProbe[] = [user];
    for (let n = 0; n < 8; n++) {
      middle.push(head(`c${n}`), tool(`c${n}`));
    }
    middle.push({ role: 'assistant' }); // 结论正文
    const tail = [head('far'), ...middle]; // 末尾 = 最新（也就是组头之后的那堆）
    expect(tail.length - 1).toBe(18); // 断言构造正确
    expect(gapBetweenToolHeadAndReceipt(tail, 'far')).toBe(18);
    expect(shouldWarnOnGap(18)).toBe(true);
  });

  it('★ 健康：组头就是最后一条 → gap=0（不告警）', () => {
    const tail = [user, head('c1')];
    expect(gapBetweenToolHeadAndReceipt(tail, 'c1')).toBe(0);
    expect(shouldWarnOnGap(0)).toBe(false);
  });

  it('★ 组头不在 tail 里 → -1（另由 orphan 逻辑处理，不告警）', () => {
    const tail = [user, tool('nope')];
    expect(gapBetweenToolHeadAndReceipt(tail, 'missing')).toBe(-1);
    expect(shouldWarnOnGap(-1)).toBe(false);
  });

  it('★ 同一 id 多次出现：取**最近**的组头（最大索引处）', () => {
    const tail = [head('dup'), user, head('dup')]; // 第二次在末尾
    expect(gapBetweenToolHeadAndReceipt(tail, 'dup')).toBe(0);
  });

  it('★ 空 toolCallId → -1，不抛错', () => {
    expect(gapBetweenToolHeadAndReceipt([user], '')).toBe(-1);
    expect(gapBetweenToolHeadAndReceipt([user], undefined as any)).toBe(-1);
  });

  it('★ 无 tool_calls 的 assistant / 无 id 的 tool_call 不误判为组头', () => {
    const tail = [{ role: 'assistant' }, { role: 'assistant', toolCalls: [] }, { role: 'assistant', toolCalls: [{ id: undefined }] }];
    expect(gapBetweenToolHeadAndReceipt(tail, 'x')).toBe(-1);
  });
});

describe('接线守卫 · insertToolMessageAndEmit 必须调判据并告警', () => {
  const REPO = resolve(__dirname, '..', '..', '..');
  const strip = (s: string) =>
    // ★ 顺序敏感：先剥块注释再剥行注释（与 background-subagent.test.ts 同一防坑）
    s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  const LTM = strip(readFileSync(resolve(REPO, 'apps/server/src/llm-task-manager.ts'), 'utf8'));

  it('必须导入判据模块', () => {
    expect(LTM).toMatch(/from\s+'\.\/services\/tool-receipt-adjacency\.js'/);
  });

  it('insertToolMessageAndEmit 内必须调用 gapBetweenToolHeadAndReceipt + shouldWarnOnGap', () => {
    const start = LTM.indexOf('function insertToolMessageAndEmit(');
    expect(start).toBeGreaterThan(-1);
    const end = LTM.indexOf('\nfunction ', start + 1);
    const body = LTM.slice(start, end > 0 ? end : start + 2000);
    expect(body).toMatch(/gapBetweenToolHeadAndReceipt\(/);
    expect(body).toMatch(/shouldWarnOnGap\(/);
    expect(body).toMatch(/logger\.warn\(/);
    // 可观测性失败绝不能影响落库：必须有 try/catch 兜底
    expect(body).toMatch(/catch\s*\{/);
  });

  it('查询尾巴必须按 created_at DESC 取回并 reverse 成旧→新（判据方向不能反）', () => {
    const start = LTM.indexOf('function insertToolMessageAndEmit(');
    const end = LTM.indexOf('\nfunction ', start + 1);
    const body = LTM.slice(start, end > 0 ? end : start + 2000);
    expect(body).toMatch(/ORDER BY created_at DESC/);
    expect(body).toMatch(/\.reverse\(\)/);
  });
});
