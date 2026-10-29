<template>
  <div class="pet-win">
    <div class="stage">

      <!-- 任务小面板（左键点「任务面板」槽位打开） -->
      <div v-if="panelOpen" class="panel" data-hit>
        <div class="p-head">
          <b>任务</b>
          <span class="p-count">{{ tasks.length }} 个</span>
          <span v-if="memory.affinity" class="p-affinity" :title="'摸头 ' + memory.pet + ' · 招手 ' + memory.wave + ' · 跟随 ' + memory.follow">
            好感 {{ memory.affinity }}
          </span>
          <button class="p-x" @click.stop="panelOpen = false">✕</button>
        </div>
        <div class="p-body">
          <div v-if="!tasks.length" class="p-empty">没有在跑的任务</div>
          <div v-for="t in tasks" :key="t.id" class="p-row" @click.stop="openConv(t.id)">
            <span class="p-dot" :class="'s-' + t.status" />
            <span class="p-title">{{ t.title }}</span>
            <span class="p-acts">
              <button v-if="t.status === 'running'" class="p-act" title="暂停" @click.stop="rowAction('pause', t.id)">暂停</button>
              <button v-else-if="t.status === 'paused'" class="p-act" title="恢复" @click.stop="rowAction('resume', t.id)">恢复</button>
              <button v-else-if="t.status === 'needs-input'" class="p-act" title="去回答" @click.stop="openConv(t.id)">回答</button>
              <button
                v-else-if="t.status === 'error' || t.status === 'completed'"
                class="p-act"
                title="用同样的内容再跑一次"
                @click.stop="rowAction('retry', t.id)"
              >重试</button>
              <button
                class="p-act pin"
                :class="{ on: settings.pinnedConvId === t.id }"
                :title="settings.pinnedConvId === t.id ? '取消跟随' : '让宠物跟随这个任务'"
                @click.stop="rowAction('pin', t.id)"
              >📌</button>
            </span>
          </div>
        </div>
      </div>

      <!-- 半圆菜单：绕宠物上半圈弹出，靠近窗口顶部自动翻到下方 -->
      <div v-if="radialOpen" class="radial" data-hit :style="{ left: radial.cx + 'px', top: radial.cy + 'px' }">
        <button
          v-for="(k, i) in slotKeys"
          :key="k + i"
          class="slot"
          :style="slotStyle(i, slotKeys.length)"
          :title="labelOf(k)"
          @click.stop="runSlot(k)"
        >
          <span class="ic" v-html="defOf(k).icon"></span>
          <span class="sl">{{ labelOf(k) }}</span>
        </button>
      </div>


      <!-- 逗一下：动作条 -->
      <div class="bar" v-if="barOpen" data-hit>
        <button
          v-for="a in ACTIONS"
          :key="a.key"
          class="act"
          :class="{ on: action === a.key }"
          @click.stop="play(a.key)"
        >
          <span class="g">{{ a.g }}</span>{{ a.label }}
        </button>
      </div>

      <div
        class="body"
        :class="{ 'body-3d': settings.renderer === '3d' }"
        :style="bodyStyle"
        data-hit
        title="左键拖动 · 双击说话 · 右键菜单"
        @pointerdown="onDown"
        @dblclick.stop="openAsk"
        @contextmenu.prevent="openRadial"
      >
        <Pet2D
          v-if="show2d"
          class="pet-overlay"
          :state="state"
          :action="action"
          :pack="settings.pack"
          :scale="settings.scale"
          :walking="walking"
          :flip="facingLeft"
          :active="renderActive"
          :visible="renderVisible"
        />
        <Pet3D
          v-if="useVrm3d"
          :state="state"
          :action="action"
          :scale="settings.scale"
          :walking="walking"
          :flip="facingLeft"
          :active="renderActive"
          :visible="renderVisible"
          :vrm-buffer="vrmBuffer"
          @vrm-state="onVrmState"
        />
      </div>

      <!-- 活动气泡：内容型（正在做什么 + 文件名），不吃指针，可点穿透 -->
      <div v-if="bubble" class="bubble" :style="{ bottom: bubbleBottom }">
        <span class="b-dot" :class="'k-' + bubble.kind" />
        <span class="b-label">{{ bubble.label }}</span>
        <span v-if="bubble.target" class="b-target">{{ bubble.target }}</span>
      </div>

      <!-- 快问输入条：hover 宠物浮现，Enter 把话交给主窗（预填 + 切回对话页） -->
      <div class="ask" v-if="showAsk" :style="{ bottom: askBottom }" data-hit>
        <div class="ask-agent-wrap">
          <button class="ask-agent" :title="agentName" @click.stop="toggleAgents">{{ agentName }}</button>
          <div v-if="agentOpen" class="agent-pop" data-hit>
            <input v-model="agentQuery" class="agent-search" placeholder="搜索智能体" @keydown.esc.stop.prevent="agentOpen = false" />
            <div class="agent-list">
              <button
                v-for="a in filteredAgents"
                :key="a.id"
                class="agent-item"
                :class="{ on: a.id === agentId }"
                @click.stop="pickAgent(a.id)"
              >{{ a.name }}</button>
              <div v-if="!filteredAgents.length" class="agent-empty">没有匹配</div>
            </div>
          </div>
        </div>
        <input
          ref="askInputEl"
          v-model="askText"
          placeholder="派个活 / 问点什么…"
          @keydown.enter.prevent="submitAsk"
          @keydown.esc.prevent="hideAsk(true)"
          @focus="askFocused = true"
          @blur="askFocused = false"
        />
        <button class="ask-go" title="交给主窗口" @click.stop="submitAsk">↑</button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Pet2D from '../components/pet/Pet2D.vue'
