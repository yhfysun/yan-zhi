<template>
  <div ref="host" class="pet3d" :data-vrm="vrmState">
    <canvas ref="cv" class="cv" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import type { PetState } from '../../stores/pet'
import { loadVrmFromBuffer, type LoadedVrm } from './vrmLoader'
import { poseFor } from './vrmPose'

const props = withDefaults(
  defineProps<{
    state: PetState
    action?: string | null
    scale?: number
    /** 沿屏幕底边踱步中 */
    walking?: boolean
    /** 朝左走时转向 */
    flip?: boolean
    /** 应用在前台：false 时降帧省电 */
    active?: boolean
    /** 窗口可见：false 时整帧停止（隐藏即停渲染） */
    visible?: boolean
    /** VRM 模型字节；为空时退回程序化素模 */
    vrmBuffer?: ArrayBuffer | null
  }>(),
  { action: null, scale: 1, walking: false, flip: false, active: true, visible: true, vrmBuffer: null }
)

const host = ref<HTMLElement | null>(null)
const cv = ref<HTMLCanvasElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let raf = 0
let ro: ResizeObserver | null = null

/** 宠物骨架引用：换成 VRM/glTF 时只替换这一层 */
interface Rig {
  root: THREE.Group
  body: THREE.Mesh
  head: THREE.Group
  eyes: THREE.Mesh[]
  ears: THREE.Group[]
  arms: THREE.Group[]
  legs: THREE.Group[]
  tail: THREE.Mesh
}
let rig: Rig | null = null

/** 真 VRM 模型（加载成功后压过程序化素模） */
let loaded: LoadedVrm | null = null
/** 给外部（真机验证/排障）一个可读的状态标记：none / loading / ready / error */
const vrmState = ref<'none' | 'loading' | 'ready' | 'error'>('none')
let vrmExpr = ''
/** 换模型/卸载时作废旧的一次异步加载 */
let loadSeq = 0

function disposeVrm() {
  if (!loaded) return
  try {
    scene?.remove(loaded.holder)
    loaded.holder.traverse((o: any) => {
      o.geometry?.dispose?.()
      const m = o.material
      if (Array.isArray(m)) m.forEach((x: any) => x?.dispose?.())
      else m?.dispose?.()
    })
    ;(loaded.vrm as any).dispose?.()
  } catch {
    /* 释放失败不影响换下一个模型 */
  }
  loaded = null
  vrmExpr = ''
  vrmState.value = 'none'
  if (rig) rig.root.visible = true
  frameDefault()
}

async function loadVrm(buffer: ArrayBuffer | null) {
  const seq = ++loadSeq
  disposeVrm()
  if (!buffer || !scene) return
  vrmState.value = 'loading'
  try {
    const next = await loadVrmFromBuffer(buffer)
    if (seq !== loadSeq || !scene) { // 已被更新的一次加载取代
      next.holder.traverse((o: any) => { o.geometry?.dispose?.() })
      return
    }
    next.holder.scale.setScalar(props.scale)
    scene.add(next.holder)
    loaded = next
    vrmState.value = 'ready'
    if (rig) rig.root.visible = false
    frameVrm(next.height)
  } catch (err) {
    vrmState.value = 'error'
    console.warn('[pet] VRM 加载失败，退回程序化素模:', err && (err as Error).message)
  }
}

/** 素模的默认取景 */
function frameDefault() {
  if (!camera) return
  camera.position.set(0, 3.1, 11)
  camera.lookAt(0, 1.85, 0)
  camera.updateProjectionMatrix()
}

/**
 * VRM 取景：让脚正好落在取景框底边、模型占满约 86% 高度。
 * 单纯沿用素模相机的话，人形会「悬在半空 + 只占屏幕一小块」（真机实测）。
 */
function frameVrm(height: number) {
  if (!camera) return
  const visible = height / 0.86
  const d = visible / 2 / Math.tan((camera.fov * Math.PI) / 360)
  camera.position.set(0, visible / 2, d)
  camera.lookAt(0, visible / 2, 0)
  camera.updateProjectionMatrix()
}

