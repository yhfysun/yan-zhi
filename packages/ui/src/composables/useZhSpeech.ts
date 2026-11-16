// 中文诵读 composable —— 学习模式三处（精读台 / 典籍文库 / 后续科目）共用的唯一实现。
// ★ 收口原因（判据「同一语义只能有一处实现」）：声线挑选、句队列、降级节奏曾散在两处，
//   CanonLibrary 曾出现「按句内容匹配高亮 → 重复句全亮」的 bug，本 composable 统一按索引。
// 声线：getVoices() 里挑自然度最高的中文声线（微软 Xiaoxiao/Yunxi 系 > Yaoyao/Tingting/
// Huihui > 任意 zh），偏好存 localStorage；没有可用声线时降级为「只按节奏推进高亮」。
// 朗读：逐句 utterance，**保留标点**（引擎按标点自然停顿——此前剥掉标点导致一股器械感），
// rate 略缓 0.9。

import { onBeforeUnmount, ref } from 'vue';
import { getNativeTts, nativeSpeak, nativeStopTts, warnEngineUnavailableOnce } from '../utils/nativeTts';

export type ZhSpeechLoop = 'none' | 'all' | 'single';

export type ZhSpeechOptions = {
  startIndex?: number;
  loop?: ZhSpeechLoop;
  rate?: number;
  /** 无语音支持时是否降级为按节奏推进高亮（1.2s/句） */
  silentFallback?: boolean;
  /** 每句开始时回调（i = 句索引） */
  onIndex?: (i: number) => void;
  /** 全部播完（loop='none'）时回调 */
  onDone?: () => void;
};

const VOICE_PREF_KEY = 'yz.learning.speak.voice.v1';
const SENTENCE_FALLBACK_MS = 1200;

// 加分表：名字命中越靠前分越高（微软 OneCore/自然音 > 完整版 SAPI > 任意 zh）
const VOICE_BONUS: Array<[RegExp, number]> = [
  [/xiao(xiao|yi|yan|chen|han|meng|mo|rou|rui|shuang|xuan|qiao)|yun(xi|yang|nei|hong|ye|ze|song)/i, 10],
  [/yaoyao|tingting|huihui|meijia|kangkang|liang/i, 6],
  [/online|neural|natural/i, 8],
  [/xiaokun|xiaoguo|yunzhe|yunjian/i, 5],
];

let voiceCache: SpeechSynthesisVoice[] = [];
let voicesHooked = false;

