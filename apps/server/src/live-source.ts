// 直播弹幕源（2026-10-30）。
//
// 上游千差万别（平台桥 / 浏览器抓取 / 脚本回放），但它们对下游只暴露一件事：
// 把一条弹幕投进 ingestDanmaku。游戏、宠物动作、字幕都不需要知道弹幕从哪来。
//
// 这一版只内置 replay：开播冷场时喂一段脚本化弹幕，同时它也是接真实抓取适配器
// 的接线样板——换成抓取器时，只需要把 emit 换成 wss 回调，其余不动。
import { ingestDanmaku } from './live-danmaku.js'

export type LiveSourceKind = 'off' | 'replay'

export interface LiveSourceSnapshot {
  kind: LiveSourceKind
  sent: number
  startedAt: number | null
}

export interface ReplayStep {
  text: string
  from: string
}

/** 脚本化弹幕：1/2 选边、冲/打/加油轮流，昵称各不相同（避开单用户限流） */
export const REPLAY_SCRIPT: ReplayStep[] = [
  { from: '路过的观众', text: '1' },
  { from: '小满', text: '2' },
  { from: '阿飞', text: '冲' },
  { from: '橘子汽水', text: '1' },
  { from: '夜航船', text: '打' },
  { from: '十九', text: '2' },
  { from: '白桃乌龙', text: '加油' },
  { from: '石斑鱼', text: '1' },
  { from: 'momo', text: '冲' },
  { from: '不吃香菜', text: '2' },
  { from: '大橘为重', text: '打' },
  { from: '晚风', text: '1' },
  { from: '南栀', text: '2' },
  { from: '阿柴', text: '加油' },
  { from: '云朵', text: '1' },
  { from: '咸鱼翻身', text: '2' },
]

/** 取第 index 条脚本（循环）。抽出来是为了可单测，不依赖定时器。 */
export function replayStepAt(index: number): ReplayStep {
  const n = REPLAY_SCRIPT.length
  const i = ((index % n) + n) % n
  return REPLAY_SCRIPT[i]
}

let timer: ReturnType<typeof setInterval> | null = null
let snapshot: LiveSourceSnapshot = { kind: 'off', sent: 0, startedAt: null }

/** 启动回放源。未开播时 ingest 会拒收，sent 不增长——调用方不需要自己判断。 */
export function startReplaySource(intervalMs = 2200): LiveSourceSnapshot {
  stopLiveSource()
  snapshot = { kind: 'replay', sent: 0, startedAt: Date.now() }
  let index = 0
  timer = setInterval(() => {
    const step = replayStepAt(index++)
    if (ingestDanmaku({ text: step.text, from: step.from }).ok) snapshot.sent += 1
  }, intervalMs)
  ;(timer as unknown as { unref?: () => void }).unref?.()
  return { ...snapshot }
}

export function stopLiveSource(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  snapshot = { ...snapshot, kind: 'off' }
}

export function liveSourceState(): LiveSourceSnapshot {
  return { ...snapshot }
}

/** 仅测试用 */
export function resetLiveSource(): void {
  stopLiveSource()
  snapshot = { kind: 'off', sent: 0, startedAt: null }
}
