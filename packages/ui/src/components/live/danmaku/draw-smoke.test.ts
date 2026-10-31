/**
 * 渲染冒烟：stub canvas ctx，把五个玩法的 tick/draw/gift/comment 全跑一遍。
 * 目的：抓住 vue-tsc 抓不到的运行时异常（undefined 数学、漏初始化的数组等）。
 * 不验证像素。
 */
import { describe, expect, it } from 'vitest'
import { createModeByKey, MODE_FACTORIES } from './registry'

/** 万能 ctx stub：未知方法返回 undefined，渐变工厂返回带 addColorStop 的对象 */
function stubCtx(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} }
  const base: Record<string, unknown> = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: (s: string) => ({ width: String(s).length * 8 }),
    canvas: { width: 360, height: 640 },
  }
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop as string]
      return () => undefined
    },
    set() {
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

const DT = 1 / 30

describe('五玩法渲染冒烟（tick + draw + 输入全链路）', () => {
  for (const make of MODE_FACTORIES) {
    it(`${make().key}：模拟 60 秒 + 礼物/弹幕穿插不抛异常`, () => {
      const m = make()
      const g = stubCtx()
      const s = { rewrite: m.startAt, resolved: false }

      m.reset()
      // 60 秒、30fps：每帧 tick + draw；中段喂礼物与弹幕
      for (let frame = 0; frame < 1800; frame++) {
        const t = frame * DT * 1000
        if (frame === 600) {
          s.rewrite = 70 // 触发绝地反击分支与阶段切换
        }
        if (frame === 1200) {
          s.resolved = true // 判定后：tick/draw/gift 都要走「不再改结论」分支
          m.onJudge(true, 'a', s)
        }
        const ev = m.tick(t, DT, s)
        if (ev?.share != null) s.rewrite = m.team ? s.rewrite : s.rewrite
        m.draw(g, t, DT, s)
        if (frame % 200 === 100) {
          m.onGift('donut', frame % 400 === 100 ? 'a' : 'b', '冒烟观众', 1, s)
          m.onGift('battery', 'a', '冒烟观众', 2.5, s)
          m.onComment('王', '冒烟观众', 'a', s)
          m.onComment('INTJ', '冒烟观众', 'a', s)
        }
      }
      // onPhase 全档位走一遍
      m.phases.forEach((_, i) => m.onPhase?.(i, ''))
      // report 全结局走一遍
      m.report({ outcome: 'base', lead: 'b', percent: 30, top: null, comboTop: null, contribs: [], losers: [] })
      m.report({ outcome: 'altered', lead: 'a', percent: 75, top: null, comboTop: null, contribs: [], losers: [] })
      expect(true).toBe(true)
    })
  }

  it('引擎常量与玩法阶段不超过一局时长', () => {
    for (const make of MODE_FACTORIES) {
      const m = make()
      const lastAt = m.phases[m.phases.length - 1]?.at ?? 0
      expect(lastAt).toBeLessThanOrEqual(60)
    }
  })

  it('createModeByKey 五个 key 全部可建', () => {
    for (const key of ['chibi', 'stars', 'debate', 'surname', 'mbti']) {
      expect(createModeByKey(key)?.key).toBe(key)
    }
  })
})
