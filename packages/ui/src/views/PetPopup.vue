<template>
  <div class="pop-win" :class="'kind-' + kind">
    <!-- 半圆菜单 -->
    <div v-if="kind === 'radial'" class="radial" style="left: 50%; top: 50%">
      <button
        v-for="(k, i) in slotKeys"
        :key="k + i"
        class="slot"
        :style="slotStyle(i, slotKeys.length)"
        :title="labelOf(k)"
        @click.stop="onSlot(k)"
      >
        <span class="ic" v-html="iconOf(k)"></span>
        <span class="sl">{{ labelOf(k) }}</span>
      </button>
    </div>

    <!-- 任务面板 -->
    <div v-else-if="kind === 'panel'" class="panel">
      <div class="p-head">
        <b>任务</b>
        <span class="p-count">{{ tasks.length }} 个</span>
        <span
          v-if="memory.affinity"
          class="p-affinity"
          :title="'摸头 ' + memory.pet + ' · 招手 ' + memory.wave + ' · 跟随 ' + memory.follow"
        >好感 {{ memory.affinity }}</span>
        <button class="p-x" @click.stop="close">✕</button>
      </div>
      <div class="p-body">
        <div v-if="!tasks.length" class="p-empty">没有在跑的任务</div>
        <div v-for="t in tasks" :key="t.id" class="p-row" @click.stop="openConv(t.id)">
          <span class="p-dot" :class="'s-' + t.status" />
          <span class="p-title">{{ t.title }}</span>
          <span class="p-acts">
            <button v-if="t.status === 'running'" class="p-act" title="暂停" @click.stop="act('pause', t.id)">暂停</button>
            <button v-else-if="t.status === 'paused'" class="p-act" title="恢复" @click.stop="act('resume', t.id)">恢复</button>
            <button v-else-if="t.status === 'needs-input'" class="p-act" title="去回答" @click.stop="openConv(t.id)">回答</button>
            <button
              v-else-if="t.status === 'error' || t.status === 'completed'"
              class="p-act"
              title="用同样的内容再跑一次"
              @click.stop="act('retry', t.id)"
            >重试</button>
            <button
              class="p-act pin"
              :class="{ on: settings.pinnedConvId === t.id }"
              :title="settings.pinnedConvId === t.id ? '取消跟随' : '让宠物跟随这个任务'"
              @click.stop="act('pin', t.id)"
            >📌</button>
          </span>
        </div>
      </div>
    </div>

    <!-- 逗一下：动作条 -->
    <div v-else-if="kind === 'play'" class="bar">
      <button v-for="a in ACTIONS" :key="a.key" class="act" @click.stop="play(a.key)">
        <span class="g">{{ a.g }}</span>{{ a.label }}
      </button>
    </div>

    <!-- 快问输入条 -->
    <div v-else-if="kind === 'ask'" class="ask">
      <div class="ask-agent-wrap">
        <button class="ask-agent" :title="agentName" @click.stop="agentOpen = !agentOpen">{{ agentName }}</button>
        <div v-if="agentOpen" class="agent-pop">
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
        @keydown.esc.prevent="close"
      />
      <button class="ask-go" title="交给主窗口" @click.stop="submitAsk">↑</button>
    </div>

    <!-- 活动气泡（不吃指针） -->
    <div v-else-if="kind === 'bubble' && activity" class="bubble">
      <span class="b-dot" :class="'k-' + activity.kind" />
      <span class="b-label">{{ activity.label }}</span>
      <span v-if="activity.target" class="b-target">{{ activity.target }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 宠物弹层宿主（2026-10-29，方案 B）
 *
 * 宠物窗缩到只剩宠物本体，菜单/任务面板/输入条/活动气泡各自是独立透明小窗：
 * 主进程负责开窗、定位、广播状态；这里只按 kind 渲染一块 UI 并把结果回传。
 * 这样四周不留空白，宠物可以直接贴住屏幕边、也能骑在屏幕缝上。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  PET_DEFAULTS,
  PET_SLOT_DEFS,
  type PetActivity,
  type PetSettings,
  type PetState,
} from '../stores/pet'
import '../components/pet/pet-popups.css'

const route = useRoute()
const kind = String(route.params.kind || '')

const settings = ref<PetSettings>({ ...PET_DEFAULTS })
const state = ref<PetState>('idle')
const activity = ref<PetActivity | null>(null)
const tasks = ref<Array<{ id: string; title: string; status: string }>>([])
const memory = ref({ affinity: 0, pet: 0, wave: 0, follow: 0, lastAt: 0 })
const agents = ref<Array<{ id: string; name: string }>>([])
const agentId = ref('')

const askText = ref('')
const askInputEl = ref<HTMLInputElement | null>(null)
const agentOpen = ref(false)
const agentQuery = ref('')

const api = () => (window as any).electronAPI?.pet
const close = () => api()?.closePopup?.(kind)

