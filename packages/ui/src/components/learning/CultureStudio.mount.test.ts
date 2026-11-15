// @vitest-environment jsdom
/**
 * CultureStudio（传统文化 · 创作台）真挂载测试。
 *
 * mock 范式照 CultureWorkbench.mount.test.ts。评分引擎 scanCoupletFree / scanPoem / pingzeLine
 * 走 @yan-zhi/shared 真实现（不 mock，判分口径已有 scansion.test.ts 钉死）；
 * NoteQuickCreateDialog 打成轻 mock（渲染 data-title / data-category，供预填断言）。
 *
 * 断言：
 *   ① 两个子 Tab（对句 / 写诗）渲染
 *   ② 对句「雨/风」评分 → score 100 + summary
 *   ③ 对句字数不等 → 「字数要相等」提示
 *   ④ 写诗（静夜思四句）→ rhymeKey='ang' 且 rhymeOk 通过 + 逐字平仄标注渲染
 *   ⑤ 保存作品 → localStorage yz.learning.culture.poems.v1 写入
 *   ⑥ 「记到笔记」打开弹窗且预填 title（首句）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, nextTick, h, type App } from 'vue'
import CultureStudio from './culture/CultureStudio.vue'

// 笔记弹窗轻 mock：visible 时渲染一个带 data-title / data-category 的占位节点（不走 Teleport / api）
vi.mock('../notes/NoteQuickCreateDialog.vue', () => ({
  default: {
    props: {
      visible: { type: Boolean, default: false },
      title: { type: String, default: '' },
      content: { type: String, default: '' },
      categoryName: { type: String, default: '' },
    },
    render(this: { visible: boolean; title?: string; content?: string; categoryName?: string }) {
      if (!this.visible) return null
      return h(
        'div',
        { class: 'nqc-mock', 'data-title': this.title ?? '', 'data-category': this.categoryName ?? '' },
        this.content ?? '',
      )
    },
  },
}))

const POEMS_KEY = 'yz.learning.culture.poems.v1'

/** 已挂载的 app 实例：beforeEach 统一卸载，防止跨用例泄漏 */
const mountedApps: App[] = []

async function mountStudio(): Promise<HTMLElement> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app: App = createApp(CultureStudio)
  mountedApps.push(app)
  app.mount(el)
  await nextTick()
  await nextTick()
  return el
}

function setInput(el: HTMLElement, sel: string, value: string): void {
  const input = el.querySelector(sel) as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
}

function click(el: HTMLElement, sel: string): void {
  ;(el.querySelector(sel) as HTMLElement).click()
}

async function switchToPoemTab(el: HTMLElement): Promise<void> {
  const tab = [...el.querySelectorAll('.cul-st-tab')].find((b) => b.textContent?.trim() === '写诗') as HTMLElement
  tab.click()
  await nextTick()
}

/** 填静夜思四句并点评分（写诗 Tab 下） */
async function scoreJingYeSi(el: HTMLElement): Promise<void> {
  await switchToPoemTab(el)
  const lines = ['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡']
  const inputs = [...el.querySelectorAll('.cul-st-poem-line')] as HTMLInputElement[]
  expect(inputs.length).toBe(4)
  inputs.forEach((inp, i) => {
    inp.value = lines[i]
    inp.dispatchEvent(new Event('input'))
  })
  await nextTick()
  click(el, '.cul-st-poem-score')
  await nextTick()
}

beforeEach(() => {
  for (const app of mountedApps) app.unmount()
  mountedApps.length = 0
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('CultureStudio · 挂载契约', () => {
  it('① 渲染两个子 Tab（对句 / 写诗），默认落在对句', async () => {
    const el = await mountStudio()
    const tabs = [...el.querySelectorAll('.cul-st-tab')].map((b) => b.textContent?.trim())
    expect(tabs).toEqual(['对句', '写诗'])
    expect(el.querySelector('.cul-st-upper')).toBeTruthy()
    expect(el.querySelector('.cul-st-poem-line')).toBeFalsy()
  })

  it('② 对句「雨/风」评分 → score 100 显示，summary 出现', async () => {
    const el = await mountStudio()
    setInput(el, '.cul-st-upper', '雨')
    setInput(el, '.cul-st-lower', '风')
    click(el, '.cul-st-score-btn')
    await nextTick()
    expect((el.querySelector('.cul-st-score-num') as HTMLElement).textContent).toContain('100')
    expect(el.querySelector('.cul-st-summary')?.textContent).toContain('好对子')
    // 逐字平仄标注：上下联各一排「平/仄」小徽标
    expect(el.querySelectorAll('.cul-st-tone-chars i').length).toBe(2)
  })

  it('③ 对句字数不等（风来花自舞 / 雪）→ 提示「字数要相等」', async () => {
    const el = await mountStudio()
    setInput(el, '.cul-st-upper', '风来花自舞')
    setInput(el, '.cul-st-lower', '雪')
    click(el, '.cul-st-score-btn')
    await nextTick()
    expect(el.querySelector('.cul-st-summary')?.textContent).toContain('字数要相等')
    expect(el.querySelector('.cul-st-checks li.bad')?.textContent).toContain('5 / 1')
  })

  it('④ 写诗（静夜思四句）→ rhymeKey=ang 且押韵通过 + 逐字平仄标注渲染', async () => {
    const el = await mountStudio()
    await scoreJingYeSi(el)
    const rhyme = el.querySelector('.cul-st-rhyme') as HTMLElement
    expect(rhyme.textContent).toContain('ang')
    expect(rhyme.textContent).toContain('通过')
    // 逐字平仄标注：四句每字一个小字标注（未知标「？」）
    const toneChars = el.querySelectorAll('.cul-st-poem-tone-ch')
    expect(toneChars.length).toBe(20)
    expect([...toneChars].every((c) => ['平', '仄', '轻', '？'].includes(c.textContent?.trim() ?? ''))).toBe(true)
    // 口径小字必须出现
    expect(el.querySelector('.cul-st-caliber')?.textContent).toContain('按普通话近似口径评分')
  })

  it('⑤ 保存作品 → 写入独立 localStorage key yz.learning.culture.poems.v1', async () => {
    const el = await mountStudio()
    await scoreJingYeSi(el)
    click(el, '.cul-st-save')
    await nextTick()
    const raw = localStorage.getItem(POEMS_KEY)
    expect(raw).toBeTruthy()
    const list = JSON.parse(raw!) as Array<{ id: string; form: string; lines: string[]; score: number; at: string }>
    expect(list.length).toBe(1)
    expect(list[0].form).toBe('五言绝句')
    expect(list[0].lines[0]).toBe('床前明月光')
    expect(list[0].score).toBeGreaterThan(0)
    expect(list[0].at.length).toBeGreaterThan(0)
    // 绝不混用其他进度 key
    expect(localStorage.getItem('yz.learning.culture.completed.v1')).toBeNull()
  })

  it('⑥ 「记到笔记」打开弹窗且预填 title（作品首句）与分类「我的创作」', async () => {
    const el = await mountStudio()
    await scoreJingYeSi(el)
    click(el, '.cul-st-note-btn')
    await nextTick()
    const mock = el.querySelector('.nqc-mock') as HTMLElement
    expect(mock).toBeTruthy()
    expect(mock.getAttribute('data-title')).toContain('床前明月光')
    expect(mock.getAttribute('data-category')).toBe('我的创作')
    expect(mock.textContent).toContain('低头思故乡')
    expect(mock.textContent).toContain('评分')
  })
})
