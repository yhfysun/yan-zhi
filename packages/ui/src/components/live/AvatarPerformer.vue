<template>
  <div class="live-avatar" :data-expr="expression" :data-fallback="fallback ? '1' : '0'">
    <canvas v-if="!fallback" ref="cv" class="live-avatar__canvas" />
    <!-- 没有 WebGL（无头环境/老显卡）时退成 CSS 形象：口型仍然跟着音量动 -->
    <div v-else class="live-avatar__css">
      <div class="css-body" />
      <div class="css-head">
        <span class="css-brow l" />
        <span class="css-brow r" />
        <span class="css-eye l" />
        <span class="css-eye r" />
        <span class="css-mouth" :style="{ transform: `translateX(-50%) scaleY(${(0.28 + mouthCss * 1.7).toFixed(2)})` }" />
        <span class="css-hair" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 直播虚拟人（2026-10-29）。
 *
 * 程序化 three.js 角色：不依赖任何模型资产，零授权、零下载。
 * 口型用播报音频的振幅驱动（见 live-audio 的 mouthLevel）——sherpa VITS 不给音素时间戳，
 * 按振幅驱动是与 TTS 引擎解耦的唯一做法，视觉上够用。
 *
 * 与宠物共用同一套调用契约：状态/动作由页面控制，这里只管"长什么样、怎么动"。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { mouthLevel } from '../../composables/live-audio'
import { createAvatarVrm, type AvatarVrm } from './avatarVrm'

type AvatarExpression = 'neutral' | 'thinking' | 'happy' | 'confused'

const props = withDefaults(
  defineProps<{
    expression?: AvatarExpression
    /** 是否在播报（决定要不要采音频振幅） */
    speaking?: boolean
    /** 内置 VRM 模型 id（见 PET_BUILTIN_VRMS） */
    vrmId?: string
    /** 朝左/朝右的轻微摆动方向 */
    flip?: boolean
    active?: boolean
    visible?: boolean
    scale?: number
  }>(),
  { expression: 'neutral', speaking: false, vrmId: 'shino', flip: false, active: true, visible: true, scale: 1 }
)

const cv = ref<HTMLCanvasElement | null>(null)
const fallback = ref(false)
const mouthCss = ref(0)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let root: THREE.Group | null = null
let head: THREE.Object3D | null = null
let mouth: THREE.Object3D | null = null
let eyes: THREE.Object3D[] = []
let brows: THREE.Object3D[] = []
let raf = 0
let ro: ResizeObserver | null = null
let blinkAt = 0
let blinkUntil = 0
/** VRM 形象（内置 CC0 模型）。加载成功后接管渲染，程序化形象随即隐藏 */
let vrmAvatar: AvatarVrm | null = null
let lastFrameAt = 0

function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const any = o as any
    if (any.geometry) any.geometry.dispose?.()
    if (any.material) {
      const mats = Array.isArray(any.material) ? any.material : [any.material]
      for (const m of mats) m.dispose?.()
    }
  })
}

/**
 * 头部尺寸与构图常量（改这几行就能整体调比例）。
 * 头心在 y=0.42，半径 0.5 —— 五官坐标都相对头心，跟着头一起摆时才不会错位。
 */
const HEAD_Y = 0.42
const HEAD_R = 0.5

interface AvatarMats {
  skin: THREE.MeshStandardMaterial
  skinShade: THREE.MeshStandardMaterial
  hair: THREE.MeshStandardMaterial
  cloth: THREE.MeshStandardMaterial
  trim: THREE.MeshStandardMaterial
  sclera: THREE.MeshStandardMaterial
  iris: THREE.MeshStandardMaterial
  pupil: THREE.MeshStandardMaterial
  shine: THREE.MeshStandardMaterial
  lip: THREE.MeshStandardMaterial
  mouthIn: THREE.MeshStandardMaterial
  blush: THREE.MeshStandardMaterial
}

