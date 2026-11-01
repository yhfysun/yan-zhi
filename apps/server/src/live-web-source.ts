// 直播间弹幕「网页抓取」源（2026-11-01）—— 抖音 / 快手。
//
// 为什么是 DOM 抓取而不是协议直连：两家都没有对个人开发者公开的弹幕 API
// （抖音开放平台的直播评论权限要企业资质单独申请；快手开放平台同样没有），
// 网页 wss 弹幕是 protobuf + 动态签名，逆向方案平台一改版就整体失效。
// DOM 抓取不碰协议：平台改版最多是文本形态变（解析兜底到整页文本），
// 代价是延迟 1~3 秒 —— 对"回弹幕"场景够用。
//
// 链路：浏览器桥（主进程端点，仅桌面版有）new_tab 打开直播间网页
//   → 定时 get_visible_text（先试弹幕区容器选择器，读不到就整页兜底）
//   → 按「昵称：内容」解析行 → ingestDanmaku。
//
// 为什么不用 run_script：桥对 run_script 有每页 12 次的连续熔断（script_loop，
// 2026-10-24 加的防 LLM 死循环闸），2.5s 一轮的轮询半分钟就会被拒；
// get_visible_text 是只读 action，不在熔断范围。
import { browserBridgeAvailable, callBrowserBridgeRaw } from './browser-bridge.js'
import { ingestDanmaku } from './live-danmaku.js'
import { createLogger } from './services/logger.js'

const logger = createLogger('live-web-source')

export type WebSourceKind = 'douyin' | 'kuaishou'

export interface WebSourceSnapshot {
  kind: WebSourceKind | null
  url: string
  sent: number
  startedAt: number | null
  lastError: string
}

interface WebSourceDef {
  kind: WebSourceKind
  label: string
  /** 直播间网页链接形态（用户粘贴的链接先过这道闸，防开进任意页面） */
  urlPattern: RegExp
  /** 弹幕区容器选择器候选（按序试，命中且有文本就用它，避免整页噪声） */
  chatSelectors: string[]
}

export const WEB_SOURCES: Record<WebSourceKind, WebSourceDef> = {
  douyin: {
    kind: 'douyin',
    label: '抖音直播间',
    urlPattern: /^https?:\/\/(live\.douyin\.com|v\.douyin\.com)\//i,
    chatSelectors: ['[data-e2e="chat-list"]', '.webcast-chatroom___list', '[class*="chatList"]'],
  },
  kuaishou: {
    kind: 'kuaishou',
    label: '快手直播间',
    urlPattern: /^https?:\/\/(live\.kuaishou\.com|v\.kuaishou\.com)\//i,
    chatSelectors: ['[class*="chat-list"]', '[class*="chatList"]', '.live-room-chat-list'],
  },
}

/** 桥会话 / 流键：直播抓取自占一条流，不与 agent 的页面互相踩（流锁按键隔离） */
const BRIDGE_CONV = 'live-danmaku'
const BRIDGE_FLOW = 'live-danmaku'

/** 弹幕行形态：「昵称：内容」或「昵称: 内容」（含 emoji 昵称） */
const LINE_RE = /^([^\s：:]{1,24})[：:]\s?(.{1,100})$/
/** 整页兜底时必然混入的 UI 文本，这些开头的行不是弹幕 */
const NOISE_RE =
  /^(说点什么|弹幕|人气|点赞|送礼|更多|直播|帮你问|小助手|在线|礼物|关注|粉丝|主播|回放|清晰度|分享|举报|客服|电商|购物|秒杀|福利|连麦|PK|排行榜|贵宾|欢迎)/

export function parseDanmakuLine(line: string): { from: string; text: string } | null {
  const s = String(line || '').trim()
  if (!s) return null
  const m = LINE_RE.exec(s)
  if (!m) return null
  const from = m[1].trim()
  const text = m[2].trim()
  if (!from || !text) return null
  if (NOISE_RE.test(from)) return null
  // 纯数字/单字符的"昵称"基本是页面上别的数字段（人气值等）被换行拆出来的
  if (/^\d+$/.test(from)) return null
  return { from, text }
}

/** 从可见文本里抽弹幕行（保序，供轮询逐条 ingest） */
export function parseDanmakuText(text: string): Array<{ from: string; text: string }> {
  const out: Array<{ from: string; text: string }> = []
  for (const raw of String(text || '').split('\n')) {
    const p = parseDanmakuLine(raw)
    if (p) out.push(p)
  }
  return out
}

// ── 运行态 ──

let pollTimer: ReturnType<typeof setInterval> | null = null
let tabId: string | null = null
let activeKind: WebSourceKind | null = null
let activeUrl = ''
let sentCount = 0
let startedAt: number | null = null
let lastError = ''
/** 连续传输失败计数：>= 4 自动停，避免对下线的桥无限空打 */
let failStreak = 0
/** 去重：key → 最近一次见到的时间（同屏滑动窗口里同一条会反复出现） */
const seen = new Map<string, number>()

