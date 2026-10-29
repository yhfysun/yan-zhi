import { defineStore } from 'pinia'
import { ref } from 'vue'
import petCatalog from '../assets/pet-packs/catalog.json'

export type PetRenderer = '2d' | '3d'
export type PetState = 'idle' | 'running' | 'needs-input' | 'paused' | 'ready' | 'error'

export interface PetSync {
  state: PetState
  title: string
  running: number
  waiting: number
  /** 当前正在做的事（活动气泡）；无进行中工具时为 null */
  activity?: PetActivity | null
}

/** 活动类别：决定气泡上的小图标与文案，与「六态」正交（六态说的是任务状态，这里说的是在干什么） */
export type PetActivityKind = 'think' | 'read' | 'search' | 'write' | 'act' | 'tool'

export interface PetActivity {
  kind: PetActivityKind
  /** 中文动作词：思考 / 阅读 / 搜索 / 写作 / 操作电脑 / 调用工具 */
  label: string
  /** 具体对象：文件名 / 网址域名 / 命令……可能为空 */
  target: string
}

export interface PetSettings {
  /** 宠物窗是否启用（用户总开关） */
  enabled: boolean
  /** 用哪套渲染器 */
  renderer: PetRenderer
  /** 2D 宠物包 id */
  pack: string
  /** 当前 2D 形象的帧宽高比（设置形象时同步，主进程按它算宠物窗宽度） */
  packAspect: number
  /** 整体缩放 */
  scale: number
  /** 半圆菜单槽位（可编辑，存命令 key） */
  slots: string[]
  /** 通知档位：all 全部 / input 只留"等你输入" / off 关闭 */
  notifyMode: 'all' | 'input' | 'off'
  /** 跟随的任务（空 = 自动跟最高优先级） */
  pinnedConvId: string
  /** 3D 形象来源：内置 CC0 样例 / 自定义 .vrm 文件 / 程序化素模 */
  vrmMode: 'builtin' | 'custom' | 'off'
  /** 自定义 VRM 的绝对路径（vrmMode==='custom' 时有效） */
  vrmPath: string
  /** 内置模型 id（vrmMode==='builtin' 时有效） */
  vrmBuiltin: string
  /** 待机时沿屏幕底边踱步 */
  walk: boolean
  /** 活动气泡（正在做什么 + 文件名） */
  bubble: boolean
}

/** 最近一次任务终态（短暂展示，过期自动回落） */
export type PetTerminal = 'ready' | 'error' | null

/**
 * 状态优先级（对齐 Codex，见方案 §2.3）：
 * needs-input > error > ready > paused > running > idle。
 * 纯函数，便于单测；terminal 由主窗的 onTaskFinished 钩子喂入（带过期时间）。
 */
export function derivePetState(s: {
  running: number
  paused: number
  waiting: number
  terminal?: PetTerminal
}): PetState {
  if (s.waiting > 0) return 'needs-input'
  if (s.terminal === 'error') return 'error'
  if (s.terminal === 'ready') return 'ready'
  if (s.running > 0) return 'running'
  if (s.paused > 0) return 'paused'
  return 'idle'
}

/**
 * 含「代玩中」的六态派生（**不新增第 7 态**）。
 * 代玩期间即使聊天任务列表为空，宠物也该显示 running（气泡「代玩中」）；
 * 优先级仍是 needs-input > error > ready > 代玩 paused/running > running > paused > idle。
 */
export function derivePetStateWithGame(s: {
  running: number
  paused: number
  waiting: number
  terminal?: PetTerminal
  gameActive?: boolean
  gamePaused?: boolean
}): PetState {
  if (s.gameActive && s.waiting === 0 && s.terminal !== 'error' && s.terminal !== 'ready') {
    return s.gamePaused ? 'paused' : 'running'
  }
  return derivePetState(s)
}

/**
 * 代玩结束该演哪个动作（纯函数，便于单测）：
 *   error → nap（趴一下表示失败）；aborted/cancelled → 不打扰；
 *   其余（完成 / 用户收回）→ hop，1s 后再 spin。
 */