function makeMats(): AvatarMats {
  return {
    skin: new THREE.MeshStandardMaterial({ color: 0xf6d2b8, roughness: 0.62 }),
    skinShade: new THREE.MeshStandardMaterial({ color: 0xe4b596, roughness: 0.7 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x2b3350, roughness: 0.48 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x3a5580, roughness: 0.88 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xe9eef7, roughness: 0.72 }),
    sclera: new THREE.MeshStandardMaterial({ color: 0xfdfdff, roughness: 0.35 }),
    iris: new THREE.MeshStandardMaterial({ color: 0x2f6f9e, roughness: 0.3 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x16202e, roughness: 0.25 }),
    shine: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.55 }),
    lip: new THREE.MeshStandardMaterial({ color: 0xc27a72, roughness: 0.5 }),
    mouthIn: new THREE.MeshStandardMaterial({ color: 0x7a2f38, roughness: 0.6 }),
    blush: new THREE.MeshStandardMaterial({ color: 0xf2a08f, roughness: 0.9, transparent: true, opacity: 0.32 }),
  }
}

/** 肩颈胸廓：用 lathe 旋转出「脖子→溜肩→胸」的连续轮廓，比球+圆柱自然得多。 */
function buildTorso(m: AvatarMats): THREE.Group {
  const g = new THREE.Group()
  const profile: Array<[number, number]> = [
    [0.115, 0.02], [0.145, -0.04], [0.24, -0.12], [0.35, -0.21],
    [0.42, -0.3], [0.45, -0.42], [0.45, -0.78], [0.43, -1.1], [0.4, -1.22],
  ]
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 56),
    m.cloth
  )
  g.add(body)

  // 脖子（藏在头底下，露出一小截）
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.13, 0.26, 24), m.skin)
  neck.position.y = 0.04
  g.add(neck)

  // 领口
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.036, 12, 40), m.trim)
  collar.rotation.x = Math.PI / 2
  collar.position.y = -0.05
  g.add(collar)

  // 前襟的 V 形走线：两条从领口斜向下汇到中线，纯色衣服才不像麻袋
  for (const side of [-1, 1]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.44, 0.02), m.trim)
    seam.position.set(0.06 * side, -0.31, 0.42)
    seam.rotation.z = -0.3 * side
    seam.rotation.y = -0.18 * side
    g.add(seam)
  }

  // 手臂：上臂 + 手，贴住肩线往下垂（之前放在 0.47 处，肩窝处留了条缝，像悬空的管子）
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.4, 6, 18), m.cloth)
    arm.position.set(0.405 * side, -0.46, 0.0)
    arm.rotation.z = 0.1 * side
    g.add(arm)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.082, 20, 16), m.skin)
    hand.position.set(0.425 * side, -0.69, 0.02)
    hand.scale.set(1, 1.12, 0.85)
    g.add(hand)
  }
  return g
}

/** 单只眼睛：眼白 + 虹膜 + 瞳孔 + 高光 + 上眼睑弧，整组一起缩放做眨眼。 */
function buildEye(m: AvatarMats, side: number): THREE.Group {
  const eye = new THREE.Group()
  eye.position.set(0.19 * side, 0.05, 0.39)
  // 稍微转向外侧，贴合球面朝向（否则外眼角会贴不住脸）
  eye.rotation.y = -0.2 * side
  eye.rotation.z = 0.05 * side

  const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 20), m.sclera)
  sclera.scale.set(1, 1.12, 0.6)
  eye.add(sclera)

  const iris = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 20), m.iris)
  iris.scale.set(1, 1.1, 0.5)
  iris.position.z = 0.034
  eye.add(iris)

  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 14), m.pupil)
  pupil.scale.set(1, 1.1, 0.5)
  pupil.position.z = 0.052
  eye.add(pupil)

  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), m.shine)
  shine.position.set(-0.026 * side, 0.032, 0.064)
  eye.add(shine)

  // 上眼睑：一段圆弧压在上沿。arc 别给到 π 以上 —— 那样会绕成整圈，眼睛变成「描边」。
  const lid = new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.012, 8, 24, Math.PI * 0.88), m.pupil)
  lid.position.z = 0.018
  lid.rotation.z = 0.19
  lid.scale.set(1, 1.02, 0.7)
  eye.add(lid)

  return eye
}