import Pet3D from '../components/pet/Pet3D.vue'
import { PET_PACKS } from '../components/pet/pet-assets'
import {
  usePetStore,
  PET_DEFAULTS,
  PET_SLOT_DEFS,
  builtinVrmOf,
  type PetActivity,
  type PetSettings,
  type PetState,
} from '../stores/pet'

const store = usePetStore()
// 同源 localStorage：别等主窗的 IPC 推送 —— 宠物窗可能比它先起来（真机实测会停在默认 2D）
store.init()
const settings = ref<PetSettings>({ ...PET_DEFAULTS, ...store.settings })
const state = ref<PetState>('idle')
/** 正在做的事（主窗派生后推过来），驱动活动气泡 */
const activity = ref<PetActivity | null>(null)
/** 沿屏幕底边走：位置由主进程动窗，这里只负责动画与朝向 */
const walking = ref(false)
const walkDir = ref(1)
/** 窗口可见 / 应用在前台：两者都成立才跑满帧（失焦降帧、隐藏即停） */
const winVisible = ref(true)
const winFocused = ref(true)
const renderVisible = computed(() => winVisible.value)
const renderActive = computed(() => winVisible.value && winFocused.value)
/** 只在走的时候镜像：停下要正面朝人，不能一直背对 */
const facingLeft = computed(() => walking.value && walkDir.value < 0)
/** 3D 形象：VRM 字节（null = 用程序化素模）。内置模型 dev 走 vite、打包走主进程读 */
const vrmBuffer = ref<ArrayBuffer | null>(null)
const vrmError = ref('')
/** Pet3D 回报的加载状态：加载中/失败时用 2D 精灵顶替，避免闪出程序化素模 */
const vrmLoadState = ref<'none' | 'loading' | 'ready' | 'error'>('none')
const onVrmState = (st: 'none' | 'loading' | 'ready' | 'error') => {
  vrmLoadState.value = st
}
/** 用 VRM 的 3D 渲染（失败后卸载 Pet3D，省掉 WebGL 空转） */
const useVrm3d = computed(
  () => settings.value.renderer === '3d' && settings.value.vrmMode !== 'off' && vrmLoadState.value !== 'error'
)
/** 2D 精灵：本来就是 2D；或者 3D 但模型还没就绪/加载失败 */
const show2d = computed(
  () =>
    settings.value.renderer === '2d' ||
    (settings.value.renderer === '3d' && settings.value.vrmMode !== 'off' && vrmLoadState.value !== 'ready')
)
let vrmSeq = 0

function toArrayBuffer(data: any): ArrayBuffer | null {
  if (!data) return null
  if (data instanceof ArrayBuffer) return data
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  }
  return null
}

async function loadBuiltinVrm(): Promise<ArrayBuffer | null> {
  const one = builtinVrmOf(settings.value.vrmBuiltin)
  // 未随包任何 3D 模型（--pets 未选 3D）→ 没得读，交给上层报"内置模型不可用"并回退 2D
  if (!one) return null
  if (import.meta.env.DEV) {
    try {
      const r = await fetch('/vrm/' + one.file)
      if (r.ok) return await r.arrayBuffer()
    } catch {
      /* dev 下拿不到就退回主进程读（打包版路径） */
    }
  }
  const r = await api()?.readBuiltinVrm?.(one.id)
  return r && r.ok ? toArrayBuffer(r.data) : null
}

/** 换形象 / 切 3D / 打开宠物窗时重新取一次模型字节 */
async function refreshVrm() {
  const seq = ++vrmSeq
  vrmError.value = ''
  vrmLoadState.value = 'none'
  if (settings.value.renderer !== '3d' || settings.value.vrmMode === 'off') {
    vrmBuffer.value = null
    return
  }
  try {
    let buf: ArrayBuffer | null = null
    if (settings.value.vrmMode === 'custom') {
      if (!settings.value.vrmPath) {
        vrmError.value = '未选择模型文件'
      } else {
        const r = await api()?.readVrm?.(settings.value.vrmPath)
        if (!r || !r.ok) vrmError.value = (r && r.msg) || '读取模型失败'
        else buf = toArrayBuffer(r.data)
      }
    } else {
      buf = await loadBuiltinVrm()
      if (!buf) vrmError.value = '内置模型不可用'
    }
    if (seq !== vrmSeq) return
    vrmBuffer.value = buf
    // 连模型字节都拿不到（路径失效/文件坏）：直接判失败，让 Pet3D 卸载、2D 顶上
    if (!buf) vrmLoadState.value = 'error'
  } catch (err) {
    if (seq === vrmSeq) {
      vrmBuffer.value = null
      vrmError.value = String(err)
      vrmLoadState.value = 'error'
    }
  }
}

