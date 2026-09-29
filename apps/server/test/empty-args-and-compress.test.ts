// 空参防护（第二轮）+ 分级压缩 + 保守上下文窗口 —— 正式测试类。
//
// ★ 守的核心缺陷：
//   ① 主因（历史回放丢参）修好后，**解析层还有 3 条残留路径**仍会产出/放过空参：
//      · `<function=x></function>` 参数体缺失 → 静默产出 `arguments: "{}"`；
//      · `hasEmptyArgs` 判据是"**全部**空"→ 混合批次里那个空参调用不会被补救；
//      · content 有工具块时不看 reasoning → 参数只吐在 reasoning 里就丢了。
//   ② `ContextWindow` 只有"整段摘要"一档（悬崖式），没有"先裁剪老工具输出"的分级档。
//   ③ 模型未声明上下文窗口时兜底 1M → 阈值 = 52 万 → 等于关掉压缩。
//
// ★ 手法：**直接调用真实实现**（不是复刻语义），确保实现改坏时测试真会红。
import { describe, expect, it } from 'vitest';
import { ContextWindow, capLongText, COMPRESS_TOOL_CAP_CHARS } from '@yan-zhi/core';
import { parseTextModeToolCalls, missingRequiredArgs } from '../src/llm-task-manager.js';
import { resolveContextWindow, SAFE_CONTEXT_WINDOW, DEFAULT_CONTEXT_WINDOW } from '../src/constants.js';

/** 工具定义（带必填参数） */
const defs = [
  { type: 'function', function: { name: 'python_exec', parameters: { type: 'object', required: ['code'], properties: { code: { type: 'string' } } } } },
  { type: 'function', function: { name: 'file_read', parameters: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } } } },
  // 无必填参数的工具：不产调用 = 误杀合法调用，必须放行
  { type: 'function', function: { name: 'list_sub_agents', parameters: { type: 'object', properties: {} } } },
];

