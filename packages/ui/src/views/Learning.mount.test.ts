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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia } from 'pinia'
import Learning from './Learning.vue'

async function chooseSubject(el: Element, label: string) {
  const trigger = el.querySelector('.subject-picker-trigger') as HTMLElement
  trigger.click()
  await vi.waitFor(() => {
    expect([...el.querySelectorAll('.subject-picker-option')].some((option) => option.textContent?.includes(label))).toBe(true)
  })
  const option = [...el.querySelectorAll('.subject-picker-option')]
    .find((item) => item.textContent?.includes(label)) as HTMLElement
  option.click()
  await nextTick()
}

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
    if (url.includes('/learning/path')) {
      return {
        data: [{
          id: 'sounds', title: '先会读', subtitle: '看到词能拆音', level: '零基础',
          steps: [{
            id: 'sound_short_vowels', kind: 'phonics', title: '五个短元音', goal: '分清短元音', minutes: 8,
            explanation: '先读单个音，再拼辅音；先听例词。',
            pattern: 'a /æ/ → cat · e /ɛ/ → bed · i /ɪ/ → sit · o /ɑ/ → hot · u /ʌ/ → cup',
            patternAudio: 'a, as in cat. e, as in bed. i, as in sit. o, as in hot. u, as in cup.',
            sounds: [
              { letter: 'a', ipa: '/æ/', word: 'cat', gloss: '猫' },
              { letter: 'e', ipa: '/ɛ/', word: 'bed', gloss: '床' },
              { letter: 'i', ipa: '/ɪ/', word: 'sit', gloss: '坐' },
              { letter: 'o', ipa: '/ɑ/', word: 'hot', gloss: '热的' },
              { letter: 'u', ipa: '/ʌ/', word: 'cup', gloss: '杯子' },
            ],
            tip: '慢读', examples: [{ en: 'A cat sat on a red mat.', zh: '一只猫坐在红垫子上。' }],
            task: '慢读三遍。',
            quickCheck: {
              question: 'Which set contains five short-vowel words?',
              options: ['cat · bed · sit · hot · cup', 'cake · see · bike · home · moon', 'car · bird · short · food · team'],
              answer: 0,
              explanation: '第一组覆盖五个短元音。',
            },
          }],
        }],
      }
    }
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
  // ★ withMediaAuthQuery / absoluteMediaSrc（useMediaPreview 真实现）会消费 API_BASE：
  //   mock 必须给绝对形态的基址（与真实 LOCAL_API_BASE 同口径），否则补全逻辑测不出。
  API_BASE: 'http://127.0.0.1:3001/api',
  LOCAL_API_BASE: 'http://127.0.0.1:3001/api',
  LOCAL_API_PORT: 3001,
  api: {
    get: vi.fn(defaultGet),
    post: vi.fn(async () => ({})),
  },
  // 直通版（测试不注入鉴权上下文）；真实现口径见 src/api/client.ts
  withMediaAuthQuery: (url: string) => url,
  mediaAuthQuery: () => '',
  buildRequestHeaders: () => ({}),
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
afterEach(() => vi.unstubAllGlobals())

