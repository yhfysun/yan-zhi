// 移动端原生 TTS 统一入口（2026-11-16 音频收口）。
//
// ★★★ 为什么必须有这个模块：Android WebView 的 speechSynthesis 在国产 ROM 上
//   不可靠（voices 空 / 只有中文 voice / 英语朗读静默），系统级 TextToSpeech 需要原生
//   插件（YzTts，PlatformAdapter.nativeTts 注入，仅 Android 壳有）。此前只有
//   LearningV2 的朗读出口和 EnglishPathWorkbench.speak（主线）接了原生，
//   其余朗读点（单词点读 speak()、听写、传统文化/周易诵读 useZhSpeech、场景结算卡）
//   在移动端全部静默 —— 用户实报「移动端音频问题也要解决」。
//
// 收口原则（判据「同一语义只能有一处实现」）：适配器获取 + 降级判定统一在这里，
// 调用方一行 nativeSpeak(text, lang) —— 返回 false（不可用/不带该语言）时继续
// 各自的既有降级链（语音包音频 → WebView speechSynthesis → 提示）。
import { getPlatformAdapter } from '@yan-zhi/core';
import type { PlatformAdapter } from '@yan-zhi/core';

type NativeTts = NonNullable<PlatformAdapter['nativeTts']>;

/** 取原生 TTS 适配器；桌面/Web/测试环境返回 null（调用方走既有降级链）。 */
export function getNativeTts(): NativeTts | null {
  try {
    return getPlatformAdapter().nativeTts ?? null;
  } catch {
    return null;
  }
}

/**
 * 原生朗读（speak resolve 于朗读完成）。返回 false = 引擎不可用/不带该语言，
 * 调用方应继续自己的降级链；被原生侧打断/出错同样按 false 处理。
 */
export async function nativeSpeak(text: string, lang: string): Promise<boolean> {
  const nt = getNativeTts();
  if (!nt) return false;
  try {
    return (await nt.speak(text, lang)) === true;
  } catch {
    return false;
  }
}

/** 停止原生朗读（no-op on 桌面/Web）。 */
export function nativeStopTts(): void {
  try {
    void getNativeTts()?.stop();
  } catch { /* 适配器缺失时忽略 */ }
}

/**
 * ★ 原生引擎不可用时给用户**可操作的**一次性提示（2026-11-16 真机实锤）：
 *   部分 ROM（ColorOS 等）没有预装 TTS 引擎 ⇒ 原生读不出、WebView speechSynthesis
 *   又静默 ⇒ 用户视角就是"点哪都没声"。此前只静默回落，用户不知道要去
 *   系统设置装/启用语音引擎。每会话只提示一次，不打扰后续操作。
 */
let engineWarned = false;
export function warnEngineUnavailableOnce(): void {
  if (engineWarned) return;
  engineWarned = true;
  void import('element-plus').then(({ ElMessage }) => {
    ElMessage({
      message: '语音引擎不可用：请到 系统设置 → 语言与输入 → 文字转语音(TTS) 安装/启用一个语音引擎（如「讯飞语记」「Google 语音合成」）后重试',
      type: 'warning',
      duration: 8000,
    });
  }).catch(() => { /* 提示失败不影响朗读降级链 */ });
}
