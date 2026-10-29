<template>
  <div class="pop-win" :class="'kind-' + kind" @click.self="close">
    <!-- 半圆菜单：默认 6 格；超过 6 个槽位时滚轮转动切换显示的一组 -->
    <div v-if="kind === 'radial'" class="radial" style="left: 50%; top: 50%" @wheel.prevent="onWheel">
      <button
        v-for="(k, i) in visibleSlots"
        :key="k + i"
        class="slot"
        :style="slotStyle(i, visibleSlots.length)"
        :title="labelOf(k)"
        @click.stop="onSlot(k)"
      >
        <span class="ic" v-html="iconOf(k)"></span>
        <span class="sl">{{ labelOf(k) }}</span>
      </button>
    </div>

    <!-- 任务面板：分区（需要处理 / 进行中 / 刚完成）+ 进度条 + 行内快答（对齐原型 .pet-panel） -->
    <div v-else-if="kind === 'panel'" class="panel">
      <div class="p-head">
        <b>任务</b>
        <span class="p-count">{{ runningCount }} 进行 · {{ needCount }} 待处理</span>
        <button
          type="button"
          class="p-icon-btn"
          :class="{ on: muted }"
          :title="muted ? '恢复通知' : '静音通知'"
          @click.stop="toggleMute"
        >{{ muted ? '🔕' : '🔔' }}</button>
        <button type="button" class="p-icon-btn" title="关闭" @click.stop="close">✕</button>
      </div>
      <div class="p-body">
        <div v-if="!tasks.length" class="p-empty">没有任务 —— 点半圆菜单「新建任务」开始</div>
        <template v-for="sec in sections" :key="sec.key">
          <template v-if="sec.rows.length">
            <div class="p-sec">{{ sec.label }}</div>
            <div
              v-for="t in sec.rows"
              :key="t.id"
              class="p-row"
              @click.stop="openConv(t.id)"
            >
              <span class="p-dot" :class="'s-' + t.status" />
              <div class="p-main">
                <div class="p-title">
                  {{ t.title }}<span v-if="settings.pinnedConvId === t.id" class="p-pin">📌</span>
                </div>
                <div class="p-meta">{{ metaOf(t) }}</div>
                <div v-if="(t.planTotal || 0) > 0" class="p-plan"><i :style="{ width: planPct(t) + '%' }" /></div>
                <div v-if="t.status === 'needs-input'" class="p-q">
                  <span class="p-q-txt">{{ t.question || '智能体在等你补充信息' }}</span>
                  <div class="p-answer">
                    <input
                      v-model="answers[t.id]"
                      placeholder="快答…"
                      @click.stop
                      @keydown.enter.stop.prevent="sendAnswer(t.id)"
                    />
                    <button type="button" @click.stop="sendAnswer(t.id)">发送</button>
                  </div>
                </div>
                <div v-else-if="t.status === 'error'" class="p-q p-q-err">任务执行失败，点「重试」用同样的内容再跑一次</div>
              </div>
              <div class="p-acts" @click.stop>
                <button v-if="t.status === 'running'" class="p-act" @click.stop="act('pause', t.id)">暂停</button>
                <button v-else-if="t.status === 'paused'" class="p-act" @click.stop="act('resume', t.id)">恢复</button>
                <button v-else-if="t.status === 'error'" class="p-act" @click.stop="act('retry', t.id)">重试</button>
                <button v-else-if="t.status === 'completed'" class="p-act" @click.stop="openConv(t.id)">查看</button>
                <button
                  class="p-act pin"
                  :class="{ on: settings.pinnedConvId === t.id }"
                  :title="settings.pinnedConvId === t.id ? '取消跟随' : '让宠物跟随这个任务'"
                  @click.stop="act('pin', t.id)"
                >📌</button>
              </div>
            </div>
          </template>
        </template>
      </div>
      <div class="p-foot">
        <button type="button" @click.stop="openAllTasks">打开全部任务 →</button>
        <span class="p-hint">点击行 = 跳转会话</span>
      </div>
    </div>

    <!-- 逗一下：动作条 -->
    <div v-else-if="kind === 'play'" class="bar">
      <button v-for="a in ACTIONS" :key="a.key" class="act" @click.stop="play(a.key)">
        <span class="g">{{ a.g }}</span>{{ a.label }}
      </button>
    </div>

    <!-- 换形象：形象托盘（对齐原型 .char-tray） -->
    <div v-else-if="kind === 'char'" class="char-tray">
      <button
        v-for="p in packTiles"
        :key="p.id"
        class="chr"
        :class="{ on: p.id === settings.pack }"
        :title="p.label"
        @click.stop="pickPack(p)"
      >
        <span class="chr-pack" :style="p.style" />
        <span class="chr-name">{{ p.short }}</span>
      </button>
      <button class="chr chr-add" title="打开形象工坊" @click.stop="openImport">
        <span class="chr-plus">＋</span>
        <span class="chr-name">导入</span>
      </button>
    </div>

    <!-- 工作目录（空间）→ 会话：两级选择，选中会话直接打开追问 -->
    <div v-else-if="kind === 'space'" class="space-list">
      <div class="sp-head">
        <button v-if="spaceLevel === 'convs'" type="button" class="sp-back" title="返回目录" @click.stop="backToSpaces">‹</button>
        <span class="sp-title">{{ spaceLevel === 'spaces' ? '工作目录' : pickedSpace?.name }}</span>
        <span v-if="spaceLevel === 'convs'" class="sp-sub">选择会话</span>
      </div>
      <div class="sp-body">
        <template v-if="spaceLevel === 'spaces'">
          <button
            v-for="s in spaces"
            :key="s.id"
            type="button"
            class="sp-item"
            :class="{ on: s.id === spaceId }"
            @click.stop="pickSpace(s)"
          >
            <span class="sp-dot" />
            <span class="sp-name">{{ s.name }}</span>
            <span v-if="s.id === spaceId" class="sp-cur">当前</span>
          </button>
          <div v-if="!spaces.length" class="sp-empty">还没有工作空间</div>
        </template>
        <template v-else>
          <button
            v-for="c in spaceConvsOf"
            :key="c.id"
            type="button"
            class="sp-item sp-conv"
            @click.stop="openConv(c.id)"
          >
            <span class="sp-name">{{ c.title }}</span>
            <span class="sp-open">打开</span>
          </button>
          <div v-if="!spaceConvsOf.length" class="sp-empty">这个目录下还没有会话</div>
        </template>
      </div>
    </div>

    <!-- 快问输入条：输入框在上，工作目录选择在下面单独一行 -->
    <template v-else-if="kind === 'ask'">
      <div class="ask">
        <div class="ask-agent-wrap">
        <button class="ask-agent" :title="agentName" @click.stop="toggleAgent">{{ agentName }}</button>
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

      <!-- 输入框下方：工作目录 → 会话。三态：不绑定 / 只绑目录 / 绑目录+会话 -->
      <div class="ask-dir-row">
        <div class="ask-dir-wrap">
          <button
            class="ask-dir"
            :class="{ unbound: !askTarget.spaceId }"
            :title="askTargetLabel"
            @click.stop="toggleDir"
          >
            <span class="ask-dir-ic" v-html="ICONS.space"></span>
            <span class="ask-dir-label">{{ askTargetLabel }}</span>
          </button>
          <div v-if="dirOpen" class="dir-pop">
            <div class="dir-head">
              <button v-if="dirLevel === 'convs'" type="button" class="dir-back" @click.stop="dirBack">‹</button>
              <span class="dir-title">{{ dirLevel === 'spaces' ? '工作目录' : pickedDir?.name }}</span>
              <span v-if="dirLevel === 'convs'" class="dir-sub">选择会话</span>
            </div>
            <div class="dir-list">
              <template v-if="dirLevel === 'spaces'">
                <button
                  type="button"
                  class="dir-item dir-item-2l"
                  :class="{ on: !askTarget.spaceId }"
                  @click.stop="unbindAll"
                >
                  <span class="dir-item-main">不绑定目录</span>
                  <span class="dir-item-sub">跟随主窗当前目录</span>
                </button>
                <button
                  v-for="s in spaces"
                  :key="s.id"
                  type="button"
                  class="dir-item"
                  :class="{ on: s.id === askTarget.spaceId }"
                  @click.stop="openDir(s)"
                >{{ s.name }}</button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="dir-item dir-item-2l"
                  :class="{ on: askTarget.spaceId === pickedDir?.id && !askTarget.convId }"
                  @click.stop="bindSpaceOnly"
                >
                  <span class="dir-item-main">不绑定会话</span>
                  <span class="dir-item-sub">在该目录下新建会话</span>
                </button>
                <button
                  v-for="c in dirConvs"
                  :key="c.id"
                  type="button"
                  class="dir-item conf"
                  :class="{ on: askTarget.convId === c.id }"
                  @click.stop="pickAskConv(c)"
                >{{ c.title }}</button>
                <div v-if="!dirConvs.length" class="dir-empty">该目录下还没有会话</div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </template>

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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  PET_DEFAULTS,
  PET_SLOT_DEFS,
  type PetActivity,
  type PetSettings,
  type PetState,
} from '../stores/pet'
import { PET_PACKS, PET_PACK_URLS } from '../components/pet/pet-assets'
import { loadUserPacks, userPacks } from '../components/pet/user-packs'
import '../components/pet/pet-popups.css'