// 切 2D/3D、换内置/自定义、换文件 → 重新取模型
watch(
  () => [settings.value.renderer, settings.value.vrmMode, settings.value.vrmPath, settings.value.vrmBuiltin],
  () => refreshVrm()
)
const bubble = computed(() =>
  settings.value.bubble && state.value === 'running' && !showAsk.value ? activity.value : null
)
/** 宠物头顶在窗内的位置：2D 精灵 118 高 / 3D 取景框 280 高，脚都在窗底 6px 处 */
const petTop = computed(() => {
  const s = settings.value.scale || 1
  const h = settings.value.renderer === '3d' ? 280 : 118
  return Math.round(6 + h * s)
})
const bubbleBottom = computed(() => `${petTop.value + 10}px`)
/** 快问条：3D 必须贴着模型头顶，否则 280 高的模型会被压在条后面；2D 沿用原来的 188 */
const askBottom = computed(() =>
  settings.value.renderer === '3d' ? `${petTop.value + 10}px` : '188px'
)
/** 3D 要一个明确的取景框：canvas 默认 300×150，不给尺寸的话人形会被压成一小只 */
const bodyStyle = computed(() => {
  if (settings.value.renderer !== '3d') return {}
  const s = settings.value.scale || 1
  return { width: Math.round(190 * s) + 'px', height: Math.round(280 * s) + 'px' }
})
const action = ref<string | null>(null)
const barOpen = ref(false)
const panelOpen = ref(false)
const radialOpen = ref(false)
const radial = reactive({ cx: 0, cy: 0, flip: false })
const tasks = ref<Array<{ id: string; title: string; status: string }>>([])
/** 宠物记忆：好感与互动次数（主窗派生后推过来） */
const memory = ref({ affinity: 0, pet: 0, wave: 0, follow: 0, lastAt: 0 })
const agents = ref<Array<{ id: string; name: string }>>([])
const agentId = ref('')
const askText = ref('')
const agentOpen = ref(false)
const agentQuery = ref('')
const showAsk = ref(false)
const askFocused = ref(false)
const askInputEl = ref<HTMLInputElement | null>(null)
const hoverBody = ref(false)

/** 双击宠物才唤出输入条（hover 就弹出来太吵，用户明确要求改掉） */
function openAsk() {
  if (barOpen.value || panelOpen.value || radialOpen.value) return
  showAsk.value = true
  setInteractive(true)
  requestAnimationFrame(() => askInputEl.value?.focus())
}

const agentName = computed(() => {
  const a = agents.value.find((x) => x.id === agentId.value)
  return a ? a.name : agents.value[0]?.name || '智能体'
})
const filteredAgents = computed(() => {
  const q = agentQuery.value.trim().toLowerCase()
  return q ? agents.value.filter((a) => a.name.toLowerCase().includes(q)) : agents.value
})
function toggleAgents() {
  agentOpen.value = !agentOpen.value
  agentQuery.value = ''
}

function pickAgent(id: string) {
  agentId.value = id
  agentOpen.value = false
  agentQuery.value = ''
}

function hideAsk(clear = false) {
  showAsk.value = false
  if (clear) askText.value = ''
}

function submitAsk() {
  const v = askText.value.trim()
  if (!v) return
  api()?.action?.({ type: 'ask', text: v, agentId: agentId.value })
  askText.value = ''
  hideAsk()
}
let actionTimer = 0

const ACTIONS = [
  { key: 'pet', g: '♥', label: '摸摸', dur: 2300 },
  { key: 'wave', g: '👋', label: '招手', dur: 2400 },
  { key: 'look', g: '👀', label: '张望', dur: 2600 },
  { key: 'nap', g: '💤', label: '打盹', dur: 3000 },
  { key: 'spin', g: '↻', label: '转圈', dur: 1100 },
  { key: 'hop', g: '⤴', label: '跳一跳', dur: 900 },
]

/* 槽位注册表在 store 里（设置页的编辑器读同一份），这里只补图标 */
const slotKeys = computed(() => (Array.isArray(settings.value.slots) ? settings.value.slots : []))
const defOf = (k: string) => ({ label: PET_SLOT_DEFS[k] || '—', icon: ICONS[k] || '' })
const labelOf = (k: string) => PET_SLOT_DEFS[k] || '—'

