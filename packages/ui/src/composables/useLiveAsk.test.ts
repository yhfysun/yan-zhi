import { describe, expect, it } from 'vitest'
import { lastAssistant } from './useLiveAsk'

describe('lastAssistant', () => {
  it('取最后一条有内容的 assistant 消息', () => {
    const msgs = [
      { id: '1', role: 'user', content: '问题' },
      { id: '2', role: 'assistant', content: '回答一' },
      { id: '3', role: 'assistant', content: '回答二' },
    ]
    expect(lastAssistant(msgs)).toEqual({ id: '3', text: '回答二' })
  })

  it('跳过空的 assistant 占位消息（流式刚创建时 content 为空）', () => {
    const msgs = [
      { id: '1', role: 'assistant', content: '已有内容' },
      { id: '2', role: 'assistant', content: '   ' },
    ]
    expect(lastAssistant(msgs)).toEqual({ id: '1', text: '已有内容' })
  })

  it('没有 assistant 时返回 null', () => {
    expect(lastAssistant([{ id: '1', role: 'user', content: 'x' }])).toBeNull()
    expect(lastAssistant(null)).toBeNull()
    expect(lastAssistant({ data: [] })).toBeNull()
  })
})