const route = useRoute()
const kind = String(route.params.kind || '')

const settings = ref<PetSettings>({ ...PET_DEFAULTS })
// 弹层独立进程：主进程没推过设置时（刚启动）先用 localStorage 里同一份，否则托盘会把当前形象标错
try {
  const raw = localStorage.getItem('yz:pet:settings')
  if (raw) settings.value = { ...PET_DEFAULTS, ...JSON.parse(raw) }
} catch {
  /* 坏数据回落默认值 */
}
const state = ref<PetState>('idle')
const activity = ref<PetActivity | null>(null)
interface PetTaskRow {
  id: string
  title: string
  status: string
  agent?: string
  startedAt?: number
  endedAt?: number
  planDone?: number
  planTotal?: number
  question?: string
}
const tasks = ref<PetTaskRow[]>([])
const agents = ref<Array<{ id: string; name: string }>>([])
const agentId = ref('')
/** 工作目录/空间：来自主窗 pet:sync 的 spaces + spaceId */
const spaces = ref<Array<{ id: string; name: string }>>([])
const spaceId = ref('')

const askText = ref('')
const askInputEl = ref<HTMLInputElement | null>(null)
const agentOpen = ref(false)
const agentQuery = ref('')

const api = () => (window as any).electronAPI?.pet
const close = () => api()?.closePopup?.(kind)

