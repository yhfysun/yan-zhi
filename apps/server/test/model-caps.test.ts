/**
 * 模型能力 → 工具通道判定单测。
 *
 * 为什么必须钉死：能力集合是「测出来才勾」的累加集合（自动带上媒体能力 + UI 自动勾选），
 * 历史上按「能力非空且不含 function_call 即不支持工具」判会导致
 * 一次「自动检测全部并勾选」把对话模型的工具裁空、智能体失能。
 * 这里锁死正确口径：只有**纯媒体模型**（只标 image/video）才不走工具通道。
 */
import { describe, it, expect } from 'vitest';
import { modelSupportsTools, MEDIA_CAPABILITIES } from '../src/services/model-caps.js';

describe('modelSupportsTools', () => {
  it('能力未标注（空 / undefined）→ 支持（宽容口径，不能因缺标记就裁工具）', () => {
    expect(modelSupportsTools(undefined)).toBe(true);
    expect(modelSupportsTools(null)).toBe(true);
    expect(modelSupportsTools([])).toBe(true);
  });

  it('标注了 function_call → 支持', () => {
    expect(modelSupportsTools(['function_call'])).toBe(true);
    expect(modelSupportsTools(['function_call', 'vision'])).toBe(true);
  });

  it('只勾了 vision / reasoning 的对话模型 → 仍支持（自动勾选不能裁掉工具）', () => {
    expect(modelSupportsTools(['vision'])).toBe(true);
    expect(modelSupportsTools(['reasoning'])).toBe(true);
    expect(modelSupportsTools(['vision', 'reasoning'])).toBe(true);
  });

  it('只标了 image / video 的媒体模型 → 不走工具通道', () => {
    expect(modelSupportsTools(['image'])).toBe(false);
    expect(modelSupportsTools(['video'])).toBe(false);
    expect(modelSupportsTools(['image', 'video'])).toBe(false);
  });

  it('媒体标记 + 显式 function_call → 支持（显式标注优先）', () => {
    expect(modelSupportsTools(['image', 'function_call'])).toBe(true);
  });

  it('媒体能力标记清单与能力推断口径一致', () => {
    expect(MEDIA_CAPABILITIES).toEqual(['image', 'video']);
  });
});