const ICONS: Record<string, string> = {
  play: '<svg viewBox="0 0 24 24"><path d="M11 3l1.5 4.2L16.7 8.7l-4.2 1.5L11 14.4 9.5 10.2 5.3 8.7l4.2-1.5z"/><path d="M17.5 14l.8 2.3 2.2.8-2.2.8-.8 2.3-.8-2.3-2.2-.8 2.2-.8z"/></svg>',
  walk: '<svg viewBox="0 0 24 24"><circle cx="13" cy="4.5" r="2"/><path d="M11 21l1.5-5-2.5-2 1-4 3 2.5 2.5 1"/><path d="M12.5 16l-2 5M9 10l-2.5 3.5"/></svg>',
  newTask: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z"/><path d="M13.5 7.5l3 3"/></svg>',
  panel: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  pack: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="7"/><path d="M9 4l1.5 2h3L15 4z"/></svg>',
  hide: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 4l16 16"/></svg>',
  zoom: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M8 10.5h5M10.5 8v5"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>',
}

const RADIUS = 96
function slotStyle(i: number, n = slotKeys.value.length) {
  const start = 168
  const end = 12
  const deg = start - ((start - end) * i) / Math.max(1, n - 1)
  const a = (deg * Math.PI) / 180
  const x = Math.cos(a) * RADIUS
  const y = Math.sin(a) * RADIUS * (radial.flip ? -1 : 1)
  // 槽位坐标是相对 .radial 容器（它已经定位在宠物中心），不能再叠加中心点
  return {
    left: x - 26 + 'px',
    top: -y - 26 + 'px',
    animationDelay: i * 30 + 'ms',
  }
}

const STATUS_SHORT: Record<string, string> = {
  running: '执行中',
  paused: '已暂停',
  'needs-input': '等你',
  ready: '完成',
  error: '出错',
}
const PACK_ORDER = PET_PACKS.map((p) => p.id)


const api = () => (window as any).electronAPI?.pet

function play(key: string) {
  const a = ACTIONS.find((x) => x.key === key)
  if (!a) return
  // 互动计入宠物记忆（好感）：只报这两种，其余动作不算
  if (key === 'pet' || key === 'wave') api()?.action?.({ type: 'pet-interaction', kind: key })
  action.value = null
  requestAnimationFrame(() => (action.value = key)) // 连点同一动作也能重播
  window.clearTimeout(actionTimer)
  actionTimer = window.setTimeout(() => (action.value = null), a.dur)
}

function openRadial() {
  const el = document.querySelector('.body') as HTMLElement | null
  if (!el) return
  const r = el.getBoundingClientRect()
  radial.cx = r.left + r.width / 2
  radial.cy = r.top + r.height * 0.35 // 从胸口发散，避开头顶
  radial.flip = radial.cy < 150 // 贴近窗口顶 → 翻下半圈
  radialOpen.value = true
  barOpen.value = false
  panelOpen.value = false
  showAsk.value = false
  setInteractive(true)
}
function closeRadial() {
  radialOpen.value = false
}

function runSlot(key: string) {
  closeRadial()
  if (key === 'play') {
    barOpen.value = !barOpen.value
    setInteractive(true)
    return
  }
  if (key === 'walk') {
    if (walking.value) stopWalk()
    else if (state.value === 'idle' && !action.value) api()?.walk?.({ on: true })
    return
  }
  if (key === 'panel') {
    panelOpen.value = !panelOpen.value
    setInteractive(true)
    return
  }
  if (key === 'hide') {
    api()?.close?.()
    return
  }
  if (key === 'pack') {
    cyclePack()
    return
  }
  if (key === 'zoom') {
    const order = [0.8, 1, 1.2, 1.4]
    const idx = order.indexOf(Number(settings.value.scale))
    const next = order[(idx + 1) % order.length]
    settings.value = { ...settings.value, scale: next }
    store.update({ scale: next })
    return
  }
  if (key === 'renderer') {
    const next = settings.value.renderer === '2d' ? '3d' : '2d'
    settings.value = { ...settings.value, renderer: next }
    store.update({ renderer: next })
    return
  }
  const type = key === 'newTask' ? 'new-task' : key === 'settings' ? 'open-settings' : 'open-chat'
  api()?.action?.({ type })
}

function rowAction(type: 'pause' | 'resume' | 'pin' | 'retry', id: string) {
  if (type === 'pin') {
    const next = settings.value.pinnedConvId === id ? '' : id
    settings.value = { ...settings.value, pinnedConvId: next }
    store.update({ pinnedConvId: next })   // 立刻落盘，不等 IPC 往返
    if (next) api()?.action?.({ type: 'pet-interaction', kind: 'follow' })
  }
  api()?.action?.({ type, convId: id })
}

function openConv(id: string) {
  panelOpen.value = false
  api()?.action?.({ type: 'open-conv', convId: id })
}

