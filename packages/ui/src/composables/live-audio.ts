/**
 * 播报音频 → 推流的 WebAudio 图（2026-10-29）。
 *
 * 问题：TTS 是用 <audio> 播的，`canvas.captureStream()` 只有视频轨，
 * 推出去的流没有声音。ffmpeg 那一侧也没法从别处拿到这路音频。
 *
 * 做法：把 <audio> 接进一条 WebAudio 图，扇出两路——
 *   ① MediaStreamAudioDestinationNode：作为音频轨并进推流的 MediaStream；
 *   ② ctx.destination：本机扬声器照常能听见。
 *
 * 注意 createMediaElementSource 对同一个元素只能建一次（重复会抛），
 * 所以用 WeakSet 记账；元素被丢弃后随弱引用一起回收。
 */

export interface LiveAudioGraph {
  ctx: AudioContext
  dest: MediaStreamAudioDestinationNode
}

let graph: LiveAudioGraph | null = null
const attached = new WeakSet<HTMLMediaElement>()
/** 口型驱动的采样点：挂在播报音频上，只此一个 */
let analyser: AnalyserNode | null = null
let sampleBuf: Float32Array | null = null

/** 取（或懒建）全局音频图；环境不支持时返回 null，调用方按无声处理 */
export function getAudioGraph(): LiveAudioGraph | null {
  if (graph) return graph
  const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!Ctx) return null
  try {
    const ctx: AudioContext = new Ctx()
    graph = { ctx, dest: ctx.createMediaStreamDestination() }
    return graph
  } catch {
    return null
  }
}

/** 把媒体元素接进音频图；重复调用安全 */
export function attachMediaToGraph(el: HTMLMediaElement): LiveAudioGraph | null {
  const g = getAudioGraph()
  if (!g) return null
  if (attached.has(el)) return g
  try {
    const src = g.ctx.createMediaElementSource(el)
    // 串一个分析器：口型（viseme 的廉价替代）从这里取振幅
    const an = g.ctx.createAnalyser()
    an.fftSize = 1024
    an.smoothingTimeConstant = 0.55
    src.connect(an)
    an.connect(g.dest)
    an.connect(g.ctx.destination)
    analyser = an
    sampleBuf = new Float32Array(an.fftSize)
    attached.add(el)
  } catch {
    // 已连接过 / 元素不可用：不阻断播放
  }
  return g
}

/**
 * 当前播报的音量包络（0~1）。没在播 / 没有音频图时返回 0。
 * 为什么不按音素做口型：sherpa 的 VITS 不给时间戳，按振幅驱动是唯一与引擎无关的做法，
 * 视觉上足够（说话时嘴一直在动），也不会因为换 TTS 就失效。
 */
export function mouthLevel(): number {
  if (!analyser || !sampleBuf) return 0
  try {
    // TS 5.7 起 Float32Array 带 ArrayBuffer 泛型，与 lib.dom 的签名不完全对齐，这里放宽
    analyser.getFloatTimeDomainData(sampleBuf as any)
    let sum = 0
    for (let i = 0; i < sampleBuf.length; i++) sum += sampleBuf[i] * sampleBuf[i]
    const rms = Math.sqrt(sum / sampleBuf.length)
    // 人声 RMS 大约 0.02~0.15，放大后落到 0~1
    return Math.max(0, Math.min(1, rms * 7))
  } catch {
    return 0
  }
}

/** 自动播放策略下 AudioContext 可能处于 suspended，需要用户手势后恢复 */
export async function resumeAudioGraph(): Promise<void> {
  const g = getAudioGraph()
  if (!g || g.ctx.state !== 'suspended') return
  try { await g.ctx.resume() } catch { /* 不恢复也能播画面，只是没声音 */ }
}

/** 取推流用的音频轨；没有图时返回空数组 */
export function streamAudioTracks(): MediaStreamTrack[] {
  const g = getAudioGraph()
  if (!g) return []
  try { return g.dest.stream.getAudioTracks() } catch { return [] }
}

/** 仅测试用：丢弃单例，避免用例之间互相污染 */
export function resetAudioGraph(): void {
  if (graph) {
    try { void graph.ctx.close() } catch { /* ignore */ }
  }
  graph = null
}
