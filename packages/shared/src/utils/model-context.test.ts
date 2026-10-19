// inferContextWindow 单测（2026-10-19）。
// 钉住：已知家族给真实窗口、蒸馏模型继承底座、未知模型不猜（返回 undefined 走保守兜底）。
import { describe, it, expect } from 'vitest';
import { inferContextWindow } from './model-context';

describe('inferContextWindow', () => {
  it('DeepSeek 官方 V2/V3/V3.1/V3.2/R1/chat/reasoner → 128K', () => {
    for (const id of [
      'deepseek-chat', 'deepseek-reasoner', 'deepseek-r1', 'deepseek-r1-0528',
      'deepseek-v3', 'deepseek-v3-0324', 'deepseek-v3.1', 'deepseek-v3.2',
      'siliconflow/deepseek-v3.2', 'vanchin/deepseek-v3.1-terminus',
    ]) {
      expect(inferContextWindow(id), id).toBe(131072);
    }
  });

  it('R1 蒸馏：qwen 底座 32K / llama 底座 128K（不得被通用 r1 规则误中）', () => {
    expect(inferContextWindow('deepseek-r1-distill-qwen-32b')).toBe(32768);
    expect(inferContextWindow('deepseek-r1-distill-qwen-1.5b')).toBe(32768);
    expect(inferContextWindow('deepseek-r1-distill-llama-70b')).toBe(131072);
    expect(inferContextWindow('deepseek-r1-distill-llama-8b')).toBe(131072);
  });

  it('OCR 模型 → 8K', () => {
    expect(inferContextWindow('vanchin/deepseek-ocr')).toBe(8192);
  });

  it('未知家族（含 V4 新系列 / 自定义网关命名）→ undefined（不猜）', () => {
    expect(inferContextWindow('deepseek-v4-pro')).toBeUndefined();
    expect(inferContextWindow('deepseek-v4.1-flash')).toBeUndefined();
    expect(inferContextWindow('deepseek-flash')).toBeUndefined();
    expect(inferContextWindow('some-custom-model')).toBeUndefined();
    expect(inferContextWindow('')).toBeUndefined();
  });
});
