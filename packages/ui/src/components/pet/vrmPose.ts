/**
 * VRM 人形骨骼的姿态参数（2026-10-28）
 *
 * 为什么单独抽成纯函数：姿态是"六态 + 动作 + 视线"三者的叠加结果，直接写在
 * 渲染循环里既没法测，也容易在加一个状态时把别的状态改坏。这里只算数值，
 * 由 Pet3D 负责把数值贴到 three-vrm 的 normalized bone 上。
 *
 * 角度单位是弧度，坐标系是 VRM 的 normalized humanoid 空间：
 * 手臂静止沿 ±X（T-pose），因此"放下手臂"= 绕 Z 轴 ∓1.1 左右；
 * 前后摆臂/迈腿 = 绕 X 轴。
 */
import type { PetState } from '../../stores/pet'

export interface VrmPose {
  /** 根节点整体位移/旋转（跳、转圈用） */
  rootY: number
  rootRotY: number
  spineX: number
  spineY: number
  spineZ: number
  chestX: number
  headX: number
  headY: number
  headZ: number
  armLX: number
  armLZ: number
  armRX: number
  armRZ: number
  /** 肘：绕 Y（左负右正 = 小臂往前抬，真机量过） */
  foreArmLY: number
  foreArmRY: number
  /** 肩：把整条手臂往身体收一点，是"自然垂手"和"A-pose"的关键差别 */
  shoulderLZ: number
  shoulderRZ: number
  /** 腕：绕手臂轴转手掌，否则手会保持 T-pose 的"掌心朝后、手指外翘" */
  handLY: number
  handRY: number
  handLX: number
  handRX: number
  legLX: number
  legRX: number
  kneeLX: number
  kneeRX: number
  /** VRM1 表情 preset 名（happy/sad/relaxed/surprised/angry/blink/…） */
  expression: string
  expressionWeight: number
  /** 眨眼权重（0..1）：与其他表情并行叠加，不走 expression 那条独占通道 */
  blink: number
  /** 眨眼兜底：模型没有 blink 表情时用眼睑？保持 0，仅记录意图 */
  cursorX: number
  cursorY: number
}

/** 手臂静止姿态：A-pose（比 T-pose 自然，也不会穿模） */
const ARM_DOWN_L = 1.32
const ARM_DOWN_R = -1.32
/** 膝盖只在腿往后摆时弯，避免"直腿拖地" */
const KNEE_BEND = 0.55

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function basePose(): VrmPose {
  return {
    rootY: 0,
    rootRotY: 0,
    spineX: 0,
    spineY: 0,
    spineZ: 0,
    chestX: 0,
    headX: 0,
    headY: 0,
    headZ: 0,
    armLX: 0,
    armLZ: ARM_DOWN_L,
    armRX: 0,
    armRZ: ARM_DOWN_R,
    foreArmLY: -0.25,
    foreArmRY: 0.25,
    shoulderLZ: 0.05,
    shoulderRZ: -0.05,
    handLY: 0,
    handRY: 0,
    handLX: 0.05,
    handRX: 0.05,
    legLX: 0,
    legRX: 0,
    kneeLX: 0,
    kneeRX: 0,
    expression: 'neutral',
    expressionWeight: 0,
    blink: 0,
    cursorX: 0,
    cursorY: 0,
  }
}

export interface PoseInput {
  state: PetState
  action?: string | null
  /** 全局时间（秒），驱动呼吸/走路循环 */
  t: number
  /** 动作已播放时长（秒） */
  actionT?: number
  /** 鼠标相对宠物中心的归一化坐标（-1..1） */
  cursor?: { x: number; y: number }
  /** 是否在踱步（压过六态） */
  walking?: boolean
}

