import { describe, expect, it } from 'vitest'
import { createChibi } from './chibi'
import { createStars } from './stars'
import { createDebate } from './debate'
import { createSurname } from './surname'
import { createMbti } from './mbti'
import { createModeByKey, MODE_FACTORIES } from './registry'
import { GATE, ROUND_MS, JUDGE_AT } from './shared-constants'

const S = (rewrite = 0, resolved = false) => ({ rewrite, resolved })

describe('danmaku modes registry', () => {
  it('注册了五种玩法且 key 唯一', () => {
    const keys = MODE_FACTORIES.map((f) => f().key)
    expect(keys).toEqual(['chibi', 'stars', 'debate', 'surname', 'mbti'])
    expect(new Set(keys).size).toBe(5)
  })

  it('createModeByKey 按 key 建实例，未知 key 返回 null', () => {
    expect(createModeByKey('chibi')?.name).toBe('赤壁之战')
    expect(createModeByKey('mbti')?.team).toBe(true)
    expect(createModeByKey('nope')).toBeNull()
  })
})

describe('gate 玩法（拉锯门槛）', () => {
  it('赤壁：startAt=0、gate=60、非团队', () => {
    const m = createChibi()
    expect(m.startAt).toBe(0)
    expect(m.gate).toBe(GATE)
    expect(m.team).toBe(false)
    expect(m.phases.length).toBeGreaterThan(0)
  })

  it('观星：startAt=0、gate=60、星力/人力双方', () => {
    const m = createStars()
    expect(m.startAt).toBe(0)
    expect(m.gate).toBe(GATE)
    expect(m.sides.a).toContain('人力')
  })

  it('甜咸：startAt=50、gate=50（多数决）', () => {
    const m = createDebate()
    expect(m.startAt).toBe(50)
    expect(m.gate).toBe(50)
  })

  it('甜咸：站队词返回 join 语义', () => {
    const m = createDebate()
    m.reset()
    expect(m.onComment('甜', '观众A', null, S(50))).toEqual({ join: 'a' })
    expect(m.onComment('咸', '观众A', null, S(50))).toEqual({ join: 'b' })
    expect(m.onComment('说理', '观众A', null, S(50))).toBe(false)
  })
})

describe('团队玩法（抢榜）', () => {
  it('姓氏/MBTI：team=true 且 tick 回传领先方占比', () => {
    const surname = createSurname()
    surname.reset()
    expect(surname.team).toBe(true)
    expect(surname.freeWords.length).toBeGreaterThan(0)
    const ev = surname.tick(0, 0.016, S(0))
    expect(typeof ev?.share).toBe('number')

    const mbti = createMbti()
    mbti.reset()
    expect(mbti.team).toBe(true)
    expect(mbti.onComment('INTJ', '观众B', null, S(0))).toBe(true)
  })

  it('姓氏：发自己的姓加分，不认识的弹幕不消费', () => {
    const m = createSurname()
    m.reset()
    const before = m.onJudge
    expect(before).toBeTruthy()
    // 「王」是内置姓氏：消费；「XX」不是：不消费
    expect(m.onComment('王', '观众C', null, S(0))).toBe(true)
    expect(m.onComment('某不存在姓氏', '观众C', null, S(0))).toBe(false)
  })

  it('MBTI：四字母（含小写/混杂）都能点亮本型', () => {
    const m = createMbti()
    m.reset()
    expect(m.onComment('intj', '观众D', null, S(0))).toBe(true)
    expect(m.onComment('i n t j!', '观众D', null, S(0))).toBe(true)
    expect(m.onComment('XYZW', '观众D', null, S(0))).toBe(false)
  })
})

describe('判赏红线', () => {
  it('常量：一局 60 秒、40 秒判定、门槛 60', () => {
    expect(ROUND_MS).toBe(60_000)
    expect(JUDGE_AT).toBe(40_000)
    expect(GATE).toBe(60)
  })

  it('赤壁 onJudge 两种结局都只产台词不改数值', () => {
    const m = createChibi()
    m.reset()
    const a = m.onJudge(true, 'a', S(80, true))
    const b = m.onJudge(false, 'b', S(30, true))
    expect(a?.say).toBeTruthy()
    expect(b?.say).toBeTruthy()
  })

  it('观星 onJudge 两种结局文案区分', () => {
    const m = createStars()
    m.reset()
    expect(m.onJudge(true, 'a', S(80, true))?.say).toContain('人力')
    expect(m.onJudge(false, 'b', S(30, true))?.say).toBeTruthy()
  })

  it('战报：五玩法 report 都给出 title/live/dead', () => {
    for (const f of MODE_FACTORIES) {
      const m = f()
      m.reset()
      const rep = m.report({
        outcome: 'altered',
        lead: 'a',
        percent: 72,
        top: { name: '测试', coins: 99 },
        comboTop: null,
        contribs: [],
        losers: [],
      })
      expect(rep.title.length).toBeGreaterThan(0)
      expect(rep.live.length).toBeGreaterThan(0)
      expect(rep.dead.length).toBeGreaterThan(0)
    }
  })
})
