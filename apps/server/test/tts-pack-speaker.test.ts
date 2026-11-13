import { describe, expect, it, vi } from 'vitest';
import { resolvePreviewSpeakerId } from '../src/services/tts-packs';

describe('语音包试听说话人', () => {
  it('MeloTTS 单说话人固定使用 sid=0，不套用 Aishell3 角色映射', () => {
    const fallback = vi.fn(() => 88);
    expect(resolvePreviewSpeakerId('vits-melo-tts-zh_en', undefined, fallback)).toBe(0);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('显式 speakerId 仍然优先', () => {
    expect(resolvePreviewSpeakerId('vits-melo-tts-zh_en', 0, () => 88)).toBe(0);
  });

  it('多说话人语音包继续按角色稳定选择', () => {
    const fallback = vi.fn(() => 17);
    expect(resolvePreviewSpeakerId('vits-zh-aishell3', undefined, fallback)).toBe(17);
    expect(fallback).toHaveBeenCalledWith('旁白', expect.any(Set));
  });
});
