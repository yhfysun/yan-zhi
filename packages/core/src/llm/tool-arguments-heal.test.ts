/**
 * tool_call arguments 合法性自愈 + 截断整组剥离 —— 守门测试（2026-10-18，用户实报 high）。
 *
 * ★★★ 背景（生产会话 3f646e6a「手机定时拍照传输桌面应用开发」，20:11:33 实报）：
 *   `LLM 请求失败: 400 Bad Request {"error":{"code":"1214","message":"The messages
 *   parameter is illegal. Please check the documentation."}}` —— 13 秒内连吃两个，任务 failed。
 *
 *   根因（生产库 hex 级实据）：模型一批 5 个调用里，python_exec 的 arguments 是 68KB
 *   长 JSON，**生成到一半被 max_tokens 截断**（尾部 `...await capture.stop();\n      if`，
 *   无闭合引号/花括号）。工具侧拒绝执行且回执落库，但原始坏串留在历史里；
 *   三道既有自愈（id/配对/顺序）都不校验 arguments 内容 ⇒ 原样回放 ⇒ GLM 1214。
 *   直到上下文压缩把毒丸稀释进摘要才自愈。
 *
 * ★ 本测试钉住：
 *   ① 纯函数 healToolArguments：恒等 / 非法转义修复（语义无损）/ 截断→null；
 *   ② 真实链路（toApiMessage → sanitizeToolMessages）：截断调用**连同回执整组剥离**、
 *      好调用一字不动、每个发出的 arguments 都能 JSON.parse（GLM 1214 的直接判据）。
 *
 * ★ 写测试的教训：反斜杠转义在源码字面量里极易错（首版测试把 `\U` 写成 `\\U` 又漏了
 *   收尾引号，测了个不存在的形态）—— 一律用 BQ 显式拼接构造模型原始输出。
 */
import { describe, expect, it } from 'vitest';
import { healToolArguments } from './tool-arguments-heal';
import { LlmClient } from './client';

const BQ = String.fromCharCode(92); // 反斜杠（模型吐 JSON 时该加倍没加倍的那个字符）

const client = new LlmClient({ id: 'p', apiUrl: 'http://x' } as any, { modelId: 'm' } as any);
/** 走真实链路：toApiMessage（内部形态→API 形态）→ sanitizeToolMessages（发送前清洗） */
const send = (msgs: any[]) =>
  (client as any).sanitizeToolMessages(msgs.map((m) => (client as any).toApiMessage(m)), true);

/** 非法转义坏参（\U \D 未加倍；引号转义正常、结构闭合）——模型本意 code = `print(1)\nBASE = r"C:\Users\Desktop"` */
const ESCAPE_BAD =
  '{"code":"print(1)' + BQ + 'nBASE = r' + BQ + '"C:' + BQ + 'Users' + BQ + 'Desktop' + BQ + '""}';
/** 修复后应解出的 Python 源码原意 */
const ESCAPE_BAD_DECODED = 'print(1)\nBASE = r"C:' + BQ + 'Users' + BQ + 'Desktop"';

/** 截断毒丸（复刻生产形态：68KB 长 JSON 被 max_tokens 切半，尾部无闭合） */
const TRUNCATED =
  '{"code":"import os' + BQ + 'n' + BQ + 'nBASE = r' + BQ + '"C:' + BQ + BQ + 'Users' + BQ + BQ + 'Administrator' + BQ + '...（截断于此，无闭合）';

const PARSE_FAIL_RECEIPT =
  '参数解析失败，本工具未执行。arguments 不是合法 JSON（原始片段: {"code":"import os...）\n' +
  '请重新调用 python_exec，确保 arguments 是完整、合法的 JSON 对象。';

describe('healToolArguments（纯函数）', () => {
  it('合法 JSON 恒等返回（绝不变动正常历史）', () => {
    const ok = '{"path":"a.txt","n":1}';
    expect(healToolArguments(ok)).toBe(ok);
  });

  it('合法转义（\\n \\" \\\\ \\uXXXX）原样放行', () => {
    const ok = '{"code":"a' + BQ + 'nb' + BQ + '"c' + BQ + BQ + 'd' + BQ + 'u4e2d"}';
    expect(healToolArguments(ok)).toBe(ok);
  });

  it('★★ 非法转义修复：Windows 路径单反斜杠 → 加倍，解出模型本意', () => {
    // sanity：输入确实非法（\U 非法转义）
    expect(() => JSON.parse(ESCAPE_BAD)).toThrow();
    const fixed = healToolArguments(ESCAPE_BAD);
    expect(fixed).not.toBeNull();
    expect(JSON.parse(fixed!).code).toBe(ESCAPE_BAD_DECODED);
  });

  it('合法调用不受修复逻辑影响（已加倍的历史路径字节不变）', () => {
    const ok = '{"cwd":"C:' + BQ + BQ + 'Users' + BQ + BQ + 'Administrator"}';
    expect(healToolArguments(ok)).toBe(ok);
  });

  it('截断（尾部无闭合）→ null（修不了，交给调用方整组剥离）', () => {
    expect(healToolArguments(TRUNCATED)).toBeNull();
  });

  it('空串原样返回（空参归既有「未执行」判据管，本函数不插手）', () => {
    expect(healToolArguments('')).toBe('');
  });

  it('非字符串 → null', () => {
    expect(healToolArguments(undefined)).toBeNull();
    expect(healToolArguments({ a: 1 })).toBeNull();
  });
});