/** 六态 + 踱步 + 动作 → 姿态数值。动作叠加在状态之上（动作优先） */
export function poseFor(input: PoseInput): VrmPose {
  const p = basePose()
  const t = input.t || 0
  const cx = clamp(input.cursor?.x ?? 0, -1, 1)
  const cy = clamp(input.cursor?.y ?? 0, -1, 1)
  p.cursorX = cx
  p.cursorY = cy

  const breath = Math.sin(t * 1.7)
  const lookAt = () => {
    p.headY = cx * 0.45
    p.headX = -cy * 0.22
  }

  // 踱步压过六态：只要走路的循环
  if (input.walking) {
    const fx = Math.sin(t * 7)
    p.legLX = fx * 0.5
    p.legRX = -fx * 0.5
    p.kneeLX = Math.max(0, -fx) * KNEE_BEND
    p.kneeRX = Math.max(0, fx) * KNEE_BEND
    p.armLX = -fx * 0.35
    p.armRX = fx * 0.35
    p.rootY = Math.abs(fx) * 0.02
    p.chestX = 0.03
    p.expression = 'relaxed'
    p.expressionWeight = 0.25
    return p
  }

  switch (input.state) {
    case 'idle': {
      // 站姿要"活"：呼吸带一点点手臂前后摆、躯干重心轻晃，别像根木桩
      p.chestX = breath * 0.02
      p.spineX = breath * 0.01
      p.spineZ = Math.sin(t * 0.5) * 0.02
      const sway = Math.sin(t * 1.1) * 0.03
      p.armLZ = ARM_DOWN_L - Math.abs(sway) * 0.35
      p.armRZ = ARM_DOWN_R + Math.abs(sway) * 0.35
      p.armLX = 0.05 + sway
      p.armRX = 0.05 - sway
      p.foreArmLY = -0.25 - Math.abs(sway) * 0.3
      p.foreArmRY = 0.25 + Math.abs(sway) * 0.3
      lookAt()
      p.headY += Math.sin(t * 0.6) * 0.05
      p.headX += breath * 0.01
      p.expression = 'relaxed'
      p.expressionWeight = 0.2
      break
    }
    case 'running': {
      const fx = Math.sin(t * 9)
      p.legLX = fx * 0.62
      p.legRX = -fx * 0.62
      p.kneeLX = Math.max(0, -fx) * (KNEE_BEND + 0.15)
      p.kneeRX = Math.max(0, fx) * (KNEE_BEND + 0.15)
      p.armLX = fx * 0.5
      p.armRX = -fx * 0.5
      p.armLZ = ARM_DOWN_L + 0.12
      p.armRZ = ARM_DOWN_R - 0.12
      p.rootY = Math.abs(fx) * 0.03
      p.spineX = 0.06
      p.chestX = breath * 0.015
      p.expression = 'relaxed'
      p.expressionWeight = 0.35
      break
    }
    case 'needs-input':
      p.headZ = 0.12
      p.headY = Math.sin(t * 2.2) * 0.16
      p.headX = -0.05
      p.armLZ = ARM_DOWN_L + 0.1
      p.armRZ = ARM_DOWN_R - 0.1
      p.chestX = breath * 0.03
      p.expression = 'surprised'
      p.expressionWeight = 0.6
      break
    case 'paused':
      p.spineX = 0.1
      p.headX = 0.24
      p.armLZ = ARM_DOWN_L - 0.18
      p.armRZ = ARM_DOWN_R + 0.18
      p.expression = 'relaxed'
      p.expressionWeight = 0.5
      break
    case 'ready': {
      const hop = Math.max(0, Math.sin(t * 3.2))
      p.rootY = hop * 0.035
      p.expression = 'happy'
      p.expressionWeight = 0.85
      p.armLZ = ARM_DOWN_L - 0.25
      p.armRZ = ARM_DOWN_R + 0.25
      break
    }
    case 'error': {
      p.headY = Math.sin(t * 26) * 0.12
      p.spineX = -0.04
      p.expression = 'angry'
      p.expressionWeight = 0.55
      break
    }
  }

  // 眨眼（与表情并行）：4.5s 一轮，闭眼 100ms、半闭 80ms
  const blinkPh = t % 4.5
  if (blinkPh < 0.1) p.blink = 1
  else if (blinkPh < 0.18) p.blink = 0.45

  // 动作叠加（动作时状态姿态仍保留呼吸，但不再抢头/手）
  const act = input.action
  if (!act) return p
  const at = input.actionT ?? 0
  const p01 = clamp(at / (input.action === 'hop' ? 0.75 : 1.1), 0, 1)
  const k = Math.sin(p01 * Math.PI)
  switch (act) {
    case 'pet':
      p.headZ = -0.18 * k
      p.headX = -0.06 * k
      p.expression = 'happy'
      p.expressionWeight = 0.8
      break
    case 'wave':
      p.armRZ = ARM_DOWN_R + 1.9 * Math.min(1, p01 / 0.25)
      p.foreArmRY = 0.9 + Math.sin(at * 14) * 0.35
      p.expression = 'happy'
      p.expressionWeight = 0.5
      break
    case 'look':
      p.headY = Math.sin(p01 * Math.PI * 2) * 0.55
      break
    case 'nap':
      p.headX = 0.36 * Math.min(1, p01 * 3)
      p.spineX = 0.16 * Math.min(1, p01 * 3)
      p.blink = 1
      break
    case 'spin':
      p.rootRotY = (p01 < 0.5 ? 2 * p01 * p01 : 1 - Math.pow(-2 * p01 + 2, 2) / 2) * Math.PI * 2
      break
    case 'hop':
      p.rootY = Math.sin(Math.min(1, p01 / 0.8) * Math.PI) * 0.16
      p.expression = 'happy'
      p.expressionWeight = 0.6
      break
  }
  return p
}