function hookVoices(): void {
  if (voicesHooked || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  voicesHooked = true;
  const synth = window.speechSynthesis;
  const refresh = () => { voiceCache = synth.getVoices() ?? []; };
  refresh();
  // Chrome/Electron 首次 getVoices 常为空，靠事件补齐
  synth.addEventListener?.('voiceschanged', refresh);
}

export function pickZhVoice(): SpeechSynthesisVoice | null {
  hookVoices();
  const zh = voiceCache.filter((v) => v.lang?.toLowerCase().startsWith('zh'));
  if (!zh.length) return null;
  let prefUri = '';
  try { prefUri = localStorage.getItem(VOICE_PREF_KEY) ?? ''; } catch { /* localStorage 不可用忽略 */ }
  const preferred = prefUri ? zh.find((v) => v.voiceURI === prefUri) : undefined;
  if (preferred) return preferred;
  const scored = zh.map((v) => ({
    v,
    score: VOICE_BONUS.reduce((n, [re, bonus]) => (re.test(v.name) ? n + bonus : n), 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.v ?? zh[0];
}

export function zhSpeechSupported(): boolean {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function useZhSpeech() {
  const active = ref(false);
  const index = ref(-1);
  const voiceLabel = ref('');

  let queue: string[] = [];
  let opts: ZhSpeechOptions = {};
  let timer: ReturnType<typeof setInterval> | undefined;

  function clearTimer() {
    if (timer !== undefined) { clearInterval(timer); timer = undefined; }
  }

  function stop() {
    active.value = false;
    index.value = -1;
    clearTimer();
    nativeStopTts(); // ★ 原生通道也要停（Android），否则诵读收不住
    try { window.speechSynthesis?.cancel(); } catch { /* 无浏览器语音时忽略 */ }
  }

  function emitIndex(i: number) {
    index.value = i;
    opts.onIndex?.(i);
  }

  function playNext(i: number, loop: ZhSpeechLoop, rate: number) {
    if (!active.value) return;
    if (i >= queue.length) {
      if (loop === 'all' && queue.length) { playNext(0, loop, rate); return; }
      active.value = false;
      index.value = -1;
      opts.onDone?.();
      return;
    }
    emitIndex(i);
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(queue[i]);
    utterance.lang = 'zh-CN';
    utterance.rate = rate;
    const voice = pickZhVoice();
    if (voice) { utterance.voice = voice; voiceLabel.value = voice.name; }
    utterance.onend = () => {
      if (!active.value) return;
      if (loop === 'single' && queue.length) { playNext(i, loop, rate); return; }
      playNext(i + 1, loop, rate);
    };
    // 某些引擎偶发不触发 onend：超时兜底推进（略大于该句正常时长）
    try { synth.speak(utterance); } catch { /* 忽略 */ }
    clearTimer();
    const guard = Math.max(3000, queue[i].length * 600) + 2500;
    timer = setInterval(() => {
      if (!active.value) { clearTimer(); return; }
      // onend 已把 index 推进过则撤守；仍在当前句视为卡死，手动推进
      if (index.value === i) {
        clearTimer();
        if (loop === 'single') { playNext(i, loop, rate); return; }
        playNext(i + 1, loop, rate);
      } else {
        clearTimer();
      }
    }, guard);
  }

  /**
   * ★ 原生通道（Android 唯一可靠出声路径，2026-11-16）：WebView speechSynthesis
   *   在国产 ROM 静默 ⇒ 传统文化/周易诵读此前全是「只高亮不出声」。
   *   逐句 speak（resolve 于朗读完成）推进队列；引擎拒绝该句（如系统无中文语音包，
   *   ok=false）时按节奏推进高亮，保持诵读流程不中断。单句循环/全篇循环语义与
   *   utterance 版一致。
   */
  async function nativePlayNext(i: number, loop: ZhSpeechLoop) {
    if (!active.value) return;
    if (i >= queue.length) {
      if (loop === 'all' && queue.length) { void nativePlayNext(0, loop); return; }
      active.value = false;
      index.value = -1;
      opts.onDone?.();
      return;
    }
    emitIndex(i);
    voiceLabel.value = '系统 TTS';
    const ok = await nativeSpeak(queue[i], 'zh-CN');
    if (!active.value) return; // stop() 打断
    if (!ok) { warnEngineUnavailableOnce(); await new Promise((r) => setTimeout(r, SENTENCE_FALLBACK_MS)); }
    if (!active.value) return;
    if (loop === 'single' && queue.length) { void nativePlayNext(i, loop); return; }
    void nativePlayNext(i + 1, loop);
  }

  function start(texts: string[], options: ZhSpeechOptions = {}): void {
    stop();
    if (!texts.length) return;
    queue = texts.slice();
    opts = options;
    const loop = options.loop ?? 'none';
    const rate = options.rate ?? 0.9;
    // ★ 原生通道优先（Android）：不依赖 WebView voices（国产 ROM 上为空会误入静默降级）
    if (getNativeTts()) {
      active.value = true;
      const first = Math.min(Math.max(0, options.startIndex ?? 0), queue.length - 1);
      void nativePlayNext(first, loop);
      return;
    }
    if (!zhSpeechSupported() || !pickZhVoice()) {
      if (!options.silentFallback) return;
      // 降级：不发声，按节奏逐句推进高亮
      active.value = true;
      const first = Math.min(Math.max(0, options.startIndex ?? 0), queue.length - 1);
      emitIndex(first);
      timer = setInterval(() => {
        if (!active.value) { clearTimer(); return; }
        const next = index.value + 1;
        if (next >= queue.length) {
          if (loop === 'all') { emitIndex(0); return; }
          active.value = false;
          index.value = -1;
          clearTimer();
          opts.onDone?.();
          return;
        }
        emitIndex(next);
      }, SENTENCE_FALLBACK_MS);
      return;
    }
    active.value = true;
    const first = Math.min(Math.max(0, options.startIndex ?? 0), queue.length - 1);
    playNext(first, loop, rate);
  }

  function setPreferredVoice(uri: string): void {
    try { localStorage.setItem(VOICE_PREF_KEY, uri); } catch { /* 忽略 */ }
  }

  onBeforeUnmount(stop);

  return { active, index, voiceLabel, start, stop, setPreferredVoice, refreshVoices: () => { hookVoices(); pickZhVoice(); } };
}

/** 按中文标点切句（句尾标点归属本句）；三处诵读与渲染共用同一份切分 */
export function splitZhSentences(text: string): string[] {
  return text.match(/[^，。！？；、]+[，。！？；、]?/g) ?? [text];
}
