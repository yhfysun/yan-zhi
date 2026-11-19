/**
 * 移动端原生 TTS 接线守卫（2026-11-16 用户实报「移动端音频问题也要解决」）。
 *
 * 背景：Android WebView speechSynthesis 在国产 ROM 上静默（voices 空/英语不出声），
 * 原生 TextToSpeech（PlatformAdapter.nativeTts，YzTts 插件）是移动端唯一可靠出声通道。
 * 此前只有陪练与英语主线两处接了原生，其余朗读点（单词点读/听写、传统文化/周易诵读、
 * 场景结算卡）在移动端全部无声。本文件把「所有朗读出口都必须先试原生」钉死，防回归。
 *
 * 为什么用源码锚点：jsdom 里 getPlatformAdapter 无原生注入，行为断言不了「出声」，
 * 只能钉「接线存在」（本仓 learning 系既有做法）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('移动端原生 TTS 接线契约', () => {
  it('★ 统一入口存在：getNativeTts / nativeSpeak / nativeStopTts（唯一实现，禁止各处再摸适配器）', () => {
    const src = read('nativeTts.ts');
    expect(src).toContain('export function getNativeTts()');
    expect(src).toContain('export async function nativeSpeak(');
    expect(src).toContain('export function nativeStopTts()');
    // 不可用必须返回 false 让调用方继续降级链，绝不能抛异常
    expect(src).toMatch(/catch \{[\s\S]*?return false;/);
  });

  it('★ useZhSpeech：中文诵读原生通道优先（不依赖 WebView voices），stop 停原生', () => {
    const src = read('../composables/useZhSpeech.ts');
    expect(src).toContain("import { getNativeTts, nativeSpeak, nativeStopTts, warnEngineUnavailableOnce } from '../utils/nativeTts'");
    // start 先判原生（国产 ROM voices 为空会误入静默降级，必须原生优先）
    expect(src).toMatch(/const loop = options\.loop \?\? 'none';[\s\S]{0,200}if \(getNativeTts\(\)\)/);
    // 原生逐句队列存在 + stop 停原生
    expect(src).toContain('async function nativePlayNext(');
    expect(src).toMatch(/function stop\(\) \{[\s\S]{0,200}nativeStopTts\(\)/);
  });

  it('★ 英语主线 EPW 与场景结算卡：打断/朗读也要走原生', () => {
    const epw = read('../components/learning/EnglishPathWorkbench.vue');
    expect(epw).toMatch(/function stopActiveSpeech\(\) \{[\s\S]{0,120}nativeStopTts\(\)/);
    const card = read('../components/chat/SceneResultCard.vue');
    expect(card).toMatch(/async function speak\(text: string\) \{[\s\S]{0,200}await nativeSpeak\(text, 'en-US'\)/);
  });
});
