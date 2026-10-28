<template>
  <div class="pet2d" :class="{ flip }" :style="{ width: box.w + 'px', height: box.h + 'px' }">
    <span class="shadow" :style="{ width: box.w * 0.66 + 'px' }" />
    <span
      class="sprite"
      :class="{ spin: action === 'spin', hop: action === 'hop', shy: action === 'pet', look: action === 'look' }"
      :style="spriteStyle"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PetState } from '../../stores/pet'

import bobaImg from '../../assets/pet-packs/boba-spritesheet.webp'
import tikoImg from '../../assets/pet-packs/tiko-spritesheet.webp'
import wangcaiImg from '../../assets/pet-packs/wangcai-spritesheet.webp'
import luluImg from '../../assets/pet-packs/lulu-spritesheet.webp'
import noirImg from '../../assets/pet-packs/noir-spritesheet.webp'
import mallowImg from '../../assets/pet-packs/mallow-spritesheet.webp'

const props = withDefaults(
  defineProps<{
    state: PetState
    action?: string | null
    pack?: string
    scale?: number
    /** 沿屏幕底边踱步中：优先播 walking 行 */
    walking?: boolean
    /** 朝左走时水平镜像 */
    flip?: boolean
    /** 应用在前台：false 时降帧省电 */
    active?: boolean
    /** 窗口可见：false 时整帧停止（隐藏即停渲染） */
    visible?: boolean
  }>(),
  { action: null, pack: 'boba', scale: 1, walking: false, flip: false, active: true, visible: true }
)

interface RowCfg { r: number; n: number; fps: number }
interface PackCfg {
  name: string
  img: string
  fw: number
  fh: number
  cols: number
  rows: number
  states: Record<string, RowCfg>
}

const STD: Record<string, RowCfg> = {
  idle: { r: 0, n: 6, fps: 5 },
  walking: { r: 1, n: 8, fps: 10 },
  running: { r: 2, n: 8, fps: 12 },
  ready: { r: 3, n: 4, fps: 8 },
  'needs-input': { r: 4, n: 5, fps: 4 },
  error: { r: 5, n: 8, fps: 6 },
  paused: { r: 6, n: 6, fps: 2.5 },
}

const PACKS: Record<string, PackCfg> = {
  boba: {
    name: 'Boba',
    img: bobaImg,
    fw: 192,
    fh: 208,
    cols: 8,
    rows: 11,
    states: { ...STD, idle: { r: 0, n: 7, fps: 5 } },
  },
  tiko: { name: 'Tiko', img: tikoImg, fw: 192, fh: 208, cols: 8, rows: 9, states: STD },
  wangcai: { name: '旺财', img: wangcaiImg, fw: 192, fh: 208, cols: 8, rows: 9, states: STD },
  lulu: { name: '噜噜', img: luluImg, fw: 192, fh: 208, cols: 8, rows: 9, states: STD },
  noir: { name: 'Noir', img: noirImg, fw: 192, fh: 208, cols: 8, rows: 9, states: STD },
  mallow: { name: 'Mallow', img: mallowImg, fw: 192, fh: 208, cols: 8, rows: 9, states: STD },
}

/** 逗一下：动作 → 精灵行（社区标准行序） */
const ACTION_ROWS: Record<string, RowCfg & { dur: number }> = {
  pet: { r: 0, n: 6, fps: 6, dur: 2300 },
  wave: { r: 3, n: 4, fps: 8, dur: 2400 },
  look: { r: 7, n: 6, fps: 8, dur: 2600 },
  nap: { r: 6, n: 6, fps: 3, dur: 3000 },
  spin: { r: 0, n: 6, fps: 6, dur: 1100 },
  hop: { r: 0, n: 6, fps: 6, dur: 900 },
}

const packCfg = computed(() => PACKS[props.pack] || PACKS.boba)
const box = computed(() => ({ w: 109 * props.scale, h: 118 * props.scale }))

const frame = ref(0)
const row = ref(0)
const frames = ref(6)
const fps = ref(5)
let overrideUntil = 0

