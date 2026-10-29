// 弹幕接入（2026-10-29）。
//
// 通道形态：服务端收（POST /api/live/danmaku）+ 前端轮询（GET ?since=）。
// 为什么先做 HTTP 而不是直连平台：抖音/视频号的开放接口要资质与鉴权，本机拿不到；
// 而「谁把评论送进来」是可以替换的——平台桥、playwright 抓后台、甚至手动模拟，
// 都往同一个入口投递，客户端不关心来源。
//
// 安全：弹幕是**不可信输入**。这里做三件事——
//   ① 清洗（去空白、截断）；
//   ② 注入检测（命中只展示，不触发任何行为）；
//   ③ 限流（同一来源每分钟上限）。
import { isLiveMode } from './live-mode.js'

export type DanmakuKind = 'question' | 'action' | 'ignore'

export interface DanmakuItem {
  seq: number
  id: string
  text: string
  from: string
  kind: DanmakuKind
  action?: string
  at: number
}

export const DANMAKU_MAX_LEN = 80
export const DANMAKU_BUFFER_MAX = 200
export const RATE_WINDOW_MS = 60_000
export const RATE_MAX_PER_WINDOW = 6

/** 动作词 → 宠物动作 key（与 Live 页的 LIVE_ACTIONS 对齐） */
export const ACTION_WORDS: Record<string, string> = {
  摸摸: 'pet',
  招手: 'wave',
  张望: 'look',
  转圈: 'spin',
  跳一跳: 'hop',
}

/** 命中即视为不可信：只展示，不驱动任何工具/动作 */
const INJECTION_PATTERNS: RegExp[] = [
  /忽略(之前|以上|前面|所有).{0,6}(指令|规则|设定|提示)/i,
  /ignore\s+(all\s+)?(previous|prior|above)/i,
  /system\s*prompt/i,
  /(你现在是|从现在开始你(是|要)|你的新身份)/,
  /(删除|删掉|清空|格式化).{0,6}(文件|目录|磁盘|数据库|硬盘)/,
  /(执行|运行).{0,4}(命令|脚本|cmd|powershell)/i,
]

const QUESTION_HINTS = /[?？]$|吗$|怎么|为什么|能不能|可不可以|如何|什么|哪[个里]|多少/

export function normalizeDanmaku(raw: string): string {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim()
  return text.length > DANMAKU_MAX_LEN ? text.slice(0, DANMAKU_MAX_LEN) : text
}

export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text))
}

/** 分类顺序有意义：先判不可信，再判动作，最后才判提问 */
export function classifyDanmaku(text: string): { kind: DanmakuKind; action?: string } {
  const t = normalizeDanmaku(text)
  if (!t) return { kind: 'ignore' }
  if (looksLikeInjection(t)) return { kind: 'ignore' }

  // 动作词：整句等于动作词，或短句里出现（避免"我摸摸它转圈了吗"这种误触）
  if (t.length <= 8) {
    for (const [word, action] of Object.entries(ACTION_WORDS)) {
      if (t === word || t.includes(word)) return { kind: 'action', action }
    }
  }

  if (QUESTION_HINTS.test(t)) return { kind: 'question' }
  return { kind: 'ignore' }
}

const buffer: DanmakuItem[] = []
let seq = 0
const hits = new Map<string, number[]>()

/** 滑动窗口限流：超限返回 false */
export function rateLimited(from: string, now = Date.now()): boolean {
  const key = String(from || 'anonymous')
  const list = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS)
  if (list.length >= RATE_MAX_PER_WINDOW) {
    hits.set(key, list)
    return true
  }
  list.push(now)
  hits.set(key, list)
  return false
}

export interface IngestResult {
  ok: boolean
  reason?: string
  item?: DanmakuItem
}

export function ingestDanmaku(input: { text?: unknown; from?: unknown }, now = Date.now()): IngestResult {
  if (!isLiveMode()) return { ok: false, reason: '未开播' }

  const text = normalizeDanmaku(String(input?.text ?? ''))
  if (!text) return { ok: false, reason: '空弹幕' }

  const from = String(input?.from ?? '').trim().slice(0, 40) || 'anonymous'
  if (rateLimited(from, now)) return { ok: false, reason: '发送太频繁' }

  const { kind, action } = classifyDanmaku(text)
  const item: DanmakuItem = { seq: ++seq, id: `dm-${seq}`, text, from, kind, action, at: now }
  buffer.push(item)
  if (buffer.length > DANMAKU_BUFFER_MAX) buffer.splice(0, buffer.length - DANMAKU_BUFFER_MAX)
  return { ok: true, item }
}

/** 拉取 seq 之后的新弹幕（轮询用） */
export function pullDanmaku(since = 0): { items: DanmakuItem[]; lastSeq: number } {
  const from = Number.isFinite(since) ? Math.max(0, Math.floor(since)) : 0
  const items = buffer.filter((d) => d.seq > from)
  return { items, lastSeq: seq }
}

/** 仅测试用 */
export function resetDanmakuBuffer(): void {
  buffer.length = 0
  seq = 0
  hits.clear()
}
