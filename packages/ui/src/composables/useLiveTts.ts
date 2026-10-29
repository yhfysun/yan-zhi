/**
 * 直播语音播报（2026-10-29）。
 *
 * 复用已有的本地 TTS 语音包链路：服务端 `POST /api/tts-packs/:id/preview` 接受任意文本
 * （text 为空才回落到示例句），合成后写到产物目录并返回可播放地址 —— 不另造一套合成接口。
 *
 * 播放策略：**新的播报直接打断旧的**。直播里"每个字都要念完"是反效果的，
 * 观众听到的应该是当前最重要的那句（优先级由 live store 的字幕规则决定）。
 */
import { ref } from 'vue'
import { api } from '../api/client'
import { attachMediaToGraph, resumeAudioGraph } from './live-audio'

export interface VoicePackOption {
  id: string
  name: string
}

/** 只留下已安装的语音包；非数组/脏数据一律丢弃 */
export function pickInstalledPacks(list: unknown): VoicePackOption[] {
  if (!Array.isArray(list)) return []
  const out: VoicePackOption[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    if (!p.installed || typeof p.id !== 'string' || !p.id) continue
    out.push({ id: p.id, name: typeof p.name === 'string' && p.name ? p.name : p.id })
  }
  return out
}

export function useLiveTts() {
  const packs = ref<VoicePackOption[]>([])
  const packId = ref('')
  const enabled = ref(true)
  const speaking = ref(false)
  const loading = ref(false)
  const error = ref('')

  let el: HTMLAudioElement | null = null
  let onEnd: (() => void) | null = null

  function ensureAudio(): HTMLAudioElement {
    if (!el) {
      el = new Audio()
      el.preload = 'auto'
      el.onended = () => {
        speaking.value = false
        const cb = onEnd
        onEnd = null
        cb?.()
      }
      el.onerror = () => {
        speaking.value = false
        error.value = '音频播放失败'
      }
    }
    return el
  }

  async function refresh(): Promise<void> {
    try {
      const r = await api.get<any>('/tts-packs')
      const list = (r as any)?.data ?? r
      packs.value = pickInstalledPacks(list)
      if (!packs.value.some((p) => p.id === packId.value)) {
        packId.value = packs.value[0]?.id || ''
      }
    } catch (e: any) {
      error.value = e?.message || '读取语音包失败'
    }
  }

  function stop(): void {
    if (el) {
      try { el.pause() } catch { /* ignore */ }
      try { el.currentTime = 0 } catch { /* ignore */ }
    }
    speaking.value = false
    onEnd = null
  }

  /** 合成并播放一句；失败只记错误，不抛（直播不该因为一句没念出来就中断） */
  async function speak(text: string, opts: { onEnd?: () => void } = {}): Promise<void> {
    if (!enabled.value || !packId.value) return
    const t = String(text || '').trim()
    if (!t) return

    stop()
    onEnd = opts.onEnd || null
    loading.value = true
    error.value = ''
    try {
      const r = await api.post<any>(`/tts-packs/${encodeURIComponent(packId.value)}/preview`, { text: t })
      if (r && typeof r === 'object' && 'error' in r) throw new Error((r as any).error)
      const url = (r as any)?.data?.url || (r as any)?.url
      if (!url) throw new Error('接口未返回音频地址')

      const audio = ensureAudio()
      // 接进音频图：一路扬声器、一路给推流（见 live-audio.ts）
      attachMediaToGraph(audio)
      void resumeAudioGraph()
      audio.src = String(url)
      speaking.value = true
      // 自动播放被拦（没有用户手势）时不报错，只把状态复位
      await audio.play().catch(() => { speaking.value = false })
    } catch (e: any) {
      error.value = e?.message || String(e)
      speaking.value = false
    } finally {
      loading.value = false
    }
  }

  function dispose(): void {
    stop()
    if (el) {
      el.src = ''
      el = null
    }
  }

  return { packs, packId, enabled, speaking, loading, error, refresh, speak, stop, dispose }
}