function dedupeKey(item: { from: string; text: string }): string {
  return `${item.from}\u0001${item.text}`
}

function pruneSeen(): void {
  const cutoff = Date.now() - 120_000
  for (const [k, t] of seen) if (t < cutoff) seen.delete(k)
}

export function webSourceState(): WebSourceSnapshot {
  return {
    kind: activeKind,
    url: activeUrl,
    sent: sentCount,
    startedAt,
    lastError,
  }
}

/** 仅测试用 */
export function resetWebSource(): void {
  stopPolling()
  tabId = null
  activeKind = null
  activeUrl = ''
  sentCount = 0
  startedAt = null
  lastError = ''
  seen.clear()
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/** 停抓取并尽量关掉直播间标签页（关失败不影响状态复位 —— tab 可能已被用户手动关掉） */
export async function stopWebSource(): Promise<void> {
  stopPolling()
  const t = tabId
  tabId = null
  activeKind = null
  activeUrl = ''
  startedAt = null
  seen.clear()
  if (t) {
    try {
      await callBrowserBridgeRaw(BRIDGE_CONV, 'browser_close_tab', { tabId: t }, 8000, BRIDGE_FLOW)
    } catch { /* 标签页可能已关，忽略 */ }
  }
}

async function bridgeCall(toolName: string, args: Record<string, unknown>, timeoutMs: number) {
  return callBrowserBridgeRaw(BRIDGE_CONV, toolName, { ...args, ...(tabId ? { tabId } : {}) }, timeoutMs, BRIDGE_FLOW)
}

/** 一轮轮询：读弹幕文本 → 解析 → ingest 新条目 */
async function pollOnce(): Promise<void> {
  const def = WEB_SOURCES[activeKind as WebSourceKind]
  if (!def || !tabId) return
  let text = ''
  try {
    // 先试弹幕区容器（少噪声）；选择器失效（改版）就退整页文本，靠解析层过滤
    for (const sel of [...def.chatSelectors, '']) {
      const r = await bridgeCall('browser_get_visible_text', sel ? { selector: sel } : {}, 8000)
      if (r && r.error) continue
      const t = String(r?.text || '')
      if (t) { text = t; break }
    }
    failStreak = 0
  } catch (e: any) {
    failStreak += 1
    if (failStreak >= 4) {
      lastError = `浏览器桥连续失败（${e?.message || e}），抓取已停止`
      logger.warn(lastError)
      await stopWebSource()
      return
    }
    return
  }
  if (!text) return
  pruneSeen()
  const items = parseDanmakuText(text)
  for (const item of items) {
    const key = dedupeKey(item)
    if (seen.has(key)) continue
    seen.set(key, Date.now())
    const r = ingestDanmaku({ text: item.text, from: item.from })
    if (r.ok) sentCount += 1
  }
}

export interface StartWebSourceResult {
  ok: boolean
  error?: string
  snapshot?: WebSourceSnapshot
}

/**
 * 启动网页抓取源：开直播间标签页 + 起轮询。
 * 抓取独立于开播状态 —— ingestDanmaku 自身拒收未开播数据，这里不必重复判断。
 */
export async function startWebSource(kind: WebSourceKind, roomUrl: string): Promise<StartWebSourceResult> {
  const def = WEB_SOURCES[kind]
  if (!def) return { ok: false, error: `未知弹幕源：${kind}` }
  const url = String(roomUrl || '').trim()
  if (!def.urlPattern.test(url)) {
    return { ok: false, error: `请粘贴${def.label}的网页链接（如 ${kind === 'douyin' ? 'https://live.douyin.com/…' : 'https://live.kuaishou.com/u/…'}）` }
  }
  if (!browserBridgeAvailable()) {
    return { ok: false, error: '浏览器桥不可用：网页抓取需在桌面版应用内运行（主进程桥端点未就绪）' }
  }
  // 先收掉旧源（可能是另一平台的）再开新 tab
  await stopWebSource()
  let r: any
  try {
    r = await callBrowserBridgeRaw(BRIDGE_CONV, 'browser_new_tab', { url }, 45000, BRIDGE_FLOW)
  } catch (e: any) {
    return { ok: false, error: `打开直播间页面失败：${e?.message || e}` }
  }
  if (!r || r.error || !r.tabId) {
    return { ok: false, error: `打开直播间页面失败：${r?.error || '桥未返回 tabId'}` }
  }
  tabId = String(r.tabId)
  activeKind = kind
  activeUrl = url
  sentCount = 0
  startedAt = Date.now()
  lastError = ''
  failStreak = 0
  seen.clear()
  stopPolling()
  pollTimer = setInterval(() => { void pollOnce() }, 2500)
  ;(pollTimer as unknown as { unref?: () => void }).unref?.()
  logger.info(`弹幕抓取已启动：${def.label} ${url}`)
  return { ok: true, snapshot: webSourceState() }
}