describe('发送前清洗：截断 arguments 整组剥离（2026-10-18 实报 1214）', () => {
  it('★★★ 毒丸整组剥离：坏调用与它的回执都不再发送，好调用一字不动', () => {
    const out = send([
      { role: 'user', content: '一鼓作气写完啊' },
      {
        role: 'assistant',
        content: '批量执行：环境复查 + 全量落盘',
        toolCalls: [
          { id: 'c1', type: 'function', function: { name: 'cmd_exec', arguments: '{"args":["--version"],"command":"dart"}' } },
          { id: 'c2', type: 'function', function: { name: 'file_write', arguments: '{"path":"a.dart","content":"x"}' } },
          { id: 'c3', type: 'function', function: { name: 'python_exec', arguments: TRUNCATED } },
        ],
      },
      { role: 'tool', toolCallId: 'c1', content: 'Dart SDK 3.4.0' },
      { role: 'tool', toolCallId: 'c2', content: 'WROTE a.dart' },
      { role: 'tool', toolCallId: 'c3', content: PARSE_FAIL_RECEIPT },
    ]);
    const calls = out.filter((m: any) => Array.isArray(m.tool_calls)).flatMap((m: any) => m.tool_calls);
    expect(calls.map((c: any) => c.function.name)).toEqual(['cmd_exec', 'file_write']);
    // 好调用的 arguments 一字未动
    expect(calls[0].function.arguments).toBe('{"args":["--version"],"command":"dart"}');
    // 每个发出的调用都能通过 JSON.parse —— GLM 1214 的直接判据
    for (const c of calls) expect(() => JSON.parse(c.function.arguments)).not.toThrow();
    // 截断调用的回执不再出现（只剩两个好回执）
    const receipts = out.filter((m: any) => m.role === 'tool');
    expect(receipts.map((r: any) => r.tool_call_id)).toEqual(['c1', 'c2']);
    // assistant 有正文 ⇒ 保留正文
    const asst = out.find((m: any) => m.role === 'assistant');
    expect(asst.content).toBe('批量执行：环境复查 + 全量落盘');
  });

  it('assistant 无正文 + 全是坏调用 → 整条消息消失（不留空壳）', () => {
    const out = send([
      { role: 'user', content: 'go' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'x', type: 'function', function: { name: 'python_exec', arguments: TRUNCATED } }] },
      { role: 'tool', toolCallId: 'x', content: PARSE_FAIL_RECEIPT },
    ]);
    expect(out.some((m: any) => m.role === 'assistant')).toBe(false);
    expect(out.some((m: any) => m.role === 'tool')).toBe(false);
    expect(out).toHaveLength(1); // 只剩 user
  });

  it('非法转义类坏 arguments：发送副本就地修复，好调用恒等', () => {
    const out = send([
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'g', type: 'function', function: { name: 'cmd_exec', arguments: '{"command":"dart"}' } },
          { id: 'b', type: 'function', function: { name: 'python_exec', arguments: '{"code":"BASE = r' + BQ + '"C:' + BQ + 'Users' + BQ + 'x' + BQ + '""}' } },
        ],
      },
      { role: 'tool', toolCallId: 'g', content: 'ok' },
      { role: 'tool', toolCallId: 'b', content: 'ran' },
    ]);
    const calls = out.filter((m: any) => Array.isArray(m.tool_calls)).flatMap((m: any) => m.tool_calls);
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(() => JSON.parse(c.function.arguments)).not.toThrow();
    const fixed = calls.find((c: any) => c.id === 'b');
    expect(JSON.parse(fixed.function.arguments).code).toBe('BASE = r"C:' + BQ + 'Users' + BQ + 'x"');
    expect(calls.find((c: any) => c.id === 'g').function.arguments).toBe('{"command":"dart"}');
  });

  it('无回执的坏调用：既有配对过滤照样剥（双保险）', () => {
    const out = send([
      { role: 'user', content: 'go' },
      { role: 'assistant', content: '正文', toolCalls: [{ id: 'x', type: 'function', function: { name: 'python_exec', arguments: TRUNCATED } }] },
    ]);
    const asst = out.find((m: any) => m.role === 'assistant');
    expect(asst.tool_calls).toBeUndefined();
    expect(asst.content).toBe('正文');
  });

  it('干净历史不受影响（无 tool_calls 的普通会话原样通过）', () => {
    const out = send([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '嗨' },
    ]);
    expect(out.map((m: any) => m.role)).toEqual(['user', 'assistant']);
    expect(out[1].content).toBe('嗨');
  });
});
