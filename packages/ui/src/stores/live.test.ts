import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  DANMAKU_MAX,
  canReplaceCaption,
  capDanmaku,
  laneOf,
  normalizeCaption,
  normalizeDanmaku,
  petStateOfPhase,
  sceneLabel,
  useLiveStore,
} from './live'

describe('live 纯函数', () => {
  it('正文可以顶掉垫场，垫场不能顶掉正文', () => {
    expect(canReplaceCaption('filler', 'reply')).toBe(true)
    expect(canReplaceCaption('reply', 'filler')).toBe(false)
    expect(canReplaceCaption(null, 'filler')).toBe(true)
  })

  it('同级字幕可以互相覆盖', () => {
    expect(canReplaceCaption('narration', 'narration')).toBe(true)
    expect(canReplaceCaption('danmaku', 'reply')).toBe(true)
    expect(canReplaceCaption('reply', 'narration')).toBe(false)
  })

  it('弹幕清洗：压缩空白、去首尾、超长截断', () => {
    expect(normalizeDanmaku('  主播   好  ')).toBe('主播 好')
    expect(normalizeDanmaku('x'.repeat(200))).toHaveLength(60)
    expect(normalizeDanmaku('   ')).toBe('')
    expect(normalizeDanmaku(undefined as unknown as string)).toBe('')
  })

  it('字幕比弹幕允许更长', () => {
    expect(normalizeCaption('y'.repeat(300))).toHaveLength(160)
  })

  it('弹幕列表只保留最近 N 条', () => {
    const list = Array.from({ length: DANMAKU_MAX + 5 }, (_, i) => i)
    const capped = capDanmaku(list)
    expect(capped).toHaveLength(DANMAKU_MAX)
    expect(capped[0]).toBe(5)
    expect(capped[capped.length - 1]).toBe(DANMAKU_MAX + 4)
    expect(list).toHaveLength(DANMAKU_MAX + 5) // 不改原数组
  })

  it('轨道轮转，负数与非法值不越界', () => {
    expect(laneOf(0)).toBe(0)
    expect(laneOf(5)).toBe(0)
    expect(laneOf(7)).toBe(2)
    expect(laneOf(-3)).toBe(0)
    expect(laneOf(Number.NaN)).toBe(0)
  })

  it('阶段映射到宠物六态', () => {
    expect(petStateOfPhase('idle')).toBe('idle')
    expect(petStateOfPhase('talking')).toBe('ready')
    expect(petStateOfPhase('playing')).toBe('running')
    expect(petStateOfPhase('replying')).toBe('needs-input')
  })

  it('场景名有中文标签', () => {
    expect(sceneLabel('pet-full')).toBe('宠物主播')
  })
})

describe('live store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('开播前不播报，也不进 talking', () => {
    const s = useLiveStore()
    expect(s.say('大家好')).toBe(false)
    expect(s.caption).toBe('')
    expect(s.phase).toBe('idle')
  })

  it('开播后正文上屏并进入 talking，下播后清空', () => {
    const s = useLiveStore()
    expect(s.start()).toBe(true)
    expect(s.status).toBe('live')

    expect(s.say('我来演示一下', 'reply')).toBe(true)
    expect(s.caption).toBe('我来演示一下')
    expect(s.captionSource).toBe('reply')
    expect(s.phase).toBe('talking')

    expect(s.stop()).toBe(true)
    expect(s.status).toBe('ended')
    expect(s.caption).toBe('')
    expect(s.phase).toBe('idle')
  })

  it('垫场话不能顶掉正在播的正文', () => {
    const s = useLiveStore()
    s.start()
    s.say('正文', 'reply')
    expect(s.say('垫场', 'filler')).toBe(false)
    expect(s.caption).toBe('正文')
  })

  it('重复开播/重复下播返回 false，状态不乱跳', () => {
    const s = useLiveStore()
    expect(s.start()).toBe(true)
    expect(s.start()).toBe(false)
    expect(s.stop()).toBe(true)
    expect(s.stop()).toBe(false)
    expect(s.status).toBe('ended')
  })

  it('弹幕入队、清洗空串、轨道递增', () => {
    const s = useLiveStore()
    expect(s.pushDanmaku('   ')).toBeNull()
    const a = s.pushDanmaku(' 主播 好 ')
    const b = s.pushDanmaku('再来一条')
    expect(a?.text).toBe('主播 好')
    expect(a?.lane).toBe(1)
    expect(b?.lane).toBe(2)
    expect(s.danmaku).toHaveLength(2)
  })

  it('弹幕列表有上限，不会无限增长', () => {
    const s = useLiveStore()
    for (let i = 0; i < DANMAKU_MAX + 3; i++) s.pushDanmaku(`弹幕${i}`)
    expect(s.danmaku).toHaveLength(DANMAKU_MAX)
  })

  it('切换场景', () => {
    const s = useLiveStore()
    s.setScene('duo')
    expect(s.scene).toBe('duo')
  })

  it('每次上屏字幕序号自增（播报靠它触发）', () => {
    const s = useLiveStore()
    s.start()
    const base = s.captionSeq
    s.say('第一句', 'filler')
    s.say('第二句', 'narration')
    expect(s.captionSeq).toBe(base + 2)
    // 被优先级规则拦掉的不算上屏，序号不动
    s.say('正文', 'reply')
    const afterReply = s.captionSeq
    s.say('垫场', 'filler')
    expect(s.captionSeq).toBe(afterReply)
  })
})
