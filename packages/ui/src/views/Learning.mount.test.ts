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
const loadMessages = vi.fn(async () => {})
const sendMessage = vi.fn(async () => {})
const stopChat = vi.fn()
const isConvStreaming = vi.fn(() => false)
/** 陪练消息仓：顶层共享对象（组件 setup 捕获的是这个引用），用例可注入英文回复再断言气泡 */
const messagesByConv: Record<string, Array<{ id?: string; role: string; content?: string }>> = {}
vi.mock('../stores/chat', () => ({
  useChatStore: () => ({
    createConversation, loadMessages, sendMessage, stop: stopChat, isConvStreaming,
    conversations: [], messagesByConv,
  }),
}))
const ensurePlatforms = vi.fn(async () => {})
const ensureModels = vi.fn(async () => {})
/** 陪练发送要选模型：给一个可用平台/模型，否则 resolveCoachModel 返回 null 会走错误提示分支 */
vi.mock('../stores/platform', () => ({
  usePlatformStore: () => ({
    models: [{ id: 'm_test', platformId: 'p_test', name: 'test-model' }],
    platforms: [{ id: 'p_test', name: 'test-platform' }],
    ensurePlatforms, ensureModels,
  }),
}))

/** 默认 api.get 分发（vi.hoisted：vi.mock factory 会提升到顶层声明之前，直接引用 const 会 TDZ 崩）。
 *  每个用例 beforeEach 恢复它，防止某个用例的 mockImplementation 泄漏到后面。 */
