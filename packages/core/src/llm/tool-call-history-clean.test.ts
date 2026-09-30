// 「存量坏历史里的空参调用被原样回放」的收口回归测试（2026-09-30，用户要求「污染源收口」）。
//
// ★★★ 收口点（决定性实验定位，用**编译产物**跑真实生产库会话得出）：
//   2026-09-29/30 两轮修复后，空参**新增**已归零（09-30 新会话 061202ec 全程 0%），
//   但**存量坏历史**仍在污染模型上下文 ——
//     老会话 deed2862 库内 69.3% 空参 → 走完整 `sanitizeToolMessages` 后**仍是 69.3%**
//   （id 自愈生效了，不再抹历史；但这些坏样本被原样回放）。
//
//   坏样本在库里是**成组**的：
//     assistant: content=""  tool_calls=[{name:"python_exec", arguments:"{}"}]
//     tool:      tool_call_id=<同 id>  content="工具 python_exec 未执行：arguments 缺少必填参数（code）…"
//   —— 每轮都完整演示「可以不带参数」，模型照抄 → 自我强化退化。
//
// ★ 处置：**发送前**（只读，不写库）把「未执行的空参调用 + 它的错误回执」整组剥离。
//   判据三条同时成立（保守、不误伤）：① 参数为空；② 回执是我们的"未执行"拦截文案；
//   ③ 剥离后 assistant 无正文则整条去掉，有正文则保留正文。
import { describe, expect, it } from 'vitest';
import { LlmClient } from './client';

const client = new LlmClient({ id: 'p', apiUrl: 'http://x' } as any, { modelId: 'm' } as any);
/** 走真实链路：toApiMessage（内部形态→API 形态）→ sanitizeToolMessages（发送前清洗） */
const send = (msgs: any[]) =>
  (client as any).sanitizeToolMessages(msgs.map((m) => (client as any).toApiMessage(m)), true);

/** 生产库里"未执行"拦截回执的真实文案（判据锚点） */
const UNEXECUTED = '工具 python_exec 未执行：arguments 缺少必填参数（code）。常见原因是上一轮模型输出被 maxTokens 截断导致参数丢失。';

