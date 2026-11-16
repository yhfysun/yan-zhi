/**
 * Android 系统 TTS 驱动桥（Capacitor 本地插件 YzTts → 前端统一入口）
 *
 * ★ 平台降级：仅 Android 原生壳注册可用；iOS/Web/桌面返回 false，调用方回落
 *   window.speechSynthesis（既有链路不动）。
 *
 * ★ 为什么走原生（2026-11-15 真机实报）：WebView 的 speechSynthesis 在国产 ROM
 *   上不可靠 —— voices 空、或只有中文 voice，英语朗读静默无声；系统级
 *   TextToSpeech API 所有 ROM 都带且支持中英文。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface YzTtsBridge {
  /** 合成并朗读；resolve 于朗读完成/失败。ok=false 时 reason 说明原因 */
  speak(args: { text: string; lang: string }): Promise<{ ok: boolean; reason?: string; lang?: string }>;
  stop(): Promise<void>;
}

const YzTts = registerPlugin<YzTtsBridge>('YzTts');

export function isNativeTtsPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * 用系统 TTS 朗读，resolve 于朗读完成。
 *
 * 返回 false = 当前环境不可用（非 Android 壳 / 引擎初始化失败 / 引擎不带该语言），
 * 调用方回落既有链路；返回 true = 已交给系统引擎（完成时 Promise 才 resolve）。
 */
export async function nativeSpeak(text: string, lang: string): Promise<boolean> {
  if (!isNativeTtsPlatform()) return false;
  try {
    const r = await YzTts.speak({ text, lang });
    if (r.ok) return true;
    // 引擎不带该语言（LANG_NOT_SUPPORTED）等：如实交给调用方回落
    return false;
  } catch {
    return false;
  }
}

export async function nativeStopTts(): Promise<void> {
  if (!isNativeTtsPlatform()) return;
  try { await YzTts.stop(); } catch { /* ignore */ }
}
