/**
 * 拉取弹幕（2026-10-29）。
 *
 * 用轮询而不是 WS：弹幕是低频事件（每条几秒），轮询实现简单、断线自愈，
 * 而且与现有 chat-ws 的任务流解耦——直播画面不该因为弹幕通道抖动而受影响。
 *
 * 启动时先"对齐水位"：不然会把缓冲区里的历史弹幕一次性灌进画面。
 */
import { ref } from 'vue'
import { api } from '../api/client'

export interface IncomingDanmaku {
  seq: number
  text: string
  from: string
  kind: 'question' | 'action' | 'ignore'
  action?: string
}

export interface UseLiveDanmakuOptions {
  onItem: (item: IncomingDanmaku) => void
  intervalMs?: number
}

export function useLiveDanmaku(opts: UseLiveDanmakuOptions) {
  const running = ref(false)
  let timer = 0
  let since = 0

  async function fetchSince(from: number): Promise<IncomingDanmaku[]> {
    const r = await api.get<any>(`/live/danmaku?since=${from}`)
    const data = (r as any)?.data ?? r
    const last = Number(data?.lastSeq)
    if (Number.isFinite(last) && last > since) since = last
    return Array.isArray(data?.items) ? (data.items as IncomingDanmaku[]) : []
  }

  async function tick(): Promise<void> {
    try {
      const items = await fetchSince(since)
      for (const it of items) {
        if (it && typeof it.text === 'string') opts.onItem(it)
      }
    } catch {
      // 单次轮询失败忽略：下一轮自然补上（since 没前进）
    }
  }

  function start(): void {
    if (running.value) return
    running.value = true
    // 对齐水位：拉一个不可能存在的 seq，只取回 lastSeq
    void fetchSince(Number.MAX_SAFE_INTEGER - 1).catch(() => {})
    timer = window.setInterval(() => { void tick() }, opts.intervalMs ?? 2000)
  }

  function stop(): void {
    running.value = false
    if (timer) {
      clearInterval(timer)
      timer = 0
    }
  }

  return { running, start, stop }
}
