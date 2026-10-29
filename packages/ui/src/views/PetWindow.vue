<template>
  <div class="pet-win">
    <div class="stage">
      <div
        class="body"
        :class="{ 'body-3d': settings.renderer === '3d' }"
        :style="bodyStyle"
        data-hit
        title="左键拖动 · 双击说话 · 右键菜单"
        @pointerdown="onDown"
        @dblclick.stop="openPopup('ask')"
        @contextmenu.prevent="openPopup('radial')"
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
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 宠物窗（方案 B，2026-10-29）
 *
 * 窗口只装宠物本体：菜单 / 任务面板 / 输入条 / 活动气泡都是独立小窗（PetPopup.vue）。
 * 好处：四周没有预留空白，宠物能贴住屏幕边、也能骑在两块屏的缝上。
 * 这里只负责：渲染、拖拽、踱步、双击/右键唤起弹层、接受主进程来的动作命令。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Pet2D from '../components/pet/Pet2D.vue'
import { loadUserPacks, userPacks } from '../components/pet/user-packs'
import Pet3D from '../components/pet/Pet3D.vue'
import {
  usePetStore,
  PET_DEFAULTS,
  builtinVrmOf,
  type PetSettings,
  type PetState,
} from '../stores/pet'

const store = usePetStore()
store.init() // 同源 localStorage：别等主窗的 IPC 推送
const settings = ref<PetSettings>({ ...PET_DEFAULTS, ...store.settings })
const state = ref<PetState>('idle')
/** 活动气泡的内容来自快照；有内容就开气泡小窗，没有就关掉 */
const activity = ref<{ kind: string; label: string; target?: string } | null>(null)
const action = ref<string | null>(null)
/** 沿屏幕底边走：位置由主进程动窗，这里只负责动画与朝向 */
const walking = ref(false)
const walkDir = ref(1)
const winVisible = ref(true)
const winFocused = ref(true)
const renderVisible = computed(() => winVisible.value)
const renderActive = computed(() => winVisible.value && winFocused.value)
const facingLeft = computed(() => walking.value && walkDir.value < 0)

/** 3D 形象：VRM 字节（null = 程序化素模） */
const vrmBuffer = ref<ArrayBuffer | null>(null)
const vrmError = ref('')
const vrmLoadState = ref<'none' | 'loading' | 'ready' | 'error'>('none')
const onVrmState = (st: 'none' | 'loading' | 'ready' | 'error') => {
  vrmLoadState.value = st
}
const useVrm3d = computed(
  () => settings.value.renderer === '3d' && settings.value.vrmMode !== 'off' && vrmLoadState.value !== 'error'
)
const show2d = computed(
  () =>
    settings.value.renderer === '2d' ||
    (settings.value.renderer === '3d' && settings.value.vrmMode !== 'off' && vrmLoadState.value !== 'ready')
)
/** 3D 要一个明确取景框；窗口本身就是宠物大小，这里给 canvas 尺寸 */
const bodyStyle = computed(() => {
  if (settings.value.renderer !== '3d') return {}
  const s = settings.value.scale || 1
  return { width: Math.round(190 * s) + 'px', height: Math.round(280 * s) + 'px' }
})

const api = () => (window as any).electronAPI?.pet
const openPopup = (kind: string) => api()?.openPopup?.(kind)

/* ===== VRM 模型 ===== */
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
  if (import.meta.env.DEV) {
    try {
      const r = await fetch('/vrm/' + one.file)
      if (r.ok) return await r.arrayBuffer()
    } catch {
      /* dev 拿不到就退回主进程读 */
    }
  }
  const r = await api()?.readBuiltinVrm?.(one.id)
  return r && r.ok ? toArrayBuffer(r.data) : null
}
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
      if (!settings.value.vrmPath) vrmError.value = '未选择模型文件'
      else {
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
    if (!buf) vrmLoadState.value = 'error'
  } catch (err) {
    if (seq === vrmSeq) {
      vrmBuffer.value = null
      vrmError.value = String(err)
      vrmLoadState.value = 'error'
    }
  }
}
watch(
  () => [settings.value.renderer, settings.value.vrmMode, settings.value.vrmPath, settings.value.vrmBuiltin],
  () => refreshVrm()
)

/* ===== 动作 ===== */
const ACT_DUR: Record<string, number> = { pet: 2300, wave: 2400, look: 2600, nap: 3000, spin: 1100, hop: 900 }
let actionTimer = 0
function play(key: string) {
  if (!ACT_DUR[key]) return
  if (key === 'pet' || key === 'wave') api()?.action?.({ type: 'pet-interaction', kind: key })
  action.value = null
  requestAnimationFrame(() => (action.value = key))
  window.clearTimeout(actionTimer)
  actionTimer = window.setTimeout(() => (action.value = null), ACT_DUR[key])
}

