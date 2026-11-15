// @vitest-environment jsdom
/**
 * CultureWorkbench（传统文化 · 典籍精读台）真挂载测试。
 *
 * mock 范式照 Learning.mount.test.ts：vi.mock('../../api/client') 按路径分发假数据。
 * 数据用真实类型形状（apps/server/src/learning/culture/types.ts），文案取公版《声律启蒙》/《笠翁对韵》。
 *
 * 断言交互宪法（docs/学习模式设计准则.md）与方案 §3.1：
 *   ① 沉浸台挂载为全屏 fixed（jsdom 不算 CSS，另用源码锚点钉死 position/z-index）
 *   ② 五步一次只显示一步（其余步骤不渲染）
 *   ③ 点可点字打开注解抽屉，主流程 DOM 无 <details> 折叠
 *   ④ 对句台：填错字显示平仄提示，填对后完成课时
 *   ⑤ Escape 退出 emit focus-change false
 *   ⑥ 进度写独立 localStorage key（绝不混用 yz.learning.path.*）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, nextTick, h, defineComponent, type App } from 'vue'
import CultureWorkbench from './CultureWorkbench.vue'

const BENCH_SRC = () => readFileSync(resolve(__dirname, 'CultureWorkbench.vue'), 'utf8')

// ===== mock 数据（真实类型形状，公版内容） =====
const lessonPayload = {
  id: 'cul_mengxue_shenglv',
  kind: 'read',
  title: '声律启蒙 · 一东（节选）',
  goal: '第一次感受「对仗」：字数一样、词性相对、平仄相反',
  minutes: 8,
  level: '蒙学·对韵',
  source: '《声律启蒙》清·车万育，通行本',
  plainSummary: [
    '这本书是古代小朋友的对对子入门教材。',
    '这一段告诉你：云和雨相对，雪和风相对。',
    '读起来像唱歌，因为平仄是交替的。',
  ],
  lines: [
    {
      id: 'sl_1',
      text: '云对雨，雪对风，晚照对晴空。',
      pingze: '平仄仄仄仄平平仄仄平平',
      plain: '云对雨，雪对风；傍晚的日光对晴朗的天空。',
      annotations: [
        { term: '晚照', pinyin: 'wǎn zhào', gloss: '傍晚的日光', type: '释词', note: '与「晴空」相对：一个偏时间，一个偏空间' },
        { term: '晴空', gloss: '晴朗的天空' },
      ],
      interpretations: [
        { school: '车万育《声律启蒙撮要》', dynasty: '清', text: '云对雨，雪对风，晚照对晴空：皆天文时令之对。', plain: '把天上的景物两两相对，读来音韵起伏。' },
      ],
    },
    {
      id: 'sl_2',
      text: '来鸿对去燕，宿鸟对鸣虫。',
      pingze: '平平仄仄仄仄仄仄平平',
      plain: '飞来的鸿雁对飞去的燕子，歇宿的鸟对鸣叫的虫。',
      annotations: [
        { term: '鸿', pinyin: 'hóng · 本音', gloss: '大雁' },
        { term: '宿', gloss: '歇宿、停留' },
      ],
      interpretations: [
        { school: '《笠翁对韵》通行讲义', dynasty: '清', text: '鸿与燕皆候鸟，一来一去，动静相成。', plain: '大意：鸿雁和燕子都是候鸟，一来一去正好成对。', paraphrase: true },
      ],
    },
  ],
  structure: [
    { label: '天文对', hint: '云雨雪风，字字成对', lineIndex: 0 },
    { label: '景物对', hint: '晚照对晴空，时间对空间', lineIndex: 0 },
    { label: '禽虫对', hint: '来去一对，动静一对', lineIndex: 1 },
  ],
  steps: ['recite', 'gloss', 'plain', 'structure', 'couplet'],
}

const coupletPayload = {
  id: 'clt_tian_di',
  title: '一字对 · 天',
  level: '蒙学·对韵',
  prompt: '天',
  promptTone: '平',
  expectPos: ['名'],
  expectTone: ['仄'],
  candidates: [
    { ch: '地', pos: '名', tone: '仄' },
    { ch: '海', pos: '名', tone: '仄' },
    { ch: '山', pos: '名', tone: '平' },
    { ch: '云', pos: '名', tone: '平' },
    { ch: '雨', pos: '名', tone: '仄' },
    { ch: '人', pos: '名', tone: '平' },
  ],
  sampleAnswer: '地',
  sampleWhy: '《笠翁对韵》开篇即「天对地」：天是平声，对面要仄声，「地」正合适。',
}

const pathsPayload = {
  stages: [
    {
      level: '蒙学·对韵',
      lessons: [{
        id: 'cul_mengxue_shenglv', kind: 'read', title: '声律启蒙 · 一东（节选）',
        goal: '第一次感受「对仗」', minutes: 8, steps: ['recite', 'gloss', 'plain', 'structure', 'couplet'],
      }],
      couplets: [{ id: 'clt_tian_di', title: '一字对 · 天', prompt: '天', promptTone: '平' }],
    },
    {
      level: '诗词歌赋',
      lessons: [{
        id: 'cul_shici_jingyesi', kind: 'read', title: '静夜思',
        goal: '读会第一首唐诗', minutes: 10, steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
      }],
      couplets: [],
    },
    {
      level: '四书',
      lessons: [{
        id: 'cul_sishu_lunyu_xueer', kind: 'read', title: '论语 · 学而（首章）',
        goal: '第一次逐字读经典', minutes: 12, steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
      }],
      couplets: [],
    },
    {
      level: '五经',
      lessons: [{
        id: 'cul_wujing_shijing_guanju', kind: 'read', title: '诗经 · 周南 · 关雎（首章）',
        goal: '读五经的第一种', minutes: 12, steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
      }],
      couplets: [],
    },
  ],
}

// mock 分发实现：mock 工厂返回 vi.fn 包一层 getImpl，beforeEach（及用例内）可随时换实现。
let getImpl: (url: string) => Promise<unknown> = async () => ({ data: null })

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn((url: string) => getImpl(url)),
    post: vi.fn(async () => ({ data: null })),
    patch: vi.fn(async () => ({ data: null })),
    put: vi.fn(async () => ({ data: null })),
    delete: vi.fn(async () => ({ data: null })),
  },
}))

function setupApi() {
  getImpl = async (url: string) => {
    if (url.includes('/learning/culture/couplet/')) return { data: coupletPayload }
    if (url.includes('/learning/culture/lessons/')) return { data: lessonPayload }
    if (url.includes('/learning/culture/paths')) return { data: pathsPayload }
    if (url.includes('/learning/lesson-progress')) return { data: { lessonIds: [] } }
    return { data: null }
  }
}

const COMPLETED_KEY = 'yz.learning.culture.completed.v1'
const POSITION_KEY = 'yz.learning.culture.position.v1'

/** 捕获 focus-change 事件的挂载宿主 */
const focusEvents: boolean[] = []
/** 已挂载的 app 实例：beforeEach 统一卸载，防止 window 监听与 body 滚动锁跨用例泄漏 */
const mountedApps: App[] = []

