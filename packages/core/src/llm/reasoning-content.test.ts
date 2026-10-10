/**
 * `reasoning_content` 回传判定（2026-10-10 实据修复，第二版）。
 *
 * 背景：DeepSeek 系「思考模式」要求 assistant 消息必须把上一轮 reasoning **原样回传**，
 *   否则整轮 `400 The reasoning_content in the thinking mode must be passed back to the API.`
 *
 * ★ 第一版只回传「非空 reasoning」—— 实测**仍会 400**：
 *   模型某轮只吐 tool_calls、不吐 reasoning（落库为 NULL）→ 旧判据为假 → **字段整个缺失**。
 *   实据：会话 f0a901e3 的 22:46:28 消息（有 tool_calls / reasoning NULL）→ 下一轮即 400。
 *
 * 本测试钉住：**assistant 且有 tool_calls 或 content 非空 ⇒ 字段必须存在**（无 reasoning 时为空串）。
 */
import { describe, it, expect } from 'vitest';
import { resolveReasoningField } from './client';

describe('resolveReasoningField（reasoning_content 回传判定）', () => {
  it('★★★ 有 tool_calls 但 reasoning 为 NULL → 必须回传空串（不是省略字段）', () => {
    const v = resolveReasoningField({ role: 'assistant', content: '', toolCalls: [{ id: 'a' }] });
    expect(v, '★ 字段缺失 → DeepSeek 思考模式直接 400（本次实报根因）').toBe('');
  });

  it('★★★ 有 tool_calls 且 reasoning 非空 → 原样回传', () => {
    const v = resolveReasoningField({ role: 'assistant', content: '', toolCalls: [{ id: 'a' }], reasoningContent: '先想想' });
    expect(v).toBe('先想想');
  });

  it('★ 纯文本 assistant（无 tool_calls）也应带字段（思考模式同样要求）', () => {
    expect(resolveReasoningField({ role: 'assistant', content: '你好' })).toBe('');
    expect(resolveReasoningField({ role: 'assistant', content: '你好', reasoningContent: '嗯' })).toBe('嗯');
  });

  it('★ 空 assistant（无内容无工具）不带字段 —— 本就不该发给上游', () => {
    expect(resolveReasoningField({ role: 'assistant', content: '' })).toBeUndefined();
    expect(resolveReasoningField({ role: 'assistant', content: '', toolCalls: [] })).toBeUndefined();
  });

  it('★ 非 assistant 角色一律不带（污染上游上下文）', () => {
    expect(resolveReasoningField({ role: 'user', content: '问题' })).toBeUndefined();
    expect(resolveReasoningField({ role: 'tool', content: '结果' })).toBeUndefined();
    expect(resolveReasoningField({ role: 'system', content: '系统' })).toBeUndefined();
  });

  it('★ content 为多模态数组时（非字符串）不误判为"非空文本"', () => {
    // 数组形态 content 由 imageParts 分支处理；此处判据只认字符串 —— 有 toolCalls 仍应带
    expect(resolveReasoningField({ role: 'assistant', content: [], toolCalls: [{ id: 'a' }] })).toBe('');
    expect(resolveReasoningField({ role: 'assistant', content: [] })).toBeUndefined();
  });
});
