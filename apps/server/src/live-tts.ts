// 直播播报合成：本地语音包优先，没有就退到 Edge 在线 TTS（2026-10-30）。
//
// 为什么需要兜底：本地模型包是"按需下载"的（31~163MB，走 GitHub 发布资产），
// 没代理时根本下不下来，而直播没有声音等于半残。Edge 在线合成不需要模型，
// 只要网络能到微软就能出声；质量也比 8kHz 的 aishell3 好。
//
// 顺序是硬的：本地优先。在线合成每次都要走网络，直播里卡一下就是几秒空白。
import path from 'node:path'
import { promises as fsp } from 'node:fs'
import { edgeSpeak } from './mcp/edge-tts.js'
import { systemSpeak } from './mcp/tts-sapi.js'
import { TTS_PACKS, installedDir, previewTtsPack } from './services/tts-packs.js'

/** 默认音色：晓晓（中文女声，直播最常用） */
export const EDGE_DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'

export interface LiveSpeechResult {
  ok: boolean
  error?: string
  engine?: 'local' | 'system' | 'edge'
  packId?: string
  voice?: string
  url?: string
  file?: string
  bytes?: number
}

export async function synthesizeLiveSpeech(input: {
  text?: string
  packId?: string
  voice?: string
}): Promise<LiveSpeechResult> {
  const text = String(input?.text ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return { ok: false, error: '空文本' }

  // 1) 本地语音包：指定的优先，其次任意一套已安装的
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

  // 2) 系统语音（Windows SAPI / WinRT，离线即时）—— 与 api_tts_speak 同一条兜底链
  try {
    const { mediaTarget } = await import('./mcp/api-tool-executor.js')
    const target = mediaTarget({ kind: 'audios' })
    await fsp.mkdir(target.dir, { recursive: true })
    const file = path.join(target.dir, `live-sys-${Date.now()}.wav`)
    const r = await systemSpeak(text, { outFile: file })
    if (r) {
      return {
        ok: true,
        engine: 'system',
        voice: (r as any).voice,
        url: `${target.urlBase}/${path.basename(file)}`,
        file,
      }
    }
  } catch {
    // 落到下面的在线兜底
  }

  // 3) 兜底：Edge 在线合成（无需模型）
  try {
    const voice = String(input.voice || EDGE_DEFAULT_VOICE)
    const out = await edgeSpeak(text, { voice })
    const { mediaTarget } = await import('./mcp/api-tool-executor.js')
    const target = mediaTarget({ kind: 'audios' })
    await fsp.mkdir(target.dir, { recursive: true })
    const file = path.join(target.dir, `live-edge-${Date.now()}.mp3`)
    await fsp.writeFile(file, out.buffer)
    return {
      ok: true,
      engine: 'edge',
      voice: out.voice || voice,
      url: `${target.urlBase}/${path.basename(file)}`,
      file,
      bytes: out.buffer.length,
    }
  } catch (e: any) {
    return { ok: false, error: `本地无语音包，Edge 在线合成也失败：${e?.message || e}` }
  }
}