/* ===== 换形象托盘 ===== */
interface PackTile {
  id: string
  label: string
  short: string
  aspect: number
  style: Record<string, string>
}
/** 缩略图 36px：按帧宽缩放整张图集，只露第一帧（与原型 char-tray 同算法） */
function tileThumb(fw: number, fh: number, cols: number, rows: number, url: string) {
  const sc = 36 / Math.max(1, fw)
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${(fw * cols * sc).toFixed(1)}px ${(fh * rows * sc).toFixed(1)}px`,
    backgroundPosition: '0 0',
    width: (fw * sc).toFixed(1) + 'px',
    height: (fh * sc).toFixed(1) + 'px',
  }
}
const packTiles = computed<PackTile[]>(() => {
  const builtin = PET_PACKS.filter((p) => !!PET_PACK_URLS[p.id]).map((p) => ({
    id: p.id,
    label: p.label,
    short: p.label.replace(/（.*?）|\(.*?\)/g, ''),
    aspect: 192 / 208,
    style: tileThumb(192, 208, 8, 9, PET_PACK_URLS[p.id]),
  }))
  const mine = Object.values(userPacks).map((e) => {
    const m = e.manifest
    return {
      id: m.id,
      label: m.label,
      short: m.label,
      aspect: m.frameWidth / m.frameHeight,
      style: tileThumb(m.frameWidth, m.frameHeight, m.cols || m.frames || 1, m.rows || 1, e.url),
    }
  })
  return [...builtin, ...mine]
})
function pickPack(p: PackTile) {
  api()?.action?.({ type: 'set-pack', packId: p.id, aspect: p.aspect })
  close()
}
function openImport() {
  api()?.action?.({ type: 'open-settings' })
  close()
}
/** 工作目录（空间）→ 会话：两级 */
const spaceConvs = ref<Array<{ id: string; title: string; spaceId: string }>>([])
const spaceLevel = ref<'spaces' | 'convs'>('spaces')
const pickedSpace = ref<{ id: string; name: string } | null>(null)
const spaceConvsOf = computed(() => spaceConvs.value.filter((c) => c.spaceId === pickedSpace.value?.id))
/**
 * 快问条的投递目标，三态：
 *   spaceId ''            → 不绑定目录（跟随主窗当前目录，新建会话）
 *   spaceId 有值、convId '' → 只绑目录（在该目录下新建会话）
 *   spaceId + convId      → 绑到那个会话里追问
 * 选择只记在这里，**发送时才让主窗切目录/选会话** —— 浏览目录不该有副作用。
 */
const ASK_TARGET_KEY = 'yz:pet:ask-target'
const askTarget = ref<{ spaceId: string; convId: string }>({ spaceId: '', convId: '' })
try {
  const raw = localStorage.getItem(ASK_TARGET_KEY)
  if (raw) {
    const v = JSON.parse(raw)
    if (v && typeof v === 'object') {
      askTarget.value = { spaceId: String(v.spaceId || ''), convId: String(v.convId || '') }
    }
  }
} catch {
  /* 坏数据按「不绑定」处理 */
}
function persistAskTarget() {
  try {
    localStorage.setItem(ASK_TARGET_KEY, JSON.stringify(askTarget.value))
  } catch {
    /* 存储不可用：只影响下次打开弹层时的恢复 */
  }
}
function setAskTarget(spaceId: string, convId = '') {
  askTarget.value = { spaceId, convId }
  persistAskTarget()
  dirOpen.value = false
}
/** 主窗推来的目录/会话可能已被删：清掉失效的那一层，保留还能用的绑定 */
function sanitizeAskTarget() {
  const t = askTarget.value
  if (!t.spaceId) return
  if (!spaces.value.some((s) => s.id === t.spaceId)) {
    askTarget.value = { spaceId: '', convId: '' }
    persistAskTarget()
    return
  }
  if (t.convId && !spaceConvs.value.some((c) => c.id === t.convId)) {
    askTarget.value = { spaceId: t.spaceId, convId: '' }
    persistAskTarget()
  }
}
const askTargetLabel = computed(() => {
  const t = askTarget.value
  if (!t.spaceId) return '不绑定目录'
  const sn = spaces.value.find((s) => s.id === t.spaceId)?.name || '目录'
  if (!t.convId) return sn
  const cn = spaceConvs.value.find((c) => c.id === t.convId)?.title || '会话'
  return sn + ' › ' + cn
})
const dirOpen = ref(false)
const dirLevel = ref<'spaces' | 'convs'>('spaces')
const pickedDir = ref<{ id: string; name: string } | null>(null)
const dirConvs = computed(() => spaceConvs.value.filter((c) => c.spaceId === pickedDir.value?.id))
function toggleDir() {
  dirOpen.value = !dirOpen.value
  if (dirOpen.value) {
    dirLevel.value = 'spaces'
    pickedDir.value = null
    agentOpen.value = false
  }
}
function openDir(s: { id: string; name: string }) {
  pickedDir.value = s
  dirLevel.value = 'convs'
}
function dirBack() {
  dirLevel.value = 'spaces'
  pickedDir.value = null
}
function unbindAll() {
  setAskTarget('')
}
function bindSpaceOnly() {
  if (pickedDir.value) setAskTarget(pickedDir.value.id)
}
function pickAskConv(c: { id: string; title: string; spaceId?: string }) {
  setAskTarget(pickedDir.value?.id || c.spaceId || '', c.id)
}
// 快问条窗口是固定的 380×340（上方留白给下拉）：这里不是"改窗口大小"，
// 而是告诉主进程「下拉展开了」——展开时整窗可点，收起时只有底部输入条可点。
watch([agentOpen, dirOpen], ([a, d]) => api()?.resizePopup?.(kind, 380, a || d ? 320 : 84))
/** 选目录：切过去并进入该目录的会话列表 */
function pickSpace(s: { id: string; name: string }) {
  pickedSpace.value = s
  spaceLevel.value = 'convs'
  api()?.action?.({ type: 'space', spaceId: s.id })
}
function backToSpaces() {
  spaceLevel.value = 'spaces'
  pickedSpace.value = null
}

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
  space: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>',
}
const RADIUS = 92
const SLOT_SIZE = 42
const slotKeys = computed(() => (Array.isArray(settings.value.slots) ? settings.value.slots : []))
/** 一屏最多摆 6 个；槽位更多时用滚轮转动 offset */
const VISIBLE_SLOTS = 7
const slotOffset = ref(0)
const visibleSlots = computed(() => {
  const keys = slotKeys.value
  if (keys.length <= VISIBLE_SLOTS) return keys
  return Array.from({ length: VISIBLE_SLOTS }, (_, i) => keys[(slotOffset.value + i) % keys.length])
})
function onWheel(e: WheelEvent) {
  const n = slotKeys.value.length
  if (n <= VISIBLE_SLOTS) return
  const dir = e.deltaY > 0 ? 1 : -1
  slotOffset.value = (slotOffset.value + dir + n) % n
}
const labelOf = (k: string) => PET_SLOT_DEFS[k] || '—'
const iconOf = (k: string) => ICONS[k] || ''
function slotStyle(i: number, n = visibleSlots.value.length) {
  const start = 168
  const end = 12
  const deg = start - ((start - end) * i) / Math.max(1, n - 1)
  const a = (deg * Math.PI) / 180
  const x = Math.cos(a) * RADIUS
  const y = Math.sin(a) * RADIUS
  return { left: x - SLOT_SIZE / 2 + 'px', top: -y - SLOT_SIZE / 2 + 'px', animationDelay: i * 30 + 'ms' }
}

function onSlot(k: string) {
  if (k === 'panel') { openPopup('panel'); close(); return }
  if (k === 'play') { openPopup('play'); close(); return }
  if (k === 'hide') { api()?.close?.(); close(); return }
  if (k === 'space') {
    openPopup('space')
    close()
    return
  }
  if (k === 'pack') {
    // 换形象：弹出形象托盘（内置 + 我的导入 + 工坊入口）
    openPopup('char')
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

/* ===== 任务面板（对齐原型 .pet-panel：分区 / 进度条 / 行内快答） ===== */
const SECTIONS = [
  { key: 'need', label: '需要处理', match: (t: PetTaskRow) => t.status === 'needs-input' || t.status === 'error' },
  { key: 'run', label: '进行中', match: (t: PetTaskRow) => t.status === 'running' || t.status === 'paused' },
  { key: 'done', label: '刚完成', match: (t: PetTaskRow) => t.status === 'completed' },
]
/** 分区顺序固定，空分区由模板跳过 */
const sections = computed(() =>
  SECTIONS.map((s) => ({ key: s.key, label: s.label, rows: tasks.value.filter(s.match) }))
)
const runningCount = computed(
  () => tasks.value.filter((t) => t.status === 'running' || t.status === 'paused').length
)
const needCount = computed(
  () => tasks.value.filter((t) => t.status === 'needs-input' || t.status === 'error').length
)
const muted = computed(() => settings.value.notifyMode === 'off')

/** 耗时靠本地 1 秒 tick 走：弹层是独立进程，主窗只在快照变化时推数据，不能每秒发 IPC */
const nowTick = ref(Date.now())
let tickTimer = 0
function fmtElapsed(sec: number) {
  const s = Math.max(0, sec | 0)
  const m = (s / 60) | 0
  return m > 0 ? `${m} 分 ${s % 60} 秒` : `${s} 秒`
}
function metaOf(t: PetTaskRow) {
  const parts: string[] = []
  if (t.agent) parts.push(t.agent)
  const started = Number(t.startedAt) || 0
  const ended = Number(t.endedAt) || 0
  if (started) parts.push('已用 ' + fmtElapsed(((ended || nowTick.value) - started) / 1000))
  const total = Number(t.planTotal) || 0
  if (total > 0) parts.push(`步骤 ${Number(t.planDone) || 0}/${total}`)
  return parts.join(' · ')
}
function planPct(t: PetTaskRow) {
  const total = Number(t.planTotal) || 0
  return total ? Math.round(((Number(t.planDone) || 0) / total) * 100) : 0
}
/** 每行一个快答草稿；回车/发送走 answer 动作，由主窗代答该会话的反问卡 */
const answers = ref<Record<string, string>>({})
function sendAnswer(convId: string) {
  const text = String(answers.value[convId] || '').trim() || '继续'
  api()?.action?.({ type: 'answer', convId, text })
  delete answers.value[convId]
}
function toggleMute() {
  api()?.action?.({ type: 'toggle-mute' })
}
function openAllTasks() {
  api()?.action?.({ type: 'open-all-tasks' })
  close()
}
function act(type: string, convId: string) {
  api()?.action?.({ type, convId })
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
/** 智能体下拉与目录菜单互斥：同时只开一个，不然两块菜单会叠在一起 */
function toggleAgent() {
  agentOpen.value = !agentOpen.value
  if (agentOpen.value) {
    dirOpen.value = false
    agentQuery.value = ''
  }
}
function submitAsk() {
  const v = askText.value.trim()
  if (!v) return
  const t = askTarget.value
  // 绑了会话就发进那个会话；否则带目录（可能为空 = 不绑定）在主窗新建会话
  api()?.action?.({
    type: 'ask',
    text: v,
    agentId: agentId.value,
    convId: t.convId || '',
    spaceId: t.convId ? '' : t.spaceId || '',
  })
  askText.value = ''
  close()
}

/* ===== 订阅宠物状态（主进程广播） ===== */
let offState: (() => void) | undefined
let offSettings: (() => void) | undefined
onMounted(() => {
  document.documentElement.classList.add('pet-window-mode')
  document.body.classList.add('pet-window-mode')
  // 形象托盘要用用户导入的形象（本窗口是独立进程，注册表要自己同步一次）
  if (kind === 'char') void loadUserPacks()
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
    if (Array.isArray(payload.spaces)) spaces.value = payload.spaces
    if (Array.isArray(payload.spaceConvs)) spaceConvs.value = payload.spaceConvs
    // 目录/会话可能被删：快问条绑定跟着失效的话就地降级（会话没了 → 退回只绑目录）
    if (kind === 'ask') sanitizeAskTarget()
    if (payload.spaceId) spaceId.value = payload.spaceId
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
  // 面板的「已用 X 分 Y 秒」自己走秒，不依赖主窗每秒推数据（跨进程 IPC 有成本）
  if (kind === 'panel') {
    tickTimer = window.setInterval(() => {
      nowTick.value = Date.now()
    }, 1000)
  }

  // 用 document 捕获：真实按键从焦点元素冒泡上来，合成事件也覆盖得到
  document.addEventListener('keydown', onKey, true)

  // 画完第一帧再让主进程显示窗口：否则会先闪一个空白透明窗
  requestAnimationFrame(() => requestAnimationFrame(() => api()?.popupReady?.(kind)))
})
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
onBeforeUnmount(() => {
  window.clearInterval(tickTimer)
  offState?.()
  offSettings?.()
  document.removeEventListener('keydown', onKey, true)
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
/* .pop-win 必须保持 fixed + inset:0 撑满窗口；曾经给 radial 加了 position:relative，
 * 容器高度塌成 0，.radial 的 top:50% 变成 0，整个菜单画到窗口外（表现为“右键没反应”）。 */
/* 这些面板的 CSS 还是按“单个大宠物窗”写的绝对定位（bottom:140~188px）。
 * 现在是各自独立的小窗（窗口高度 = 面板高度 + 余量），照旧 bottom 会把内容顶到窗口外，
 * 统一改成在窗口内居中。 */
.kind-ask .ask,
.kind-play .bar,
.kind-panel .panel,
.kind-bubble .bubble {
  bottom: auto;
  top: 50%;
  transform: translate(-50%, -50%);
}
.kind-ask { align-items: flex-end; padding-bottom: 4px; }
/* 输入条固定在窗口下方，目录行紧贴它下沿（实测窗口 340 时相距 1px） */
.kind-ask .ask {
  top: auto;
  bottom: 24px;
  transform: translateX(-50%);
}
.kind-bubble { align-items: flex-end; }
.kind-play { align-items: flex-end; }
.kind-panel { align-items: flex-end; }
</style>
