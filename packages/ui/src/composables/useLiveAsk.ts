/**
 * 弹幕提问 → 智能体 → 回复上屏（2026-10-29）。
 *
 * 发送走服务端 `/api/live/ask`（起任务），回复靠轮询会话消息——
 * 与弹幕一样用轮询，不新增 WS 订阅：直播页不该为了一句回答去抢聊天的事件流。
 *
 * 串行处理：同一时刻只等一条回复。弹幕是突发流量，并发起一堆任务既贵又会互相打断。
 */
import { ref } from 'vue'
import { api } from '../api/client'

export interface UseLiveAskOptions {
  onReply: (text: string) => void
  intervalMs?: number
  timeoutMs?: number
}

export interface LastAssistant {
  id: string
  text: string
}

/** 从消息列表里取最后一条 assistant 的内容（纯函数，便于单测） */
export function lastAssistant(messages: unknown): LastAssistant | null {
  if (!Array.isArray(messages)) return null
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as Record<string, unknown>
    if (!m || m.role !== 'assistant') continue
    const text = typeof m.content === 'string' ? m.content.trim() : ''
    if (!text) continue
    return { id: String(m.id ?? i), text }
  }
  return null
}

export function useLiveAsk(opts: UseLiveAskOptions) {
  const busy = ref(false)
  const queue: string[] = []
  let convId = ''

  async function listMessages(id: string): Promise<unknown[]> {
    const r = await api.get<any>(`/conversations/${encodeURIComponent(id)}/messages?limit=20`)
    const d = (r as any)?.data ?? r
    if (Array.isArray(d)) return d
    if (Array.isArray(d?.data)) return d.data
    return []
  }

  async function waitReply(id: string, sinceId: string): Promise<string | null> {
    const deadline = Date.now() + (opts.timeoutMs ?? 45000)
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, opts.intervalMs ?? 1500))
      const last = lastAssistant(await listMessages(id))
      if (last && last.id !== sinceId) return last.text
    }
    return null
  }

  async function worker(): Promise<void> {
    busy.value = true
    while (queue.length) {
      const text = queue.shift() as string
      try {
        const before = lastAssistant(await listMessages(convId))?.id || ''
        const posted = await api.post<any>('/live/ask', { text, convId })
        const d = (posted as any)?.data ?? posted
        if (!d?.ok) continue
        const reply = await waitReply(convId, before)
        if (reply) opts.onReply(reply)
      } catch {
        // 单条失败不影响后面排队的问题
      }
    }
    busy.value = false
  }

  /** 入队；队列上限 3，超出丢最旧的一条（宁可漏答也不能积压到下一场） */
  function ask(text: string, id: string): void {
    const t = String(text || '').trim()
    if (!t || !id) return
    convId = id
    if (queue.length >= 3) queue.shift()
    queue.push(t)
    if (!busy.value) void worker()
  }

  return { busy, ask }
}
