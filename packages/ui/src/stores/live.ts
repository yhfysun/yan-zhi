// 直播状态机 + 字幕/弹幕队列。
//
// 只服务直播页自己：任务状态由页面按需从 chat store 读，这里不重复订阅 WS。
// 纯函数单独导出，便于单测——优先级和裁剪规则错了会直接表现为"直播时该说的话被吞"。
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type LiveStatus = 'offline' | 'starting' | 'live' | 'wrapping' | 'ended'
export type LivePhase = 'idle' | 'talking' | 'playing' | 'replying'
export type LiveScene = 'pet-full' | 'avatar-full' | 'task-live' | 'game-pip' | 'danmaku-game' | 'duo'

/** 字幕来源：正文回答 > 弹幕回复 > 任务旁白 > 垫场 */
export type CueSource = 'reply' | 'danmaku' | 'narration' | 'filler'

export interface DanmakuItem {
  id: string
  text: string
  at: number
  /** 弹幕轨道（0~4），避免全部叠在同一行 */
  lane: number
}

export const DANMAKU_MAX = 60
export const DANMAKU_LANES = 5
export const DANMAKU_MAX_LEN = 60
export const CAPTION_MAX_LEN = 160

const CUE_WEIGHT: Record<CueSource, number> = {
  reply: 3,
  danmaku: 2,
  narration: 1,
  filler: 0,
}

export const LIVE_SCENES: Array<{ key: LiveScene; label: string }> = [
  { key: 'pet-full', label: '宠物主播' },
  { key: 'avatar-full', label: '虚拟人单口' },
  { key: 'task-live', label: '任务实录' },
  { key: 'game-pip', label: '游戏解说' },
  { key: 'danmaku-game', label: '弹幕游戏' },
  { key: 'duo', label: '虚拟人 + 宠物' },
]

export function sceneLabel(scene: LiveScene): string {
  return LIVE_SCENES.find((s) => s.key === scene)?.label || scene
}

export function cueWeight(source: CueSource): number {
  return CUE_WEIGHT[source] ?? 0
}

/**
 * 新字幕能否覆盖当前字幕。
 * 规则：同级或更高优先级可以覆盖；低优先级只在当前为空时上屏。
 * 这条规则保证"任务跑得快时旁白不会堵住正文回答"。
 */
export function canReplaceCaption(current: CueSource | null, next: CueSource): boolean {
  if (!current) return true
  return cueWeight(next) >= cueWeight(current)
}

/** 弹幕清洗：去首尾空白、压缩连续空白、超长截断 */
export function normalizeDanmaku(raw: string): string {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim()
  return text.length > DANMAKU_MAX_LEN ? text.slice(0, DANMAKU_MAX_LEN) : text
}

/** 字幕清洗：同上，但允许更长 */
export function normalizeCaption(raw: string): string {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim()
  return text.length > CAPTION_MAX_LEN ? text.slice(0, CAPTION_MAX_LEN) : text
}

/** 只保留最近 max 条；弹幕长度无上限会拖垮渲染 */
export function capDanmaku<T>(list: T[], max = DANMAKU_MAX): T[] {
  return list.length > max ? list.slice(list.length - max) : list.slice()
}

/** 轨道轮转：按序号取模，超过轨道数后自然复用 */
export function laneOf(index: number, lanes = DANMAKU_LANES): number {
  if (lanes <= 0) return 0
  const n = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0
  return n % lanes
}

/** 直播阶段 → 宠物状态（复用它已有的六态，不另造一套） */
export function petStateOfPhase(phase: LivePhase): 'idle' | 'running' | 'needs-input' | 'ready' {
  switch (phase) {
    case 'talking':
      return 'ready'
    case 'playing':
      return 'running'
    case 'replying':
      return 'needs-input'
    default:
      return 'idle'
  }
}

export const useLiveStore = defineStore('live', () => {
  const status = ref<LiveStatus>('offline')
  const phase = ref<LivePhase>('idle')
  const scene = ref<LiveScene>('pet-full')
  const caption = ref('')
  const captionSource = ref<CueSource | null>(null)
  /** 每次成功上屏自增：字幕内容可能重复，靠序号才能触发"该念这句了" */
  const captionSeq = ref(0)
  const danmaku = ref<DanmakuItem[]>([])
  let seq = 0

  const isLive = () => status.value === 'live'

  function start(): boolean {
    if (status.value === 'live' || status.value === 'starting') return false
    status.value = 'starting'
    status.value = 'live'
    phase.value = 'idle'
    return true
  }

  function stop(): boolean {
    if (status.value === 'offline' || status.value === 'ended') return false
    status.value = 'wrapping'
    status.value = 'ended'
    phase.value = 'idle'
    caption.value = ''
    captionSource.value = null
    return true
  }

  function setScene(next: LiveScene): void {
    scene.value = next
  }

  function setPhase(next: LivePhase): void {
    phase.value = next
  }

  /**
   * 上一条字幕。离线时直接忽略——避免用户在未开播时点按钮产生"已播报"的错觉。
   * 返回是否真的上屏，调用方可据此决定是否推进状态。
   */
  function say(raw: string, source: CueSource = 'filler'): boolean {
    if (!isLive()) return false
    const text = normalizeCaption(raw)
    if (!text) return false
    if (!canReplaceCaption(captionSource.value, source)) return false
    caption.value = text
    captionSource.value = source
    captionSeq.value += 1
    phase.value = 'talking'
    return true
  }

  function clearCaption(): void {
    caption.value = ''
    captionSource.value = null
  }

  function pushDanmaku(raw: string): DanmakuItem | null {
    const text = normalizeDanmaku(raw)
    if (!text) return null
    const item: DanmakuItem = {
      id: `dm-${Date.now()}-${seq++}`,
      text,
      at: Date.now(),
      lane: laneOf(seq),
    }
    danmaku.value = capDanmaku([...danmaku.value, item])
    return item
  }

  function clearDanmaku(): void {
    danmaku.value = []
  }

  return {
    status,
    phase,
    scene,
    caption,
    captionSource,
    captionSeq,
    danmaku,
    start,
    stop,
    setScene,
    setPhase,
    say,
    clearCaption,
    pushDanmaku,
    clearDanmaku,
  }
})
