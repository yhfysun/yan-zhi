/**
 * 直播虚拟人的 VRM 形象层（2026-10-30）。
 *
 * 为什么不用程序化几何体：手感再怎么调，本质还是「球+圆柱拼的」，一眼就是塑料 3D。
 * 而仓库里本来就内置了两只 **CC0 1.0** 的 VRoid 样例模型（可商用、免署名，见
 * apps/web/public/vrm/README.md），且宠物伴星那条链路已经解决了加载/归一化/收手指。
 *
 * 这一层只补直播特有的三件事：
 *  1. **半身取景** —— 宠物是全身像，直播要的是头肩特写；
 *  2. **口型** —— 用 TTS 音频振幅驱动 `aa` 表情（VITS 不给音素时间戳）；
 *  3. **表情映射** —— 页面给的是 neutral/thinking/happy/confused，要落到 VRM 表情预设上。
 */
import * as THREE from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { loadVrmFromBuffer, relaxHands } from '../pet/vrmLoader'
import { BUILTIN_VRM_FILE, builtinVrmOf } from '../../stores/pet'

export type AvatarExpr = 'neutral' | 'thinking' | 'happy' | 'confused'

export interface AvatarVrmState {
  /** 全局时间（秒），驱动呼吸/摆动 */
  t: number
  /** 口型张开量 0..1 */
  open: number
  expression: AvatarExpr
}

export interface AvatarVrm {
  root: THREE.Group
  /** 半身取景时相机该对准的世界坐标点 */
  focus: THREE.Vector3
  update(dt: number, s: AvatarVrmState): void
  dispose(): void
}

/** 模型字节缓存（按 id）：切换场景会重新挂载组件，重复下载 15~19MB 太浪费 */
const bufferCache = new Map<string, ArrayBuffer>()
const bufferFailed = new Set<string>()

/** 内置模型 id → public 下的相对路径；未知 id 回落到第一只 */
function fileOf(id: string | undefined): string {
  const hit = builtinVrmOf(id)
  return hit ? 'vrm/' + hit.file : BUILTIN_VRM_FILE
}

async function loadBuffer(id: string): Promise<ArrayBuffer | null> {
  const cached = bufferCache.get(id)
  if (cached) return cached
  const file = fileOf(id)
  if (!file || bufferFailed.has(id)) return null
  try {
    const res = await fetch('/' + file)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    bufferCache.set(id, buf)
    return buf
  } catch {
    // 打包时 --pets=none 会删掉 vrm/ 目录，404 是预期情况：调用方退回程序化形象
    bufferFailed.add(id)
    return null
  }
}

/** 页面表情 → VRM 表情预设。空串表示不覆盖（保持默认脸） */
const EXPR_PRESET: Record<AvatarExpr, { name: string; weight: number }> = {
  neutral: { name: '', weight: 0 },
  thinking: { name: 'relaxed', weight: 0.55 },
  happy: { name: 'happy', weight: 0.85 },
  confused: { name: 'surprised', weight: 0.45 },
}

export async function createAvatarVrm(id = 'shino'): Promise<AvatarVrm | null> {
  const buf = await loadBuffer(id)
  if (!buf) return null
  const { vrm, holder } = await loadVrmFromBuffer(buf, 4.0, { optimize: false })
  relaxHands(vrm)

  const bone = (name: string) => {
    try {
      return vrm.humanoid?.getNormalizedBoneNode(name as never) || null
    } catch {
      return null
    }
  }
  const headNode = bone('head')
  const chestNode = bone('chest')

  // 模型是 T-pose（双臂横平），直播里必须放下来，否则像被架着。
  // 角度与宠物那条链路的 basePose 一致（实测过的数值，别自己另调一套）。
  const setBase = (name: string, x: number, y: number, z: number) => {
    const n = bone(name)
    if (n) n.rotation.set(x, y, z)
  }
  setBase('leftShoulder', 0, 0, 0.05)
  setBase('rightShoulder', 0, 0, -0.05)
  setBase('leftUpperArm', 0, 0, 1.32)
  setBase('rightUpperArm', 0, 0, -1.32)
  setBase('leftLowerArm', 0, -0.25, 0)
  setBase('rightLowerArm', 0, 0.25, 0)
  setBase('leftHand', 0.05, 0, 0)
  setBase('rightHand', 0.05, 0, 0)

  // 头心世界高度：优先问原始头骨；问不到就按「总高 4.0、头部约占下端 0.38」估
  let headY = 3.62
  try {
    const rawHead = vrm.humanoid?.getRawBoneNode?.('head' as never) as THREE.Object3D | undefined
    if (rawHead) {
      vrm.scene.updateWorldMatrix(true, true)
      const p = new THREE.Vector3()
      rawHead.getWorldPosition(p)
      if (p.y > 2.2 && p.y < 4.3) headY = p.y
    }
  } catch {
    /* 用估值 */
  }

  const em: any = (vrm as any).expressionManager
  let lastExpr = ''
  let blinkT = Math.random() * 3

  return {
    root: holder,
    focus: new THREE.Vector3(0, headY - 0.16, 0),
    update(dt: number, s: AvatarVrmState) {
      // 待机：呼吸起伏 + 极轻的重心摆动（幅度大了像晕船）
      holder.position.y = Math.sin(s.t * 1.6) * 0.012
      holder.rotation.z = Math.sin(s.t * 0.7) * 0.01
      if (headNode) {
        headNode.rotation.set(
          Math.sin(s.t * 0.9) * 0.03,
          Math.sin(s.t * 0.55) * 0.11,
          Math.sin(s.t * 0.45) * 0.02
        )
      }
      if (chestNode) chestNode.rotation.x = Math.sin(s.t * 1.6) * 0.012

      if (em?.setValue) {
        const preset = EXPR_PRESET[s.expression] || EXPR_PRESET.neutral
        if (preset.name !== lastExpr) {
          if (lastExpr) {
            try { em.setValue(lastExpr, 0) } catch { /* 模型没有这个表情 */ }
          }
          lastExpr = preset.name
        }
        if (preset.name) {
          try { em.setValue(preset.name, preset.weight) } catch { /* 同上 */ }
        }
        // 口型：`aa` 是 VRM0 A 口型的标准映射，three-vrm 会自己转
        try { em.setValue('aa', Math.min(1, s.open * 1.25)) } catch { /* 模型没有 aa */ }
        // 眨眼：叠加通道，不吃上面那条独占
        blinkT += dt
        const ph = blinkT % 3.6
        const blink = ph < 0.1 ? 1 : ph < 0.17 ? 0.45 : 0
        try { em.setValue('blink', blink) } catch { /* 同上 */ }
      }
      vrm.update(dt)
    },
    dispose() {
      holder.traverse((o: any) => {
        o.geometry?.dispose?.()
        const mat = o.material
        if (Array.isArray(mat)) mat.forEach((m: any) => m?.dispose?.())
        else mat?.dispose?.()
      })
      try { (vrm as any).dispose?.() } catch { /* 释放失败不影响卸载 */ }
    },
  }
}
