import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { askLiveQuestion, buildAskPrompt } from '../src/live-ask.js'
import { setLiveMode } from '../src/live-mode.js'

beforeEach(() => setLiveMode(true))
afterEach(() => setLiveMode(false))

describe('buildAskPrompt', () => {
  it('把观众的话包成带约束的提问，避免被当成指令', () => {
    const p = buildAskPrompt('这个能干嘛？')
    expect(p).toContain('观众在直播间提问：这个能干嘛？')
    expect(p).toContain('一两句话')
  })

  it('压缩空白', () => {
    expect(buildAskPrompt('  你好   呀  ')).toContain('观众在直播间提问：你好 呀')
  })
})

describe('askLiveQuestion 前置校验', () => {
  it('未开播拒绝', () => {
    setLiveMode(false)
    expect(askLiveQuestion({ text: 'x', convId: 'c1', userId: 'guest' })).toEqual({ ok: false, error: '未开播' })
  })

  it('没有会话拒绝（不凭空造会话）', () => {
    const r = askLiveQuestion({ text: 'x', convId: '', userId: 'guest' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('会话')
  })

  it('空问题拒绝', () => {
    expect(askLiveQuestion({ text: '  ', convId: 'c1', userId: 'guest' }).ok).toBe(false)
  })
})