describe('Learning 工作区 · 挂载契约', () => {
  it('页头收成科目下拉与状态行，不再渲染标题、宠物或开始陪练按钮', async () => {
    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-top-status')?.textContent).toContain('🔥 连续 3 天'))
    expect(el.querySelector('h1')).toBeFalsy()
    expect(el.querySelector('.lp-topbar')).toBeTruthy()
    expect(el.querySelector('.lp-subject-select select')).toBeFalsy()
    const subjectTrigger = el.querySelector('.subject-picker-trigger') as HTMLButtonElement
    expect(subjectTrigger.textContent).toContain('英语')
    subjectTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await nextTick()
    expect(subjectTrigger.getAttribute('aria-expanded')).toBe('true')
    expect(el.querySelector('.subject-picker-menu')).toBeTruthy()
    subjectTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(subjectTrigger.getAttribute('aria-expanded')).toBe('false')
    expect(el.querySelector('.subject-picker-menu')).toBeFalsy()
    expect(el.querySelector('.lp-coach')).toBeFalsy()
    const tabs = [...el.querySelectorAll('.lp-tab')].map((b) => b.textContent?.trim())
    expect(tabs).toEqual(['零基础主线', '单词闯关', '陪练对话', '词汇表', '场景卡', '语法微课', '范文阅读', '历年真题'])
    expect(el.querySelector('.lp-grid')).toBeTruthy() // 默认落在「零基础主线」
    await vi.waitFor(() => expect(el.querySelector('.lp-path')?.textContent).toContain('五个短元音'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-path-immersive')).toBeTruthy())
    expect(el.querySelector('.lp-path-paper')?.textContent).toContain('先读单个音，再拼辅音')
    expect(el.querySelector('.lp-topbar')?.hasAttribute('inert')).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
    ;(el.querySelector('.lp-path-back') as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.lp-path-immersive')).toBeFalsy()
    expect(el.querySelector('.lp-topbar')?.hasAttribute('inert')).toBe(false)
    expect(document.body.style.overflow).toBe('')
    expect(el.querySelector('.lp-header')).toBeFalsy()
    expect(el.querySelector('.lp-avatar-stage')).toBeFalsy()
  })

  it('★ 短元音：音标可展示，点击例词只朗读英文，不把斜杠和 IPA 交给 TTS', async () => {
    const requested: string[] = []
    const spokenByBrowser: string[] = []
    const localPlayed: string[] = []
    class FakeAudio {
      listeners: Record<string, Array<() => void>> = {}
      pause = vi.fn()
      play = vi.fn(async () => { setTimeout(() => this.listeners['ended']?.forEach((cb) => cb()), 5) })
      constructor(src: string) { localPlayed.push(src) }
      addEventListener(type: string, cb: () => void) { (this.listeners[type] ||= []).push(cb) }
    }
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn((utterance: { text: string }) => spokenByBrowser.push(utterance.text)),
    })
    const { api } = await import('../api/client')
    vi.mocked(api.post).mockImplementation(async (url: string, payload?: unknown) => {
      if (!url.includes('/learning/tts')) return { data: null }
      const text = String((payload as { text?: string } | undefined)?.text || '')
      requested.push(text)
      return { data: { url: `/audio/${requested.length}.wav`, engine: 'sapi', voice: 'Microsoft Zira Desktop' } }
    })

    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path')?.textContent).toContain('五个短元音'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-sound-card')).toBeTruthy())

    // 一次只显示当前音标
    expect(el.querySelector('.lp-sound-ipa')?.textContent).toContain('/æ/')
    // 点大音标：放随包本音，不发起 TTS
    ;(el.querySelector('.lp-sound-ipa') as HTMLElement).click()
    await vi.waitFor(() => expect(localPlayed.some((src) => decodeURIComponent(src).endsWith('sound_æ.mp3'))).toBe(true))
    expect(requested).toEqual([])
    // 点例词：只朗读英文单词，不把斜杠和 IPA 交给 TTS
    ;(el.querySelector('.lp-sound-word') as HTMLElement).click()
    await vi.waitFor(() => expect(requested).toEqual(['cat']))
    expect(requested.join(' ')).not.toMatch(/[\/æɛɪɑʌ]/)
    // 逐个学：下一个自动带读本音
    const next = el.querySelector('.lp-sound-next') as HTMLElement
    next.click()
    await vi.waitFor(() => expect(localPlayed.some((src) => decodeURIComponent(src).endsWith('sound_e.mp3'))).toBe(true))
    for (let i = 0; i < 3; i++) { next.click(); await nextTick() }
    expect(el.querySelector('.lp-sound-ipa')?.textContent).toContain('/ʌ/')
    // 学完最后一个 → 拼读演示：逐音素放本音，再连整词
    next.click()
    await vi.waitFor(() => expect(el.querySelector('.lp-blending')).toBeTruthy())
    expect(el.querySelectorAll('.lp-blend-part')).toHaveLength(5)
    ;(el.querySelector('.lp-path-pattern-blend .lp-path-listen') as HTMLElement).click()
    await vi.waitFor(() => expect(requested).toEqual(['cat', 'bed', 'sit', 'hot', 'cup']), { timeout: 15000 })
    expect(spokenByBrowser).toEqual([])
  })

  it('★ 零基础层：IPA 下沉为口型提示，拼读块渲染完整例词，人群轨道可切换', async () => {
    localStorage.removeItem('yz.learning.path.track.v1')
    class FakeAudio {
      listeners: Record<string, Array<() => void>> = {}
      pause = vi.fn()
      play = vi.fn(async () => { setTimeout(() => this.listeners['ended']?.forEach((cb) => cb()), 5) })
      constructor(_src: string) {}
      addEventListener(type: string, cb: () => void) { (this.listeners[type] ||= []).push(cb) }
    }
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), getVoices: vi.fn(() => []), speak: vi.fn() })
    const pathPayload = [{
      id: 'sounds', title: '先会读', subtitle: '看到词能拆音', level: '零基础',
      steps: [{
        id: 'sound_short_vowels', kind: 'phonics', title: 'a/e/i/o/u 的短音（归纳）', goal: '把短音和已学词对上', minutes: 8,
        explanation: '前三组学过这些词，本课对比听。',
        pattern: 'a /æ/ → cat · e /ɛ/ → bed · i /ɪ/ → sit · o /ɑ/ → hot · u /ʌ/ → cup',
        sounds: [
          { letter: 'a', ipa: '/æ/', word: 'cat', gloss: '猫', mouth: '嘴张到能塞两指，短促' },
          { letter: 'e', ipa: '/ɛ/', word: 'bed', gloss: '床', mouth: '嘴半开，齿间一指宽' },
          { letter: 'i', ipa: '/ɪ/', word: 'sit', gloss: '坐', mouth: '下巴放松半开' },
          { letter: 'o', ipa: '/ɑ/', word: 'hot', gloss: '热', mouth: '嘴自然张大' },
          { letter: 'u', ipa: '/ʌ/', word: 'cup', gloss: '杯子', mouth: '嘴自然半开' },
        ],
        ipaHidden: true,
        tip: '快问快答', examples: [{ en: 'cat · bed · sit · hot · cup', zh: '猫 · 床 · 坐 · 热 · 杯子' }],
        task: '慢读三遍。',
        quickCheck: { question: 'q', options: ['cat · bed · sit · hot · cup', 'x1', 'x2'], answer: 0, explanation: 'e' },
      }],
    }]
    const trackMetaPayload = [
      { id: 'zero', name: '零基础', audience: '从字母音开始', entryStepId: 'ssp_group1' },
      { id: 'junior', name: '初中', audience: '补音标', entryStepId: 'junior_ipa_map' },
      { id: 'senior', name: '高中', audience: '练易错音', entryStepId: 'senior_sound_fix' },
      { id: 'adult', name: '成人', audience: '速通音标', entryStepId: 'adult_ipa_crash' },
    ]
    const requestedUrls: string[] = []
    const { api } = await import('../api/client')
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      requestedUrls.push(url)
      if (url.includes('/learning/path/tracks')) return { data: trackMetaPayload }
      if (url.includes('/learning/path')) return { data: pathPayload }
      return await defaultGet(url)
    })

    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path-tracks')).toBeTruthy())
    // 4 个人群轨道，默认零基础；主线请求必须带 track 参数
    const trackButtons = [...el.querySelectorAll('.lp-path-tracks button')]
    expect(trackButtons.map((b) => b.textContent?.trim())).toEqual(['零基础', '初中', '高中', '成人'])
    await vi.waitFor(() => expect(requestedUrls.some((u) => u.includes('/learning/path?track=zero'))).toBe(true))
    // 零基础层：大卡片显示口型提示，不显示 IPA 符号
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-sound-card')).toBeTruthy())
    const ipaCard = el.querySelector('.lp-sound-ipa') as HTMLElement
    expect(ipaCard.textContent).toContain('嘴张到能塞两指')
    expect(ipaCard.textContent).not.toContain('/æ/')
    // 学完逐音进入拼读块：例词必须完整渲染（不许截成 ca/be/si/ho）
    const next = el.querySelector('.lp-sound-next') as HTMLElement
    for (let i = 0; i < 4; i++) { next.click(); await nextTick() }
    next.click()
    await vi.waitFor(() => expect(el.querySelector('.lp-blending')).toBeTruthy())
    const arrows = [...el.querySelectorAll('.lp-blend-arrow')].map((b) => b.textContent?.trim())
    expect(arrows).toEqual(['→ cat', '→ bed', '→ sit', '→ hot', '→ cup'])
    // 切换人群轨道：带新 track 参数重新拉主线，选择持久化
    ;(trackButtons[1] as HTMLElement).click()
    await vi.waitFor(() => expect(requestedUrls.some((u) => u.includes('/learning/path?track=junior'))).toBe(true))
    expect(localStorage.getItem('yz.learning.path.track.v1')).toBe('junior')
    localStorage.removeItem('yz.learning.path.track.v1')
  })

  it('★ 回译课：源句先可见，参考译文点「对照」才展开，「全部对照」一键切换', async () => {
    const { api } = await import('../api/client')
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.includes('/learning/path/tracks')) return { data: [] }
      if (url.includes('/learning/path')) {
        return { data: [{
          id: 'word-building', title: '会造词', subtitle: '词根词缀扩展词汇量', level: '入门',
          steps: [{
            id: 'translate_roots', kind: 'translate', method: '回译', title: '回译：用词根把中文翻成英语',
            goal: '先自己翻，再对照参考译文', minutes: 12, explanation: '回译是主动输出。',
            tip: '只抓选词与形式。', examples: [], task: '翻完再对照。',
            translate: [
              { zh: '这家公司出口机器。', en: 'This company exports machines.', note: 'ex- 向外 → exports；第三人称单数加 -s。' },
              { zh: '他尊重检查员。', en: 'He respects the inspector.', note: 'spect=看。' },
              { zh: '这份报告便于携带。', en: 'The report is portable.', note: '-able 表示能被……的。' },
            ],
            quickCheck: { question: '对照时优先查什么？', options: ['选词与动词形式', '高级词', '句子长度'], answer: 0, explanation: '先看选词与形式。' },
          }],
        }] }
      }
      return await defaultGet(url)
    })

    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path')?.textContent).toContain('回译：用词根把中文翻成英语'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await nextTick(); await nextTick()
    console.log('DBG immersive:', !!el.querySelector('.lp-path-immersive'))
    console.log('DBG paper:', el.querySelector('.lp-path-paper')?.textContent?.slice(0, 300))
    console.log('DBG body-html:', el.querySelector('.lp-path-paper-body')?.innerHTML.replace(/data-v-[a-f0-9]+=""/g, '').slice(0, 900))
    await vi.waitFor(() => expect(el.querySelector('.lp-translate')).toBeTruthy())
    // method 教法标签渲染
    expect(el.querySelector('.lp-path-paper-head')?.textContent).toContain('回译')
    const translate = el.querySelector('.lp-translate') as HTMLElement
    // 源句可见，参考译文默认收起
    expect(translate.textContent).toContain('这家公司出口机器。')
    expect(translate.textContent).not.toContain('This company exports machines.')
    // 点第一句对照 → 参考译文 + 差异提示出现；其余句仍收起
    ;(translate.querySelectorAll('.lp-translate-source button')[0] as HTMLElement).click()
    await nextTick()
    expect(translate.textContent).toContain('This company exports machines.')
    expect(translate.textContent).toContain('ex- 向外 → exports；第三人称单数加 -s。')
    expect(translate.textContent).not.toContain('He respects the inspector.')
    // 全部对照 → 三句全开；再点一次收起全部
    ;(translate.querySelector('.lp-translate header button') as HTMLElement).click()
    await nextTick()
    expect(translate.textContent).toContain('He respects the inspector.')
    expect(translate.textContent).toContain('The report is portable.')
    ;(translate.querySelector('.lp-translate header button') as HTMLElement).click()
    await nextTick()
    expect(translate.textContent).not.toContain('This company exports machines.')
  })

  it('★ 故事课「对照细读」：切换到范文阅读 Tab 并打开同一篇范文', async () => {
    const { api } = await import('../api/client')
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.includes('/learning/path/tracks')) return { data: [] }
      if (url.includes('/learning/path')) {
        return { data: [{
          id: 'story-input', title: '短篇故事', subtitle: '练复述', level: 'A2',
          steps: [{
            id: 'path_p_test', kind: 'story', readingPassageId: 'p_test', title: 'The Old Bridge',
            goal: '抓住情节', minutes: 16, explanation: '先找人物和事件。', pattern: 'c→p→t→e',
            tip: '一段一句。', task: '用四句复述。',
            examples: [{ en: 'The old bridge swayed in the wind.', zh: '旧桥在风中摇晃。' }],
            quickCheck: { question: 'Which title?', options: ['The Old Bridge', 'B', 'C'], answer: 0, explanation: '标题。' },
          }],
        }] }
      }
      if (url.includes('/learning/readings/p_test')) {
        return { data: { id: 'p_test', title: 'The Old Bridge', cefr: 'A2', topic: '日常', paras: [{ en: 'The old bridge swayed.', zh: '旧桥摇晃。' }] } }
      }
      if (url.includes('/learning/readings')) return { data: [{ id: 'p_test', title: 'The Old Bridge', cefr: 'A2', topic: '日常', paraCount: 1 }] }
      return await defaultGet(url)
    })

    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path')?.textContent).toContain('The Old Bridge'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    // 默认停在「理解」阶段，先下一步到「原文与理解」，对照细读入口在这里
    await vi.waitFor(() => expect(el.querySelector('.lp-path-immersive')).toBeTruthy())
    ;([...el.querySelectorAll('.lp-path-footer button')].find((b) => b.textContent?.includes('下一步')) as HTMLElement).click()
    await nextTick()
    await vi.waitFor(() => expect(el.querySelector('.lp-path-reading-link')).toBeTruthy())
    ;(el.querySelector('.lp-path-reading-link button') as HTMLElement).click()
    await vi.waitFor(() => {
      const active = [...el.querySelectorAll('.lp-tab')].find((b) => b.classList.contains('active'))
      expect(active?.textContent).toContain('范文阅读')
      expect(el.querySelector('.lp-reader')?.textContent).toContain('The Old Bridge')
    })
  })

  it('★ 朗读音频地址必须补成绝对地址（打包版 file:// 页面下相对地址解析成 file:///api/... 必挂）', async () => {
    const created: string[] = []
    class FakeAudio {
      pause = vi.fn()
      addEventListener = vi.fn()
      play = vi.fn(async () => {})
      constructor(src: string) { created.push(src) }
    }
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn(),
    })
    const { api } = await import('../api/client')
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url.includes('/learning/tts')) {
        return { data: { url: '/api/generated/audios/learning-en-1.wav', engine: 'sapi' } }
      }
      return { data: null }
    })

    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path')?.textContent).toContain('五个短元音'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-sound-card')).toBeTruthy())
    ;(el.querySelector('.lp-sound-word') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(created.length).toBeGreaterThanOrEqual(1))
    // 交给 new Audio 的每个地址都必须已是绝对地址（speechCache 命中旧值时同样要被补全）
    for (const src of created) {
      expect(src.startsWith('http://127.0.0.1:3001/')).toBe(true)
    }
  })

  it('★ 点音标放随包本音（/æ/ 这类符号 TTS 念不了），不发起后端 TTS 请求', async () => {
    const created: string[] = []
    class FakeAudio {
      pause = vi.fn()
      addEventListener = vi.fn()
      play = vi.fn(async () => {})
      constructor(src: string) { created.push(src) }
    }
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn(),
    })
    const { api } = await import('../api/client')
    const posts: string[] = []
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      posts.push(url)
      return { data: null }
    })

    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path')?.textContent).toContain('五个短元音'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-sound-card')).toBeTruthy())
    // 点音标字符（i 元素，@click.stop 阻止冒泡到例词朗读）
    ;(el.querySelector('.lp-sound-ipa') as HTMLElement).click()

    await vi.waitFor(() => expect(created.some((src) => decodeURIComponent(src).endsWith('/phonics-audio/sound_æ.mp3'))).toBe(true))
    // 本音播放是纯本地音频，绝不打后端合成接口
    expect(posts.filter((url) => url.includes('/learning/tts'))).toEqual([])
  })

  it('服务端英语音频不可用时只回退到 en-* 浏览器音色，绝不落到默认中文音色', async () => {
    const spoken: Array<{ text: string; lang: string; voice: string }> = []
    class FakeUtterance {
      text: string
      lang = ''
      rate = 1
      voice: { name: string } | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(text: string) { this.text = text }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: vi.fn(() => [
        { name: 'Microsoft Huihui', lang: 'zh-CN', default: true },
        { name: 'Microsoft Zira', lang: 'en-US', default: false },
      ]),
      speak: vi.fn((utterance: FakeUtterance) => {
        spoken.push({ text: utterance.text, lang: utterance.lang, voice: utterance.voice?.name || '' })
      }),
    })
    const { api } = await import('../api/client')
    vi.mocked(api.post).mockRejectedValue(new Error('offline'))

    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path')?.textContent).toContain('五个短元音'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-sound-card')).toBeTruthy())
    ;(el.querySelector('.lp-sound-word') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(spoken).toEqual([{ text: 'cat', lang: 'en-US', voice: 'Microsoft Zira' }]))
    expect(spoken[0].voice).not.toContain('Huihui')
  })

  it('没有英文系统音色且在线合成失败时，弹窗询问是否下载语音包并自动重试', async () => {
    const calls: string[] = []
    class FakeAudio {
      pause = vi.fn()
      addEventListener = vi.fn()
      constructor(_src: string) {}
      play = vi.fn(async () => {})
    }
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn(),
    })
    const { api } = await import('../api/client')
    let learningAttempts = 0
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      calls.push(url)
      if (url.includes('/learning/tts')) {
        learningAttempts += 1
        if (learningAttempts === 1) throw new Error('no english voice')
        return { data: { url: '/audio/retry.wav' } }
      }
      if (url.includes('/tts-packs/') && url.endsWith('/install')) return { data: { ok: true } }
      return { data: null }
    })
    const getMock = vi.mocked(api.get)
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/tts-packs/') && url.endsWith('/progress')) {
        return { data: { state: 'done', progress: 100, message: '安装完成' } }
      }
      return defaultGet(url)
    })

    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path')?.textContent).toContain('五个短元音'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-sound-card')).toBeTruthy())
    ;(el.querySelector('.lp-sound-word') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(el.querySelector('.lp-voice-modal')).toBeTruthy())
    expect(el.querySelector('.lp-voice-modal')?.textContent).toContain('需要下载英语语音包')
    ;(el.querySelector('.lp-voice-dialog-primary') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(calls.some((url) => url.includes('/tts-packs/vits-melo-tts-zh_en/install'))).toBe(true))
    await vi.waitFor(() => expect(learningAttempts).toBe(2), { timeout: 3000 })
  })

  it('语音包安装接口返回错误时保留弹窗并显示失败原因，不把错误响应当成功重试', async () => {
    const calls: string[] = []
    let learningAttempts = 0
    vi.stubGlobal('Audio', class {
      pause = vi.fn()
      addEventListener = vi.fn()
      play = vi.fn(async () => {})
    })
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn(),
    })
    const { api } = await import('../api/client')
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      calls.push(url)
      if (url.includes('/learning/tts')) {
        learningAttempts += 1
        return { error: 'no english voice', status: 409 }
      }
      if (url.includes('/tts-packs/') && url.endsWith('/install')) {
        return { error: '语音引擎安装失败：网络不可用', status: 400 }
      }
      return { data: null }
    })

    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path')?.textContent).toContain('五个短元音'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-sound-card')).toBeTruthy())
    ;(el.querySelector('.lp-sound-word') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(el.querySelector('.lp-voice-modal')).toBeTruthy())
    ;(el.querySelector('.lp-voice-dialog-primary') as HTMLButtonElement).click()

    await vi.waitFor(() => {
      expect(el.querySelector('.lp-voice-install-error')?.textContent).toContain('语音引擎安装失败：网络不可用')
    })
    expect(learningAttempts).toBe(1)
    expect(el.querySelector('.lp-voice-modal')).toBeTruthy()
    expect((el.querySelector('.lp-voice-dialog-primary') as HTMLButtonElement).disabled).toBe(false)
    expect(calls.filter((url) => url.endsWith('/install'))).toHaveLength(1)
  })

  it('语音包已经安装时朗读失败只显示错误，不再弹下载语音包提示', async () => {
    const calls: string[] = []
    vi.stubGlobal('Audio', class {
      pause = vi.fn()
      addEventListener = vi.fn()
      play = vi.fn(async () => {})
    })
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn(),
    })
    const { api } = await import('../api/client')
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      calls.push(url)
      if (url.includes('/learning/tts')) {
        return { error: '本地英语模型推理失败', status: 500 }
      }
      if (url.endsWith('/install')) return { data: { ok: true } }
      return { data: null }
    })
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/tts-packs') {
        return {
          data: {
            items: [{ id: 'vits-melo-tts-zh_en', installed: true }],
            engine: { available: true },
          },
        }
      }
      return defaultGet(url)
    })

    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path')?.textContent).toContain('五个短元音'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-sound-card')).toBeTruthy())
    ;(el.querySelector('.lp-sound-word') as HTMLButtonElement).click()

    await vi.waitFor(() => {
      expect(el.querySelector('.lp-voice-runtime-error')?.textContent).toContain('本地英语模型推理失败')
    })
    expect(el.querySelector('.lp-voice-modal')).toBeFalsy()
    expect(calls.some((url) => url.endsWith('/install'))).toBe(false)
  })

  it('用户在设置页下载完成后，朗读失败会重新检查安装状态而不是沿用旧缓存', async () => {
    let packChecks = 0
    let packInstalled = false
    vi.stubGlobal('Audio', class {
      pause = vi.fn()
      addEventListener = vi.fn()
      play = vi.fn(async () => {})
    })
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn(),
    })
    const { api } = await import('../api/client')
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url.includes('/learning/tts')) return { error: '朗读失败', status: 500 }
      return { data: null }
    })
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/tts-packs') {
        packChecks += 1
        return {
          data: {
            items: [{ id: 'vits-melo-tts-zh_en', installed: packInstalled }],
            engine: { available: true },
          },
        }
      }
      return defaultGet(url)
    })

    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path')?.textContent).toContain('五个短元音'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-sound-card')).toBeTruthy())
    ;(el.querySelector('.lp-sound-word') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(el.querySelector('.lp-voice-modal')).toBeTruthy())
    ;(el.querySelector('.lp-voice-modal > footer button') as HTMLButtonElement).click()
    packInstalled = true
    ;(el.querySelector('.lp-sound-word') as HTMLButtonElement).click()

    await vi.waitFor(() => {
      expect(el.querySelector('.lp-voice-runtime-error')?.textContent).toContain('朗读失败')
    })
    expect(packChecks).toBeGreaterThanOrEqual(2)
    expect(el.querySelector('.lp-voice-modal')).toBeFalsy()
  })

  it('语音包进度已经完成但安装请求未返回时，也能关闭弹窗并自动重试朗读', async () => {
    let learningAttempts = 0
    vi.stubGlobal('Audio', class {
      pause = vi.fn()
      addEventListener = vi.fn()
      play = vi.fn(async () => {})
    })
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn(),
    })
    const { api } = await import('../api/client')
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url.includes('/learning/tts')) {
        learningAttempts += 1
        if (learningAttempts === 1) return { error: 'no english voice', status: 409 }
        return { data: { url: '/audio/retry.wav' } }
      }
      if (url.endsWith('/install')) return new Promise(() => {})
      return { data: null }
    })
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.endsWith('/progress')) {
        return { data: { state: 'done', progress: 100, message: '安装完成' } }
      }
      return defaultGet(url)
    })

    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path')?.textContent).toContain('五个短元音'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-sound-card')).toBeTruthy())
    ;(el.querySelector('.lp-sound-word') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(el.querySelector('.lp-voice-modal')).toBeTruthy())
    ;(el.querySelector('.lp-voice-dialog-primary') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(learningAttempts).toBe(2), { timeout: 3000 })
    expect(el.querySelector('.lp-voice-modal')).toBeFalsy()
  })

  it('拼读课的练习与完成标准按声音训练组织，不套用“替换个人信息”模板', async () => {
    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path')?.textContent).toContain('五个短元音'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-path-immersive')).toBeTruthy())

    const practiceNav = [...el.querySelectorAll('.lp-path-immersive-rail button')]
      .find((button) => button.textContent?.includes('练习')) as HTMLButtonElement
    practiceNav.click()
    await nextTick()
    const practice = el.querySelector('.lp-path-practice-plan')?.textContent || ''
    expect(practice).toContain('遮住音标')
    expect(practice).toContain('拼读')
    expect(practice).not.toContain('替换成与你有关的信息')
    expect(el.querySelector('.lp-path-practice-action')?.textContent).toContain('去跟读巩固')

    const checkNav = [...el.querySelectorAll('.lp-path-immersive-rail button')]
      .find((button) => button.textContent?.includes('自测')) as HTMLButtonElement
    checkNav.click()
    await nextTick()
    expect(el.querySelector('.lp-path-choices')?.textContent).toContain('cat · bed · sit · hot · cup')
  })

  it('★ 英语主线：寓言课按理解/例句/练习/自测四步沉浸学习，完成后记录进度', async () => {
    const { api } = await import('../api/client')
    const getMock = vi.mocked(api.get)
    const lesson = {
      id: 'fable_tortoise',
      kind: 'fable',
      title: '寓言：The Tortoise and the Hare',
      goal: '读懂对比关系并解释“慢而稳”',
      minutes: 14,
      explanation: '寓言先看角色做了什么，再看结果和道理。',
      pattern: 'slow and steady wins the race',
      tip: '先说行为，再说结果。',
      examples: [{ en: 'The tortoise kept walking.', zh: '乌龟一直走。' }],
      wordFamily: [
        { word: 'import', gloss: '进口', note: 'im- 向内 + port' },
        { word: 'export', gloss: '出口', note: 'ex- 向外 + port' },
        { word: 'transport', gloss: '运输', note: 'trans- 跨越 + port' },
        { word: 'portable', gloss: '便携的', note: 'port + -able' },
        { word: 'report', gloss: '报告' },
        { word: 'support', gloss: '支持' },
        { word: 'porter', gloss: '搬运工' },
        { word: 'teleport', gloss: '瞬间传送' },
      ],
      task: '用三句话复述故事。',
      quickCheck: {
        question: 'Why did the tortoise win?',
        options: ['He ran faster.', 'He kept moving.', 'He took a shorter road.', 'He woke up earlier.'],
        answer: 1,
        explanation: '重点是持续行动，而不是速度。',
      },
    }
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/learning/path')) {
        return {
          data: [{
            id: 'fable-reading',
            title: '寓言精读',
            subtitle: '短故事里练推断',
            level: 'A2-B1',
            steps: [lesson],
          }],
        }
      }
      return defaultGet(url)
    })
    localStorage.removeItem('yz.learning.path.completed.v2')
    localStorage.removeItem('yz.learning.path.saved.v2')
    const el = await mountPage()
    await vi.waitFor(() => expect(el.querySelector('.lp-path-kind')?.textContent).toContain('寓言精读'))
    ;(el.querySelector('.lp-path-step-list button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-path-immersive')).toBeTruthy())
    expect(el.querySelector('.lp-path-immersive-rail')?.textContent).toContain('理解')
    expect(el.querySelector('.lp-path-immersive-rail')?.textContent).toContain('自测')
    expect(el.querySelector('.lp-path-explanation')?.textContent).toContain('角色做了什么')
    ;(el.querySelector('.lp-path-save') as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.lp-path-save')?.getAttribute('aria-pressed')).toBe('true')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(el.querySelector('.lp-path-examples')?.textContent).toContain('The tortoise kept walking.')
    expect(el.querySelectorAll('.lp-path-word-grid button').length).toBe(8)
    ;(el.querySelectorAll('.lp-path-footer button')[1] as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.lp-path-task')?.textContent).toContain('用三句话复述故事')
    ;(el.querySelectorAll('.lp-path-footer button')[1] as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.lp-path-choices')?.textContent).toContain('He kept moving.')
    ;(el.querySelectorAll('.lp-path-choices button')[1] as HTMLElement).click()
    await nextTick()
    expect((el.querySelector('.lp-path-check-action') as HTMLButtonElement).disabled).toBe(false)
    ;(el.querySelector('.lp-path-check-action') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-path-feedback')).toBeTruthy())
    expect(el.querySelector('.lp-path-feedback')?.textContent).toContain('理解正确')
    expect(el.querySelector('.lp-path-feedback')?.textContent).toContain('持续行动')
    ;(el.querySelectorAll('.lp-path-footer button')[1] as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.lp-path-immersive')).toBeFalsy()
    expect(JSON.parse(localStorage.getItem('yz.learning.path.completed.v2') || '[]')).toContain('fable_tortoise')
  })

  it('★ 语法微课：列表只负责选知识点，打开后进入全屏三步微课', async () => {
    const { api } = await import('../api/client')
    const getMock = vi.mocked(api.get)
    getMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/learning/grammar')) {
        return {
          data: [{ id: 'g_present_3rd', title: '第三人称单数 -s', cefr: 'A1', group: '时态', rule: 'he/she/it 后动词加 -s。' }],
        }
      }
      if (url.includes('/learning/grammar/g_present_3rd')) {
        return {
          data: {
            id: 'g_present_3rd',
            title: '第三人称单数 -s',
            cefr: 'A1',
            group: '时态',
            rule: 'he/she/it 后动词加 -s。',
            examples: [{ en: 'She likes coffee.', zh: '她喜欢咖啡。' }],
            pairs: [{ wrong: 'She like coffee.', right: 'She likes coffee.', why: '第三人称单数漏了 -s。' }],
          },
        }
      }
      return defaultGet(url)
    })
    const el = await mountPage()
    ;([...el.querySelectorAll('.lp-tab')] as HTMLElement[]).find((button) => button.textContent?.includes('语法微课'))!.click()
    await vi.waitFor(() => expect(el.querySelectorAll('.grammar-card').length).toBe(1))
    expect(el.querySelector('.lp-grammar-detail')).toBeFalsy()
    ;(el.querySelector('.grammar-card') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.grammar-focus')).toBeTruthy())
    expect(el.querySelector('.grammar-rule')?.textContent).toContain('he/she/it')
    expect(el.querySelector('.lp-topbar')?.hasAttribute('inert')).toBe(true)
    ;(el.querySelectorAll('.grammar-footer button')[1] as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.grammar-example')?.textContent).toContain('She likes coffee.')
    ;(el.querySelectorAll('.grammar-footer button')[1] as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.grammar-pair')?.textContent).toContain('She like coffee.')
    ;(el.querySelectorAll('.grammar-footer button')[1] as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.grammar-focus')).toBeFalsy()
    expect(document.body.style.overflow).toBe('')
  })

  it('左右栏支持拖拽宽度，并可分别收起和展开', async () => {
    const el = await mountPage()
    const grid = el.querySelector('.lp-grid') as HTMLElement
    const resizers = el.querySelectorAll('.lp-column-resizer')
    expect(resizers.length).toBe(2)
    resizers[0].dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 300, button: 0 }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350 }))
    window.dispatchEvent(new MouseEvent('pointerup'))
    await nextTick()
    expect(grid.getAttribute('style') || '').toContain('--lp-left-w: 350px')

    ;(el.querySelector('[aria-label="收起左侧栏"]') as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.lp-col-left')).toBeFalsy()
    ;(el.querySelector('[aria-label="展开左侧栏"]') as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.lp-col-left')).toBeTruthy()

    ;(el.querySelector('[aria-label="收起右侧栏"]') as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('[aria-label="展开右侧栏"]')).toBeTruthy()
    ;(el.querySelector('[aria-label="展开右侧栏"]') as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('[aria-label="收起右侧栏"]')).toBeTruthy()
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
    const spoken: string[] = []
    class FakeUtterance {
      text: string
      lang = ''
      rate = 1
      pitch = 1
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(text: string) { this.text = text }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn((utterance: FakeUtterance) => {
        spoken.push(utterance.text)
        utterance.onend?.()
      }),
    })
    const pronounce = el.querySelector('.lp-wt-pronounce') as HTMLButtonElement
    expect(pronounce.disabled).toBe(false)
    pronounce.click()
    await vi.waitFor(() => expect(spoken).toEqual(['cancel']))
    // 三栏骨架仍在（布局不跳）
    expect(el.querySelector('.lp-grid')).toBeTruthy()
  })

  it('范文阅读：按简单/中级/困难与主题筛选，右侧阅读器独立展开', async () => {
    const getMock = vi.mocked((await import('../api/client')).api.get)
    const readingRows = [
      { id: 'r1', title: 'A Bowl of Noodles', cefr: 'A1', topic: '日常生活', paraCount: 3 },
      { id: 'r2', title: 'The Lost Umbrella', cefr: 'A2', topic: '故事', paraCount: 3 },
      { id: 'r3', title: 'Working With People', cefr: 'B1', topic: '职场', paraCount: 3 },
      { id: 'r4', title: 'Technology and Patience', cefr: 'B2', topic: '观点', paraCount: 3 },
    ]
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/learning/readings/')) {
        const id = url.split('/').pop()
        const row = readingRows.find((r) => r.id === id)!
        return {
          data: {
            ...row,
            paras: [
              { en: 'This is a short English paragraph for the reading test.', zh: '这是一段用于阅读测试的英文。' },
              { en: 'The second paragraph gives one more useful detail.', zh: '第二段提供了另一个有用的细节。' },
              { en: 'The final paragraph closes the idea clearly.', zh: '最后一段清楚地收束了这个观点。' },
            ],
          },
        }
      }
      if (url.includes('/learning/readings')) return { data: readingRows }
      return { data: null }
    })
    const el = await mountPage()
    ;([...el.querySelectorAll('.lp-tab')] as HTMLElement[]).find((b) => b.textContent?.includes('范文阅读'))!.click()
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-reading-card').length).toBe(4))
    expect(el.querySelector('.lp-reader')?.textContent).toContain('A Bowl of Noodles')
    ;([...el.querySelectorAll('.lp-reading-levels button')] as HTMLElement[]).find((b) => b.textContent === '简单')!.click()
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-reading-card').length).toBe(2))
    const topic = el.querySelector('.lp-reading-topic select') as HTMLSelectElement
    topic.value = '故事'
    topic.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-reading-card').length).toBe(1))
    expect(el.querySelector('.lp-reading-card')?.textContent).toContain('The Lost Umbrella')
    expect(el.querySelector('.lp-reader-head')?.textContent).toContain('简单')
  })

  it('软考作为独立科目：左侧显示专业目录，右侧提供可下载资料', async () => {
    const getMock = vi.mocked((await import('../api/client')).api.get)
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/learning/subjects')) {
        return { data: [
          { key: '英语', label: '英语', ready: true },
          { key: '软考', label: '软考', ready: true },
        ] }
      }
      if (url.includes('/learning/courses')) {
        let decoded = url
        try { decoded = decodeURIComponent(url) } catch { /* ignore */ }
        if (decoded.includes('subject=软考')) {
          return {
            data: [{ stage: '软考', courses: [
              { id: 'soft_arch', name: '系统架构设计师', stage: '软考', bookId: '', bookName: '系统架构设计师', wordCount: 0, levelCount: 0, clearedLevels: 0, totalLevels: 0, dueCount: 0, progressPct: 0, kind: 'exam', examLevel: '高级', examSpecialty: '系统架构设计师' },
              { id: 'soft_designer', name: '软件设计师', stage: '软考', bookId: '', bookName: '软件设计师', wordCount: 0, levelCount: 0, clearedLevels: 0, totalLevels: 0, dueCount: 0, progressPct: 0, kind: 'exam', examLevel: '中级', examSpecialty: '软件设计师' },
            ] }],
          }
        }
        return defaultGet(url)
      }
      if (url.endsWith('/learning/soft-exam/materials')) {
        return { data: [
          {
            id: 'm1', title: '系统架构设计师 · 近三年知识点与题库', level: '高级', specialty: '系统架构设计师', yearRange: '2023–2025', description: '高可用、缓存与消息队列', fileName: 'architect.md',
            freeResources: [
              { id: 'r1', title: '官方考试入口', kind: '官方入口', provider: '中国计算机技术职业资格网', url: 'https://www.ruankao.org.cn/', license: '官方公开页面', description: '查看大纲', howToUse: '先确认考试范围' },
              { id: 'r2', title: '免费开源题库', kind: '开源题库', provider: 'GitHub', url: 'https://github.com/ruankaodaren/ruankao', license: 'MIT', description: '章节练习', howToUse: '学完一章做题' },
            ],
          },
          { id: 'm2', title: '软件设计师 · 近三年知识点与题库', level: '中级', specialty: '软件设计师', yearRange: '2023–2025', description: '数据结构、UML 与数据库', fileName: 'designer.md' },
        ] }
      }
      if (url.endsWith('/learning/soft-exam/regions')) {
        return { data: [
          { name: '北京', officialUrl: 'https://rsj.beijing.gov.cn/', registrationUrl: 'https://bm.ruankao.org.cn/sign/welcome' },
          { name: '上海', officialUrl: 'https://rsj.sh.gov.cn/', registrationUrl: 'https://bm.ruankao.org.cn/sign/welcome' },
        ] }
      }
      if (url.includes('/learning/soft-exam/live')) {
        return { data: { region: '北京', registrationUrl: 'https://bm.ruankao.org.cn/sign/welcome', officialUrl: 'https://rsj.beijing.gov.cn/', nationalUrl: 'https://www.ruankao.org.cn/', fetchedAt: Date.now(), status: 'live', notices: [{ title: '2027 年软考报名通知', url: 'https://example.com/notice', source: '地区' }] } }
      }
      if (url.endsWith('/learning/exams')) {
        return { data: [
          { id: 'soft_exam', title: '2025 软考高级 · 系统架构设计师 · 综合知识', examType: '软考', year: 2025, region: '全国软考', section: '综合知识', difficulty: '中高难度', durationMinutes: 25, tags: ['高级'], examLevel: '高级', examFormat: '综合知识', softSpecialty: '系统架构设计师', knowledgePoints: ['高可用'], questionCount: 4, hasListening: false, hasPractice: false },
        ] }
      }
      return defaultGet(url)
    })
    const el = await mountPage()
    await chooseSubject(el, '软考')
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-course-exam').length).toBe(2))
    expect(el.querySelector('.lp-tabs')).toBeFalsy()
    expect(el.querySelectorAll('.lp-tab').length).toBe(0)
    expect(el.querySelector('.lp-soft-materials')).toBeTruthy()
    expect(el.querySelector('.lp-soft-plan-form')).toBeTruthy()
    expect(el.querySelector('.lp-soft-notices')?.textContent).toContain('2027 年软考报名通知')
    const examDate = el.querySelector('.lp-soft-plan-form input[type="date"]') as HTMLInputElement
    examDate.value = '2099-05-23'
    examDate.dispatchEvent(new Event('input'))
    await nextTick()
    expect(el.querySelector('.lp-soft-countdown')?.textContent).toContain('距考试')
    expect(el.querySelectorAll('.lp-soft-study-plan article').length).toBeGreaterThan(0)
    ;([...el.querySelectorAll('.lp-soft-side-tabs button')] as HTMLElement[]).find((b) => b.textContent?.includes('学习清单'))!.click()
    await nextTick()
    expect(el.querySelectorAll('.lp-soft-material').length).toBe(1)
    expect(el.querySelector('.lp-soft-material')?.textContent).toContain('系统架构设计师')
    expect(el.querySelector('.lp-soft-material')?.textContent).toContain('下载学习清单')
    expect(el.querySelector('.lp-soft-free-resources')?.textContent).toContain('免费自学资料')
    expect(el.querySelector('.lp-soft-free-resources')?.textContent).toContain('开源题库')
    expect(el.querySelector('.lp-soft-free-resources')?.textContent).toContain('怎么用')
    expect(el.querySelector('.lp-exam-soft-filters')).toBeTruthy()
  })

  it('网络安全作为独立科目：路线页只负责选课，进入模块后全屏且一次只显示当前步骤', async () => {
    const getMock = vi.mocked((await import('../api/client')).api.get)
    const paths = [
      {
        id: 'sec_fundamentals', name: '安全基础与威胁建模', level: '入门', description: '从资产和信任边界开始',
        audience: '开发与运维', prerequisites: [], nextPathIds: ['sec_web'], tags: ['STRIDE', 'TLS'],
        glossary: [
          { term: 'STRIDE', fullName: 'Spoofing / Tampering / Repudiation / Information disclosure / Denial of service / Elevation of privilege', explanation: '六类威胁检查表，用来系统提出威胁。' },
          { term: 'TLS', fullName: 'Transport Layer Security', explanation: '保护网络传输机密性和完整性的协议。' },
        ],
        modules: [{
          id: 'm_fund', title: '威胁建模', summary: '识别资产、边界和威胁',
          topics: ['资产', '边界', '威胁'], risk: '不做威胁建模容易遗漏业务逻辑风险。',
          control: '把滥用场景和正常用例一起评审。',
          lesson: {
            objectives: ['理解资产', '识别边界', '验证控制'],
            keyTerms: [
              { term: '资产', explanation: '需要保护的对象。' },
              { term: '边界', explanation: '身份或权限发生变化的位置。' },
              { term: '威胁', explanation: '可能发生的坏事。' },
            ],
            walkthrough: [
              { title: '画流程', detail: '先写出正常业务链路。' },
              { title: '标资产', detail: '找出文件、会话和存储桶。' },
              { title: '套 STRIDE', detail: '逐类提出威胁。' },
              { title: '写验收', detail: '把威胁变成可复测断言。' },
            ],
            knowledgeChecks: [
              { question: '为什么要先画数据流？', answer: '因为威胁发生在组件和信任边界上。' },
              { question: '什么才算验收？', answer: '同一请求在修复前后有可重复观察的差异。' },
            ],
          },
          code: {
            language: 'typescript',
            context: '言智网络安全课程 · STRIDE 模块',
            application: '文件上传服务（浏览器 → API → 对象存储）',
            exampleKind: '威胁模型记录（教学用 YAML 结构）',
            badLabel: '不安全的上传设计',
            goodLabel: '威胁模型与控制',
            bad: 'allowAll();', good: 'denyByDefault();', note: '默认拒绝更容易审计。',
            variants: [
              { language: 'java', bad: 'allowAll();', good: 'PreparedStatement check();', note: 'Java 示例' },
              { language: 'python', bad: 'allow_all()', good: 'deny_by_default()', note: 'Python 示例' },
            ],
          },
          lab: {
            target: '本地授权靶场',
            tools: ['DevTools', 'curl'],
            steps: ['列资产', '画边界', '验证控制', '记录证据'],
            commands: ['curl.exe -i http://127.0.0.1:4317/health'],
            expected: '形成可复核的威胁清单，并记录修复前后响应差异。',
          },
        }],
      },
      {
        id: 'sec_web', name: 'Web 漏洞与攻击防御', level: '进阶', description: '学习 OWASP 高频风险',
        audience: '前后端开发', prerequisites: ['sec_fundamentals'], nextPathIds: [], tags: ['XSS', 'SQL 注入'],
        modules: [{
          id: 'm_web', title: 'SQL 注入', summary: '参数化查询与最小权限', topics: ['参数化', '权限', '日志'],
          risk: '拼接 SQL 会改变查询语义。', control: '使用参数化查询。',
        }],
      },
    ]
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/learning/subjects')) {
        return { data: [{ key: '英语', label: '英语', ready: true }, { key: '网络安全', label: '网络安全', ready: true }] }
      }
      if (url.includes('/learning/courses')) {
        let decoded = url
        try { decoded = decodeURIComponent(url) } catch { /* ignore */ }
        if (decoded.includes('subject=网络安全')) {
          return { data: [{ stage: '网络安全', courses: [
            { id: 'sec_fund', name: '安全基础与威胁建模', stage: '网络安全', bookId: '', bookName: '安全基础', wordCount: 0, levelCount: 0, clearedLevels: 0, totalLevels: 0, dueCount: 0, progressPct: 0, kind: 'security', securityPathId: 'sec_fundamentals' },
            { id: 'sec_web', name: 'Web 漏洞与攻击防御', stage: '网络安全', bookId: '', bookName: 'Web 攻防', wordCount: 0, levelCount: 0, clearedLevels: 0, totalLevels: 0, dueCount: 0, progressPct: 0, kind: 'security', securityPathId: 'sec_web' },
          ] }] }
        }
      }
      if (url.endsWith('/learning/security/paths')) return { data: paths }
      return defaultGet(url)
    })
    const el = await mountPage()
    await chooseSubject(el, '网络安全')
    await vi.waitFor(() => expect(el.querySelector('.sec-workbench')).toBeTruthy())
    expect(el.querySelector('.lp-tabs')).toBeFalsy()
    expect(el.querySelector('.lp-grid')?.classList.contains('security-workspace')).toBe(true)
    expect(el.querySelector('.lp-col-left')).toBeFalsy()
    expect(el.querySelector('.lp-security-boundary')).toBeFalsy()
    expect(el.querySelector('.sec-glossary')).toBeFalsy()
    expect(el.querySelectorAll('.sec-level-switcher button').length).toBe(3)
    expect([...el.querySelectorAll('.sec-level-switcher button')].map((button) => button.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '入门 1',
      '进阶 1',
      '高级 0',
    ])
    expect(el.querySelector('.sec-level-switcher button[aria-pressed="true"]')?.textContent).toContain('入门')
    expect(el.querySelectorAll('.sec-path-switcher button').length).toBe(1)
    expect([...el.querySelectorAll('.sec-path-switcher button')].every((button) => button.textContent?.includes('个知识点'))).toBe(true)
    expect(el.querySelectorAll('.sec-module-card').length).toBe(1)
    expect(el.querySelector('.sec-module-card')?.textContent).toContain('威胁建模')
    expect(el.querySelector('.sec-focus')).toBeFalsy()

    ;(el.querySelector('.sec-module-start') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.sec-focus')).toBeTruthy())
    const focus = el.querySelector('.sec-focus') as HTMLElement
    expect(focus.getAttribute('role')).toBe('dialog')
    expect(focus.getAttribute('aria-modal')).toBe('true')
    expect(el.querySelector('.lp-topbar')?.hasAttribute('inert')).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
    expect(el.querySelectorAll('.sec-focus-rail button').length).toBe(5)
    expect(el.querySelector('.sec-focus-content')?.textContent).toContain('识别资产、边界和威胁')
    expect(el.querySelectorAll('.sec-term-focus').length).toBe(1)
    expect(el.querySelector('.sec-term-focus')?.textContent).toContain('资产')
    expect(el.querySelector('.sec-term-focus')?.textContent).not.toContain('身份或权限发生变化的位置')
    ;(el.querySelector('.sec-term-nav button:last-child') as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.sec-term-focus')?.textContent).toContain('边界')
    expect(el.querySelector('.sec-code')).toBeFalsy()

    ;([...el.querySelectorAll('.sec-focus-rail button')] as HTMLElement[]).find((b) => b.textContent?.includes('推导'))!.click()
    await nextTick()
    expect(el.querySelectorAll('.sec-reasoning-card').length).toBe(1)
    expect(el.querySelector('.sec-reasoning-card')?.textContent).toContain('画流程')
    expect(el.querySelectorAll('.sec-reasoning-dots button').length).toBe(4)
    ;(el.querySelectorAll('.sec-reasoning-dots button')[2] as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.sec-reasoning-card')?.textContent).toContain('套 STRIDE')
    expect(el.querySelector('.sec-term-focus')).toBeFalsy()

    ;([...el.querySelectorAll('.sec-focus-rail button')] as HTMLElement[]).find((b) => b.textContent?.includes('攻防'))!.click()
    await nextTick()
    expect(el.querySelector('.sec-code')).toBeTruthy()
    expect(el.querySelector('.sec-code-origin')?.textContent).toContain('文件上传服务')
    expect(el.querySelectorAll('.sec-code-languages button').length).toBe(3)
    ;([...el.querySelectorAll('.sec-code-languages button')] as HTMLElement[]).find((b) => b.textContent === 'java')!.click()
    await nextTick()
    expect(el.querySelector('.sec-code')?.textContent).toContain('PreparedStatement')

    ;([...el.querySelectorAll('.sec-focus-rail button')] as HTMLElement[]).find((b) => b.textContent?.includes('实验'))!.click()
    await nextTick()
    expect(el.querySelector('.sec-lab-stage')?.textContent).toContain('本地授权靶场')
    expect(el.querySelector('.sec-lab-commands')?.textContent).toContain('/health')
    expect(el.querySelector('.sec-code')).toBeFalsy()

    ;([...el.querySelectorAll('.sec-focus-rail button')] as HTMLElement[]).find((b) => b.textContent?.includes('自测'))!.click()
    await nextTick()
    expect(el.querySelector('.sec-check-stage')?.textContent).toContain('为什么要先画数据流')
    expect(el.querySelector('.sec-check-answer')).toBeFalsy()
    ;(el.querySelector('.sec-reveal-answer') as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.sec-check-answer')?.textContent).toContain('威胁发生在组件和信任边界上')
    expect(el.querySelector('.sec-focus-next')?.textContent).toContain('完成本节')
    ;(el.querySelector('.sec-focus-next') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.sec-focus-complete')).toBeTruthy())
    expect(el.querySelector('.sec-focus-complete')?.textContent).toContain('本节完成')
    ;(el.querySelector('.sec-complete-actions .secondary') as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.sec-focus')).toBeFalsy()
    expect(document.body.style.overflow).toBe('')
    expect(el.querySelector('.lp-topbar')?.hasAttribute('inert')).toBe(false)

    ;([...el.querySelectorAll('.sec-level-switcher button')] as HTMLElement[]).find((button) => button.textContent?.includes('进阶'))!.click()
    await vi.waitFor(() => expect(el.querySelector('.sec-overview-copy h1')?.textContent).toContain('Web 漏洞'))
    expect(el.querySelectorAll('.sec-path-switcher button').length).toBe(1)
    expect(el.querySelector('.sec-path-switcher button')?.textContent).toContain('Web 漏洞与攻击防御')
    ;([...el.querySelectorAll('.sec-level-switcher button')] as HTMLElement[]).find((button) => button.textContent?.includes('入门'))!.click()
    await vi.waitFor(() => expect(el.querySelector('.sec-overview-copy h1')?.textContent).toContain('安全基础'))
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
      if (url.includes('/learning/subjects')) {
        return { data: [{ key: '英语', label: '英语', ready: true }, { key: '软考', label: '软考', ready: true }] }
      }
      if (url.includes('/learning/courses')) {
        let decoded = url
        try { decoded = decodeURIComponent(url) } catch { /* ignore */ }
        if (decoded.includes('subject=软考')) {
          return { data: [{ stage: '软考', courses: [
            { id: 'soft_designer', name: '软件设计师', stage: '软考', bookId: '', bookName: '软件设计师', wordCount: 0, levelCount: 0, clearedLevels: 0, totalLevels: 0, dueCount: 0, progressPct: 0, kind: 'exam', examLevel: '中级', examSpecialty: '软件设计师' },
            { id: 'soft_arch', name: '系统架构设计师', stage: '软考', bookId: '', bookName: '系统架构设计师', wordCount: 0, levelCount: 0, clearedLevels: 0, totalLevels: 0, dueCount: 0, progressPct: 0, kind: 'exam', examLevel: '高级', examSpecialty: '系统架构设计师' },
          ] }] }
        }
      }
      if (url.endsWith('/learning/soft-exam/materials')) return { data: [] }
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
    expect([...el.querySelectorAll('.lp-exam-filters button')].map((b) => b.textContent?.trim())).not.toContain('软考')

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

  it('★ 软考：按中高级、专业和综合知识/上机题筛选，上机题使用代码作答区', async () => {
    const { api } = await import('../api/client')
    const getMock = vi.mocked(api.get)
    const postMock = vi.mocked(api.post)
    const papers = [
      { id: 'soft_mid_theory', title: '2025 软考中级 · 软件设计师 · 综合知识', examType: '软考', year: 2025, region: '全国软考', section: '综合知识', difficulty: '中等', durationMinutes: 20, tags: ['中级'], examLevel: '中级', examFormat: '综合知识', softSpecialty: '软件设计师', knowledgePoints: ['UML', '数据库'], questionCount: 4, hasListening: false, hasPractice: false },
      { id: 'soft_senior_theory', title: '2025 软考高级 · 系统架构设计师 · 综合知识', examType: '软考', year: 2025, region: '全国软考', section: '综合知识', difficulty: '中高难度', durationMinutes: 25, tags: ['高级'], examLevel: '高级', examFormat: '综合知识', softSpecialty: '系统架构设计师', knowledgePoints: ['高可用'], questionCount: 4, hasListening: false, hasPractice: false },
      { id: 'soft_mid_practice', title: '2025 软考中级 · 软件设计师 · 上机精选', examType: '软考', year: 2025, region: '全国软考', section: '上机实操', difficulty: '中等', durationMinutes: 45, tags: ['上机'], examLevel: '中级', examFormat: '上机实操', softSpecialty: '软件设计师', knowledgePoints: ['SQL'], questionCount: 1, hasListening: false, hasPractice: true },
      { id: 'soft_senior_practice', title: '2025 软考高级 · 系统架构设计师 · 案例精选', examType: '软考', year: 2025, region: '全国软考', section: '上机实操', difficulty: '中高难度', durationMinutes: 50, tags: ['架构'], examLevel: '高级', examFormat: '上机实操', softSpecialty: '系统架构设计师', knowledgePoints: ['容量估算'], questionCount: 1, hasListening: false, hasPractice: true },
    ]
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/learning/subjects')) {
        return { data: [{ key: '英语', label: '英语', ready: true }, { key: '软考', label: '软考', ready: true }] }
      }
      if (url.includes('/learning/courses')) {
        let decoded = url
        try { decoded = decodeURIComponent(url) } catch { /* ignore */ }
        if (decoded.includes('subject=软考')) {
          return { data: [{ stage: '软考', courses: [
            { id: 'soft_designer', name: '软件设计师', stage: '软考', bookId: '', bookName: '软件设计师', wordCount: 0, levelCount: 0, clearedLevels: 0, totalLevels: 0, dueCount: 0, progressPct: 0, kind: 'exam', examLevel: '中级', examSpecialty: '软件设计师' },
            { id: 'soft_arch', name: '系统架构设计师', stage: '软考', bookId: '', bookName: '系统架构设计师', wordCount: 0, levelCount: 0, clearedLevels: 0, totalLevels: 0, dueCount: 0, progressPct: 0, kind: 'exam', examLevel: '高级', examSpecialty: '系统架构设计师' },
          ] }] }
        }
      }
      if (url.endsWith('/learning/soft-exam/materials')) return { data: [] }
      if (url.endsWith('/learning/exams')) return { data: papers }
      if (url.includes('/learning/exams/soft_mid_practice')) {
        return {
          data: {
            ...papers[2],
            passage: '请完成 SQL 上机题。',
            questions: [{
              id: 'p1', kind: 'practice', stem: '查询 2025 年订单数。', language: 'sql',
              starterCode: 'SELECT\n  -- TODO\nFROM orders;',
            }],
          },
        }
      }
      return defaultGet(url)
    })
    postMock.mockImplementation(async (url: string) => {
      if (url.includes('/learning/exams/soft_mid_practice/submit')) {
        return {
          data: {
            paperId: 'soft_mid_practice', title: papers[2].title, correct: 0, total: 1, score: 0,
            details: [{
              questionId: 'p1', kind: 'practice', stem: '查询 2025 年订单数。',
              picked: null, pickedText: 'SELECT COUNT(*) FROM orders;', answer: null,
              reference: 'SELECT COUNT(*) FROM orders WHERE created_at >= ...', correct: null,
              explanation: '检查时间范围和聚合函数。',
            }],
          },
        }
      }
      return { data: null }
    })

    const el = await mountPage()
    await chooseSubject(el, '软考')
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-course-exam').length).toBe(2))
    ;([...el.querySelectorAll('.lp-course-exam')] as HTMLElement[]).find((b) => b.textContent?.includes('软件设计师'))!.click()
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-exam-card').length).toBe(2))
    await vi.waitFor(() => expect(el.querySelector('.lp-exam-soft-filters')).toBeTruthy())
    ;([...el.querySelectorAll('.lp-exam-soft-row button')] as HTMLElement[]).find((b) => b.textContent?.trim() === '上机实操')!.click()
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-exam-card').length).toBe(1))
    expect(el.querySelector('.lp-exam-card')?.textContent).toContain('上机')
    ;(el.querySelector('.lp-exam-card button') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-exam-code')).toBeTruthy())
    const code = el.querySelector('.lp-exam-code') as HTMLTextAreaElement
    code.value = 'SELECT COUNT(*) FROM orders;'
    code.dispatchEvent(new Event('input'))
    const submit = ([...el.querySelectorAll('button')] as HTMLElement[]).find((b) => b.textContent?.trim() === '交卷判分')!
    submit.click()
    await vi.waitFor(() => expect(el.querySelector('.lp-exam-practice-review')).toBeTruthy())
    expect(el.querySelector('.lp-exam-practice-review')?.textContent).toContain('参考要点')
    expect(el.querySelector('.lp-exam-practice-review')?.textContent).toContain('SELECT COUNT(*)')
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
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled())
    const scenePrompt = (sendMessage.mock.calls[0] as unknown as [string])[0]
    expect(scenePrompt).toContain('Current scene contract')
    expect(scenePrompt).toContain('Good morning. Which course would you like to change?')
    expect(scenePrompt).toContain('I would like to switch from Art History to Psychology.')
    expect(scenePrompt).toContain('Do not say that answer for me')
    expect(scenePrompt).toContain('Minimum learner rounds before finishing')
    expect(scenePrompt).toContain('Do not output [SCENE_END]')
    await vi.waitFor(() => expect(el.querySelector('.lp-pet-stage')).toBeTruthy())
    expect(el.querySelector('.lp-practice-title')?.textContent).toContain('选课咨询')
    expect(el.querySelector('.lp-pet-speech')?.textContent).toContain('言言')
    // ★ 用户实报「场景卡跳到办公模式」：场景任务绝不 push 聊天详情路由
    expect(push).not.toHaveBeenCalled()
    const freeButton = ([...el.querySelectorAll('button')] as HTMLButtonElement[])
      .find((button) => button.textContent?.trim() === '自由发挥')!
    freeButton.click()
    await vi.waitFor(() => expect(createConversation).toHaveBeenCalledTimes(2))
    const [freeTitle, freeOpts] = createConversation.mock.calls[1] as unknown as [
      string,
      { sourceMeta?: { learningKind?: string } },
    ]
    expect(freeTitle).toContain('英语陪练')
    expect(freeOpts.sourceMeta?.learningKind).toBe('free')
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
    const freePrompt = (sendMessage.mock.calls[1] as unknown as [string])[0]
    expect(freePrompt).toContain('freely, without a fixed scene')
    expect(freePrompt).toContain('Do not use scene missions')
  })

  it('★ 开始陪练：内嵌中栏直接调 AI（不跳路由），带契约 id 建会话并发起英文对话', async () => {
    const el = await mountPage()
    ;([...el.querySelectorAll('.lp-tab')] as HTMLElement[]).find((b) => b.textContent?.includes('陪练对话'))!.click()
    await vi.waitFor(() => expect(el.querySelector('.lp-coach-start')).toBeTruthy())
    const btn = el.querySelector('.lp-coach-start') as HTMLElement
    btn.click()
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled())
    expect(createConversation).toHaveBeenCalledTimes(1)
    const [title, opts] = createConversation.mock.calls[0] as unknown as [string, { agentId?: string }]
    expect(title).toContain('英语陪练')
    expect(opts.agentId).toBe('a_builtin_learning_coach')
    // ★ 用户实报「怎么又跳到办公模式」：陪练必须留在学习模式内嵌对话，绝不 push 聊天路由
    expect(push).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(el.querySelector('.lp-coach-chat')).toBeTruthy())
    expect(el.querySelector('.lp-pet-stage')).toBeTruthy()
    expect(el.querySelector('.lp-talk-button')).toBeTruthy()
    expect(el.querySelector('.lp-coach-side.collapsed')).toBeTruthy()
    expect(el.querySelector('.lp-col-right')?.getAttribute('style')).toContain('display: none')
    // ★ 独立学习页必须自己幂等预热平台/模型，否则首次发送必然落到「没有可用模型」提示
    expect(ensurePlatforms).toHaveBeenCalled()
    expect(ensureModels).toHaveBeenCalled()
    // 直接调用 AI 接口（chat.sendMessage），且首句是英文摸底开场白
    const args = sendMessage.mock.calls[0] as unknown as [string, unknown, unknown, unknown, unknown, string]
    expect(args[0]).toContain('practice English')
    expect(args[5]).toBe('c_test_1')
    expect(loadMessages).toHaveBeenCalledWith('c_test_1')
  })

  it('陪练对话 Tab：宠物说当前一句，完整记录默认收起且可展开', async () => {
    // 消息仓是普通对象：必须在 ensureCoachConv 写入 coachConvId（触发 computed 重算）之前注入
    messagesByConv['c_test_1'] = [
      { id: 'u1', role: 'user', content: 'Hi!' },
      { id: 'a1', role: 'assistant', content: 'Hello! Nice to meet you. How are you today?' },
    ]
    const el = await mountPage()
    ;([...el.querySelectorAll('.lp-tab')] as HTMLElement[]).find((b) => b.textContent?.includes('陪练对话'))!.click()
    await vi.waitFor(() => expect(el.querySelectorAll('.lp-chat-bubble').length).toBe(2))
    expect(el.querySelector('.lp-coach-chat')).toBeTruthy()
    expect(el.querySelector('.lp-pet-speech')?.textContent).toContain('How are you today?')
    expect(el.querySelector('.lp-side-body')?.getAttribute('style')).toContain('display: none')
    ;(el.querySelector('.lp-side-toggle') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelector('.lp-side-body')?.getAttribute('style') || '').not.toContain('display: none'))
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
