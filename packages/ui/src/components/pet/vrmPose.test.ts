import { describe, expect, it } from 'vitest'
import { basePose, poseFor } from './vrmPose'

const rest = (state: any, extra: Record<string, unknown> = {}) => poseFor({ state, t: 0, ...extra })

describe('vrmPose · 基础姿态', () => {
  it('默认是 A-pose：两臂朝下（绕 Z 反号），膝盖不弯', () => {
    const p = basePose()
    // 该模型的 normalized 空间里：左臂朝下是绕 Z 正转，右臂是负转
    expect(p.armLZ).toBeGreaterThan(0)
    expect(p.armRZ).toBeLessThan(0)
    expect(p.kneeLX).toBe(0)
    expect(p.kneeRX).toBe(0)
  })
})

describe('vrmPose · 六态', () => {
  it('待机：轻微呼吸 + 头随视线，relaxed 低权重', () => {
    const p = rest('idle', { t: 0.9, cursor: { x: 0.8, y: -0.5 } })
    expect(p.expression).toBe('relaxed')
    expect(p.expressionWeight).toBeGreaterThan(0)
    expect(p.headY).toBeGreaterThan(0) // 光标在右 → 头朝右
    expect(p.headX).toBeGreaterThan(0) // 光标在上（y 负）→ 抬头
  })

  it('运行中：双腿反相摆动，幅度大于踱步', () => {
    const run = rest('running', { t: 0.42 })
    const walk = rest('idle', { t: 0.42, walking: true })
    expect(Math.sign(run.legLX)).toBe(-Math.sign(run.legRX))
    expect(Math.abs(run.legLX)).toBeGreaterThanOrEqual(Math.abs(walk.legLX))
    expect(Math.sign(walk.legLX)).toBe(-Math.sign(walk.legRX))
  })

  it('等你输入：惊讶表情 + 歪头', () => {
    const p = rest('needs-input')
    expect(p.expression).toBe('surprised')
    expect(p.headZ).toBeGreaterThan(0)
  })

  it('暂停：低头塌肩，relaxed', () => {
    const p = rest('paused')
    expect(p.headX).toBeGreaterThan(0.1)
    expect(p.spineX).toBeGreaterThan(0)
    expect(p.expression).toBe('relaxed')
  })

  it('完成：happy 且权重够高', () => {
    const p = rest('ready')
    expect(p.expression).toBe('happy')
    expect(p.expressionWeight).toBeGreaterThan(0.5)
  })

  it('出错：angry', () => {
    expect(rest('error').expression).toBe('angry')
  })
})

describe('vrmPose · 动作叠加', () => {
  it('招手：右手抬起来（Z 角收敛向 0）且 happy', () => {
    const base = rest('idle')
    const wave = poseFor({ state: 'idle', action: 'wave', t: 1, actionT: 0.5 })
    expect(wave.armRZ).toBeGreaterThan(base.armRZ) // 从下垂往 0 抬起来
    expect(wave.expression).toBe('happy')
  })

  it('打盹：闭眼（blink 权重拉满）+ 低头', () => {
    const nap = poseFor({ state: 'idle', action: 'nap', t: 1, actionT: 0.6 })
    expect(nap.expression).toBe('blink')
    expect(nap.expressionWeight).toBe(1)
    expect(nap.headX).toBeGreaterThan(0.1)
  })

  it('转圈：整圈自转，动作末端回到 2π（视觉上等于回正）', () => {
    const half = poseFor({ state: 'idle', action: 'spin', t: 1, actionT: 0.55 })
    const end = poseFor({ state: 'idle', action: 'spin', t: 1, actionT: 1.1 })
    expect(half.rootRotY).toBeGreaterThan(0)
    expect(end.rootRotY).toBeCloseTo(Math.PI * 2, 1)
  })

  it('摸头：歪头 + happy', () => {
    const pet = poseFor({ state: 'idle', action: 'pet', t: 1, actionT: 0.5 })
    expect(pet.headZ).toBeLessThan(0)
    expect(pet.expression).toBe('happy')
  })

  it('踱步时动作不生效（走路优先）', () => {
    const p = poseFor({ state: 'idle', action: 'wave', t: 1, actionT: 0.5, walking: true })
    expect(p.expression).toBe('relaxed')
  })
})
