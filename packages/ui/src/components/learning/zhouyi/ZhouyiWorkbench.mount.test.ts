// @vitest-environment jsdom
/**
 * ZhouyiWorkbench（周易独立学科 · 精读台）真挂载测试。
 *
 * mock 范式照 CultureWorkbench.mount.test.ts：vi.mock('../../../api/client') 按 URL 分发假数据。
 * 数据用真实类型形状（apps/server/src/learning/zhouyi/types.ts），原文取公版《乾》卦。
 *
 * 断言交互宪法（docs/学习模式设计准则.md / AGENTS.md）与周易方案 §5：
 *   ① 沉浸台全屏 fixed（jsdom 不算 CSS，源码锚点钉死 position/z-index/锁滚动）
 *   ② 一次只显示一个步骤（annotate / interpret 互斥渲染）
 *   ③ 注释与注解两层都渲染，转述标注「大意转述」，主流程 DOM 无 <details> 折叠
 *   ④ 建设中的课不可进入（总览层 disabled）
 *   ⑤ Escape 退出 emit focus-change false；进度写独立 zy localStorage key
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, nextTick, h, defineComponent, type App } from 'vue'
import ZhouyiWorkbench from './ZhouyiWorkbench.vue'

const BENCH_SRC = () => readFileSync(resolve(__dirname, 'ZhouyiWorkbench.vue'), 'utf8')

const lessonPayload = {
  id: 'zy_z07', kind: 'read', track: 'T1', branch: '经部易类',
  title: '乾卦精读：卦辞、六爻、用九',
  goal: '逐句精读乾卦经文，配合象传文言分层理解',
  minutes: 18, ready: true,
  source: '《周易》通行本（王弼定本）· 乾卦，参王弼注、孔颖达疏',
  plainSummary: ['乾卦六爻用一条龙写人生进退。', '卦辞「元亨利贞」四字是大纲。', '「九五之尊」来自第五爻飞龙在天。'],
  lines: [
    {
      id: 'zy_z07_1', text: '乾：元，亨，利，贞。',
      plain: '乾卦卦辞：元、亨、利、贞四德。',
      annotations: [{ term: '元', pinyin: 'yuán', gloss: '开始、大', type: '释词' }],
      interpretations: [
        { kind: '传', school: '《文言传》', dynasty: '先秦', text: '元者，善之长也；亨者，嘉之会也；利者，义之和也；贞者，事之干也。', paraphrase: false, plain: '四德逐字解释。' },
        { kind: '今按', school: '本教程编者按', dynasty: '今', text: '四德为一卦之纲，后续各爻围绕「进退有时」展开。', paraphrase: true, plain: '大意：四德是总纲。' },
      ],
    },
    {
      id: 'zy_z07_2', text: '上九：亢龙有悔。',
      plain: '龙飞到极高处就会有悔恨。',
      annotations: [{ term: '亢', pinyin: 'kàng', gloss: '极高、过甚', type: '释词' }],
      interpretations: [
        { kind: '传', school: '《象传》（小象）', dynasty: '先秦', text: '亢龙有悔，盈不可久也。', paraphrase: false, plain: '满盈不能长久。' },
        { kind: '传', school: '《文言传》', dynasty: '先秦', text: '亢之为言也，知进而不知退，知存而不知亡，知得而不知丧。', paraphrase: false, plain: '只知进不知退就是「亢」。' },
      ],
    },
  ],
  structure: [
    { label: '卦辞四德', hint: '元亨利贞', lineIndex: 0 },
    { label: '上九', hint: '物极必反', lineIndex: 1 },
  ],
  steps: ['annotate', 'interpret', 'plain', 'structure', 'check'],
  quickCheck: { question: '「亢龙有悔」的小象怎么说？', options: ['盈不可久也', '德施普也', '大人造也'], answer: '盈不可久也', explanation: '上九小象：满盈不能长久。' },
  sources: [{ work: '周易正义', dynasty: '唐', license: '公版' }],
}

const pathsPayload = {
  tracks: [{ id: 'T0', name: '入门与读法', desc: '先建立经传与术数的边界' }, { id: 'T1', name: '经传精读', desc: '逐句读经传' }],
  courses: [
    { id: 'zy_z07', track: 'T1', name: '乾卦精读', goal: '逐句精读乾卦', minutes: 18, kind: 'read', ready: true, branch: '经部易类' },
    { id: 'zy_z08', track: 'T1', name: '坤卦与文言', goal: '精读坤卦', minutes: 18, kind: 'read', ready: false, branch: '经部易类' },
  ],
  terms: [{ term: '爻', pinyin: 'yáo', category: '符号', definition: '组成卦的每一横' }, { term: '卦', category: '符号', definition: '由三爻组成的经卦或六爻组成的别卦' }],
  bibliography: [{ title: '周易正义', author: '孔颖达', dynasty: '唐', role: '古注', license: '公版' }],
  canon: [{ id: 'canon_zhouyi', title: '周易（白文）', dynasty: '先秦', category: '经', license: '公版', excerptLines: [{ text: '乾：元，亨，利，贞。' }] }],
  disclaimer: '周易与术数内容为传统文献与民俗文化研究展示。',
}

let getImpl: (url: string) => Promise<unknown> = async () => ({ data: null })

vi.mock('../../../api/client', () => ({
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
    if (url.includes('/learning/zhouyi/lessons/')) return { data: lessonPayload }
    if (url.includes('/learning/zhouyi/paths')) return { data: pathsPayload }
    if (url.includes('/learning/lesson-progress')) return { data: { lessonIds: [] } }
    return { data: null }
  }
}

const focusEvents: boolean[] = []
const mountedApps: App[] = []

async function mountBench(props: Record<string, unknown> = {}): Promise<HTMLElement> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const Host = defineComponent({
    setup() {
      return () => h(ZhouyiWorkbench, {
        onFocusChange: (active: boolean) => { focusEvents.push(active) },
        ...props,
      })
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
  // 展开全部路径（课时列表按 track 折叠）
  el.querySelectorAll('.zy-track-head').forEach((h) => (h as HTMLElement).click())
  await nextTick()
  const btn = el.querySelector('.zy-course-btn:not(.locked)') as HTMLElement
  btn.click()
  await vi.waitFor(() => expect(el.querySelector('.zy-immersive')).toBeTruthy())
}

function clickNext(el: HTMLElement): void {
  ;(el.querySelector('.zy-immersive-foot button.primary') as HTMLElement).click()
}

beforeEach(() => {
  for (const app of mountedApps) app.unmount()
  mountedApps.length = 0
  document.body.innerHTML = ''
  localStorage.clear()
  focusEvents.length = 0
  setupApi()
})

describe('ZhouyiWorkbench · 挂载契约', () => {
  it('① 全屏沉浸契约（源码锚点）+ 总览渲染两路径；建设中课不可进入', async () => {
    const source = BENCH_SRC()
    expect(source).toContain('position: fixed')
    expect(source).toContain('z-index: 3000')
    expect(source).toContain("document.body.style.overflow = 'hidden'")

    const el = await mountBench()
    await vi.waitFor(() => expect(el.querySelectorAll('.zy-track').length).toBe(2))
    // 展开全部路径（课时列表按 track 折叠；mock 中 T0 无课、T1 有两课）
    el.querySelectorAll('.zy-track-head').forEach((h) => (h as HTMLElement).click())
    await nextTick()
    const locked = el.querySelector('.zy-course-btn.locked') as HTMLButtonElement
    expect(locked).toBeTruthy()
    expect(locked.textContent).toContain('建设中')
    expect(locked.disabled).toBe(true)
    const open = el.querySelector('.zy-course-btn:not(.locked)') as HTMLButtonElement
    expect(open.textContent).toContain('乾卦精读')
    open.click()
    await vi.waitFor(() => expect(el.querySelector('.zy-immersive')).toBeTruthy())
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('② 一次一步：annotate 与 interpret 互斥渲染；两层内容都出现且标转述', async () => {
    const el = await mountBench()
    await openFirstLesson(el)
    // 步骤 1 = annotate（注释步）
    expect(el.querySelector('.zy-step-count')?.textContent).toContain('1/5')
    expect(el.textContent).toContain('亢龙有悔')
    expect(el.querySelectorAll('details').length).toBe(0) // 宪法：无行内折叠
    clickNext(el)
    await nextTick()
    // 步骤 2 = interpret（注解步）：历代注家 + 逐字/转述标签（传组默认展开，含今按分组）
    expect(el.querySelector('.zy-step-count')?.textContent).toContain('2/5')
    expect(el.textContent).toContain('《象传》（小象）')
    expect(el.textContent).toContain('逐字原注')
    // 一次只显示一个步骤：注释步的 token 视图不与注解步同屏
    expect(el.querySelectorAll('.zy-step').length).toBe(1)
  })

  it('③ Escape 退出 emit focus-change false，并恢复 body 滚动', async () => {
    const el = await mountBench()
    await openFirstLesson(el)
    expect(focusEvents.at(-1)).toBe(true)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(el.querySelector('.zy-immersive')).toBeFalsy()
    expect(focusEvents.at(-1)).toBe(false)
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('④ 进度写独立 zy localStorage key（绝不混用其他科目 key）', async () => {
    const el = await mountBench()
    await openFirstLesson(el)
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('yz.'))
    expect(keys.length).toBeGreaterThanOrEqual(1)
    for (const k of keys) expect(k.startsWith('yz.zhouyi.')).toBe(true)
  })

  it('⑤ 资料 Tab：/paths 下发的术语/书目/文库/disclaimer 全部有处渲染（死数据 = 断言拦下）', async () => {
    const el = await mountBench()
    await vi.waitFor(() => expect(el.querySelectorAll('.zy-overview-tabs button').length).toBe(3))
    // 术语索引
    ;(el.querySelectorAll('.zy-overview-tabs button')[1] as HTMLElement).click()
    await nextTick()
    expect(el.textContent).toContain('爻')
    expect(el.textContent).toContain('组成卦的每一横')
    // 参考书目：书目 + 文库摘录 + 立场声明
    ;(el.querySelectorAll('.zy-overview-tabs button')[2] as HTMLElement).click()
    await nextTick()
    expect(el.textContent).toContain('周易正义')
    expect(el.textContent).toContain('乾：元，亨，利，贞。')
    expect(el.textContent).toContain('传统文献与民俗文化研究展示')
    // 切回课程主线：路径列表仍在
    ;(el.querySelectorAll('.zy-overview-tabs button')[0] as HTMLElement).click()
    await nextTick()
    expect(el.querySelectorAll('.zy-track').length).toBe(2)
  })

  it('⑥ 总览层列表子项禁止 flex 收缩（否则被压扁且 scrollHeight==clientHeight 滚不动）', () => {
    const src = BENCH_SRC()
    expect(src).toContain('.zy-list > * { flex: 0 0 auto; }')
    expect(src).toContain('overflow-y: auto')
    expect(src).toContain('min-height: 0')
    // 收口到唯一出口，不能靠逐个子项补 flex-shrink
    expect(src).not.toContain('.zy-track { border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); overflow: hidden; flex-shrink: 0; }')
  })

  it('⑦ 左栏焦点联动：nonce 变化强制重新应用 + 展开后滚动到可视区（用户实报「课卡点不了」）', () => {
    const src = BENCH_SRC()
    expect(src).toContain('focusNonce')
    expect(src).toContain('watch(() => [props.focusTrack, props.focusNonce]')
    expect(src).toContain('scrollIntoView')
    expect(src).toContain(':data-track-id="t.id"')
  })
})