/* ===== 主进程发来的命令（弹层里的「逗一下 / 换形象 / 缩放」都走这里） ===== */
let offCmd: (() => void) | undefined
function onCommand(cmd: any) {
  if (!cmd || !cmd.type) return
  if (cmd.type === 'play' && cmd.key) return play(String(cmd.key))
  if (cmd.type === 'cycle-pack') {
    // 换形象：设置里改，主窗与宠物窗通过 IPC 同步
    const packs = ['boba', 'tiko', 'wangcai', 'lulu', 'noir', 'mallow']
    const next = packs[(packs.indexOf(settings.value.pack) + 1) % packs.length]
    store.update({ pack: next, renderer: '2d' })
    return
  }
  if (cmd.type === 'cycle-zoom') {
    const order = [0.8, 1, 1.2, 1.4]
    const idx = order.indexOf(Number(settings.value.scale))
    store.update({ scale: order[(idx + 1) % order.length] })
    return
  }
  if (cmd.type === 'toggle-renderer') {
    store.update({ renderer: settings.value.renderer === '2d' ? '3d' : '2d' })
    return
  }
  if (cmd.type === 'walk') {
    if (state.value === 'idle' && !action.value) api()?.walk?.({ on: true })
  }
}

/* ===== 穿透控制：宠物窗默认整窗穿透，指针落在宠物上才接管 ===== */
let interactive = false
function setInteractive(on: boolean) {
  if (on === interactive) return
  interactive = on
  api()?.setInteractive?.(on)
}
function onHover(e: PointerEvent) {
  if (dragging) return
  const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
  setInteractive(!!el?.closest('.body'))
}

/* ===== 拖拽 ===== */
let dragging = false
let lastX = 0
let lastY = 0
function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  stopWalk()
  dragging = true
  lastX = e.screenX
  lastY = e.screenY
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  api()?.setInteractive?.(true)
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

/* ===== 沿屏幕底边踱步 ===== */
const IDLE_WALK_MIN = 9000
const IDLE_WALK_MAX = 20000
let strollTimer = 0
function canStroll() {
  return settings.value.walk && state.value === 'idle' && !action.value && !walking.value && !dragging
}
function scheduleStroll() {
  window.clearTimeout(strollTimer)
  if (!settings.value.walk) return
  const delay = IDLE_WALK_MIN + Math.random() * (IDLE_WALK_MAX - IDLE_WALK_MIN)
  strollTimer = window.setTimeout(() => {
    if (!canStroll()) return scheduleStroll()
    api()?.walk?.({ on: true })
  }, delay)
}
function stopWalk() {
  if (walking.value) api()?.walk?.({ on: false })
  walking.value = false
}
watch(
  () => [state.value, action.value, settings.value.walk],
  () => {
    if (!canStroll()) stopWalk()
    scheduleStroll()
  }
)

// 气泡小窗：只在"运行中且说明开"时出现（独立窗，不吃鼠标）
watch(
  () => [activity.value, state.value, settings.value.bubble],
  () => {
    if (activity.value && state.value === 'running' && settings.value.bubble) api()?.openPopup?.('bubble')
    else api()?.closePopup?.('bubble')
  }
)

/* ===== 生命周期 ===== */
let offState: (() => void) | undefined
let offSettings: (() => void) | undefined
onMounted(() => {
  document.documentElement.classList.add('pet-window-mode')
  document.body.classList.add('pet-window-mode')
  const st = document.createElement('style')
  st.id = 'pet-window-transparent'
  st.textContent = `
    html.pet-window-mode, html.pet-window-mode body, html.pet-window-mode #app,
    html.pet-window-mode .app-shell, html.pet-window-mode .main-content {
      background: transparent !important; background-image: none !important;
      box-shadow: none !important; border: 0 !important;
    }`
  document.head.appendChild(st)

  window.addEventListener('pointermove', onHover, true)
  window.addEventListener('pointermove', onDragMove, true)
  window.addEventListener('pointerup', onUp, true)

  offState = api()?.onState?.((payload: any) => {
    if (!payload) return
    if (payload.state) state.value = payload.state as PetState
    activity.value = payload.activity ?? null
  })
  offSettings = api()?.onSettings?.((payload: any) => {
    if (payload && payload.renderer) settings.value = { ...PET_DEFAULTS, ...payload }
    // 新导入的形象在主窗落盘、本窗注册表里还没有：补一次同步
    if (payload?.pack && !userPacks[payload.pack]) void loadUserPacks()
  })
  offCmd = api()?.onCommand?.(onCommand)
  offWalk = api()?.onWalkState?.((p: any) => {
    const wasWalking = walking.value
    walking.value = !!(p && p.walking)
    if (p && p.dir) walkDir.value = Number(p.dir) < 0 ? -1 : 1
    if (walking.value) window.clearTimeout(strollTimer)
    else if (wasWalking) scheduleStroll()
  })
  offWin = api()?.onWinState?.((p: any) => {
    if (!p) return
    winVisible.value = p.visible !== false
    winFocused.value = p.focused !== false
  })

  api()?.requestSync?.()
  void loadUserPacks() // 形象工坊：用户导入的形象也要在宠物窗里可用
  refreshVrm()
  scheduleStroll()
})

let offWalk: (() => void) | undefined
let offWin: (() => void) | undefined
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onHover, true)
  window.removeEventListener('pointermove', onDragMove, true)
  window.removeEventListener('pointerup', onUp, true)
  offState?.()
  offSettings?.()
  offCmd?.()
  offWalk?.()
  offWin?.()
  vrmSeq++
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
}
.body {
  position: relative;
  cursor: grab;
  touch-action: none;
  padding: 2px;
  border-radius: 12px;
}
.body:active {
  cursor: grabbing;
}
.pet-overlay {
  display: block;
}
</style>