const spriteStyle = computed(() => {
  const p = packCfg.value
  const s = (118 * props.scale) / p.fh
  return {
    backgroundImage: `url(${p.img})`,
    backgroundSize: `${(p.fw * p.cols * s).toFixed(1)}px ${(p.fh * p.rows * s).toFixed(1)}px`,
    backgroundPosition: `${(-frame.value * p.fw * s).toFixed(1)}px ${(-row.value * p.fh * s).toFixed(1)}px`,
    width: box.value.w + 'px',
    height: box.value.h + 'px',
  }
})

let lastTick = 0
let timer = 0
let loopMs = 0
function tick() {
  const now = performance.now()
  if (overrideUntil && now >= overrideUntil) overrideUntil = 0
  const cfg = overrideUntil
    ? ACTION_ROWS[props.action as string]
    : props.walking
      ? packCfg.value.states.walking
      : packCfg.value.states[props.state] || packCfg.value.states.idle
  if (!cfg) return
  row.value = cfg.r
  frames.value = cfg.n
  fps.value = cfg.fps
  const interval = 1000 / cfg.fps
  if (now - lastTick < interval) return
  lastTick = now
  frame.value = (frame.value + 1) % cfg.n
}

/** 隐藏即停、失焦降帧：仍是 setInterval，只是间隔变了（rAF 在遮挡时会被系统节流） */
function applyTimer() {
  const want = props.visible ? (props.active ? 60 : 200) : 0
  if (want === loopMs && (timer || !want)) return
  window.clearInterval(timer)
  timer = 0
  loopMs = want
  if (want) timer = window.setInterval(tick, want)
}

watch(
  () => [props.state, props.action, props.walking],
  ([, act]) => {
    const a = act ? ACTION_ROWS[act as string] : null
    overrideUntil = a ? performance.now() + a.dur : 0
    frame.value = 0
    lastTick = 0
  }
)

onMounted(() => {
  // setInterval 而非 rAF：置顶窗被遮挡时 rAF 会被节流，帧动画会卡住
  applyTimer()
})
watch(() => [props.active, props.visible], applyTimer)
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<style scoped>
.pet2d {
  position: relative;
  user-select: none;
}
/* 朝左走：整只镜像（含影子，影子是对称的，看不出差别） */
.pet2d.flip {
  transform: scaleX(-1);
}
.sprite {
  position: absolute;
  left: 0;
  bottom: 0;
  background-repeat: no-repeat;
  transform-origin: 50% 88%;
  image-rendering: auto;
}
.sprite.shy { animation: pet-shy 1.05s cubic-bezier(0.3, 0.9, 0.3, 1); }
.sprite.look { animation: pet-look 2.2s ease-in-out; }
.sprite.spin { animation: pet-spin 0.9s cubic-bezier(0.4, 0.02, 0.35, 1); }
.sprite.hop { animation: pet-hop 0.78s cubic-bezier(0.35, 0.9, 0.3, 1); }
@keyframes pet-shy {
  0% { transform: rotate(0) scale(1, 1); }
  22% { transform: rotate(-5deg) scale(0.95, 1.05) translateY(-2px); }
  58% { transform: rotate(-4deg) scale(0.96, 1.04) translateY(-1px); }
  100% { transform: rotate(0) scale(1, 1); }
}
@keyframes pet-look {
  0%, 100% { transform: rotate(0) translateX(0); }
  16% { transform: rotate(-4deg) translateX(-3px); }
  38% { transform: rotate(4deg) translateX(3px); }
  62% { transform: rotate(-3deg) translateX(-2px); }
  84% { transform: rotate(2deg) translateX(2px); }
}
@keyframes pet-spin {
  0% { transform: perspective(600px) rotateY(0deg); }
  14% { transform: perspective(600px) rotateY(-16deg); }
  50% { transform: perspective(600px) rotateY(180deg); }
  100% { transform: perspective(600px) rotateY(360deg); }
}
@keyframes pet-hop {
  0%, 100% { transform: translateY(0) scale(1, 1); }
  32% { transform: translateY(-16px) scale(0.92, 1.12); }
  50% { transform: translateY(0) scale(1.1, 0.87); }
  66% { transform: translateY(-6px) scale(0.97, 1.05); }
}
.shadow {
  position: absolute;
  left: 50%;
  bottom: -6px;
  height: 12px;
  margin-left: -33%;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0) 72%);
}
</style>