/* ===== 半圆菜单 ===== */
const ACTIONS = [
  { key: 'pet', g: '♥', label: '摸摸' },
  { key: 'wave', g: '👋', label: '招手' },
  { key: 'look', g: '👀', label: '张望' },
  { key: 'nap', g: '💤', label: '打盹' },
  { key: 'spin', g: '↻', label: '转圈' },
  { key: 'hop', g: '⤴', label: '跳一跳' },
]
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
const slotKeys = computed(() => (Array.isArray(settings.value.slots) ? settings.value.slots : []))
const labelOf = (k: string) => PET_SLOT_DEFS[k] || '—'
const iconOf = (k: string) => ICONS[k] || ''
function slotStyle(i: number, n = slotKeys.value.length) {
  const start = 168
  const end = 12
  const deg = start - ((start - end) * i) / Math.max(1, n - 1)
  const a = (deg * Math.PI) / 180
  const x = Math.cos(a) * RADIUS
  const y = Math.sin(a) * RADIUS
  return { left: x - 26 + 'px', top: -y - 26 + 'px', animationDelay: i * 30 + 'ms' }
}

function onSlot(k: string) {
  if (k === 'panel') { openPopup('panel'); close(); return }
  if (k === 'play') { openPopup('play'); close(); return }
  if (k === 'hide') { api()?.close?.(); close(); return }
  if (k === 'pack') {
    // 换形象：在宠物窗里做（它持有渲染器），这里只发命令
    api()?.command?.({ type: 'cycle-pack' })
    close()
    return
  }
  if (k === 'zoom' || k === 'renderer') {
    api()?.command?.({ type: k === 'zoom' ? 'cycle-zoom' : 'toggle-renderer' })
    close()
    return
  }
  if (k === 'walk') {
    api()?.command?.({ type: 'walk' })
    close()
    return
  }
  if (k === 'settings') { api()?.action?.({ type: 'open-settings' }); close(); return }
  api()?.action?.({ type: 'new-task' })
  close()
}

function play(key: string) {
  api()?.command?.({ type: 'play', key })
  close()
}

function openPopup(k: string) {
  api()?.openPopup?.(k)
}

/* ===== 任务面板 ===== */
function act(type: string, convId: string) {
  api()?.action?.({ type, convId })
  if (type === 'pause' || type === 'resume') return
}
function openConv(convId: string) {
  api()?.action?.({ type: 'open-conv', convId })
  close()
}

/* ===== 快问输入条 ===== */
const agentName = computed(() => {
  const a = agents.value.find((x) => x.id === agentId.value)
  return a ? a.name : agents.value[0]?.name || '智能体'
})
const filteredAgents = computed(() => {
  const q = agentQuery.value.trim().toLowerCase()
  return q ? agents.value.filter((a) => a.name.toLowerCase().includes(q)) : agents.value
})
function pickAgent(id: string) {
  agentId.value = id
  agentOpen.value = false
  agentQuery.value = ''
}
function submitAsk() {
  const v = askText.value.trim()
  if (!v) return
  api()?.action?.({ type: 'ask', text: v, agentId: agentId.value })
  askText.value = ''
  close()
}

/* ===== 订阅宠物状态（主进程广播） ===== */
let offState: (() => void) | undefined
let offSettings: (() => void) | undefined
onMounted(() => {
  document.documentElement.classList.add('pet-window-mode')
  document.body.classList.add('pet-window-mode')
  const st = document.createElement('style')
  st.id = 'pet-popup-transparent'
  st.textContent = `
    html.pet-window-mode, html.pet-window-mode body, html.pet-window-mode #app,
    html.pet-window-mode .app-shell, html.pet-window-mode .main-content {
      background: transparent !important; background-image: none !important;
      box-shadow: none !important; border: 0 !important;
    }`
  document.head.appendChild(st)

  offState = api()?.onState?.((payload: any) => {
    if (!payload) return
    if (payload.state) state.value = payload.state
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
  api()?.requestSync?.()
  if (kind === 'ask') setTimeout(() => askInputEl.value?.focus(), 80)

  // 用 document 捕获：真实按键从焦点元素冒泡上来，合成事件也覆盖得到
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('blur', onBlur)
})
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
function onBlur() {
  // 输入条允许失焦（可能要点主窗口），其余弹层失焦即收
  if (kind !== 'ask') close()
}
onBeforeUnmount(() => {
  offState?.()
  offSettings?.()
  document.removeEventListener('keydown', onKey, true)
  window.removeEventListener('blur', onBlur)
  document.documentElement.classList.remove('pet-window-mode')
  document.body.classList.remove('pet-window-mode')
  document.getElementById('pet-popup-transparent')?.remove()
})
</script>

<style scoped>
.pop-win {
  position: fixed;
  inset: 0;
  background: transparent;
  user-select: none;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.kind-radial { position: relative; }
.kind-ask { align-items: flex-end; padding-bottom: 4px; }
.kind-bubble { align-items: flex-end; }
.kind-play { align-items: flex-end; }
.kind-panel { align-items: flex-end; }
</style>