function buildHeadGroup(m: AvatarMats): THREE.Group {
  const g = new THREE.Group()
  g.position.y = HEAD_Y

  const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 48, 48), m.skin)
  skull.scale.set(1.03, 0.98, 0.95)
  g.add(skull)

  // 头发：后脑发团（往后退，别把领口糊住）+ 头顶罩 + 刘海 + 两侧鬓发
  const backMass = new THREE.Mesh(new THREE.SphereGeometry(0.5, 36, 32), m.hair)
  backMass.position.set(0, -0.04, -0.22)
  backMass.scale.set(1.02, 1.08, 0.92)
  g.add(backMass)

  // 头顶罩：theta 只到 ~73°，正好停在眉毛上方，留出额头
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.522, 44, 32, 0, Math.PI * 2, 0, 1.2),
    m.hair
  )
  crown.position.y = 0.008
  g.add(crown)

  // 刘海：薄而长的发缕，从中缝向两侧散开、发梢参差。
  // 两轮教训：① 小胶囊排弧 = 一排「药丸」；② z 按「发缕中心」算 = 下半截埋进头骨、只剩顶部露头。
  // 所以 z 按**发梢高度**取球面位置，再用 rotation.x 把上半截往后贴回头皮。
  const TILT = 0.5
  for (let i = 0; i < 9; i++) {
    const a = (i - 4) / 4 // -1 .. 1
    const x = a * 0.33
    const tipY = 0.175 - Math.abs(a) * 0.02 + (i % 2 === 0 ? 0.014 : -0.014)
    const halfH = 0.085 * 2.0
    const cy = tipY + halfH * Math.cos(TILT) - 0.01
    const z = Math.sqrt(Math.max(0.05, 0.5 * 0.5 - x * x - tipY * tipY)) + 0.006
    const strand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 16), m.hair)
    strand.position.set(x, cy, z)
    strand.scale.set(0.95, 2.0, 0.26)
    strand.rotation.x = -TILT
    strand.rotation.z = -a * 0.34
    g.add(strand)
  }

  // 鬓发：贴着脸颊两侧垂到下颌
  for (const side of [-1, 1]) {
    const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.34, 5, 16), m.hair)
    lock.position.set(0.4 * side, -0.13, 0.14)
    lock.rotation.z = 0.1 * side
    lock.scale.set(1, 1, 0.8)
    g.add(lock)
  }

  for (const side of [-1, 1]) {
    const eye = buildEye(m, side)
    g.add(eye)
    eyes.push(eye)
  }

  // 眉毛
  for (const side of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.013, 8, 18, Math.PI * 0.72), m.hair)
    brow.position.set(0.185 * side, 0.14, 0.4)
    brow.rotation.z = 0.44
    brow.rotation.y = -0.2 * side
    brow.scale.set(1, 0.9, 0.7)
    g.add(brow)
    brows.push(brow)
  }

  // 鼻子：只用一个很小的球，别做成大疙瘩
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), m.skinShade)
  nose.position.set(0, -0.125, 0.478)
  nose.scale.set(1.1, 0.9, 0.8)
  g.add(nose)

  // 嘴：内腔随音量纵向张开，上唇弧线常驻
  const mouthGrp = new THREE.Group()
  mouthGrp.position.set(0, -0.25, 0.44)
  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.052, 20, 16), m.mouthIn)
  inner.scale.set(1.5, 0.32, 0.5)
  mouthGrp.add(inner)
  const upperLip = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.011, 8, 20, Math.PI), m.lip)
  upperLip.rotation.z = 0
  upperLip.position.set(0, 0.0, 0.02)
  upperLip.scale.set(1.35, 1, 0.5)
  mouthGrp.add(upperLip)
  g.add(mouthGrp)
  // 口型只缩放内腔这一层：缩放整组会把上唇弧线一起压扁，看起来像在扁嘴
  mouth = inner

  // 腮红
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), m.blush)
    cheek.position.set(0.29 * side, -0.19, 0.365)
    cheek.scale.set(1, 0.62, 0.25)
    cheek.rotation.y = -0.55 * side
    g.add(cheek)
  }

  return g
}

function buildAvatar(): THREE.Group {
  const g = new THREE.Group()
  const m = makeMats()
  g.add(buildTorso(m))

  const headGrp = buildHeadGroup(m)
  g.add(headGrp)
  head = headGrp

  return g
}

