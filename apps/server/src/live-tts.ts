// 直播播报合成（2026-11-01 重排 + 二次修正）：
//   什么都没选 → 模型层 TTS（与视频配音 api_tts_speak 同链，最自然）
//   选了语音包 → 本地包优先（尊重显式选择）
//   选了音色   → Edge 优先（音色下拉选的就是 Edge 音色名，选了就该用它）
//   全部失败   → 系统语音兜底（完全离线）
//
// 为什么模型层默认最优先：视频配音走模型层 /v1/audio/speech，音色自然；
// 直播此前完全跳过模型层、从本地 8kHz 包起步 —— 用户实测「视频配音不僵硬、直播僵硬」。
// 本地包是按需下载的（31~163MB，设置 → 语音包），没装就没有 —— 不是"加载不到"，是压根没包。
//
// 延迟口径：模型层是网络请求，直播里卡一下就是几秒空白 —— 给 12s 竞速，
// 超时即降级（原请求继续跑完不取消，浪费但无害）。
import path from 'node:path'
import { promises as fsp } from 'node:fs'
import { edgeSpeak } from './mcp/edge-tts.js'
import { systemSpeak } from './mcp/tts-sapi.js'
import { TTS_PACKS, installedDir, previewTtsPack } from './services/tts-packs.js'

/** 默认音色：晓晓（中文女声，直播最常用） */
export const EDGE_DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'

/** 模型层合成竞速上限：超时就降级走下一层，别让一句播报卡死直播间 */
const MODEL_TTS_TIMEOUT_MS = 12000

export interface LiveSpeechResult {
  ok: boolean
  error?: string
  engine?: 'model' | 'local' | 'system' | 'edge'
  packId?: string
  voice?: string
  model?: string
  url?: string
  file?: string
  bytes?: number
}

export async function synthesizeLiveSpeech(input: {
  text?: string
  packId?: string
  voice?: string
  model?: string
  /** SAPI 风格语速（-10~10，前端滑杆原样传上来） */
  rate?: number
}): Promise<LiveSpeechResult> {
  const text = String(input?.text ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return { ok: false, error: '空文本' }
  // -10~10 → 0.5~1.5 倍：滑杆一格 5%，两端不夸张
  const speed = input.rate ? Math.round((1 + Number(input.rate) * 0.05) * 100) / 100 : undefined

  const done = { model: false, local: false, edge: false }

  const tryModel = async (): Promise<LiveSpeechResult | null> => {
    done.model = true
    try {
      const { modelTtsSpeak } = await import('./mcp/api-tool-executor.js')
      const raced = await Promise.race([
        modelTtsSpeak({ text, voice: input.voice, model: input.model, speed }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), MODEL_TTS_TIMEOUT_MS)),
      ])
      if (raced && raced.ok) {
        return {
          ok: true, engine: 'model', model: raced.model, voice: raced.voice,
          url: raced.url, file: raced.file, bytes: raced.bytes,
        }
      }
    } catch { /* 模型层失败 → 继续降级 */ }
    return null
  }

  const tryLocal = async (): Promise<LiveSpeechResult | null> => {
    done.local = true
    // 指定的语音包优先，其次任意一套已安装的
    const ordered = [
      ...(input.packId ? [String(input.packId)] : []),
      ...TTS_PACKS.map((p) => p.id),
    ]
    for (const id of ordered) {
      let dir: string | null = null
      try { dir = await installedDir(id) } catch { dir = null }
      if (!dir) continue
      const r = await previewTtsPack(id, { text })
      if (r.ok && r.url) {
        return { ok: true, engine: 'local', packId: id, url: r.url, file: r.file, bytes: r.bytes }
      }
    }
    return null
  }

  const tryEdge = async (): Promise<LiveSpeechResult | null> => {
    done.edge = true
    try {
      const voice = String(input.voice || EDGE_DEFAULT_VOICE)
      const out = await edgeSpeak(text, { voice, rate: input.rate || 0 })
      const { mediaTarget } = await import('./mcp/api-tool-executor.js')
      const target = mediaTarget({ kind: 'audios' })
      await fsp.mkdir(target.dir, { recursive: true })
      const file = path.join(target.dir, `live-edge-${Date.now()}.mp3`)
      await fsp.writeFile(file, out.buffer)
      return {
        ok: true, engine: 'edge', voice: out.voice || voice,
        url: `${target.urlBase}/${path.basename(file)}`, file, bytes: out.buffer.length,
      }
    } catch { return null }
  }

  // ── 按显式选择排链：选了什么先给什么，没选过的按默认顺序兜底 ──
  let r: LiveSpeechResult | null = null
  if (input.packId) r = await tryLocal()
  if (!r && input.voice) r = await tryEdge()
  if (!r && !done.model) r = await tryModel()
  if (!r && !done.local) r = await tryLocal()
  if (!r && !done.edge) r = await tryEdge()
  if (r) return r

  // ── 最后的保底：系统语音（Windows SAPI / WinRT，完全离线）──
  try {
    const { mediaTarget } = await import('./mcp/api-tool-executor.js')
    const target = mediaTarget({ kind: 'audios' })
    await fsp.mkdir(target.dir, { recursive: true })
    const file = path.join(target.dir, `live-sys-${Date.now()}.wav`)
    const sys = await systemSpeak(text, { outFile: file })
    if (sys) {
      return {
        ok: true, engine: 'system', voice: (sys as any).voice,
        url: `${target.urlBase}/${path.basename(file)}`, file,
      }
    }
    return { ok: false, error: '模型层/本地包/Edge 均不可用，系统语音也未产出音频' }
  } catch (e: any) {
    return { ok: false, error: `全部语音层均失败：${e?.message || e}` }
  }
}
