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

type AvatarExpression = 'neutral' | 'thinking' | 'happy' | 'confused'

const props = withDefaults(
  defineProps<{
    expression?: AvatarExpression
    /** 是否在播报（决定要不要采音频振幅） */
    speaking?: boolean
    /** 朝左/朝右的轻微摆动方向 */
    flip?: boolean
    active?: boolean
    visible?: boolean
    scale?: number
  }>(),
  { expression: 'neutral', speaking: false, flip: false, active: true, visible: true, scale: 1 }
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

function buildAvatar(): THREE.Group {
  const g = new THREE.Group()

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.46, 0.5, 6, 20),
    new THREE.MeshStandardMaterial({ color: 0x3b4f7a, roughness: 0.85 })
  )
  body.position.y = -0.85
  g.add(body)

  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 40, 40),
    new THREE.MeshStandardMaterial({ color: 0xf2cdb4, roughness: 0.75 })
  )
  headMesh.position.y = 0.16
  g.add(headMesh)
  head = headMesh

  // 头发：上半球壳，压在头顶
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.645, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.56),
    new THREE.MeshStandardMaterial({ color: 0x26314a, roughness: 0.9 })
  )
  hair.position.y = 0.17
  g.add(hair)

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1d2430, roughness: 0.4 })
  for (const x of [-0.22, 0.22]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.072, 20, 20), eyeMat)
    eye.position.set(x, 0.22, 0.545)
    eye.scale.set(1, 1.15, 0.7)
    g.add(eye)
    eyes.push(eye)
  }

  const browMat = new THREE.MeshStandardMaterial({ color: 0x6d4a3a, roughness: 0.9 })
  for (const x of [-0.22, 0.22]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.028, 0.03), browMat)
    brow.position.set(x, 0.4, 0.53)
    g.add(brow)
    brows.push(brow)
  }

  const mouthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0x8c3f46, roughness: 0.6 })
  )
  mouthMesh.position.set(0, -0.13, 0.55)
  mouthMesh.scale.set(1.3, 0.35, 0.55)
  g.add(mouthMesh)
  mouth = mouthMesh

  return g
}

function applyExpression(): void {
  const e = props.expression
  const happy = e === 'happy'
  const thinking = e === 'thinking'
  const confused = e === 'confused'

  for (const eye of eyes) eye.scale.set(1, happy ? 0.35 : 1.15, 0.7)
  brows.forEach((brow, i) => {
    brow.rotation.z = thinking ? (i === 0 ? -0.25 : 0.25) : confused && i === 0 ? 0.35 : 0
    brow.position.y = thinking ? 0.37 : 0.4
  })
  if (mouth) mouth.scale.x = happy ? 1.55 : 1.3
}

function loop(): void {
  raf = requestAnimationFrame(loop)
  if (!renderer || !scene || !camera || !root) return
  if (!props.active || !props.visible) return

  const now = performance.now()
  const t = now / 1000

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
  const eyeScaleY = blinking ? 0.12 : props.expression === 'happy' ? 0.35 : 1.15
  for (const eye of eyes) eye.scale.y = eyeScaleY

  // 口型：只在播报时采样，停播归零
  const open = props.speaking ? mouthLevel() : 0
  if (mouth) {
    mouth.scale.y = 0.3 + open * 1.5
    mouth.scale.x = (props.expression === 'happy' ? 1.55 : 1.3) + open * 0.25
  }
  mouthCss.value = open

  renderer.render(scene, camera)
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
    camera.position.set(0, 0.15, 3.6)
    camera.lookAt(0, 0.05, 0)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.25))
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(1.2, 2.2, 2.4)
    scene.add(key)

    root = buildAvatar()
    root.scale.setScalar(props.scale)
    scene.add(root)
    applyExpression()

    resize()
    ro = new ResizeObserver(() => resize())
    if (canvas.parentElement) ro.observe(canvas.parentElement)
    loop()
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

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  cancelAnimationFrame(cssRaf)
  ro?.disconnect()
  ro = null
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