export function petOutcome(status?: string | null): { key: string; follow?: string } {
  const s = String(status || '')
  if (s === 'error' || s === 'failed') return { key: 'nap' }
  if (s === 'aborted' || s === 'cancelled') return { key: '' }
  return { key: 'hop', follow: 'spin' }
}

/**
 * 四类「等你输入」按会话求并集（纯函数，便于单测）。
 * 入参既接受 ref 也接受已解包的 Record，兼容调用方两种写法。
 */
export function collectWaitingIds(byConvList: unknown[]): string[] {
  const ids = new Set<string>()
  for (const item of byConvList) {
    const byConv = (item as any)?.value ?? item
    if (!byConv || typeof byConv !== 'object') continue
    for (const [id, v] of Object.entries(byConv as Record<string, unknown>)) if (v) ids.add(id)
  }
  return [...ids]
}

const STORAGE_KEY = 'yz:pet:settings'
/** 一次性迁移标记：老设置补「工作目录」槽位用 */
const SPACE_SLOT_MIGRATED_KEY = 'yz:pet:space-slot'

/** 默认 6 槽：逗一下 / 新建任务 / 任务面板 / 换形象 / 隐藏 / 设置 */
export const PET_SLOT_DEFAULTS = ['play', 'newTask', 'panel', 'space', 'pack', 'hide', 'settings']

/**
 * 半圆菜单槽位注册表：唯一定义在 store 里 —— 设置页的槽位编辑器与宠物窗的菜单
 * 读同一份，避免两边各写一套导致"设置里能选、菜单上不认"。
 */
export const PET_SLOT_DEFS: Record<string, string> = {
  play: '逗一下',
  walk: '散个步',
  newTask: '新建任务',
  panel: '任务面板',
  pack: '换形象',
  space: '工作目录',
  renderer: '切 2D/3D',
  zoom: '放大',
  hide: '隐藏',
  settings: '设置',
}

/**
 * 宠物设置要跨进程发给宠物窗：**必须**转成普通对象。
 * Vue 的 reactive 是 Proxy，IPC 的结构化克隆会抛 "An object could not be cloned"；
 * 浅拷贝只解开顶层，`slots` 仍是响应式数组 —— 所以数组也得复制一份
 * （2026-10-28 实测：改 scale 能同步、改槽位不同步，就是漏了数组这一层）。
 */
export function plainPetSettings(s: PetSettings): PetSettings {
  return { ...s, slots: Array.isArray(s?.slots) ? [...s.slots] : [] }
}

/** 内置 VRM 清单（都是 VRoid 早期样例，CC0，可自由再分发；清单在 pet-packs/catalog.json） */
export const PET_BUILTIN_VRMS: Array<{ id: string; file: string; name: string }> = (
  (petCatalog as { vrms?: Array<{ id: string; label: string; file: string }> }).vrms || []
).map((v) => ({ id: v.id, file: v.file, name: v.label }))

/** 内置 VRM 在 public/ 下的相对路径（老代码兼容：默认第一只；空清单时为 ''） */
export const BUILTIN_VRM_FILE = PET_BUILTIN_VRMS.length ? 'vrm/' + PET_BUILTIN_VRMS[0].file : ''

export function builtinVrmOf(id: string | undefined | null) {
  return PET_BUILTIN_VRMS.find((x) => x.id === id) || PET_BUILTIN_VRMS[0] || null
}

/**
 * 把第 index 个槽位改成 key。key 已在别的槽位时两个槽位**互换**，
 * 而不是让菜单里出现两个同名项（用户想把「设置」从第 6 位换到第 1 位，
 * 原第 1 位应顶到第 6 位，而不是凭空多出一个）。
 */
export function setPetSlot(slots: string[], index: number, key: string): string[] {
  const next = Array.isArray(slots) ? [...slots] : [...PET_SLOT_DEFAULTS]
  if (index < 0 || index >= next.length || !key) return next
  const at = next.indexOf(key)
  if (at === index) return next
  if (at >= 0) next[at] = next[index]
  next[index] = key
  return next
}

export const PET_DEFAULTS: PetSettings = {
  enabled: false,
  renderer: '2d',
  pack: 'boba',
  packAspect: 192 / 208,
  scale: 1,
  slots: [...PET_SLOT_DEFAULTS],
  notifyMode: 'all',
  pinnedConvId: '',
  vrmMode: 'builtin',
  vrmPath: '',
  vrmBuiltin: 'shino',
  walk: true,
  bubble: true,
}

