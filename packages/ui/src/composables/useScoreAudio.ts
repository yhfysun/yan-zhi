// 谱面合成音（Web Audio 单例）v2 —— docs/音乐双方向重构方案-2026-11-15.md §3.3。
// 照 live-audio.ts 的 AudioContext 获取 + 手势 resume 范式；零新依赖，无声环境全部 try/catch 静默降级
// （降级为「看谱高亮」，不阻塞学习）。v2：按 step+alter+octave 半音发声（不再绑定五声 Pitch）。

import { noteToHz, type NoteEvent } from '../utils/learning/score-render';

let ctx: AudioContext | null = null;

/** 取（或懒建）AudioContext 单例；环境不支持返回 null，调用方按无声处理 */
function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor: any = (window as any)?.AudioContext || (window as any)?.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor() as AudioContext;
    return ctx;
  } catch {
    return null;
  }
}

/** 自动播放策略下可能 suspended：用户点击（手势）后 resume */
async function resumeCtx(): Promise<void> {
  const c = getCtx();
  if (!c || c.state !== 'suspended') return;
  try { await c.resume(); } catch { /* 恢复失败按无声降级 */ }
}

/**
 * 单音：OscillatorNode(sine) + GainNode 包络（attack 12ms → exponentialRamp 到 0.0001 at dur）。
 * baseOffsetSemi 用于整体移调试听。
 */
export function playNote(note: NoteEvent, durationSec = 0.6, baseOffsetSemi = 0): void {
  try {
    const c = getCtx();
    if (!c) return;
    void resumeCtx();
    const hz = noteToHz(note, baseOffsetSemi);
    if (!Number.isFinite(hz) || hz <= 0) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const peak = 0.22;
    const dur = Math.max(0.05, durationSec);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012); // attack 12ms
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); // decay 到收尾
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  } catch {
    // 无声环境（无音频设备 / 上下文被禁）：降级为看谱，不抛错
  }
}

/** playSequence 的播放句柄：stop() 清掉未触发的排程 */
export type SequenceHandle = { stop: () => void };

/**
 * 整段播放：按 beats × 60/BPM 用 setTimeout 排程，每个音头触发 onNoteIndex(i) 供高亮跟随。
 * 返回 stop 函数；重复调用前先停上一段（单例账本，避免两段混响）。
 */
export function playSequence(
  events: Array<Pick<NoteEvent, 'step' | 'octave' | 'beats' | 'rest' | 'alter'>>,
  bpm: number,
  onNoteIndex?: (index: number) => void,
): SequenceHandle {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const secPerBeat = 60 / Math.max(30, bpm);
  let elapsed = 0;
  events.forEach((n, i) => {
    const dur = Math.max(0.05, n.beats * secPerBeat);
    if (!n.rest) {
      timers.push(setTimeout(() => {
        playNote(n as NoteEvent, dur * 0.92);
        try { onNoteIndex?.(i); } catch { /* 高亮回调失败不影响发声 */ }
      }, Math.round(elapsed * 1000)));
    }
    elapsed += dur;
  });
  const stop = () => {
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
  };
  stopActive();
  activeSequence = stop;
  return { stop };
}

/** 当前整段播放的 stop 账本：开新段前先停旧的 */
let activeSequence: (() => void) | null = null;
function stopActive(): void {
  try { activeSequence?.(); } catch { /* ignore */ }
  activeSequence = null;
}

/** 立即停止一切发声与排程（退出沉浸台 / 组件卸载时调用） */
export function stopAllScoreAudio(): void {
  stopActive();
}

/** 组合式入口：供组件统一取用（与 live-audio.ts 的调用面保持相似） */
export function useScoreAudio() {
  return {
    playNote,
    playSequence,
    stopAll: stopAllScoreAudio,
  };
}

/** 仅测试用：丢弃单例，避免用例之间互相污染 */
export function resetScoreAudioForTest(): void {
  stopActive();
  ctx = null;
}
