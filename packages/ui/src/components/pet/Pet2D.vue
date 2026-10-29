<template>
  <div v-if="packCfg" class="pet2d" :class="{ flip }" :style="{ width: box.w + 'px', height: box.h + 'px' }">
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
import { PET_PACK_URLS } from './pet-assets'
import { userPackConfig } from './user-packs'

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
interface ActionCfg extends RowCfg { dur: number }
interface PackCfg {
  name: string
  img: string
  fw: number
  fh: number
  cols: number
  rows: number
  states: Record<string, RowCfg>
  /** 导入的形象可自带动作行；内置包没有，用下面的 ACTION_ROWS */
  actions?: Record<string, ActionCfg>
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

/** 各宠物包的帧参数（不含图片 URL —— URL 由 pet-assets 按打包选择集给出） */
const PACK_CFG: Record<string, Omit<PackCfg, 'img'>> = {
  boba: {
    name: 'Boba',
    fw: 192,
    fh: 208,
    cols: 8,
    rows: 11,
    states: { ...STD, idle: { r: 0, n: 7, fps: 5 } },
  },
  tiko: { name: 'Tiko', fw: 192, fh: 208, cols: 8, rows: 9, states: STD },
  wangcai: { name: '旺财', fw: 192, fh: 208, cols: 8, rows: 9, states: STD },
  lulu: { name: '噜噜', fw: 192, fh: 208, cols: 8, rows: 9, states: STD },
  noir: { name: 'Noir', fw: 192, fh: 208, cols: 8, rows: 9, states: STD },
  mallow: { name: 'Mallow', fw: 192, fh: 208, cols: 8, rows: 9, states: STD },
  // 原创大肥鱼（2026-10-29，scripts/gen-pet-whale.mjs 程序化生成，蓝色胖鲸鱼 + 头顶喷水）
  feiyu: { name: 'Feiyu', fw: 192, fh: 208, cols: 8, rows: 9, states: STD },
}

/** 只保留本包真的带了素材的形象（--pets 裁剪后未选的 id 不在 PET_PACK_URLS 里） */
const PACKS: Record<string, PackCfg> = Object.fromEntries(
  Object.entries(PACK_CFG)
    .filter(([id]) => !!PET_PACK_URLS[id])
    .map(([id, cfg]) => [id, { ...cfg, img: PET_PACK_URLS[id] }])
)

/** 逗一下：动作 → 精灵行（社区标准行序）；用户图集若有自己的动作行则优先 */
const ACTION_ROWS: Record<string, ActionCfg> = {
  pet: { r: 0, n: 6, fps: 6, dur: 2300 },
  wave: { r: 3, n: 4, fps: 8, dur: 2400 },
  look: { r: 7, n: 6, fps: 8, dur: 2600 },
  nap: { r: 6, n: 6, fps: 3, dur: 3000 },
  spin: { r: 0, n: 6, fps: 6, dur: 1100 },
  hop: { r: 0, n: 6, fps: 6, dur: 900 },
}

function actionCfgOf(pack: PackCfg | null, name: string | null): ActionCfg | null {
  if (!name) return null
  return pack?.actions?.[name] || ACTION_ROWS[name] || null
}

// 没有任何 2D 素材（--pets=none 或未选任何包）→ packCfg 为 null，组件不渲染也不跑定时器
const packCfg = computed<PackCfg | null>(() => {
  // 用户导入的形象优先（形象工坊）
  const user = userPackConfig(props.pack)
  if (user) return user as PackCfg
  return PACKS[props.pack] || PACKS[Object.keys(PACKS)[0]] || null
})
/** 盒子按帧宽高比走：图集帧可能不是 192×208，硬套会裁掉边缘 */
const box = computed(() => {
  const h = 118 * props.scale
  const ratio = packCfg.value ? packCfg.value.fw / packCfg.value.fh : 192 / 208
  return { w: Math.max(36, Math.min(280, h * ratio)), h }
})

const frame = ref(0)
const row = ref(0)
const frames = ref(6)
const fps = ref(5)
let overrideUntil = 0

const spriteStyle = computed(() => {
  const p = packCfg.value
  if (!p) return {}
  // contain：按盒子与帧尺寸取小值，任何宽高比的图集都不会被裁
  const s = Math.min(box.value.w / p.fw, box.value.h / p.fh)
  return {
    backgroundImage: `url(${p.img})`,
    backgroundSize: `${(p.fw * p.cols * s).toFixed(1)}px ${(p.fh * p.rows * s).toFixed(1)}px`,
    backgroundPosition: `${(-frame.value * p.fw * s).toFixed(1)}px ${(-row.value * p.fh * s).toFixed(1)}px`,
    width: p.fw * s + 'px',
    height: p.fh * s + 'px',
  }
})

let lastTick = 0
let timer = 0
let loopMs = 0
function tick() {
  const now = performance.now()
  if (overrideUntil && now >= overrideUntil) overrideUntil = 0
  const pack = packCfg.value
  if (!pack) return
  const cfg = overrideUntil
    ? actionCfgOf(pack, props.action as string)
    : props.walking
      ? pack.states.walking
      : pack.states[props.state] || pack.states.idle
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
  const want = !packCfg.value || !props.visible ? 0 : props.active ? 60 : 200
  if (want === loopMs && (timer || !want)) return
  window.clearInterval(timer)
  timer = 0
  loopMs = want
  if (want) timer = window.setInterval(tick, want)
}

watch(
  () => [props.state, props.action, props.walking],
  ([, act]) => {
    const a = actionCfgOf(packCfg.value, act as string | null)
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