function applyExpression(): void {
  const e = props.expression
  const thinking = e === 'thinking'
  const confused = e === 'confused'
  const happy = e === 'happy'

  brows.forEach((brow, i) => {
    const outer = i === 1 ? 1 : -1
    brow.rotation.z = thinking ? 0.44 + 0.22 * outer : 0.44
    brow.position.y = thinking ? 0.105 : happy ? 0.14 : confused && outer > 0 ? 0.155 : 0.125
    brow.scale.y = happy ? 1.05 : 0.9
  })
  if (head) head.rotation.z = thinking ? 0.06 : 0
}

function loop(): void {
  raf = requestAnimationFrame(loop)
  if (!renderer || !scene || !camera || !root) return
  if (!props.active || !props.visible) return

  const now = performance.now()
  const t = now / 1000
  const dt = lastFrameAt ? Math.min(0.1, (now - lastFrameAt) / 1000) : 0.016
  lastFrameAt = now

  // VRM 接管后走它自己的驱动（口型是 aa 表情，不再是缩放嘴部几何体）
  if (vrmAvatar) {
    const open = props.speaking ? mouthLevel() : 0
    vrmAvatar.update(dt, { t, open, expression: props.expression })
    mouthCss.value = open
    renderer.render(scene, camera)
    return
  }

  // 待机：轻微呼吸 + 摆动
  root.position.y = Math.sin(t * 1.6) * 0.02
  if (head) head.rotation.y = Math.sin(t * 0.9) * 0.07 + (props.flip ? -0.05 : 0.05)
  root.rotation.z = Math.sin(t * 0.7) * 0.015

  // 眨眼
  if (now > blinkAt + 3200) {
    blinkUntil = now + 110
    blinkAt = now
  }
  const blinking = now < blinkUntil
  // 眼睛是整组（眼白/虹膜/眼睑）一起压扁，所以基准是 1，不是单个球体的 1.15
  const eyeScaleY = blinking ? 0.08 : props.expression === 'happy' ? 0.3 : 1
  for (const eye of eyes) eye.scale.y = eyeScaleY

  // 口型：只在播报时采样，停播归零
  const open = props.speaking ? mouthLevel() : 0
  if (mouth) {
    mouth.scale.y = 0.32 + open * 2.2
    mouth.scale.x = (props.expression === 'happy' ? 1.68 : 1.5) + open * 0.3
  }
  mouthCss.value = open

  renderer.render(scene, camera)
}

/** 半身取景的视野高度（头 + 肩）。改这一个数就能推近/拉远，换模型不用动别的 */
const BUST_VIEW_HEIGHT = 1.8

function frameBust(focus: THREE.Vector3): void {
  if (!camera) return
  const dist = BUST_VIEW_HEIGHT / (2 * Math.tan((camera.fov * Math.PI) / 360))
  camera.position.set(focus.x, focus.y + 0.05, dist)
  camera.lookAt(focus)
}

/**
 * 先用程序化形象顶上（首帧不能空），VRM 解析完再切过去。
 * 拿不到模型（打包时裁掉 /vrm/、无 WebGL）就继续用程序化形象 —— 直播不能因为素材缺失黑屏。
 */
async function useVrmWhenReady(): Promise<void> {
  const wanted = props.vrmId
  try {
    const avatar = await createAvatarVrm(wanted)
    if (!avatar) return
    // 解析期间用户又换了一只 → 丢弃这次结果，别把旧模型挂上去
    if (wanted !== props.vrmId || !scene || !root) { avatar.dispose(); return }
    if (vrmAvatar) {
      scene.remove(vrmAvatar.root)
      vrmAvatar.dispose()
    }
    scene.add(avatar.root)
    root.visible = false
    vrmAvatar = avatar
    frameBust(avatar.focus)
  } catch (e) {
    // 换模型失败要能看见：静默吞掉会表现成「点了下拉但画面没变」
    console.warn('[live-avatar] VRM 加载失败，沿用当前形象', wanted, e)
  }
}