describe('存量坏历史：空参调用组被剥离（收口）', () => {
  it('★★★ 核心：空参调用 + 未执行回执 整组不进上下文', () => {
    const out = send([
      { role: 'user', content: '开始任务' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_bad', type: 'function', function: { name: 'python_exec', arguments: '{}' } }],
      },
      { role: 'tool', content: UNEXECUTED, toolCallId: 'call_bad' },
      { role: 'assistant', content: '我换个方式来做' },
    ]);

    // 空参调用不得出现在发送内容里
    const emptiedCalls = out
      .filter((m: any) => m.role === 'assistant' && m.tool_calls?.length)
      .flatMap((m: any) => m.tool_calls)
      .filter((tc: any) => {
        const a = tc.function?.arguments;
        return a === '{}' || a === '' || a == null;
      });
    expect(emptiedCalls, '★ 空参调用被回放 = 模型会照抄').toHaveLength(0);
    // 错误回执也不应出现（它对模型无有效信息）
    expect(out.some((m: any) => m.role === 'tool' && String(m.content).includes('未执行'))).toBe(false);
    // 正常的对话文本必须保留
    expect(out.some((m: any) => m.content === '开始任务')).toBe(true);
    expect(out.some((m: any) => m.content === '我换个方式来做')).toBe(true);
  });

  it('★★ 不误伤：模型给了参数的真实调用（哪怕工具报错）必须保留', () => {
    const goodCall = { id: 'call_ok', type: 'function', function: { name: 'python_exec', arguments: '{"code":"print(1)"}' } };
    const out = send([
      { role: 'user', content: '跑一下' },
      { role: 'assistant', content: '', toolCalls: [goodCall] },
      { role: 'tool', content: 'NameError: name x is not defined', toolCallId: 'call_ok' },
    ]);
    const kept = out.filter((m: any) => m.role === 'assistant' && m.tool_calls?.length);
    expect(kept, '★ 有参数的真实调用被误删了').toHaveLength(1);
    expect(kept[0].tool_calls[0].function.arguments).toBe('{"code":"print(1)"}');
    expect(out.filter((m: any) => m.role === 'tool'), '★ 真实工具结果被误删了').toHaveLength(1);
  });

  it('★★ 不误伤：真实工具回执里含"缺少必填参数"但**不是我们的拦截文案**时不剥', () => {
    // 例如某个外部命令自己报的参数错误（没有"未执行：arguments 缺少必填参数"这个精确锚点）
    const out = send([
      { role: 'assistant', content: '', toolCalls: [{ id: 'c1', type: 'function', function: { name: 'cmd_exec', arguments: '{}' } }] },
      { role: 'tool', content: 'error: the following arguments are required: --out', toolCallId: 'c1' },
    ]);
    // 判据锚点不匹配 → 不剥；但此调用参数为空、回执存在（配对成立）→ 仍会保留（不误删）
    expect(out.filter((m: any) => m.role === 'tool')).toHaveLength(1);
  });

  it('★★ 混合批次：同一批里只剥空的坏调用，保留有参数的好调用', () => {
    const out = send([
      {
        role: 'assistant',
        content: '我来处理',
        toolCalls: [
          { id: 'bad', type: 'function', function: { name: 'python_exec', arguments: '{}' } },
          { id: 'good', type: 'function', function: { name: 'file_read', arguments: '{"path":"a.txt"}' } },
        ],
      },
      { role: 'tool', content: UNEXECUTED, toolCallId: 'bad' },
      { role: 'tool', content: 'file content', toolCallId: 'good' },
    ]);
    const asst = out.filter((m: any) => m.role === 'assistant' && m.tool_calls?.length);
    expect(asst).toHaveLength(1);
    expect(asst[0].tool_calls.map((t: any) => t.function.name), '★ 只应保留好调用').toEqual(['file_read']);
    expect(asst[0].content, '★ 正文必须保留').toBe('我来处理');
    const tools = out.filter((m: any) => m.role === 'tool');
    expect(tools).toHaveLength(1);
    expect(tools[0].content).toBe('file content');
  });

  it('★★ 反例对照：修复前的行为会把空参调用原样送上去（固定缺陷现场）', () => {
    const raw = [
      { role: 'assistant', content: '', tool_calls: [{ id: 'b', type: 'function', function: { name: 'python_exec', arguments: '{}' } }] },
      { role: 'tool', content: UNEXECUTED, tool_call_id: 'b' },
    ];
    // 旧逻辑：配对成立 → 原样保留（这就是"存量坏历史原样回放"）
    const asstRaw = raw[0] as { tool_calls: any[] };
    const ids = new Set(raw.filter((m) => m.role === 'tool' && m.tool_call_id).map((m) => m.tool_call_id));
    const keptOld = asstRaw.tool_calls.filter((tc: any) => tc?.id && ids.has(tc.id));
    expect(keptOld, '旧逻辑必然保留空参调用').toHaveLength(1);

    // 新逻辑（走真实链路）必须剥离
    const fixed = send([
      { role: 'assistant', content: '', toolCalls: [{ id: 'b', type: 'function', function: { name: 'python_exec', arguments: '{}' } }] },
      { role: 'tool', content: UNEXECUTED, toolCallId: 'b' },
    ]);
    expect(
      fixed.some((m: any) => m.role === 'assistant' && m.tool_calls?.length),
      '★ 新逻辑必须剥离空参调用组',
    ).toBe(false);
    expect(fixed.some((m: any) => m.role === 'tool')).toBe(false);
  });

  it('★ 剥离后不留"孤儿"：后续正常调用不受牵连', () => {
    const out = send([
      { role: 'assistant', content: '', toolCalls: [{ id: 'b', type: 'function', function: { name: 'python_exec', arguments: '{}' } }] },
      { role: 'tool', content: UNEXECUTED, toolCallId: 'b' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'g', type: 'function', function: { name: 'file_list', arguments: '{"path":"."}' } }] },
      { role: 'tool', content: 'a.txt\nb.txt', toolCallId: 'g' },
    ]);
    const asst = out.filter((m: any) => m.role === 'assistant' && m.tool_calls?.length);
    expect(asst).toHaveLength(1);
    expect(asst[0].tool_calls[0].id).toBe('g');
    const tools = out.filter((m: any) => m.role === 'tool');
    expect(tools).toHaveLength(1);
    expect(tools[0].tool_call_id, '★ 配对必须仍然成立').toBe('g');
  });
});