describe('解析层空参防护：不产出"假空参"调用', () => {
  it('XML 参数体缺失 + 有必填参数 → 不产出调用，记入 skipped', () => {
    const r = parseTextModeToolCalls('<function=python_exec></function>', defs);
    expect(r.toolCalls).toHaveLength(0);
    expect(r.skipped).toEqual(['python_exec']);
  });

  it('XML 参数体缺失 + **无必填参数** → 照常产出（不误杀合法无参调用）', () => {
    const r = parseTextModeToolCalls('<function=list_sub_agents></function>', defs);
    expect(r.toolCalls.map((t) => t.name)).toEqual(['list_sub_agents']);
    expect(r.skipped).toHaveLength(0);
  });

  it('拿不到工具定义（toolDefs 缺省）→ 保守产出，绝不误杀', () => {
    // 关键取舍：宁可放过一个真空参，也不能把"无参工具"全部干掉
    const r = parseTextModeToolCalls('<function=python_exec></function>');
    expect(r.toolCalls).toHaveLength(1);
    expect(r.skipped).toHaveLength(0);
  });

  it('[TOOL_CALL] 只有 name 没有 arguments + 有必填参数 → 不产出调用', () => {
    const r = parseTextModeToolCalls('[TOOL_CALL]{"name":"python_exec"}[/TOOL_CALL]', defs);
    expect(r.toolCalls).toHaveLength(0);
    expect(r.skipped).toEqual(['python_exec']);
  });

  it('参数完整时正常产出，且 skipped 为空（正例对照：别把好调用也拦了）', () => {
    const r = parseTextModeToolCalls('[TOOL_CALL]{"name":"python_exec","arguments":{"code":"print(1)"}}[/TOOL_CALL]', defs);
    expect(r.toolCalls).toHaveLength(1);
    expect(JSON.parse(r.toolCalls[0].arguments)).toEqual({ code: 'print(1)' });
    expect(r.skipped).toHaveLength(0);
  });

  /**
   * ★★★ 本组最重要的一条：**两种"空"的正确处置是相反的**（2026-09-29 第二次修正）。
   *   我第一版把 `{}` 也跳过 —— 结果破坏了既有的**自纠链路**：
   *   模型显式写 `{}` 时本该产出调用 → 由后端 missingRequiredArgs 回一条
   *   "缺 query 参数，请重调 X" → 模型据此修正 → 任务继续（react-loop 场景2 守的就是它）。
   *   跳过它会让模型**拿不到任何反馈**。
   *   ⇒ 判据是「参数**键**是否存在」，不是「值是否为空对象」。
   */
  it('★★★ 显式写了空参数体（arguments:{}）→ 必须**照常产出**（交给后端回自纠提示）', () => {
    const r = parseTextModeToolCalls('[TOOL_CALL]{"name":"python_exec","arguments":{}}[/TOOL_CALL]', defs);
    expect(r.toolCalls, '★ 显式 {} 被跳过 → 模型拿不到"缺哪个参数"的反馈，无法自纠').toHaveLength(1);
    expect(r.toolCalls[0].name).toBe('python_exec');
    expect(r.skipped).toHaveLength(0);
  });

  it('★★★ XML 显式空对象（<function=x>{}</function>）同样必须产出', () => {
    const r = parseTextModeToolCalls('<function=python_exec>{}</function>', defs);
    expect(r.toolCalls).toHaveLength(1);
    expect(r.skipped).toHaveLength(0);
  });

  it('★★ 同一工具多次调用（参数不同）必须全部保留 —— 不能按工具名去重', () => {
    // 实测形态：一次输出两个 web_search（不同 query）。按名字去重会吃掉第二个。
    const src = '[TOOL_CALL]{"name":"python_exec","arguments":{"code":"print(1)"}}[/TOOL_CALL]'
      + '[TOOL_CALL]{"name":"python_exec","arguments":{"code":"print(2)"}}[/TOOL_CALL]';
    const r = parseTextModeToolCalls(src, defs);
    expect(r.toolCalls, '★ 同名不同参的调用被去重吃掉了').toHaveLength(2);
    expect(JSON.parse(r.toolCalls[0].arguments).code).toBe('print(1)');
    expect(JSON.parse(r.toolCalls[1].arguments).code).toBe('print(2)');
  });

  it('反例对照：修复前的写法会把 `<function=x></function>` 变成 "{}"', () => {
    // 固定旧行为，证明这条缺陷真实存在（否则本组测试是自说自话）
    const oldXml = /<function\s*=\s*(\w+)\s*>\s*(\{[\s\S]*?\})?\s*<\/function>/gi;
    const m = oldXml.exec('<function=python_exec></function>')!;
    let args: any = {};
    if (m[2]) args = JSON.parse(m[2]);
    expect(JSON.stringify(args)).toBe('{}');
  });
});

describe('missingRequiredArgs：空参判定口径', () => {
  it('缺必填 → 报出缺失参数名', () => {
    expect(missingRequiredArgs(defs, 'python_exec', {})).toEqual(['code']);
    expect(missingRequiredArgs(defs, 'file_read', {})).toEqual(['path']);
  });
  it('空字符串 / 空数组也算缺失（模型常这样"给了但又没给"）', () => {
    expect(missingRequiredArgs(defs, 'python_exec', { code: '   ' })).toEqual(['code']);
    expect(missingRequiredArgs(defs, 'file_read', { path: [] })).toEqual(['path']);
  });
  it('参数齐 → 不报；无 required 的工具 → 不报（不误拦）', () => {
    expect(missingRequiredArgs(defs, 'python_exec', { code: 'print(1)' })).toEqual([]);
    expect(missingRequiredArgs(defs, 'list_sub_agents', {})).toEqual([]);
  });
});