function resize(): void {
  const host = cv.value?.parentElement
  if (!renderer || !camera || !host) return
  const w = Math.max(1, host.clientWidth)
  const h = Math.max(1, host.clientHeight)
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

onMounted(() => {
  const canvas = cv.value
  if (!canvas) return
  // 先探一次 WebGL：jsdom / 无显卡环境直接走 CSS 形象，不去碰 WebGLRenderer
  try {
    const probe = document.createElement('canvas')
    const gl = probe.getContext('webgl2') || probe.getContext('webgl')
    if (!gl) {
      fallback.value = true
      startCssLoop()
      return
    }
  } catch {
    fallback.value = true
    startCssLoop()
    return
  }
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50)
    // 角色纵向跨度约 2.2（头心 0.42 + 头半径 0.53 → 胸线 -1.22），4.0 处刚好留一圈余量
    camera.position.set(0, 0.06, 4.0)
    camera.lookAt(0, -0.04, 0)

    // 三灯：主光偏右上给立体感，补光从左下压暗部，轮廓光从背后把头发和背景分开
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3242, 0.95))
    const key = new THREE.DirectionalLight(0xfff2e0, 1.65)
    key.position.set(1.5, 2.2, 2.2)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.55)
    fill.position.set(-2.0, 0.5, 1.4)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0x9dc4ff, 1.25)
    rim.position.set(-1.2, 1.4, -2.4)
    scene.add(rim)

    root = buildAvatar()
    root.scale.setScalar(props.scale)
    scene.add(root)
    applyExpression()

    resize()
    ro = new ResizeObserver(() => resize())
    if (canvas.parentElement) ro.observe(canvas.parentElement)
    loop()
    void useVrmWhenReady()
  } catch {
    // 无 WebGL：退 CSS 形象，直播不能因为显卡问题就没有画面
    fallback.value = true
    startCssLoop()
  }
})

let cssRaf = 0
function startCssLoop(): void {
  const step = () => {
    cssRaf = requestAnimationFrame(step)
    mouthCss.value = props.speaking ? mouthLevel() : 0
  }
  step()
}

watch(() => props.expression, applyExpression)
watch(() => props.scale, (s) => { if (root) root.scale.setScalar(s) })
// 换模型：等新的一只解析好再替换，别先卸旧的（中间会出现空画布）
watch(() => props.vrmId, () => { void useVrmWhenReady() })

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  cancelAnimationFrame(cssRaf)
  ro?.disconnect()
  ro = null
  vrmAvatar?.dispose()
  vrmAvatar = null
  if (root) disposeTree(root)
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
  root = null
  head = null
  mouth = null
  eyes = []
  brows = []
})
</script>

<style scoped>
.live-avatar {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.live-avatar__canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* ---------- 无 WebGL 的退路 ---------- */
.live-avatar__css {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.css-body {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 46%;
  height: 46%;
  border-radius: 44% 44% 16% 16% / 60% 60% 12% 12%;
  background: linear-gradient(180deg, #3b4f7a, #26344f);
}

.css-head {
  position: absolute;
  bottom: 32%;
  left: 50%;
  transform: translateX(-50%);
  width: 44%;
  aspect-ratio: 1 / 1.06;
  border-radius: 50% 50% 46% 46% / 54% 54% 46% 46%;
  background: linear-gradient(180deg, #f7d9c4, #e8bfa4);
}

.css-hair {
  position: absolute;
  left: -4%;
  top: -10%;
  width: 108%;
  height: 48%;
  border-radius: 52% 52% 46% 46% / 82% 82% 18% 18%;
  background: linear-gradient(180deg, #2f3b57, #1d2637);
}

.css-eye {
  position: absolute;
  top: 52%;
  width: 10%;
  aspect-ratio: 1 / 1.2;
  border-radius: 50%;
  background: #1d2430;
  transform: translateY(-50%);
}

.css-eye.l { left: 25%; }
.css-eye.r { right: 25%; }

.css-brow {
  position: absolute;
  top: 42%;
  width: 14%;
  height: 3%;
  border-radius: 3px;
  background: #6d4a3a;
  opacity: 0.6;
}

.css-brow.l { left: 22%; }
.css-brow.r { right: 22%; }

.css-mouth {
  position: absolute;
  top: 70%;
  left: 50%;
  width: 16%;
  height: 9%;
  background: #8c3f46;
  border-radius: 0 0 999px 999px;
  transform-origin: 50% 0;
}

.live-avatar[data-expr='happy'] .css-eye { transform: translateY(-50%) scaleY(0.35); }
.live-avatar[data-expr='thinking'] .css-brow.l { transform: rotate(-12deg); }
.live-avatar[data-expr='thinking'] .css-brow.r { transform: rotate(12deg); }
.live-avatar[data-expr='confused'] .css-brow.l { transform: rotate(16deg); }
</style>