function cyclePack() {
  if (!PACK_ORDER.length) return
  const next = PACK_ORDER[(PACK_ORDER.indexOf(settings.value.pack) + 1) % PACK_ORDER.length]
  const patch = { pack: next, renderer: '2d' as const }
  settings.value = { ...settings.value, ...patch }
  store.update(patch)
}

/* ===== 鼠标穿透：命中宠物/菜单/面板/动作条才接管事件 ===== */
let interactive = false
function setInteractive(on: boolean) {
  if (on === interactive) return
  interactive = on
  api()?.setInteractive?.(on)
}
function hitTest(x: number, y: number) {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  // 下拉浮层被 teleport 到 body，不在 .pet-win 里，也要算命中
  return !!el?.closest('[data-hit]') || !!el?.closest('.el-popper')
}
function onMove(e: PointerEvent) {
  setInteractive(hitTest(e.clientX, e.clientY))
  const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
  const overBody = !!el?.closest('.body')
  const overAsk = !!el?.closest('.ask') || !!el?.closest('.el-popper')
  hoverBody.value = overBody || overAsk
  // 用户伸手过来就别走了：跟真人宠物一样，被搭话就停下
  if (hoverBody.value && walking.value) stopWalk()
}

/* ===== 沿屏幕底边踱步：待机 9~20s 后随机走一段，位置由主进程动窗 ===== */
const IDLE_WALK_MIN = 9000
const IDLE_WALK_MAX = 20000
let strollTimer = 0

/* ===== 好感带来的小动作：好感 ≥ 30 时，待机偶尔自己蹦一下 ===== */
let joyTimer = 0
function scheduleJoy() {
  window.clearTimeout(joyTimer)
  const delay = 60000 + Math.random() * 90000
  joyTimer = window.setTimeout(() => {
    if (canStroll() && memory.value.affinity >= 30) play('hop')
    scheduleJoy()
  }, delay)
}

/** 当前是否处于"可以自己走"的状态：待机、没动作、没开菜单、没悬停 */
function canStroll() {
  return (
    settings.value.walk &&
    state.value === 'idle' &&
    !action.value &&
    !walking.value &&
    !hoverBody.value &&
    !radialOpen.value &&
    !barOpen.value &&
    !panelOpen.value
  )
}

function scheduleStroll() {
  window.clearTimeout(strollTimer)
  if (!settings.value.walk) return
  const delay = IDLE_WALK_MIN + Math.random() * (IDLE_WALK_MAX - IDLE_WALK_MIN)
  strollTimer = window.setTimeout(() => {
    if (!canStroll()) {
      scheduleStroll()
      return
    }
    api()?.walk?.({ on: true })
  }, delay)
}

function stopWalk() {
  if (walking.value) api()?.walk?.({ on: false })
  walking.value = false
}

// 离开待机 / 播动作 / 开菜单 / 关掉踱步 → 立刻取消；回到待机再重新排期
watch(
  () => [state.value, action.value, settings.value.walk, radialOpen.value, barOpen.value, panelOpen.value],
  () => {
    if (!canStroll()) stopWalk()
    scheduleStroll()
  }
)

/* ===== 拖拽 = 移动窗口 ===== */
let dragging = false
let lastX = 0
let lastY = 0
function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  closeRadial()
  stopWalk() // 拖动期间窗位置归用户，别和踱步抢
  dragging = true
  lastX = e.screenX
  lastY = e.screenY
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}
function onDragMove(e: PointerEvent) {
  if (!dragging) return
  const dx = e.screenX - lastX
  const dy = e.screenY - lastY
  lastX = e.screenX
  lastY = e.screenY
  if (dx || dy) api()?.moveBy?.(dx, dy)
}
function onUp() {
  dragging = false
}