describe('ContextWindow 分级压缩：先裁剪老工具输出，再考虑摘要', () => {
  const toolMsg = (content: string) => ({
    id: 't', conversationId: 'c', role: 'tool' as const, content, toolCallId: 'call_1', createdAt: 0,
  });

  it('只有超长工具输出撑爆上下文时 → 裁剪即够，**不摘要、不丢消息**', async () => {
    const cw = new ContextWindow(2000, 6); // 阈值很小
    const msgs: any[] = [
      { id: 'u', conversationId: 'c', role: 'user', content: '跑一下', createdAt: 0 },
      toolMsg('x'.repeat(20_000)), // 单条超长
    ];
    const out = await cw.compress(msgs);
    // 关键：消息条数不变（没有换成一条 summary），且旧 tool 被裁剪
    expect(out).toHaveLength(2);
    expect(out.some((m) => m.id === 'summary')).toBe(false);
    expect((out[1].content || '').length).toBeLessThan(20_000);
    expect(out[1].content).toContain('已压缩');
  });

  it('保留窗口内的 tool 不被"结构破坏"：tool 消息仍在、toolCallId 保留', async () => {
    const cw = new ContextWindow(100, 3);
    const msgs: any[] = [
      { id: 'u', conversationId: 'c', role: 'user', content: 'q'.repeat(3000), createdAt: 0 },
      { id: 'a', conversationId: 'c', role: 'assistant', content: 'a'.repeat(3000), createdAt: 0 },
      toolMsg('y'.repeat(3000)),
      toolMsg('z'.repeat(3000)),
    ];
    const out = await cw.compress(msgs);
    // 裁剪后仍超阈值 → 走摘要；保留窗口里的 tool 必须还是 tool 且带 toolCallId
    const keptTools = out.filter((m) => m.role === 'tool');
    for (const t of keptTools) expect(t.toolCallId).toBe('call_1');
  });

  it('capLongText：保留首尾、中间打标记；未超限原样返回', () => {
    const short = 'abc';
    expect(capLongText(short, 100)).toBe(short);
    const long = 'HEAD' + 'm'.repeat(10_000) + 'TAIL';
    const capped = capLongText(long, 200);
    expect(capped.length).toBeLessThanOrEqual(200);
    expect(capped.startsWith('HEAD')).toBe(true);
    expect(capped.endsWith('TAIL')).toBe(true);
  });

  it('默认裁剪上限是 8KB（与 COMPRESS_TOOL_CAP_CHARS 一致）', () => {
    expect(COMPRESS_TOOL_CAP_CHARS).toBe(8 * 1024);
    const text = 'x'.repeat(COMPRESS_TOOL_CAP_CHARS + 100);
    expect(capLongText(text).length).toBeLessThanOrEqual(COMPRESS_TOOL_CAP_CHARS);
  });
});

describe('resolveContextWindow：未声明窗口时按 32K 保守估算（否则等于关掉压缩）', () => {
  it('非法/缺失 → SAFE_CONTEXT_WINDOW', () => {
    for (const bad of [0, -1, NaN, undefined, null, 'abc', '']) {
      expect(resolveContextWindow(bad)).toBe(SAFE_CONTEXT_WINDOW);
    }
  });

  it('★ 恰好等于建库默认 1M → 视为"用户没填"，退回 32K', () => {
    // 这是最关键的一条：此前兜底 1M → 阈值 52 万 → 压缩几乎永不触发
    expect(resolveContextWindow(DEFAULT_CONTEXT_WINDOW)).toBe(SAFE_CONTEXT_WINDOW);
  });

  it('用户显式声明的合理窗口 → 原样采用', () => {
    expect(resolveContextWindow(131072)).toBe(131072);
    expect(resolveContextWindow(32_768)).toBe(32_768);
  });

  it('结果换算成的阈值必须显著小于窗口（保证压缩会触发）', () => {
    const cw = ContextWindow.forContextWindow(resolveContextWindow(DEFAULT_CONTEXT_WINDOW), 6);
    expect((cw as any).maxTokens).toBeLessThan(DEFAULT_CONTEXT_WINDOW);
    expect((cw as any).maxTokens).toBe(Math.floor(SAFE_CONTEXT_WINDOW * 0.5));
  });
});