/** 把 poseFor 的数值贴到 VRM 的 normalized 骨骼上 */
function applyVrmPose(dt: number) {
  if (!loaded) return
  const { vrm, holder } = loaded
  const pose = poseFor({
    state: props.state,
    action: props.action,
    t,
    actionT,
    cursor,
    walking: props.walking,
  })
  holder.position.y = pose.rootY
  holder.rotation.y = pose.rootRotY + (props.walking ? (props.flip ? -0.55 : 0.55) : 0)

  const bone = (name: string) => {
    try {
      return vrm.humanoid?.getNormalizedBoneNode(name as never) || null
    } catch {
      return null
    }
  }
  const setR = (name: string, x: number, y: number, z: number) => {
    const n = bone(name)
    if (n) n.rotation.set(x, y, z)
  }
  setR('spine', pose.spineX, pose.spineY, pose.spineZ)
  setR('chest', pose.chestX, 0, 0)
  setR('head', pose.headX, pose.headY, pose.headZ)
  setR('leftUpperArm', pose.armLX, 0, pose.armLZ)
  setR('rightUpperArm', pose.armRX, 0, pose.armRZ)
  setR('leftLowerArm', pose.foreArmLX, 0, 0)
  setR('rightLowerArm', pose.foreArmRX, 0, 0)
  setR('leftUpperLeg', pose.legLX, 0, 0)
  setR('rightUpperLeg', pose.legRX, 0, 0)
  setR('leftLowerLeg', pose.kneeLX, 0, 0)
  setR('rightLowerLeg', pose.kneeRX, 0, 0)

  const em: any = (vrm as any).expressionManager
  if (em?.setValue) {
    if (vrmExpr && vrmExpr !== pose.expression) {
      try { em.setValue(vrmExpr, 0) } catch { /* 模型没有这个表情 */ }
    }
    vrmExpr = pose.expression
    if (pose.expression) {
      try { em.setValue(pose.expression, pose.expressionWeight) } catch { /* 同上 */ }
    }
    // 眨眼是叠加通道（VRM 允许多个表情同时生效），不吃上面那条独占
    try { em.setValue('blink', pose.blink) } catch { /* 模型没有 blink */ }
  }
  vrm.update(dt)
}

let t = 0
let lastFrame = 0
let actionT = 0
let hopAt = 0
let shakeAt = 0
const cursor = { x: 0, y: 0 }

const FPS_ACTIVE = 30
const FPS_IDLE = 6
const mat = (c: number, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 })
const C = { fur: mat(0xc98a55), belly: mat(0xf1dcc0), dark: mat(0x3a2a20, 0.6) }

function buildRig(): Rig {
  const root = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 0.5, 6, 20), C.fur)
  body.position.y = 1.0
  root.add(body)

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.44, 18, 14), C.belly)
  belly.scale.set(1, 1.15, 0.55)
  belly.position.set(0, 0.98, 0.44)
  root.add(belly)

  const head = new THREE.Group()
  head.position.y = 1.95
  root.add(head)
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 18), C.fur))
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), C.belly)
  muzzle.scale.set(1.15, 0.82, 0.72)
  muzzle.position.set(0, -0.16, 0.5)
  head.add(muzzle)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), C.dark)
  nose.position.set(0, -0.08, 0.72)
  head.add(nose)

  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 12), C.dark)
    e.position.set(0.23 * s, 0.12, 0.53)
    head.add(e)
    return e
  })
  const ears = [-1, 1].map((s) => {
    const pivot = new THREE.Group()
    pivot.position.set(0.42 * s, 0.42, 0.02)
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), C.fur)
    e.scale.set(1, 1, 0.6)
    e.position.set(0.05 * s, 0.08, 0)
    pivot.add(e)
    head.add(pivot)
    return pivot
  })
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group()
    pivot.position.set(0.7 * s, 1.5, 0.04)
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 5, 12), C.fur)
    arm.position.y = -0.22
    arm.rotation.z = -0.16 * s
    pivot.add(arm)
    root.add(pivot)
    return pivot
  })
  const legs = [-1, 1].map((s) => {
    const pivot = new THREE.Group()
    pivot.position.set(0.27 * s, 0.5, 0.02)
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.3, 5, 12), C.fur)
    leg.position.y = -0.24
    pivot.add(leg)
    root.add(pivot)
    return pivot
  })
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.5, 5, 12), C.fur)
  tail.position.set(0, 0.72, -0.62)
  tail.rotation.x = 0.9
  root.add(tail)

  // 假阴影：透明窗开不了真实阴影贴图
  const c2 = document.createElement('canvas')
  c2.width = c2.height = 128
  const g = c2.getContext('2d')!.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(0,0,0,.5)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  const ctx = c2.getContext('2d')!
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.35),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c2), transparent: true, depthWrite: false })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.012
  root.add(shadow)

  return { root, body, head, eyes, ears, arms, legs, tail }
}

