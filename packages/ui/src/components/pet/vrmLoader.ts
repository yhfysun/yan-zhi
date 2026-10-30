/**
 * VRM 加载封装（2026-10-28）
 *
 * 只做"字节 → 可渲染的 VRM"：解析、清理、朝向修正、按目标高度归一化。
 * 姿态与动画在 vrmPose.ts（纯函数），贴骨骼在 Pet3D.vue —— 三层分开，
 * 换渲染器（three → 别的）时只有这一层和贴骨骼那段要动。
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'

/** 期望的模型屏幕高度（与程序化素模尺度对齐，相机参数不用跟着改） */
const TARGET_HEIGHT = 4.0

export interface LoadedVrm {
  vrm: VRM
  /** 归一化之后的世界高度（相机取景按它算） */
  height: number
  /** 外包一层：旋转/位移动画放在它身上，避免踩到 VRM0 的 rotateVRM0 结果 */
  holder: THREE.Group
}

export async function loadVrmFromBuffer(
  buffer: ArrayBuffer,
  targetHeight = TARGET_HEIGHT,
  opts: { optimize?: boolean } = {}
): Promise<LoadedVrm> {
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const gltf = await loader.parseAsync(buffer, '')
  const vrm: VRM | undefined = (gltf as any).userData?.vrm
  if (!vrm) throw new Error('不是 VRM 文件（缺少 VRM 扩展）')

  // 顶点/骨骼合并：不合并的话常驻置顶窗里每帧都要多画一堆网格。
  // ⚠️ 近距离特写（直播虚拟人）时会放大合骨的副作用 —— 头发蒙皮错乱成一团尖刺，
  // 那条链路传 optimize:false 关掉，小尺寸的宠物窗保持默认开。
  if (opts.optimize !== false) {
    try {
      VRMUtils.removeUnnecessaryVertices(gltf.scene)
      VRMUtils.combineSkeletons(gltf.scene)
    } catch {
      /* 老版本模型结构异常时跳过优化，能显示优先 */
    }
  }
  // VRM 0.x 资产朝 -Z：统一转到面向相机
  try {
    VRMUtils.rotateVRM0(vrm)
  } catch {
    /* 同上 */
  }

  vrm.scene.traverse((o: any) => {
    o.frustumCulled = false // 透明窗里包围盒偶尔算错导致闪烁，关掉更稳
  })

  // 按身高归一化：脚底落到 y=0，整体缩放到 TARGET_HEIGHT
  const box = new THREE.Box3().setFromObject(vrm.scene)
  const size = box.getSize(new THREE.Vector3())
  const height = size.y || 1
  const scale = targetHeight / height
  vrm.scene.scale.setScalar(scale)
  box.setFromObject(vrm.scene)
  vrm.scene.position.y -= box.min.y

  const holder = new THREE.Group()
  holder.add(vrm.scene)
  return { vrm, holder, height: targetHeight }
}

/**
 * 把 T-pose 张开的手收成自然半握（2026-10-29 真机：手指全部外翘像假人）。
 * 只做一次（加载后），不参与每帧姿态；手指骨骼在 normalized 空间里
 * 绕 X 正转就是"握"，Proximal 小、Intermediate 大，避免折成钩子。
 */
export function relaxHands(vrm: VRM) {
  const set = (name: string, x: number, y = 0, z = 0) => {
    try {
      const n = vrm.humanoid?.getNormalizedBoneNode(name as never)
      if (n) n.rotation.set(x, y, z)
    } catch {
      /* 模型缺这根手指骨：跳过 */
    }
  }
  for (const side of ['left', 'right'] as const) {
    // 绕 Y 才是"往掌心收"的方向，且左右镜像（真机量角度确认：左正右负）
    const curl = side === 'left' ? 1 : -1
    for (const f of ['Index', 'Middle', 'Ring', 'Little'] as const) {
      set(`${side}${f}Proximal`, 0, 0.35 * curl, 0)
      set(`${side}${f}Intermediate`, 0, 0.5 * curl, 0)
      set(`${side}${f}Distal`, 0, 0.2 * curl, 0)
    }
    // 拇指往掌心收，别横着翘
    set(`${side}ThumbMetacarpal`, 0, 0.15 * curl, side === 'left' ? -0.2 : 0.2)
    set(`${side}ThumbProximal`, 0, 0.2 * curl, 0)
  }
}

/** 表情名兼容：VRM0 模型里 joy/sorrow 等会被 three-vrm 映射到 VRM1 名，取第一个存在的 */
export function pickExpression(vrm: VRM, ...names: string[]): string {
  const mgr: any = (vrm as any).expressionManager
  if (!mgr) return ''
  for (const n of names) {
    try {
      if (mgr.getExpression?.(n) || mgr.getExpressionTrackName?.(n)) return n
    } catch {
      /* 继续试下一个 */
    }
  }
  return ''
}