function onPointerDownAnywhere(e: PointerEvent) {
  const el = e.target as HTMLElement | null
  if (
    !el?.closest?.('.radial') &&
    !el?.closest?.('.body') &&
    !el?.closest?.('.bar') &&
    !el?.closest?.('.panel') &&
    !el?.closest?.('.agent-pop') &&

    !el?.closest?.('.ask')
  ) {
    closeRadial()
    barOpen.value = false
    if (!askText.value.trim()) showAsk.value = false // 有草稿就别收，避免误点丢内容
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (radialOpen.value) return closeRadial()
  if (barOpen.value) { barOpen.value = false; return }
  if (panelOpen.value) panelOpen.value = false
}

let offState: (() => void) | undefined
let offSettings: (() => void) | undefined
let offWalk: (() => void) | undefined
let offWin: (() => void) | undefined

onMounted(() => {
  // 透明窗：应用外壳（#app / .app-shell / main）自带主题底色与壁纸，
  // 只抹 html/body 不够——必须用 !important 把整条祖先链一起压掉，否则窗口是一块实色矩形。
  document.documentElement.classList.add('pet-window-mode')
  document.body.classList.add('pet-window-mode')
  const st = document.createElement('style')
  st.id = 'pet-window-transparent'
  st.textContent = `
    html.pet-window-mode, html.pet-window-mode body, html.pet-window-mode #app,
    html.pet-window-mode .app-shell, html.pet-window-mode .main-content {
      background: transparent !important;
      background-image: none !important;
      box-shadow: none !important;
      border: 0 !important;
    }`
  document.head.appendChild(st)

  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointermove', onDragMove, true)
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointerdown', onPointerDownAnywhere, true)
  window.addEventListener('keydown', onKey)

  offState = api()?.onState?.((payload: any) => {
    if (!payload) return
    if (payload.state) state.value = payload.state as PetState
    activity.value = payload.activity ?? null
    if (Array.isArray(payload.tasks)) tasks.value = payload.tasks
    if (payload.memory) memory.value = { ...memory.value, ...payload.memory }
    if (Array.isArray(payload.agents)) {
      agents.value = payload.agents
      if (!agents.value.some((a) => a.id === agentId.value)) agentId.value = payload.agentId || agents.value[0]?.id || ''
    }
  })
  offSettings = api()?.onSettings?.((payload: any) => {
    if (payload && payload.renderer) settings.value = { ...PET_DEFAULTS, ...payload }
  })

  // 主进程动窗：起走 / 到位 / 撞到屏幕边缘折返
  offWalk = api()?.onWalkState?.((p: any) => {
    const wasWalking = walking.value
    walking.value = !!(p && p.walking)
    if (p && p.dir) walkDir.value = Number(p.dir) < 0 ? -1 : 1
    if (walking.value) window.clearTimeout(strollTimer)
    else if (wasWalking) scheduleStroll()
  })
  // 可见 / 前台：隐藏即停渲染，失焦降帧
  offWin = api()?.onWinState?.((p: any) => {
    if (!p) return
    winVisible.value = p.visible !== false
    winFocused.value = p.focused !== false
  })
  scheduleStroll()
  refreshVrm()
  scheduleJoy()

  // 主动要一次当前状态：主窗只在变化时推，本窗重载后智能体/任务列表会是空的
  api()?.requestSync?.()
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onMove, true)
  window.removeEventListener('pointermove', onDragMove, true)
  window.removeEventListener('pointerup', onUp, true)
  window.removeEventListener('pointerdown', onPointerDownAnywhere, true)
  window.removeEventListener('keydown', onKey)
  offState?.()
  offSettings?.()
  offWalk?.()
  offWin?.()
  window.clearTimeout(joyTimer)
  vrmSeq++ // 作废在途的模型加载
  window.clearTimeout(actionTimer)
  window.clearTimeout(strollTimer)
  document.documentElement.classList.remove('pet-window-mode')
  document.body.classList.remove('pet-window-mode')
  document.getElementById('pet-window-transparent')?.remove()
})
</script>

<style scoped>
.pet-win {
  position: fixed;
  inset: 0;
  background: transparent;
  user-select: none;
  overflow: hidden;
}
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 6px;
}
.body {
  position: relative;
  cursor: grab;
  touch-action: none;
  padding: 4px;
  border-radius: 12px;
}
.body:active {
  cursor: grabbing;
}

.pet-overlay {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
}