function resetPose() {
  if (!rig) return
  const { root, body, head, eyes, ears, arms, legs, tail } = rig
  body.scale.set(1, 1, 1)
  body.rotation.set(0, 0, 0)
  head.position.set(0, 1.95, 0)
  head.rotation.set(0, 0, 0)
  root.position.set(0, 0, 0)
  root.rotation.set(0, 0, 0)
  eyes.forEach((e) => e.scale.set(1, 1, 1))
  ears.forEach((e) => e.rotation.set(0, 0, 0))
  arms.forEach((a) => a.rotation.set(0, 0, 0))
  legs.forEach((l) => l.rotation.set(0, 0, 0))
  tail.rotation.set(0.9, 0, 0)
}

function applyState(dt: number) {
  if (!rig) return
  const { root, body, head, eyes, ears, arms, legs, tail } = rig
  const breath = Math.sin(t * 1.7) * 0.018
  // 踱步压过六态：走动时只要腿脚与朝向，别的表演都收起来
  if (props.walking) {
    const fx = Math.sin(t * 8)
    root.position.y = Math.abs(fx) * 0.06
    root.rotation.y = props.flip ? -0.5 : 0.5
    legs.forEach((l, i) => (l.rotation.x = fx * (i ? 0.7 : -0.7)))
    arms.forEach((a, i) => (a.rotation.x = fx * (i ? -0.5 : 0.5)))
    tail.rotation.z = Math.sin(t * 4) * 0.25
    return
  }
  switch (props.state) {
    case 'idle':
      body.scale.y = 1 + breath
      head.rotation.y = Math.sin(t * 0.7) * 0.05 + cursor.x * 0.3
      head.rotation.x = cursor.y * 0.2
      tail.rotation.z = Math.sin(t * 1.2) * 0.22
      break
    case 'running': {
      const fx = Math.sin(t * 9)
      root.position.y = Math.abs(fx) * 0.16
      body.rotation.x = 0.12
      legs.forEach((l, i) => (l.rotation.x = fx * (i ? 0.75 : -0.75)))
      arms.forEach((a, i) => (a.rotation.x = fx * (i ? -0.9 : 0.9)))
      break
    }
    case 'needs-input':
      body.scale.y = 1 + breath * 1.4
      head.rotation.z = 0.1
      head.rotation.y = Math.sin(t * 2.2) * 0.12
      ears.forEach((e, i) => (e.rotation.z = (i ? -1 : 1) * 0.14))
      break
    case 'paused':
      root.position.y = -0.16
      body.scale.y = 0.93
      eyes.forEach((e) => e.scale.set(1, 0.1, 1))
      head.position.y = 1.88
      tail.rotation.set(1.15, 0, 0.1)
      break
    case 'ready': {
      eyes.forEach((e) => e.scale.set(1, 0.42, 1))
      const k = Math.max(0, Math.sin(Math.min(t - hopAt, 1) * Math.PI * 3))
      root.position.y = k * 0.18
      tail.rotation.z = Math.sin(t * 7) * 0.35
      break
    }
    case 'error': {
      const k = Math.max(0, 1 - (t - shakeAt) / 0.8)
      root.position.x = Math.sin(t * 40) * 0.06 * k
      eyes.forEach((e) => e.scale.set(1, 0.1, 1))
      break
    }
  }
}

const ACT_DUR: Record<string, number> = { pet: 1, wave: 1.2, look: 1.6, nap: 2.6, spin: 0.9, hop: 0.75 }