/* ===== 活动派生（活动气泡用） =====
 * 只读 chat store 的既有消息结构，不引入新订阅：扫最近一条 assistant 里
 * 还没有对应 tool 结果消息的工具调用，就是"此刻在干什么"。
 * 纯函数，便于单测。
 */

/** 工具名前缀 → 类别。顺序有意义：先精确的文件类，再宽泛的 browser/code 类 */
const TOOL_KINDS: Array<{ re: RegExp; kind: PetActivityKind; label: string }> = [
  { re: /^file_(read|list|to_markdown)$|^image_analyze$|^code_(outline|refs|graph|definition)$/, kind: 'read', label: '阅读' },
  { re: /^file_(write|edit|transcode)$|^apply_patch$|^data_save$/, kind: 'write', label: '写作' },
  { re: /^file_grep$|^(code_)?search$|^browser_search$|^web_(search|fetch)$|^http_request$/, kind: 'search', label: '搜索' },
  { re: /^browser_|^cmd_exec$|^python_exec$|^js_exec$|^py_save_exec$|^app_|^screen_record$|^dns_lookup$|^port_scan$|^lan_scan$/, kind: 'act', label: '操作电脑' },
]

export function classifyTool(name: string): { kind: PetActivityKind; label: string } {
  const n = String(name || '').toLowerCase()
  for (const t of TOOL_KINDS) if (t.re.test(n)) return { kind: t.kind, label: t.label }
  return { kind: 'tool', label: '调用工具' }
}

const TARGET_KEYS = ['path', 'file_path', 'filePath', 'dir', 'directory', 'url', 'query', 'pattern', 'command', 'cmd', 'q']

/** 路径取末段、网址取域名，其余原样截断——气泡只有一行，给最认得出的那个 */
export function shortTarget(v: string): string {
  let s = String(v || '').trim().replace(/\s+/g, ' ')
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s).host || s
    } catch {
      /* 非法 URL 就原样 */
    }
  } else if (/[\\/]/.test(s)) {
    s = s.split(/[\\/]/).filter(Boolean).pop() || s
  }
  return s.length > 28 ? s.slice(0, 28) + '…' : s
}

export function toolTarget(tc: unknown): string {
  const anyTc = tc as any
  let args: any = anyTc?.function?.arguments ?? anyTc?.arguments
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      return ''
    }
  }
  if (!args || typeof args !== 'object') return ''
  for (const k of TARGET_KEYS) {
    const v = (args as any)[k]
    if (typeof v === 'string' && v.trim()) return shortTarget(v)
  }
  return ''
}

/** 最近一个未完成的工具调用 = 正在做的事；没有则 null（由调用方决定是否回落"思考中"） */
export function derivePetActivity(messages: unknown): PetActivity | null {
  if (!Array.isArray(messages) || !messages.length) return null
  const done = new Set<string>()
  for (const m of messages) {
    const row = m as any
    if (row && row.role === 'tool' && row.toolCallId) done.add(String(row.toolCallId))
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i] as any
    const calls = Array.isArray(row?.toolCalls) ? row.toolCalls : null
    if (!calls) continue
    for (let j = calls.length - 1; j >= 0; j--) {
      const tc = calls[j]
      const id = tc?.id
      if (id && done.has(String(id))) continue
      const name = String(tc?.function?.name || tc?.toolName || tc?.name || '')
      if (!name) continue
      const { kind, label } = classifyTool(name)
      return { kind, label, target: toolTarget(tc) }
    }
  }
  return null
}

/**
 * 宠物设置是「界面偏好」，沿用 yz: 前缀的 localStorage 约定（与侧栏折叠、代码页模式一致）。
 * 宠物窗与主窗口同源，因此两个窗口共享这份配置；主窗口改动后经 IPC 推给宠物窗即时生效。
 */
