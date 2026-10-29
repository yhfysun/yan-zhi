/**
 * 推流（2026-10-29）：舞台画面 → MediaRecorder(webm 分片) → 主进程 ffmpeg → RTMP。
 *
 * 为什么不在渲染层直接推 RTMP：浏览器没有 RTMP 能力，WebRTC/WHIP 又要额外的媒体服务器。
 * 走「webm 分片 → 本机 ffmpeg 转 flv」只有一条管道，且复用已有的窗口采集与裁剪，
 * 端到端延迟约 1~2 秒——对单向直播足够。
 *
 * 分片必须**串行**送入 ffmpeg：MediaRecorder 的 blob 是异步取 arrayBuffer 的，
 * 并发发送会让 webm 簇乱序，ffmpeg 直接报 "Invalid data"。
 */
import { pickRecorderMime } from './region-recorder'
import { openStageCapture } from './live-recorder'
import { resumeAudioGraph, streamAudioTracks } from './live-audio'

/** 只接受 rtmp/rtmps：其它协议 ffmpeg 也能推，但这个入口只服务直播平台 */
export function isRtmpUrl(url: string): boolean {
  return /^rtmps?:\/\/\S+$/i.test(String(url || '').trim())
}

/** 推流地址里带推流码，打日志/提示时只露协议与主机 */
export function maskRtmpUrl(url: string): string {
  const raw = String(url || '').trim()
  const m = raw.match(/^(rtmps?:\/\/[^/]+)\//i)
  return m ? `${m[1]}/…` : raw.replace(/\/\/.*$/, '//…')
}

export interface LiveStreamHandle {
  mime: string
  stop(): Promise<void>
  /** 断流后重建 ffmpeg + 录制器（采集画布保持） */
  reconnect(): Promise<void>
}

export interface StartLiveStreamOptions {
  el: HTMLElement
  rtmpUrl: string
  fps?: number
  bitrateKbps?: number
}

export async function startLiveStream(opts: StartLiveStreamOptions): Promise<LiveStreamHandle> {
  const api = (window as any).electronAPI
  if (!api?.liveStream?.start || !api?.liveStream?.chunk) {
    throw new Error('当前环境不支持推流（仅桌面端）')
  }
  if (!isRtmpUrl(opts.rtmpUrl)) {
    throw new Error('推流地址必须以 rtmp:// 或 rtmps:// 开头')
  }

  const fps = Math.min(Math.max(Number(opts.fps) || 20, 5), 30)
  const bitrateKbps = Math.min(Math.max(Number(opts.bitrateKbps) || 2500, 500), 8000)

  const started = await api.liveStream.start({ url: opts.rtmpUrl, bitrateKbps })
  if (!started?.ok) throw new Error(started?.error || '推流启动失败')

  let capture
  try {
    capture = await openStageCapture(opts.el, fps)
  } catch (err) {
    await api.liveStream.stop().catch(() => {})
    throw err
  }

  // VP9 解码比 VP8 重，直播场景优先 VP8；都没有再退回默认
  const mime = pickRecorderMime((m) => {
    if (m.includes('vp9')) return false
    return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
  })

  const stream = capture.canvas.captureStream(fps)
  // 音频轨：TTS 播报经 WebAudio 图扇出一路。没有播报时这条轨是静音，
  // 但必须存在 —— 否则 ffmpeg 拿到的 webm 没有音轨，输出也就没有 aac。
  const audioTracks = streamAudioTracks()
  if (audioTracks.length) stream.addTrack(audioTracks[0])
  void resumeAudioGraph()
  const url = opts.rtmpUrl
  let rec: MediaRecorder | null = null
  // 串行发送队列：保证分片按产生顺序进 ffmpeg
  let chain: Promise<void> = Promise.resolve()
  let finished: Promise<void> | null = null

  function startRecorder(): void {
    const r = new MediaRecorder(
      stream,
      mime ? { mimeType: mime, videoBitsPerSecond: bitrateKbps * 1000 } : { videoBitsPerSecond: bitrateKbps * 1000 },
    )
    rec = r
    chain = Promise.resolve()
    r.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return
      chain = chain
        .then(async () => {
          const bytes = new Uint8Array(await e.data.arrayBuffer())
          api.liveStream.chunk(bytes)
        })
        .catch(() => { /* 单块失败不打断整条流 */ })
    }
    finished = new Promise<void>((resolve) => {
      r.onstop = () => resolve()
    })
    r.start(1000)
  }

  async function stopRecorder(): Promise<void> {
    try { if (rec && rec.state !== 'inactive') rec.stop() } catch { /* ignore */ }
    await finished
    await chain
    rec = null
    finished = null
  }

  /**
   * 断流重连。
   * ★ 必须重建录制器：MediaRecorder 只在开始那一刻写一次 WebM 头，
   *   新起的 ffmpeg 从半截流读起会直接报 Invalid data。
   *   采集画布不重建 —— 画面不中断，只是这 1 秒左右的分片重来一遍。
   */
  async function reconnect(): Promise<void> {
    await stopRecorder()
    await api.liveStream.stop().catch(() => {})
    const again = await api.liveStream.start({ url, bitrateKbps })
    if (!again?.ok) throw new Error(again?.error || '重连失败')
    startRecorder()
  }

  startRecorder()

  return {
    mime,
    reconnect,
    async stop() {
      await stopRecorder()
      for (const t of stream.getTracks()) { try { t.stop() } catch { /* ignore */ } }
      capture.stop()
      await api.liveStream.stop().catch(() => {})
    },
  }
}