function applyAction(dt: number) {
  if (!rig || !props.action) return
  const dur = ACT_DUR[props.action] || 1
  actionT += dt
  const p = Math.min(1, actionT / dur)
  const k = Math.sin(p * Math.PI)
  const { root, body, head, arms, legs } = rig
  switch (props.action) {
    case 'pet':
      body.scale.set(1 + k * 0.05, 1 - k * 0.06, 1 + k * 0.04)
      head.rotation.z = -k * 0.16
      break
    case 'wave':
      arms[1].rotation.z = -Math.min(1, p / 0.2) * 2.1
      arms[1].rotation.x = Math.sin(actionT * 16) * 0.35
      break
    case 'look':
      head.rotation.y = Math.sin(p * Math.PI * 2) * 0.55
      break
    case 'nap':
      root.position.y = -0.26 * Math.min(1, p * 3)
      head.rotation.x = 0.32
      break
    case 'spin':
      root.rotation.y = (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) * Math.PI * 2
      break
    case 'hop': {
      const y = Math.sin(Math.min(1, p / 0.8) * Math.PI)
      root.position.y = y * 0.55
      body.scale.set(p < 0.16 ? 1.08 : p < 0.42 ? 0.94 : 1.05, p < 0.16 ? 0.9 : p < 0.42 ? 1.1 : 0.93, 1)
      legs.forEach((l) => (l.rotation.x = p < 0.5 ? -0.35 : 0.1))
      break
    }
  }
}

function loop(now: number) {
  raf = requestAnimationFrame(loop)
  if (!renderer || !scene || !camera) return
  // 隐藏即停渲染：宠物窗不可见时完全不画（WebGL 空转比 2D 贵得多）
  if (!props.visible) return
  const cap = props.active ? FPS_ACTIVE : FPS_IDLE
  if (now - lastFrame < 1000 / cap - 1) return
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now
  t += dt
  if (loaded) {
    if (props.action) actionT += dt // 程序化那条自己累加，别重复计
    applyVrmPose(dt)
  } else {
    resetPose()
    applyState(dt)
    applyAction(dt)
  }
  renderer.render(scene, camera)
}

function resize() {
  if (!renderer || !camera || !host.value || !cv.value) return
  const w = host.value.clientWidth || 1
  const h = host.value.clientHeight || 1
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

onMounted(() => {
  if (!cv.value || !host.value) return
  renderer = new THREE.WebGLRenderer({ canvas: cv.value, alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setClearAlpha(0)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
  camera.position.set(0, 3.1, 11)
  camera.lookAt(0, 1.85, 0)

  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x241b2e, 1.15))
  const key = new THREE.DirectionalLight(0xffe0bf, 2)
  key.position.set(4, 7, 6)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x8db4ff, 1)
  rim.position.set(-5, 3, -6)
  scene.add(rim)

  rig = buildRig()
  rig.root.scale.setScalar(props.scale)
  scene.add(rig.root)

  if (props.vrmBuffer) loadVrm(props.vrmBuffer)

  ro = new ResizeObserver(resize)
  ro.observe(host.value)
  resize()
  window.addEventListener('pointermove', onMove)
  raf = requestAnimationFrame(loop)
})

function onMove(e: PointerEvent) {
  const r = host.value?.getBoundingClientRect()
  if (!r) return
  cursor.x = ((e.clientX - r.left) / r.width) * 2 - 1
  cursor.y = -(((e.clientY - r.top) / r.height) * 2 - 1)
}

watch(
  () => props.action,
  () => {
    actionT = 0
  }
)
watch(
  () => props.scale,
  (s) => {
    rig?.root.scale.setScalar(s)
    loaded?.holder.scale.setScalar(s)
  }
)
watch(
  () => props.vrmBuffer,
  (b) => loadVrm(b ?? null)
)

onBeforeUnmount(() => {
  loadSeq++
  cancelAnimationFrame(raf)
  ro?.disconnect()
  window.removeEventListener('pointermove', onMove)
  disposeVrm()
  renderer?.dispose()
  renderer = null
})
</script>

<style scoped>
.pet3d { width: 100%; height: 100%; }
.cv { width: 100%; height: 100%; display: block; }
</style>
