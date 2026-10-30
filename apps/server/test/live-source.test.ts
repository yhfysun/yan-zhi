import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pullDanmaku, resetDanmakuBuffer } from '../src/live-danmaku.js'
import { setLiveMode } from '../src/live-mode.js'
import {
  REPLAY_SCRIPT,
  liveSourceState,
  replayStepAt,
  resetLiveSource,
  startReplaySource,
  stopLiveSource,
} from '../src/live-source.js'

describe('live-source', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setLiveMode(true)
    resetDanmakuBuffer()
    resetLiveSource()
  })

  afterEach(() => {
    stopLiveSource()
    vi.useRealTimers()
    setLiveMode(false)
    resetDanmakuBuffer()
  })

  it('脚本按序循环，负数不越界', () => {
    expect(replayStepAt(0)).toEqual(REPLAY_SCRIPT[0])
    expect(replayStepAt(REPLAY_SCRIPT.length)).toEqual(REPLAY_SCRIPT[0])
    expect(replayStepAt(-1)).toEqual(REPLAY_SCRIPT[REPLAY_SCRIPT.length - 1])
  })

  it('启动后按间隔把弹幕投进缓冲区', () => {
    const started = startReplaySource(1000)
    expect(started.kind).toBe('replay')
    expect(started.sent).toBe(0)

    vi.advanceTimersByTime(3100)

    const items = pullDanmaku(0).items
    expect(items).toHaveLength(3)
    expect(items[0].text).toBe(REPLAY_SCRIPT[0].text)
    expect(items[0].from).toBe(REPLAY_SCRIPT[0].from)
    expect(liveSourceState().sent).toBe(3)
  })

  it('停源后不再投递', () => {
    startReplaySource(1000)
    vi.advanceTimersByTime(1100)
    stopLiveSource()
    expect(liveSourceState().kind).toBe('off')

    const before = pullDanmaku(0).items.length
    vi.advanceTimersByTime(5000)
    expect(pullDanmaku(0).items.length).toBe(before)
  })

  it('未开播时 ingest 拒收，sent 不增长', () => {
    setLiveMode(false)
    startReplaySource(1000)
    vi.advanceTimersByTime(2100)

    expect(liveSourceState().sent).toBe(0)
    expect(pullDanmaku(0).items).toHaveLength(0)
  })
})