async function mountBench(): Promise<HTMLElement> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const Host = defineComponent({
    setup() {
      return () => h(CultureWorkbench, { onFocusChange: (active: boolean) => { focusEvents.push(active) } })
    },
  })
  const app: App = createApp(Host)
  mountedApps.push(app)
  app.mount(el)
  await nextTick()
  await nextTick()
  return el
}

async function openFirstLesson(el: HTMLElement): Promise<void> {
  const btn = el.querySelector('.cul-lesson-btn') as HTMLElement
  btn.click()
  await vi.waitFor(() => expect(el.querySelector('.cul-immersive')).toBeTruthy())
}

function clickNext(el: HTMLElement): void {
  ;(el.querySelector('.cul-immersive-foot button.primary') as HTMLElement).click()
}

beforeEach(() => {
  // 先卸载上一用例的 app：innerHTML='' 不触发 onBeforeUnmount，会留下 window 监听与滚动锁
  for (const app of mountedApps) app.unmount()
  mountedApps.length = 0
  document.body.innerHTML = ''
  localStorage.clear()
  focusEvents.length = 0
  setupApi()
})

describe('CultureWorkbench · 挂载契约', () => {
  it('① 总览四阶渲染；进入沉浸台后全屏覆盖并锁 body 滚动（fixed 锚点用源码钉死）', async () => {
    // jsdom 不套用 SFC 样式，全屏 fixed 契约用源码锚点证明（仓库有 wiring 测试先例）
    const source = BENCH_SRC()
    expect(source).toContain('position: fixed')
    expect(source).toContain('z-index: 3000')
    expect(source).toContain("document.body.style.overflow = 'hidden'")

    const el = await mountBench()
    await vi.waitFor(() => expect(el.querySelectorAll('.cul-stage').length).toBe(4))
    await openFirstLesson(el)
    const immersive = el.querySelector('.cul-immersive') as HTMLElement
    expect(immersive.getAttribute('role')).toBe('dialog')
    expect(immersive.getAttribute('aria-modal')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')
    // 顶栏四项：返回 / 课程名 / 步骤 x/n / 退出
    expect(el.querySelector('.cul-back')?.textContent).toContain('返回路线')
    expect(el.querySelector('.cul-immersive-title')?.textContent).toContain('声律启蒙')
    expect(el.querySelector('.cul-step-count')?.textContent).toContain('1/5')
    expect(el.querySelector('.cul-close')).toBeTruthy()
  })

  it('② 五步一次只显示一步：当前步可见，其余步骤不渲染（←→ 与按钮都能切步）', async () => {
    const el = await mountBench()
    await vi.waitFor(() => expect(el.querySelector('.cul-lesson-btn')).toBeTruthy())
    await openFirstLesson(el)
    await vi.waitFor(() => expect(el.querySelector('.cul-step-recite')).toBeTruthy())
    expect(el.querySelector('.cul-step-gloss')).toBeFalsy()
    expect(el.querySelector('.cul-step-plain')).toBeFalsy()
    expect(el.querySelector('.cul-step-couplet')).toBeFalsy()

    // 键盘 → 进第 2 步
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await nextTick()
    expect(el.querySelector('.cul-step-gloss')).toBeTruthy()
    expect(el.querySelector('.cul-step-recite')).toBeFalsy()
    expect(el.querySelector('.cul-step-count')?.textContent).toContain('2/5')

    // 底部「下一步」进第 3 步，再回退
    clickNext(el)
    await nextTick()
    expect(el.querySelector('.cul-step-plain')).toBeTruthy()
    expect(el.querySelector('.cul-step-gloss')).toBeFalsy()
    // 上一步回退到第 2 步
    ;([...el.querySelectorAll('.cul-immersive-foot > button')] as HTMLElement[])[0].click()
    await nextTick()
    expect(el.querySelector('.cul-step-gloss')).toBeTruthy()
    expect(el.querySelector('.cul-step-plain')).toBeFalsy()
  })

  it('③ 逐字注：点可点字打开右侧注解抽屉（注释段显示训诂），主流程 DOM 无 <details> 折叠', async () => {
    const el = await mountBench()
    await vi.waitFor(() => expect(el.querySelector('.cul-lesson-btn')).toBeTruthy())
    await openFirstLesson(el)
    clickNext(el) // recite → gloss
    await vi.waitFor(() => expect(el.querySelector('.cul-step-gloss')).toBeTruthy())

    const term = el.querySelector('.cul-gloss-term') as HTMLElement
    expect(term.textContent).toBe('晚照')
    term.click()
    await nextTick()
    const drawer = el.querySelector('.cul-drawer')
    expect(drawer).toBeTruthy()
    expect(drawer?.textContent).toContain('晚照')
    expect(drawer?.textContent).toContain('傍晚的日光')
    expect(drawer?.textContent).toContain('注释')
    // 交互宪法 §2：注解不是行内折叠
    expect(el.querySelector('details')).toBeNull()
  })

  it('⑧ 点带注释的字打开抽屉：「注解 · 历代大家」段显示 school 与 dynasty 徽标', async () => {
    const el = await mountBench()
    await vi.waitFor(() => expect(el.querySelector('.cul-lesson-btn')).toBeTruthy())
    await openFirstLesson(el)
    clickNext(el) // recite → gloss
    await vi.waitFor(() => expect(el.querySelector('.cul-step-gloss')).toBeTruthy())

    ;(el.querySelector('.cul-gloss-term') as HTMLElement).click()
    await nextTick()
    const drawer = el.querySelector('.cul-drawer')
    expect(drawer?.textContent).toContain('注解 · 历代大家')
    expect(drawer?.textContent).toContain('车万育《声律启蒙撮要》')
    // dynasty 徽标（注释 type 与朝代共用 .cul-badge 样式）
    const badges = [...drawer!.querySelectorAll('.cul-badge')].map((b) => b.textContent?.trim())
    expect(badges).toContain('清')
    expect(badges).toContain('释词')
  })

  it('⑨ paraphrase=true 的注解条目显示「大意转述」chip（不冒充逐字引文）', async () => {
    const el = await mountBench()
    await vi.waitFor(() => expect(el.querySelector('.cul-lesson-btn')).toBeTruthy())
    await openFirstLesson(el)
    clickNext(el) // recite → gloss
    await vi.waitFor(() => expect(el.querySelector('.cul-step-gloss')).toBeTruthy())

    // 点第二行的「鸿」：该行注解为转述口径
    const hong = [...el.querySelectorAll('.cul-gloss-term')].find((b) => b.textContent?.trim() === '鸿') as HTMLElement
    expect(hong).toBeTruthy()
    hong.click()
    await nextTick()
    const drawer = el.querySelector('.cul-drawer')
    expect(drawer).toBeTruthy()
    const chip = drawer!.querySelector('.cul-chip-paraphrase')
    expect(chip?.textContent).toBe('大意转述')
    // 抽屉顶部注释段没有 chip：chip 只属于 paraphrase 条目
    expect(drawer!.querySelector('.cul-anno .cul-chip-paraphrase')).toBeNull()
  })

  it('④ 对句台：填错字给一条平仄提示；点槽撤销后填对即判卷通过并完成课时', async () => {
    const el = await mountBench()
    await vi.waitFor(() => expect(el.querySelector('.cul-lesson-btn')).toBeTruthy())
    await openFirstLesson(el)
    // recite → gloss → plain → structure → couplet
    clickNext(el); clickNext(el); clickNext(el); clickNext(el)
    await vi.waitFor(() => expect(el.querySelector('.cul-board')).toBeTruthy())
    expect(el.querySelector('.cul-board-prompt-text')?.textContent).toContain('天')

    const pick = (ch: string) => {
      const btn = [...el.querySelectorAll('.cul-candidate')].find((b) => b.textContent?.trim() === ch) as HTMLElement
      btn.click()
    }
    // 填「云」：词性对但平仄错 → firstToneIssue 一条具体提示
    pick('云')
    await nextTick()
    const toneIssue = el.querySelector('.cul-issue-tone')
    expect(toneIssue?.textContent).toContain('应仄')
    expect(el.querySelector('.cul-board-verdict')?.textContent).toContain('平仄 0/1')

    // 点槽撤销，改填「地」：三项全过 → 完成课时写入进度
    ;(el.querySelector('.cul-slot.filled') as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.cul-slot.filled')).toBeFalsy()
    pick('地')
    await vi.waitFor(() => {
      const done = JSON.parse(localStorage.getItem(COMPLETED_KEY) || '[]') as string[]
      expect(done).toContain('cul_mengxue_shenglv')
    })
    expect(el.querySelector('.cul-couplet-pass')).toBeTruthy()
  })

  it('⑤ Escape 退出沉浸台并 emit focus-change false，解锁 body 滚动', async () => {
    const el = await mountBench()
    await vi.waitFor(() => expect(el.querySelector('.cul-lesson-btn')).toBeTruthy())
    await openFirstLesson(el)
    await vi.waitFor(() => expect(focusEvents.includes(true)).toBe(true))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(el.querySelector('.cul-immersive')).toBeFalsy()
    expect(document.body.style.overflow).toBe('')
    expect(focusEvents[focusEvents.length - 1]).toBe(false)
  })

  it('⑥ 进度写独立 localStorage key（completed / position），不碰英语主线 key', async () => {
    const el = await mountBench()
    await vi.waitFor(() => expect(el.querySelector('.cul-lesson-btn')).toBeTruthy())
    await openFirstLesson(el)
    // position key 存 JSON（与 completed 同一套 readJson/writeJson 口径）
    expect(JSON.parse(localStorage.getItem(POSITION_KEY) || '""')).toBe('cul_mengxue_shenglv')
    // 完成课时后 completed key 写入
    clickNext(el); clickNext(el); clickNext(el); clickNext(el)
    await vi.waitFor(() => expect(el.querySelector('.cul-board')).toBeTruthy())
    const pick = [...el.querySelectorAll('.cul-candidate')].find((b) => b.textContent?.trim() === '地') as HTMLElement
    pick.click()
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(COMPLETED_KEY) || '[]')).toContain('cul_mengxue_shenglv'))
    // 绝不混用其他科目的进度 key
    expect(localStorage.getItem('yz.learning.path.completed.v2')).toBeNull()
    expect(localStorage.getItem('yz_security_progress_v1')).toBeNull()
    // 源码锚点：进度只走 culture 专用 key
    const source = BENCH_SRC()
    expect(source).toContain(COMPLETED_KEY)
    expect(source).toContain(POSITION_KEY)
    expect(source).not.toContain("yz.learning.path.")
  })

  it('⑦ 跨端读回：挂载后把 server 返回的 lessonIds 并集合并进 localStorage（本地不清空）', async () => {
    // 本地已有一条，server 另有一条：合并结果 = 并集，且两边的进度都不丢
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(['cul_local_only']))
    getImpl = async (url: string) => {
      if (url.includes('/learning/culture/paths')) return { data: pathsPayload }
      if (url.includes('/learning/lesson-progress')) return { data: { lessonIds: ['clt_tian_di', 'cul_mengxue_shenglv'] } }
      return { data: null }
    }
    const el = await mountBench()
    await vi.waitFor(() => {
      const done = JSON.parse(localStorage.getItem(COMPLETED_KEY) || '[]') as string[]
      expect(done).toContain('clt_tian_di')
      expect(done).toContain('cul_mengxue_shenglv')
    })
    const done = JSON.parse(localStorage.getItem(COMPLETED_KEY) || '[]') as string[]
    expect(done).toContain('cul_local_only')
  })

  it('⑩ 顶栏「记笔记」打开笔记弹窗并预填课程名与分类（不影响五步导航）', async () => {
    const el = await mountBench()
    await vi.waitFor(() => expect(el.querySelector('.cul-lesson-btn')).toBeTruthy())
    await openFirstLesson(el)
    ;(el.querySelector('.cul-note-btn') as HTMLElement).click()
    await nextTick()
    // 弹窗 Teleport 到 body，沉浸台不被关闭
    const dialog = document.body.querySelector('.nqc-dialog')
    expect(dialog).toBeTruthy()
    expect((dialog!.querySelector('.nqc-title') as HTMLInputElement).value).toContain('声律启蒙')
    expect((dialog!.querySelector('.nqc-cat') as HTMLInputElement).value).toBe('典籍摘抄')
    expect(el.querySelector('.cul-immersive')).toBeTruthy()
    // 预填正文含原文行与白话摘要
    const content = (dialog!.querySelector('.nqc-content') as HTMLTextAreaElement).value
    expect(content).toContain('云对雨，雪对风，晚照对晴空。')
    expect(content).toContain('这本书是古代小朋友的对对子入门教材。')
  })
})
