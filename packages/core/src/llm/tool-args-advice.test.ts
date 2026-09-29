// 截断感知与诊断文案的测试。
//
// ★ 守的问题（2026-09-29）：主循环此前**不读 finish_reason**，把
//   「模型没生成参数（干净的 {}）」与「生成到一半被输出上限切断（半截 JSON）」
//   混为一谈，统一给出「怀疑 max_tokens / 模型能力」的错误归因，
//   并且在截断场景下建议"重试"——同样长度必然再次截断，属无效建议。
import { describe, expect, it } from 'vitest';
import {
  adviceForTruncatedArgs,
  argumentPreview,
  firstEmptyArgsCall,
  isEmptyToolArguments,
  looksTruncatedJson,
} from './tool-args-advice';

describe('参数空/截断判定', () => {
  it('空串、空白、空对象判为空', () => {
    expect(isEmptyToolArguments('')).toBe(true);
    expect(isEmptyToolArguments('   ')).toBe(true);
    expect(isEmptyToolArguments('{}')).toBe(true);
    expect(isEmptyToolArguments(undefined)).toBe(true);
  });

  it('正常 JSON 判为非空', () => {
    expect(isEmptyToolArguments('{"code":"print(1)"}')).toBe(false);
    expect(isEmptyToolArguments({ code: 'print(1)' })).toBe(false);
  });

  it('半截 JSON 不算「空」—— 它是截断信号，两者不能混', () => {
    const half = '{"code":"import os, subprocess\\nF=r"C:/Users/Adm';
    expect(isEmptyToolArguments(half)).toBe(false);
    expect(looksTruncatedJson(half)).toBe(true);
  });

  it('looksTruncatedJson 保守：不以 { 开头、或能解析成功，都不算截断', () => {
    expect(looksTruncatedJson('一段纯文本参数')).toBe(false);
    expect(looksTruncatedJson('{"a":1}')).toBe(false);
    expect(looksTruncatedJson('')).toBe(false);
    expect(looksTruncatedJson(null)).toBe(false);
  });
});

describe('截断诊断文案', () => {
  const half = '{"code":"import os, subprocess\\nF=r"C:/Users/Adm';

  it('finish_reason=length → 判定截断，且给出「落盘再执行」而非「重试」', () => {
    const r = adviceForTruncatedArgs({
      toolName: 'python_exec',
      finishReason: 'length',
      missingArgs: ['code'],
      rawArguments: half,
    });
    expect(r.truncated).toBe(true);
    expect(r.message).toContain('被长度上限截断');
    // ★ 必须明确劝阻"重试同样长度"
    expect(r.message).toContain('不要重试同样长度');
    // ★ 必须给出可行的替代路径
    expect(r.message).toContain('file_write');
  });

  it('半截 JSON 即便 finish_reason 缺失也能判为截断', () => {
    const r = adviceForTruncatedArgs({ toolName: 'python_exec', rawArguments: half });
    expect(r.truncated).toBe(true);
    expect(r.message).toContain('不要重试同样长度');
  });

  it('干净的 {} 不是截断 → 走普通缺参提示，不臆测截断', () => {
    const r = adviceForTruncatedArgs({
      toolName: 'python_exec',
      finishReason: 'tool_calls',
      missingArgs: ['code'],
      rawArguments: '{}',
    });
    expect(r.truncated).toBe(false);
    expect(r.message).toContain('缺少必填参数');
    expect(r.message).not.toContain('被长度上限截断');
  });

  it('参数片段进入预览，但被限长（不把半截 JSON 整段灌回上下文）', () => {
    const long = `{"code":"${'x'.repeat(2000)}`;
    const r = adviceForTruncatedArgs({ toolName: 'python_exec', finishReason: 'length', rawArguments: long });
    expect(r.message).toContain('已收到的参数片段');
    expect(r.message.length).toBeLessThan(long.length);
    expect(r.message).toContain('…');
  });

  it('argumentPreview 限长且空值返回空串', () => {
    expect(argumentPreview('')).toBe('');
    expect(argumentPreview(undefined)).toBe('');
    expect(argumentPreview('short')).toBe('short');
    expect(argumentPreview('x'.repeat(500)).length).toBe(401); // 400 + 省略号
  });
});

describe('从一批调用中定位空参/截断的那个', () => {
  it('两种形态都能识别（DeltaToolCall 与 ToolCall）', () => {
    const r1 = firstEmptyArgsCall([
      { id: 'a', function: { name: 'python_exec', arguments: '{"code":"ok"}' } },
      { id: 'b', function: { name: 'file_read', arguments: '{}' } },
    ] as any);
    expect(r1).toEqual({ name: 'file_read', raw: '{}' });

    const r2 = firstEmptyArgsCall([
      { id: 'c', toolName: 'python_exec', arguments: '{"code":"import os' },
    ] as any);
    expect(r2?.name).toBe('python_exec');
    expect(r2?.raw).toBe('{"code":"import os');
  });

  it('全部正常时返回 null', () => {
    expect(firstEmptyArgsCall([
      { id: 'a', function: { name: 'python_exec', arguments: '{"code":"ok"}' } },
    ] as any)).toBeNull();
  });
});