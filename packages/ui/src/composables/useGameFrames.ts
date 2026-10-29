/**
 * 游戏画面：CDP 帧流（2026-10-29）。
 *
 * 与应用内浏览器当前页同源 —— 智能体在操作哪一页，观众就看到哪一页，
 * 且不受窗口遮挡/最小化影响。帧是 base64 JPEG，这里只负责接收与节流上屏。
 *
 * 为什么用 <img> 而不是 canvas：解码交给浏览器合成器，1080p JPEG 每帧几 MB 的
 * drawImage 反而更慢；<img> 换 src 是最省事的路径，15fps 下足够顺。
 */
import { ref } from 'vue'

export interface UseGameFramesOptions {
  onFrame: (dataUrl: string) => void
  intervalMs?: number
}

export function useGameFrames(opts: UseGameFramesOptions) {
  const active = ref(false)
  let offFrame: (() => void) | null = null
  let offStatus: (() => void) | null = null

  const el = () => (window as any).electronAPI?.liveGame

  async function start(): Promise<void> {
    const api = el()
    if (!api?.start) throw new Error('当前环境不支持帧流（仅桌面端）')

    let last = 0
    const minGap = opts.intervalMs ?? 60
    offFrame?.()
    offFrame = api.onFrame?.((p: any) => {
      if (!p || typeof p.data !== 'string' || !p.data) return
      const now = Date.now()
      if (now - last < minGap) return
      last = now
      opts.onFrame(`data:image/jpeg;base64,${p.data}`)
    }) || null

    offStatus?.()
    offStatus = api.onStatus?.((p: any) => {
      if (p && p.ok === false) active.value = false
    }) || null

    const r = await api.start({ fps: 15, quality: 70 })
    if (!r?.ok) {
      stop()
      throw new Error(r?.error || '启动画面推流失败')
    }
    active.value = true
  }

  function stop(): void {
    offFrame?.()
    offStatus?.()
    offFrame = null
    offStatus = null
    active.value = false
    try { void el()?.stop?.() } catch { /* ignore */ }
  }

  return { active, start, stop }
}