/* ===== 半圆菜单 ===== */
.radial {
  position: absolute;
  width: 0;
  height: 0;
  z-index: 8;
}
.radial .slot {
  position: absolute;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #171d29;
  border: 1px solid #33405a;
  color: #cdd8ea;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  animation: slot-in 0.2s cubic-bezier(0.34, 1.5, 0.5, 1) backwards;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
@keyframes slot-in {
  from { opacity: 0; transform: scale(0.3); }
  to { opacity: 1; transform: scale(1); }
}
.radial .slot:hover {
  background: #223049;
  border-color: #e8734a;
  color: #fff;
}
.radial .slot .ic {
  display: block;
  width: 18px;
  height: 18px;
}
.radial .slot .ic :deep(svg) {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.radial .slot .sl {
  font-size: 9px;
  color: #8a97ab;
  transform: scale(0.92);
}
.radial .slot:hover .sl {
  color: #e8b49a;
}

/* ===== 逗一下动作条 ===== */
.bar {
  position: absolute;
  left: 50%;
  bottom: 148px;
  transform: translateX(-50%);
  display: flex;
  flex: 0 0 auto;
  gap: 5px;
  max-width: calc(100% - 20px);
  padding: 7px;
  background: #11151f;
  border: 1px solid #2f3a4d;
  border-radius: 16px;
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.55);
  white-space: nowrap;
  z-index: 5;
}
.bar .act {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  border: 1px solid transparent;
  background: #1a2130;
  color: #cdd8ea;
  font-size: 11px;
  line-height: 1;
  padding: 7px 10px;
  border-radius: 11px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.bar .act .g { font-size: 13px; }
.bar .act:hover { background: #223049; border-color: #3a4a66; color: #fff; }
.bar .act.on {
  border-color: #e8734a;
  background: rgba(232, 115, 74, 0.14);
  color: #e8b49a;
}

/* ===== 任务小面板 ===== */
.panel {
  position: absolute;
  left: 50%;
  bottom: 140px;
  transform: translateX(-50%);
  width: 300px;
  background: #11151f;
  border: 1px solid #2f3a4d;
  border-radius: 14px;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  z-index: 7;
}
.p-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px 8px;
  border-bottom: 1px solid #232c3b;
}
.p-head b { font-size: 12px; color: #eef2f8; }
.p-count { flex: 1; font-size: 10.5px; color: #7f8ca3; }
.p-x { border: 0; background: transparent; color: #8a97ab; cursor: pointer; font-size: 11px; }
.p-body { max-height: 168px; overflow-y: auto; padding: 4px; scrollbar-width: none; }
.p-body::-webkit-scrollbar { display: none; }
.p-row { display: flex; align-items: center; gap: 7px; padding: 7px 8px; border-radius: 9px; cursor: pointer; }
.p-row:hover { background: #1c2434; }
.p-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: #8ea3c8; }
.p-dot.s-running { background: #e8734a; }
.p-dot.s-needs-input { background: #f0b43c; }
.p-dot.s-paused { background: #8ea3c8; }
.p-title {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: #dbe3ee;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.p-st { font-size: 10px; color: #66738c; flex: 0 0 auto; }
.p-acts { display: flex; align-items: center; gap: 3px; flex: 0 0 auto; }
.p-act {
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.06);
  color: #9aa8bd;
  font-size: 9.5px;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 7px;
  cursor: pointer;
}
.p-act:hover { background: rgba(232, 115, 74, 0.18); color: #e8b49a; }
.p-act.pin.on { background: rgba(232, 115, 74, 0.2); color: #e8b49a; }
html:not(.dark) .p-act { background: rgba(24, 30, 42, 0.06); color: #6b778a; }
html:not(.dark) .p-act:hover { background: rgba(232, 115, 74, 0.14); color: #c4532e; }
html:not(.dark) .p-act.pin.on { background: rgba(232, 115, 74, 0.16); color: #c4532e; }
.p-empty { text-align: center; color: #66738c; font-size: 11.5px; padding: 18px 0; }

/* ===== 快问输入条 ===== */
.ask {
  position: absolute;
  left: 50%;
  bottom: 188px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 5px;
  width: 292px;
  height: 34px;
  padding: 0 5px 0 4px;
  background: #11151f;
  border: 1px solid #2c3648;
  border-radius: 17px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.42);
  z-index: 6;
}
.ask .ask-agent {
  flex: 0 0 auto;
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid rgba(232, 115, 74, 0.35);
  border-radius: 12px;
  background: rgba(232, 115, 74, 0.14);
  color: #e8b49a;
  font-size: 10px;
  line-height: 1;
  padding: 5px 8px;
  cursor: pointer;
}
.ask .ask-agent:hover { background: rgba(232, 115, 74, 0.24); }
.ask input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  outline: none;
  color: #dbe3ee;
  font-size: 11.5px;
}
.ask input::placeholder { color: #55617a; }
/* 自绘智能体下拉：按钮按文字自适应，封顶 120px */
.ask-agent-wrap { position: relative; flex: 0 0 auto; }
.ask .ask-agent {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid rgba(232, 115, 74, 0.35);
  border-radius: 12px;
  background: rgba(232, 115, 74, 0.14);
  color: #e8b49a;
  font-size: 10px;
  line-height: 1;
  padding: 5px 8px;
  cursor: pointer;
}
.ask .ask-agent:hover { background: rgba(232, 115, 74, 0.24); }
.agent-pop {
  position: absolute;
  left: 0;
  bottom: 38px;
  width: 172px;
  padding: 5px;
  background: #11151f;
  border: 1px solid #2f3a4d;
  border-radius: 12px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5);
  z-index: 12;
}
.agent-search {
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid #2c3648;
  border-radius: 8px;
  color: #dbe3ee;
  font-size: 10.5px;
  padding: 5px 7px;
  outline: none;
  margin-bottom: 4px;
}
.agent-list { max-height: 156px; overflow-y: auto; scrollbar-width: none; }
.agent-list::-webkit-scrollbar { display: none; }
.agent-item {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: #cdd8ea;
  font-size: 11px;
  padding: 6px 7px;
  border-radius: 7px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-item:hover { background: #223049; }
.agent-item.on { color: #e8b49a; background: rgba(232, 115, 74, 0.14); }
.agent-empty { color: #66738c; font-size: 10.5px; text-align: center; padding: 10px 0; }
html:not(.dark) .agent-pop {
  background: #fff;
  border-color: rgba(20, 25, 35, 0.12);
  box-shadow: 0 12px 30px rgba(15, 20, 30, 0.18);
}
html:not(.dark) .agent-search {
  background: rgba(24, 30, 42, 0.05);
  border-color: rgba(20, 25, 35, 0.12);
  color: #2b3444;
}
html:not(.dark) .agent-item { color: #2b3444; }
html:not(.dark) .agent-item:hover { background: rgba(24, 30, 42, 0.06); }
html:not(.dark) .agent-item.on { color: #c4532e; background: rgba(232, 115, 74, 0.12); }

/* 绑定的工作目录：胶囊正下方的小 chip */
html:not(.dark) html:not(.dark) .ask .ask-agent {
  background: rgba(232, 115, 74, 0.1);
  border-color: rgba(232, 115, 74, 0.28);
  color: #c4532e;
}
.ask .ask-go {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: #e8734a;
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ask .ask-go:hover { background: #e8734a; color: #fff; }


/* ===== 名字牌（状态文案在这里表达，不再单独挂徽标） ===== */
/* ===== 活动气泡（内容型，不吃指针） ===== */
.bubble {
  position: absolute;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 252px;
  padding: 4px 10px;
  border-radius: 10px;
  background: rgba(16, 20, 30, 0.94);
  border: 1px solid #2a3342;
  color: #cdd6e2;
  font-size: 11.5px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 6;
  transform: translateX(-50%);
  animation: bubble-in 0.22s cubic-bezier(0.3, 1.2, 0.4, 1);
}
/* 小尖角指向宠物 */
.bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -5px;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  background: inherit;
  border-right: 1px solid #2a3342;
  border-bottom: 1px solid #2a3342;
  transform: rotate(45deg);
}
.b-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  animation: b-pulse 1.2s ease-in-out infinite;
}
.b-dot.k-think { background: #8ab4ff; }
.b-dot.k-read { background: #6fd39a; }
.b-dot.k-search { background: #f0c45c; }
.b-dot.k-write { background: #e8734a; }
.b-dot.k-act { background: #b98cff; }
.b-dot.k-tool { background: #8f9bb3; }
.b-target {
  color: #8f9bb3;
  max-width: 132px;
  overflow: hidden;
  text-overflow: ellipsis;
}
@keyframes b-pulse {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.35); opacity: 1; }
}
@keyframes bubble-in {
  from { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.9); }
  to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}

.p-affinity {
  margin-left: auto;
  margin-right: 6px;
  color: #e8b49a;
  font-size: 10.5px;
}
.p-dot.s-error { background: #e05c5c; }
.p-dot.s-completed { background: #5cc48a; }


/* ===== 浅色主题：浮层全部换浅底 + 轻投影，别在浅色桌面上糊黑板 ===== */
html:not(.dark) .bar,
html:not(.dark) .panel,
html:not(.dark) .ask {
  background: rgba(255, 255, 255, 0.97);
  border-color: rgba(20, 25, 35, 0.12);
  box-shadow: 0 10px 28px rgba(15, 20, 30, 0.16);
}
html:not(.dark) .bar .act {
  background: rgba(24, 30, 42, 0.05);
  border-color: rgba(24, 30, 42, 0.08);
  color: #2b3444;
}
html:not(.dark) .bar .act:hover {
  background: rgba(24, 30, 42, 0.1);
  border-color: rgba(232, 115, 74, 0.55);
  color: #1b2230;
}
html:not(.dark) .bar .act.on {
  background: rgba(232, 115, 74, 0.12);
  border-color: #e8734a;
  color: #c4532e;
}
html:not(.dark) .radial .slot {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(20, 25, 35, 0.12);
  color: #2b3444;
  box-shadow: 0 4px 14px rgba(15, 20, 30, 0.16);
}
html:not(.dark) .radial .slot .sl { color: #5b6779; }
html:not(.dark) .radial .slot:hover {
  background: #fff;
  border-color: #e8734a;
  color: #c4532e;
}
html:not(.dark) .radial .slot:hover .sl { color: #c4532e; }
html:not(.dark) .ask input { color: #2b3444; }
html:not(.dark) .ask input::placeholder { color: #98a2b3; }
html:not(.dark) .ask .ask-agent {
  background: rgba(232, 115, 74, 0.1);
  border-color: rgba(232, 115, 74, 0.28);
  color: #c4532e;
}
html:not(.dark) .ask .ask-go { background: #e8734a; color: #fff; }
html:not(.dark) .ask .ask-go:hover { background: #e8734a; color: #fff; }
html:not(.dark) .panel .p-head { border-color: rgba(20, 25, 35, 0.08); }
html:not(.dark) .panel .p-head b { color: #1b2230; }
html:not(.dark) .panel .p-count,
html:not(.dark) .panel .p-st { color: #7a8699; }
html:not(.dark) .panel .p-title { color: #2b3444; }
html:not(.dark) .panel .p-row:hover { background: rgba(24, 30, 42, 0.06); }
html:not(.dark) .panel .p-x { color: #7a8699; }
html:not(.dark) </style>
