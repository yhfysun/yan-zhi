// @vitest-environment jsdom
/**
 * PetPopup 任务面板真挂载测试（对齐 docs/prototypes/pet-companion-proto.html .pet-panel）。
 *
 * 钉住三件契约：
 *   ① 分区标题按「需要处理 / 进行中 / 刚完成」排，空分区不出现
 *   ② 计划进度条宽度 = done/total；元信息带智能体名与耗时
 *   ③ 待答行内的快答框回车/发送会回传 answer 动作（答的是该会话，不是"当前会话"）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia } from 'pinia'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { kind: 'panel' } }) }))

import PetPopup from './PetPopup.vue'

type Cb = (p?: any) => void

function installPetApi() {
  const subs: Record<string, Cb[]> = {}
  const on = (ev: string) => (cb: Cb) => {
    ;(subs[ev] ||= []).push(cb)
    return () => {}
  }
  const api = {
    action: vi.fn(),
    closePopup: vi.fn(),
    openPopup: vi.fn(),
    requestSync: vi.fn(),
    resizePopup: vi.fn(),
    popupReady: vi.fn(),
    onState: on('state'),
    onSettings: on('settings'),
  }
  ;(window as any).electronAPI = { pet: api }
  return { api, emit: (ev: string, p?: any) => (subs[ev] || []).forEach((cb) => cb(p)) }
}

let api: ReturnType<typeof installPetApi>['api']
let emit: ReturnType<typeof installPetApi>['emit']
let app: App | null = null
let host: HTMLElement | null = null

function mountPanel() {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(PetPopup)
  app.use(createPinia())
  app.mount(host)
  return host
}

beforeEach(() => {
  ;({ api, emit } = installPetApi())
})

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
  delete (window as any).electronAPI
})

const TASKS = [
  {
    id: 't1',
    title: '整理三季度销售数据并生成对比报表',
    status: 'running',
    agent: '办公助手',
    startedAt: Date.now() - 412_000,
    planDone: 2,
    planTotal: 5,
  },
  {
    id: 't2',
    title: '抓取竞品价格并输出分析',
    status: 'needs-input',
    agent: 'pageAgent',
    question: '找到 3 个数据源（京东/淘宝/1688），全部抓取还是只抓前两个？',
  },
  { id: 't3', title: '生成新品封面图 3 张', status: 'completed', agent: '剪辑师' },
]

describe('PetPopup · 任务面板', () => {
  it('按原型分区，空分区不渲染，进度条宽度取 done/total', async () => {
    const el = mountPanel()
    emit('state', { tasks: TASKS })
    await nextTick()

    const secs = [...el.querySelectorAll('.p-sec')].map((n) => n.textContent?.trim())
    expect(secs).toEqual(['需要处理', '进行中', '刚完成'])

    const rows = [...el.querySelectorAll('.p-row')]
    const runRow = rows.find((r) => r.textContent?.includes('整理三季度'))!
    expect((runRow.querySelector('.p-plan i') as HTMLElement).style.width).toBe('40%')
    const meta = runRow.querySelector('.p-meta')!.textContent || ''
    expect(meta).toContain('办公助手')
    expect(meta).toContain('步骤 2/5')
    expect(meta).toContain('已用')
  })

  it('只有一类任务时只出那一个分区', async () => {
    const el = mountPanel()
    emit('state', { tasks: [TASKS[0]] })
    await nextTick()
    const secs = [...el.querySelectorAll('.p-sec')].map((n) => n.textContent?.trim())
    expect(secs).toEqual(['进行中'])
  })

  it('待答行的快答框回车 → 回传 answer 动作（带该行 convId）', async () => {
    const el = mountPanel()
    emit('state', { tasks: TASKS })
    await nextTick()

    expect(el.querySelector('.p-q-txt')!.textContent).toContain('全部抓取还是只抓前两个')

    const input = el.querySelector('.p-answer input') as HTMLInputElement
    input.value = '只抓前两个'
    input.dispatchEvent(new Event('input'))
    await nextTick()

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    expect(api.action).toHaveBeenCalledWith({ type: 'answer', convId: 't2', text: '只抓前两个' })
  })

  it('静音按钮回传 toggle-mute；完成行给「查看」而不是「重试」', async () => {
    const el = mountPanel()
    emit('state', { tasks: TASKS })
    await nextTick()

    ;(el.querySelector('.p-icon-btn') as HTMLButtonElement).click()
    await nextTick()
    expect(api.action).toHaveBeenCalledWith({ type: 'toggle-mute' })

    const labels = [...el.querySelectorAll('.p-act')].map((n) => n.textContent?.trim())
    expect(labels).toContain('查看')
    expect(labels).toContain('暂停')
  })

  it('没有任务时给空态提示', async () => {
    const el = mountPanel()
    emit('state', { tasks: [] })
    await nextTick()
    expect(el.querySelector('.p-empty')!.textContent).toContain('没有任务')
  })
})