const { defaultGet } = vi.hoisted(() => ({
  defaultGet: async (url: string) => {
    if (url.includes('/learning/profile')) return { data: { cefr: 'B1', goals: '日常口语', streakDays: 3 } }
    if (url.includes('/learning/courses')) {
      return {
        data: [{ stage: '大学', courses: [
          { id: 'course_cet4', name: '大学英语四级', stage: '大学', bookId: 'wb_cet4_sample', bookName: '大学英语四级', wordCount: 2607, levelCount: 131, clearedLevels: 0, totalLevels: 131, dueCount: 0, progressPct: 0 },
        ] }],
      }
    }
    if (url.includes('/learning/scenes')) {
      return { data: [
        {
          id: 'sc_cet4_course', courseId: 'course_cet4', courseName: '大学英语四级', stage: '大学',
          title: '选课咨询', theme: '校园事务', scene: '学生想换一门通识课', setting: '教务处窗口',
          roles: ['教务老师', '大一学生'], missions: ['说明原因', '确认学分', '问清候补规则'],
          keyPhrases: ['I would like to switch...', 'Are the credits transferable?', 'Could I join the waiting list?', 'What happens next?'],
          exitHint: '确认换课条件', cefr: 'B1', level: '热身', minutes: 10, tags: ['选课', '校园'],
          guide: {
            coachEn: 'Good morning. Which course would you like to change?',
            coachZh: '早上好。你想换哪门课？',
            userEn: 'I would like to switch from Art History to Psychology.',
            userPhonetic: '/aɪ wʊd laɪk tə swɪtʃ/',
            userZh: '我想从艺术史换到心理学。',
          },
        },
        {
          id: 'sc_cet4_parttime', courseId: 'course_cet4', courseName: '大学英语四级', stage: '大学',
          title: '兼职面试', theme: '求职入门', scene: '校园咖啡店招周末兼职', setting: '咖啡店角落',
          roles: ['店长', '大学生'], missions: ['说明时间', '介绍能力', '回应高峰协作'],
          keyPhrases: ['I am available on...', 'I have experience in...', 'When it gets busy...', 'I am willing to learn.'],
          exitHint: '确认排班', cefr: 'B1', level: '挑战', minutes: 12, tags: ['面试', '兼职'],
          guide: {
            coachEn: 'When are you available to work?',
            coachZh: '你什么时候可以工作？',
            userEn: 'I am available on Saturday afternoons.',
            userPhonetic: '/aɪ æm əˈveɪləbəl ɑːn ˈsætərdeɪ/',
            userZh: '我周六下午有空。',
          },
        },
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
  loadMessages.mockClear()
  sendMessage.mockClear()
  stopChat.mockClear()
  ensurePlatforms.mockClear()
  ensureModels.mockClear()
  // 消息仓清空但保留对象引用（组件 setup 已捕获该引用）
  for (const k of Object.keys(messagesByConv)) delete messagesByConv[k]
  // 恢复默认分发：前一用例的 mockImplementation 不泄漏（jsdom 用例间共享同一个 vi.fn 实例）
  const { api } = await import('../api/client')
  vi.mocked(api.get).mockImplementation(defaultGet)
  vi.mocked(api.post).mockReset()
  vi.mocked(api.post).mockImplementation(async () => ({ data: null }))
})

describe('Learning 工作区 · 挂载契约', () => {
  it('渲染标题、streak 火焰与七个 Tab（含陪练对话与历年真题）', async () => {
    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-sub')?.textContent).toContain('🔥 连续 3 天'))
    expect(el.querySelector('h1')?.textContent).toContain('学习模式')
    const tabs = [...el.querySelectorAll('.lp-tab')].map((b) => b.textContent?.trim())
    expect(tabs).toEqual(['单词闯关', '陪练对话', '词汇表', '场景卡', '语法微课', '范文阅读', '历年真题'])
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
    // 圆点导航 2 个；点击第 2 个圆点 → 第 2 题（确认答案前不允许直接跳过）
    expect(el.querySelectorAll('.lp-dot').length).toBe(2)
    expect(el.querySelector('.lp-focus-nav')?.textContent).toContain('确认答案')
    ;(el.querySelectorAll('.lp-dot')[1] as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.lp-focus')?.textContent).toContain('第 2 题')
    // ★ 拼写题必须给中文释义（没有释义用户不知道要拼哪个词）
    expect(el.querySelector('.lp-focus-word')?.textContent).toContain('薪金，薪水')
    // 三栏骨架仍在
    expect(el.querySelector('.lp-grid')).toBeTruthy()
  })

  it('★ 单词逐题反馈：确认后显示对错、正确答案、解析与实时分数', async () => {
    const { api } = await import('../api/client')
    const getMock = vi.mocked(api.get)
    const postMock = vi.mocked(api.post)
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/learning/courses')) return {
        data: [{ stage: '大学', courses: [
          { id: 'cet4', name: '大学英语四级', stage: '大学', bookId: 'wb_cet4_sample', bookName: '大学英语四级', wordCount: 2607, levelCount: 131, clearedLevels: 0, totalLevels: 131, dueCount: 0, progressPct: 0 },
        ] }],
      }
      if (url.includes('/drill')) return {
        data: { questions: [
          { qid: 'q1', kind: 'choice', wordId: 'cancel', prompt: 'cancel', phonetic: "/'kænsl/", options: ['取消，撤销', '众多的'] },
          { qid: 'q2', kind: 'choice', wordId: 'numerous', prompt: 'numerous', options: ['众多的', '取消，撤销'] },
        ] },
      }
      if (url.includes('/levels')) return {
        data: [{ levelNo: 1, wordCount: 20, stars: 0, passed: false, unlocked: true, dueCount: 0 }],
      }
      return { data: null }
    })
    postMock.mockImplementation(async (url: string) => {
      if (url.includes('/answer/check')) return {
        data: { correct: false, word: 'cancel', expected: '取消，撤销', gloss: '取消，撤销', explanation: 'cancel 的意思是「取消，撤销」。' },
      }
      return { data: null }
    })

    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-course')).toBeTruthy())
    ;(el.querySelector('.lp-course') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-level')).toBeTruthy())
    ;(el.querySelector('.lp-level') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-opt')).toBeTruthy())
    ;([...el.querySelectorAll('.lp-opt')] as HTMLElement[]).find((b) => b.textContent?.includes('众多的'))!.click()
    await nextTick()
    const checkBtn = ([...el.querySelectorAll('button')] as HTMLElement[]).find((b) => b.textContent?.includes('确认答案'))
    expect(checkBtn).toBeTruthy()
    checkBtn!.click()
    await vi.waitFor(() => expect(el.querySelector('.lp-answer-feedback')).toBeTruthy())
    const feedback = el.querySelector('.lp-answer-feedback')!
    expect(feedback.textContent).toContain('还不对')
    expect(el.querySelector('.lp-score-live')?.textContent).toContain('0 / 100')
    expect(el.querySelector('.lp-opt.picked.wrong')).toBeTruthy()
    // ★ 用户要求：答错不能直接喂答案；先给查看按钮，点击后才展开正确释义和解析
    expect(feedback.textContent).not.toContain('取消，撤销')
    expect(feedback.textContent).not.toContain('cancel 的意思')
    expect(el.querySelector('.lp-opt.correct')).toBeFalsy()
    const reveal = ([...feedback.querySelectorAll('button')] as HTMLElement[]).find((b) => b.textContent?.includes('查看正确答案'))!
    expect(reveal).toBeTruthy()
    reveal.click()
    await nextTick()
    expect(feedback.textContent).toContain('取消，撤销')
    expect(feedback.textContent).toContain('cancel 的意思')
    expect(el.querySelector('.lp-opt.correct')).toBeTruthy()
  })

  it('★ 历年真题：筛选考研/高考，进入试卷并显示交卷得分与逐题解析', async () => {
    const { api } = await import('../api/client')
    const getMock = vi.mocked(api.get)
    const postMock = vi.mocked(api.post)
    const papers = [
      { id: 'exam_kaoyan_2024', title: '2024 考研英语（一）· 阅读精练', examType: '考研', year: 2024, region: '全国统考', section: '阅读理解', difficulty: '中等偏难', durationMinutes: 18, tags: ['慢阅读'], questionCount: 5 },
      { id: 'exam_gaokao_2024', title: '2024 高考英语 · 阅读精练', examType: '高考', year: 2024, region: '全国卷', section: '阅读理解', difficulty: '中等', durationMinutes: 12, tags: ['校园生活'], questionCount: 5 },
    ]
    getMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/learning/exams')) return { data: papers }
      if (url.includes('/learning/exams/exam_kaoyan_2024')) return {
        data: {
          ...papers[0],
          passage: 'For years, speed has been treated as a virtue in online reading.',
          questions: [
            { id: 'q1', stem: 'What is the main idea?', options: ['Slow down.', 'Read less.', 'Avoid screens.', 'Share more.'] },
            { id: 'q2', stem: 'What helps careful reading?', options: ['Annotation.', 'Speed.', 'Noise.', 'Skimming only.'] },
          ],
        },
      }
      return defaultGet(url)
    })
    postMock.mockImplementation(async (url: string) => {
      if (url.includes('/learning/exams/exam_kaoyan_2024/submit')) return {
        data: {
          paperId: 'exam_kaoyan_2024', title: papers[0].title, correct: 1, total: 2, score: 50,
          details: [
            { questionId: 'q1', stem: 'What is the main idea?', picked: 0, answer: 0, correct: true, explanation: '首段强调慢读。' },
            { questionId: 'q2', stem: 'What helps careful reading?', picked: 1, answer: 0, correct: false, explanation: 'annotation 能帮助精读。' },
          ],
        },
      }
      return { data: null }
    })

    const el = await mountPage()
    const examTab = ([...el.querySelectorAll('.lp-tab')] as HTMLElement[]).find((b) => b.textContent?.includes('历年真题'))!
    examTab.click()
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-exam-card').length).toBe(2))
    expect(el.querySelector('.lp-exam-card')?.textContent).toContain('考研')
    expect(el.textContent).toContain('高考')

    ;([...el.querySelectorAll('.lp-exam-card button')] as HTMLElement[])[0].click()
    await vi.waitFor(() => expect(el.querySelector('.lp-exam-runner')).toBeTruthy())
    expect(el.querySelector('.lp-exam-passage')?.textContent).toContain('speed has been treated')
    ;([...el.querySelectorAll('.lp-exam-question .lp-opt')] as HTMLElement[])[0].click()
    const submit = ([...el.querySelectorAll('button')] as HTMLElement[]).find((b) => b.textContent?.trim() === '交卷判分')!
    submit.click()
    await vi.waitFor(() => expect(el.querySelector('.lp-exam-result')).toBeTruthy())
    expect(el.querySelector('.lp-exam-result')?.textContent).toContain('50')
    expect(el.querySelector('.lp-exam-result')?.textContent).toContain('annotation 能帮助精读')
  })

  it('★ 场景卡 Tab：按当前课程出卡，卡带任务/台本；进入对练留在学习模式并建学习会话', async () => {
    const el = await mountPage()
    ;([...el.querySelectorAll('.lp-tab')] as HTMLElement[]).find((b) => b.textContent?.includes('场景卡'))!.click()
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-scene').length).toBe(2))
    expect(el.querySelector('.lp-scene-grid')?.textContent).toContain('选课咨询')
    expect(el.querySelector('.lp-scene-grid')?.textContent).toContain('说明原因')
    expect(el.querySelector('.lp-scene-grid')?.textContent).toContain('简单')
    // 三栏骨架仍在（布局不跳）
    expect(el.querySelector('.lp-grid')).toBeTruthy()
    ;(el.querySelector('.lp-scene-action') as HTMLElement).click()
    await vi.waitFor(() => expect(createConversation).toHaveBeenCalled())
    const [title, opts] = createConversation.mock.calls[0] as unknown as [string, { agentId?: string; source?: string; sourceMeta?: { learningScene?: string } }]
    expect(title).toContain('选课咨询')
    expect(opts.agentId).toBe('a_builtin_learning_coach')
    expect(opts.source).toBe('learning')
    expect(opts.sourceMeta?.learningScene).toBe('sc_cet4_course')
    await vi.waitFor(() => expect(el.querySelector('.lp-live-scene')).toBeTruthy())
    expect(el.querySelector('.lp-live-scene')?.textContent).toContain('AI 先说')
    expect(el.querySelector('.lp-live-scene')?.textContent).toContain('轮到你')
    // ★ 用户实报「场景卡跳到办公模式」：场景任务绝不 push 聊天详情路由
    expect(push).not.toHaveBeenCalled()
  })

  it('★ 开始陪练：内嵌中栏直接调 AI（不跳路由），带契约 id 建会话并发起英文对话', async () => {
    const el = await mountPage()
    const btn = [...el.querySelectorAll('.lp-coach')].find((b) => b.textContent?.includes('开始陪练')) as HTMLElement
    expect(btn).toBeTruthy()
    btn.click()
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled())
    expect(createConversation).toHaveBeenCalledTimes(1)
    const [title, opts] = createConversation.mock.calls[0] as unknown as [string, { agentId?: string }]
    expect(title).toContain('英语陪练')
    expect(opts.agentId).toBe('a_builtin_learning_coach')
    // ★ 用户实报「怎么又跳到办公模式」：陪练必须留在学习模式内嵌对话，绝不 push 聊天路由
    expect(push).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(el.querySelector('.lp-coach-chat')).toBeTruthy())
    // ★ 独立学习页必须自己幂等预热平台/模型，否则首次发送必然落到「没有可用模型」提示
    expect(ensurePlatforms).toHaveBeenCalled()
    expect(ensureModels).toHaveBeenCalled()
    // 直接调用 AI 接口（chat.sendMessage），且首句是英文摸底开场白
    const args = sendMessage.mock.calls[0] as unknown as [string, unknown, unknown, unknown, unknown, string]
    expect(args[0]).toContain('practice English')
    expect(args[5]).toBe('c_test_1')
    expect(loadMessages).toHaveBeenCalledWith('c_test_1')
  })

  it('陪练对话 Tab：AI 英文回复渲染成气泡并带朗读按钮（不跳布局）', async () => {
    // 消息仓是普通对象：必须在 ensureCoachConv 写入 coachConvId（触发 computed 重算）之前注入
    messagesByConv['c_test_1'] = [
      { id: 'u1', role: 'user', content: 'Hi!' },
      { id: 'a1', role: 'assistant', content: 'Hello! Nice to meet you. How are you today?' },
    ]
    const el = await mountPage()
    ;([...el.querySelectorAll('.lp-tab')] as HTMLElement[]).find((b) => b.textContent?.includes('陪练对话'))!.click()
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-chat-bubble').length).toBe(2))
    expect(el.querySelector('.lp-coach-chat')).toBeTruthy()
    expect(el.querySelectorAll('.lp-chat-bubble').length).toBe(2)
    expect(el.querySelector('.lp-chat-text')?.textContent).toContain('Hi!')
    expect(el.textContent).toContain('How are you today?')
    // assistant 气泡带 🔊 朗读按钮；三栏骨架仍在
    expect(el.querySelectorAll('.lp-chat-row.assistant .lp-speak').length).toBe(1)
    expect(el.querySelector('.lp-grid')).toBeTruthy()
  })

  it('★ P2 金色复习节点：dueCount>0 的关卡挂 due 类与角标；跟读目标输入在右栏', async () => {
    const getMock = vi.mocked((await import('../api/client')).api.get)
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/learning/courses')) return {
        data: [{ stage: '大学', courses: [
          { id: 'cet4', name: '大学英语四级', stage: '大学', bookId: 'wb_cet4_sample', bookName: '大学英语四级', wordCount: 2607, levelCount: 131, clearedLevels: 0, totalLevels: 131, dueCount: 0, progressPct: 0 },
        ] }],
      }
      // 第 1 关 3 个词到期 → 金色节点；第 2 关 0 到期 → 普通节点
      if (url.includes('/levels')) return {
        data: [
          { levelNo: 1, wordCount: 20, stars: 3, passed: true, unlocked: true, dueCount: 3 },
          { levelNo: 2, wordCount: 20, stars: 0, passed: false, unlocked: true, dueCount: 0 },
        ],
      }
      if (url.includes('/drill')) return { data: { questions: [] } }
      if (url.includes('/learning/books/')) return { data: [] }
      return { data: null }
    })
    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-course')).toBeTruthy())
    ;(el.querySelector('.lp-course') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-level').length).toBe(2))
    const dueNode = el.querySelector('.lp-level.due') as HTMLElement
    expect(dueNode).toBeTruthy()
    expect(dueNode.textContent).toContain('🟡 3')
    // 无到期词的节点不挂 due（断言「存在 ≠ 生效」的反面：不是所有节点都金）
    expect(el.querySelectorAll('.lp-level.due').length).toBe(1)
    // P2 发音打分：跟读目标句输入框在右栏常驻
    expect(el.querySelector('.lp-col-right .lp-review input.lp-input')).toBeTruthy()
    // 三栏骨架仍在
    expect(el.querySelector('.lp-grid')).toBeTruthy()
  })
})
