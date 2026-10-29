// 弹幕提问 → 智能体（2026-10-29）。
//
// 走服务端起任务，而不是在渲染层调 useChat：
//   · useChat 的发送链路绑定在 Chat 视图上，直播页不该再造一个实例（会重复订阅）；
//   · 任务归属会话，服务端本来就持有唯一入口（与 IM 入站同一条 createTask）。
//
// 会话由调用方指定（直播页传当前会话）：不自作主张新建会话，
// 否则观众每问一句就多一个会话列表条目。
import { createTask } from './llm-task-manager.js'
import { getDefaultModel } from './services/im.js'
import { isLiveMode } from './live-mode.js'

/** 给模型的提问包装：观众的话不能原样当指令用，必须限定回答形态 */
export function buildAskPrompt(text: string): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  return `观众在直播间提问：${t}\n请用一两句话口语化回答，不要展开成步骤。`
}

export interface AskResult {
  ok: boolean
  taskId?: string
  error?: string
}

export function askLiveQuestion(input: { text?: unknown; convId?: unknown; userId?: unknown }): AskResult {
  if (!isLiveMode()) return { ok: false, error: '未开播' }

  const convId = String(input?.convId || '').trim()
  if (!convId) return { ok: false, error: '缺少会话：先在任务页打开一个会话' }

  const text = String(input?.text || '').replace(/\s+/g, ' ').trim()
  if (!text) return { ok: false, error: '空问题' }

  const userId = String(input?.userId || '')
  if (!userId) return { ok: false, error: '未识别用户' }

  const model = getDefaultModel(userId)
  if (!model) return { ok: false, error: '未配置默认模型' }

  try {
    const taskId = createTask({
      conversationId: convId,
      userId,
      platformId: model.platformId,
      modelId: model.modelId,
      userContent: buildAskPrompt(text),
      agentId: 'a_default_assistant',
      origin: 'live',
      offlinePolicy: 'skip',
    })
    return { ok: true, taskId }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) }
  }
}
