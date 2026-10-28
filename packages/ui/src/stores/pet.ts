import { defineStore } from 'pinia'
import { ref } from 'vue'

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
  /** 整体缩放 */
  scale: number
  /** 半圆菜单槽位（可编辑，存命令 key） */
  slots: string[]
  /** 通知档位：all 全部 / input 只留"等你输入" / off 关闭 */
  notifyMode: 'all' | 'input' | 'off'
  /** 跟随的任务（空 = 自动跟最高优先级） */
  pinnedConvId: string
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

/** 默认 6 槽：逗一下 / 新建任务 / 任务面板 / 换形象 / 隐藏 / 设置 */
export const PET_SLOT_DEFAULTS = ['play', 'newTask', 'panel', 'pack', 'hide', 'settings']

export const PET_DEFAULTS: PetSettings = {
  enabled: false,
  renderer: '2d',
  pack: 'boba',
  scale: 1,
  slots: [...PET_SLOT_DEFAULTS],
  notifyMode: 'all',
  pinnedConvId: '',
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
        }
      }
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
      (window as any).electronAPI?.pet?.settings?.(settings.value)
    } catch {
      /* 非桌面端忽略 */
    }
  }

  return { settings, lastSync, init, update }
})
