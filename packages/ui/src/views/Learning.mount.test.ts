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

/** 默认 api.get 分发（vi.hoisted：vi.mock factory 会提升到顶层声明之前，直接引用 const 会 TDZ 崩）。
 *  每个用例 beforeEach 恢复它，防止某个用例的 mockImplementation 泄漏到后面。 */
const { defaultGet } = vi.hoisted(() => ({
  defaultGet: async (url: string) => {
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
    return { data: null }
  },
}))

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(defaultGet),
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

beforeEach(async () => {
  document.body.innerHTML = ''
  push.mockClear()
  createConversation.mockClear()
  // 恢复默认分发：前一用例的 mockImplementation 不泄漏（jsdom 用例间共享同一个 vi.fn 实例）
  const { api } = await import('../api/client')
  vi.mocked(api.get).mockImplementation(defaultGet)
})

describe('Learning 工作区 · 挂载契约', () => {
  it('渲染标题、streak 火焰与五个 Tab（闯关/词汇表/场景/语法/阅读）', async () => {
    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-sub')?.textContent).toContain('🔥 连续 3 天'))
    expect(el.querySelector('h1')?.textContent).toContain('学习模式')
    const tabs = [...el.querySelectorAll('.lp-tab')].map((b) => b.textContent?.trim())
    expect(tabs).toEqual(['单词闯关', '词汇表', '场景卡', '语法微课', '范文阅读'])
    expect(el.querySelector('.lp-grid')).toBeTruthy() // 默认落在「单词闯关」
  })

  it('词汇表 Tab：未选课程时空态引导；mock 一本词书后点开真出词行（分页+搜索栏）', async () => {
    const getMock = vi.mocked((await import('../api/client')).api.get)
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/learning/courses')) return {
        data: [{ stage: '大学', courses: [
          { id: 'cet4', name: '大学英语四级', stage: '大学', bookId: 'wb_cet4_sample', bookName: '大学英语四级 · 全量', wordCount: 2607, levelCount: 131, clearedLevels: 0, totalLevels: 131, dueCount: 0, progressPct: 0 },
        ] }],
      }
      if (url.includes('/learning/levels')) return { data: [] }
      if (url.includes('/words?')) return {
        data: { total: 20841, page: 0, size: 50, words: [
          { word: 'cancel', phonetic: "/'kænsl/", gloss: '取消，撤销；删去', example: null },
          { word: 'numerous', phonetic: "/'numərəs/", gloss: '众多的', example: null },
        ] },
      }
      if (url.includes('/learning/books/')) return { data: [] }
      return { data: null }
    })
    const el = await mountPage()
    const wordsTab = ([...el.querySelectorAll('.lp-tab')] as HTMLElement[]).find((b) => b.textContent?.includes('词汇表'))!
    // 未选课程 → 空态引导
    wordsTab.click()
    await nextTick()
    expect(el.querySelector('.lp-empty')?.textContent).toContain('词汇表')
    // 选一门课程（点课程卡）→ 词汇表出词行
    const courseBtn = el.querySelector('.lp-course') as HTMLElement
    expect(courseBtn).toBeTruthy()
    courseBtn.click()
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-wt-row').length).toBe(2))
    expect(el.querySelector('.lp-wt-list')?.textContent).toContain('cancel')
    expect(el.querySelector('.lp-hint')?.textContent).toContain('20841')
    expect(el.querySelector('.lp-wt-search')).toBeTruthy()
    // 三栏骨架仍在（布局不跳）
    expect(el.querySelector('.lp-grid')).toBeTruthy()
  })

  it('闯关单题聚焦：点关卡后一次只渲染一题，进度条与圆点导航工作', async () => {
    const getMock = vi.mocked((await import('../api/client')).api.get)
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/learning/courses')) return {
        data: [{ stage: '大学', courses: [
          { id: 'cet4', name: '大学英语四级', stage: '大学', bookId: 'wb_cet4_sample', bookName: '大学英语四级 · 全量', wordCount: 2607, levelCount: 131, clearedLevels: 0, totalLevels: 131, dueCount: 0, progressPct: 0 },
        ] }],
      }
      if (url.includes('/drill')) return {
        data: { questions: [
          { qid: 'q1', kind: 'choice', wordId: 'cancel', prompt: 'cancel', phonetic: "/'kænsl/", options: ['取消', '众多的'] },
          { qid: 'q2', kind: 'spelling', wordId: 'salary', prompt: '薪金，薪水', hint: '6 个字母' },
        ] },
      }
      if (url.includes('/levels')) return {
        data: [{ levelNo: 1, wordCount: 20, stars: 0, passed: false, unlocked: true }],
      }
      if (url.includes('/words?')) return { data: { total: 0, page: 0, size: 50, words: [] } }
      if (url.includes('/learning/books/')) return { data: [] }
      return { data: null }
    })
    const el = await mountPage()
    // 选课程 → 点第 1 关（课程/关卡都是异步加载，必须 waitFor）
    await vi.waitFor(() => expect(el.querySelector('.lp-course')).toBeTruthy())
    ;(el.querySelector('.lp-course') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-level')).toBeTruthy())
    ;(el.querySelector('.lp-level') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-focus')).toBeTruthy())
    // 一次只渲染一题（不是 2 题平铺）
    expect(el.querySelectorAll('.lp-q').length).toBe(0)
    expect(el.querySelector('.lp-focus')?.textContent).toContain('cancel')
    expect(el.querySelector('.lp-focus')?.textContent).toContain('第 1 题')
    expect(el.querySelector('.lp-drill-count')?.textContent).toContain('0/2')
    // 圆点导航 2 个；点下一题 → 第 2 题
    expect(el.querySelectorAll('.lp-dot').length).toBe(2)
    ;([...el.querySelectorAll('.lp-focus-nav .lp-primary')] as HTMLElement[]).find((b) => b.textContent?.includes('下一题'))!.click()
    await nextTick()
    expect(el.querySelector('.lp-focus')?.textContent).toContain('第 2 题')
    // ★ 拼写题必须给中文释义（没有释义用户不知道要拼哪个词）
    expect(el.querySelector('.lp-focus-word')?.textContent).toContain('薪金，薪水')
    // 三栏骨架仍在
    expect(el.querySelector('.lp-grid')).toBeTruthy()
  })

  it('场景卡 Tab：点开真出卡，卡带标题与难度（中栏内渲染，不跳布局）', async () => {
    const el = await mountPage()
    ;([...el.querySelectorAll('.lp-tab')] as HTMLElement[]).find((b) => b.textContent?.includes('场景卡'))!.click()
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-scene').length).toBe(2))
    expect(el.querySelector('.lp-scene-list')?.textContent).toContain('机场值机')
    expect(el.querySelector('.lp-scene-list')?.textContent).toContain('A2')
    // 三栏骨架仍在（布局不跳）
    expect(el.querySelector('.lp-grid')).toBeTruthy()
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