export const usePetStore = defineStore('pet', () => {
  const settings = ref<PetSettings>({ ...PET_DEFAULTS })
  const lastSync = ref<PetSync>({ state: 'idle', title: '', running: 0, waiting: 0 })

  function init() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        settings.value = { ...PET_DEFAULTS, ...parsed }
        // 槽位容错：空数组/非数组一律回落默认，避免菜单变成空的
        if (!Array.isArray(settings.value.slots) || !settings.value.slots.length) {
          settings.value.slots = [...PET_SLOT_DEFAULTS]
        } else if (!settings.value.slots.includes('space') && !localStorage.getItem(SPACE_SLOT_MIGRATED_KEY)) {
          // 2026-10-29 新增「工作目录」槽位：老设置补一次，之后用户可自行移除
          settings.value.slots = [...settings.value.slots, 'space']
        }
      }
      try { localStorage.setItem(SPACE_SLOT_MIGRATED_KEY, '1') } catch { /* 忽略 */ }
    } catch {
      /* 坏数据回落默认值 */
    }
  }

  function update(patch: Partial<PetSettings>) {
    settings.value = { ...settings.value, ...patch }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
    } catch {
      /* 存储不可用时仅本窗口生效 */
    }
    // 通知主进程转发给宠物窗（宠物窗是独立渲染进程，读不到本窗口的内存状态）
    try {
      ;(window as any).electronAPI?.pet?.settings?.(plainPetSettings(settings.value))
    } catch {
      /* 非桌面端忽略 */
    }
  }

  return { settings, lastSync, init, update }
})

/* ===== 重试：面板行内「重试」要拿回上一次的请求内容 ===== */

/** 会话里最后一条有正文的用户消息（重试 = 用同样的内容再问一次） */
export function lastUserText(messages: unknown): string {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as any
    if (!m || m.role !== 'user') continue
    const text = typeof m.content === 'string' ? m.content.trim() : ''
    if (text) return text
  }
  return ''
}

/* ===== 宠物记忆（memory 维度 pet）=====
 * 只存"和用户相处的统计"，不存对话内容：太少没意义，太多是隐私。
 * 统计口径：摸头 / 招手 / 跟随任务 各计一次，好感由加权和封顶 100。
 */

export type PetInteraction = 'pet' | 'wave' | 'follow'

export interface PetStats {
  pet: number
  wave: number
  follow: number
  /** 最近一次互动时间（ms） */
  lastAt: number
}

export function emptyPetStats(): PetStats {
  return { pet: 0, wave: 0, follow: 0, lastAt: 0 }
}

export function bumpPetStats(stats: PetStats | null | undefined, kind: PetInteraction, now = Date.now()): PetStats {
  const base = stats && typeof stats === 'object' ? stats : emptyPetStats()
  const next: PetStats = {
    pet: Number(base.pet) || 0,
    wave: Number(base.wave) || 0,
    follow: Number(base.follow) || 0,
    lastAt: now,
  }
  if (kind === 'pet') next.pet += 1
  else if (kind === 'wave') next.wave += 1
  else if (kind === 'follow') next.follow += 1
  return next
}

/** 好感 0..100：摸头最亲，招手次之，跟随任务算陪伴 */
export function affinityOf(stats: PetStats | null | undefined): number {
  if (!stats) return 0
  const raw = (Number(stats.pet) || 0) * 2 + (Number(stats.wave) || 0) * 1 + (Number(stats.follow) || 0)
  return Math.max(0, Math.min(100, raw))
}

/** 人类可读的记忆正文（写进 memory 表，记忆管理页也能看到） */
export function petMemoryContent(stats: PetStats): string {
  return `宠物伴星相处记录：摸头 ${stats.pet} 次、招手 ${stats.wave} 次、跟随任务 ${stats.follow} 次（好感 ${affinityOf(stats)}/100）`
}

/** 从 memory 行里恢复统计（坏数据一律当空） */
export function petStatsFromRows(rows: unknown): PetStats | null {
  if (!Array.isArray(rows) || !rows.length) return null
  for (const row of rows as any[]) {
    let meta: any = row?.metadata ?? row?.metadata_json
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta)
      } catch {
        meta = null
      }
    }
    const s = meta && meta.petStats
    if (s && typeof s === 'object') {
      return {
        pet: Number(s.pet) || 0,
        wave: Number(s.wave) || 0,
        follow: Number(s.follow) || 0,
        lastAt: Number(s.lastAt) || 0,
      }
    }
  }
  return null
}
