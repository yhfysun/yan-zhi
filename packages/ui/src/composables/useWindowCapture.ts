/**
 * 窗口采集（任务实录，2026-10-29）。
 *
 * 采的是**别的窗口**（任务执行窗、浏览器窗），不是直播页自己 ——
 * 采自己会把直播画面拍进直播画面，递归成像。
 * 主进程在清单里已经排除了调用方窗口，这里再做一次防御。
 */
import { ref } from 'vue'

export interface CaptureSource {
  id: string
  name: string
  kind: 'window' | 'screen'
  /** 主进程判定「不含侧边栏/会话列表」的窗口 */
  safe: boolean
}

export function useWindowCapture() {
  const sources = ref<CaptureSource[]>([])
  const stream = ref<MediaStream | null>(null)
  const active = ref(false)
  const loading = ref(false)

  const electron = () => (window as any).electronAPI

  async function refresh(): Promise<void> {
    try {
      const r = await electron()?.liveSources?.list?.()
      sources.value = Array.isArray(r?.sources) ? r.sources : []
    } catch {
      sources.value = []
    }
  }

  async function start(sourceId: string): Promise<MediaStream> {
    const el = electron()
    if (!el?.screenRecord?.selectSource) throw new Error('当前环境不支持窗口采集（仅桌面端）')
    if (!sourceId) throw new Error('还没选采集源')

    loading.value = true
    try {
      const sel = await el.screenRecord.selectSource(sourceId)
      if (!sel?.ok) throw new Error(sel?.error || '指定采集源失败')

      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 20 }, audio: false })
      stop() // 重启时先收掉上一路，避免两路同时活着
      stream.value = s
      active.value = true
      // 用户从系统层终止共享时同步复位
      const track = s.getVideoTracks()[0]
      if (track) track.onended = () => { stop() }
      return s
    } finally {
      loading.value = false
    }
  }

  function stop(): void {
    if (stream.value) {
      for (const t of stream.value.getTracks()) {
        try { t.stop() } catch { /* ignore */ }
      }
    }
    stream.value = null
    active.value = false
  }

  return { sources, stream, active, loading, refresh, start, stop }
}
