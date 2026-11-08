// @vitest-environment jsdom
/**
 * Learning（学习模式工作区）真挂载测试。
 *
 * 为什么不能只测纯函数：SRS/关卡引擎有单测，但「四个 Tab 真的渲染、场景卡真的出卡、
 * 开始陪练真的带对智能体 id」是 Vue 运行时行为 —— 源码锚点证明不了。
 *
 * 白名单 mock（范式照 Settings.paneSync.mount.test.ts / PlatformDetail.mount.test.ts）：
 *   - ../api/client：按路径分发假数据（profile/scenes/...）
 *   - ../stores/chat：createConversation 收调用参数
 *   - vue-router：只用到 useRouter().push
 * LearnStage 的宠物 store 走真实现（pinia + jsdom localStorage），默认 2D 渲染器不碰 WebGL。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia } from 'pinia'
import Learning from './Learning.vue'

const push = vi.fn(async () => {})
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const createConversation = vi.fn(async () => 'c_test_1')
vi.mock('../stores/chat', () => ({
  useChatStore: () => ({ createConversation }),
}))

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(async (url: string) => {
      if (url.includes('/learning/profile')) return { data: { cefr: 'B1', goals: '日常口语', streakDays: 3 } }
      if (url.includes('/learning/scenes')) {
        return { data: [
          { id: 'sc_airport', title: '机场值机', scene: '值机柜台', roles: ['柜员', '旅客'], keyPhrases: ['a', 'b', 'c'], exitHint: '托运完成', cefr: 'A2' },
          { id: 'sc_hotel', title: '酒店入住', scene: '前台', roles: ['前台', '客人'], keyPhrases: ['a', 'b', 'c'], exitHint: '拿到房卡', cefr: 'A2' },
        ] }
      }
      if (url.includes('/learning/grammar')) return { data: [] }
      if (url.includes('/learning/readings')) return { data: [] }
      if (url.includes('/learning/errors')) return { data: [] }
      if (url.includes('/learning/books')) return { data: [] }
      if (url.includes('/tts-packs')) return { data: { items: [] } }
      return {}
    }),
    post: vi.fn(async () => ({})),
  },
}))

async function mountPage(): Promise<HTMLElement> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app: App = createApp(Learning)
  app.use(createPinia())
  app.mount(el)
  await nextTick()
  await nextTick()
  return el
}

beforeEach(() => {
  document.body.innerHTML = ''
  push.mockClear()
  createConversation.mockClear()
})

describe('Learning 工作区 · 挂载契约', () => {
  it('渲染标题、streak 火焰与四个 Tab', async () => {
    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-sub')?.textContent).toContain('🔥 连续 3 天'))
    expect(el.querySelector('h1')?.textContent).toContain('学习模式')
    const tabs = [...el.querySelectorAll('.lp-tab')].map((b) => b.textContent?.trim())
    expect(tabs).toEqual(['单词闯关', '场景卡', '语法微课', '范文阅读'])
    expect(el.querySelector('.lp-grid')).toBeTruthy() // 默认落在「单词闯关」
  })

  it('场景卡 Tab：点开真出卡，卡带标题与难度', async () => {
    const el = await mountPage()
    ;([...el.querySelectorAll('.lp-tab')] as HTMLElement[]).find((b) => b.textContent?.includes('场景卡'))!.click()
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-scene').length).toBe(2))
    expect(el.querySelector('.lp-scene-grid')?.textContent).toContain('机场值机')
    expect(el.querySelector('.lp-scene-grid')?.textContent).toContain('A2')
  })

  it('★ 开始陪练：带契约 id（a_builtin_learning_coach）创建会话并跳转', async () => {
    const el = await mountPage()
    const btn = [...el.querySelectorAll('.lp-coach')].find((b) => b.textContent?.includes('开始陪练')) as HTMLElement
    expect(btn).toBeTruthy()
    btn.click()
    await nextTick(); await nextTick()
    expect(createConversation).toHaveBeenCalledTimes(1)
    const [title, opts] = createConversation.mock.calls[0] as unknown as [string, { agentId?: string }]
    expect(title).toContain('英语陪练')
    expect(opts.agentId).toBe('a_builtin_learning_coach')
    expect(push).toHaveBeenCalledWith({ name: 'chat-detail', params: { convId: 'c_test_1' } })
  })
})
