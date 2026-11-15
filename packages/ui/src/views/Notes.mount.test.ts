// @vitest-environment jsdom
/**
 * Notes（笔记工作区）真挂载测试（docs/笔记功能方案-2026-11-14.md §6）。
 *
 * 为什么不能只测纯函数：三栏骨架真的渲染、到期红条真的出现、计划时间 chip 的
 * 「逾期红/今日橙/未来灰」真的落 class、新建真的带对 kind —— 是 Vue 运行时行为，
 * 源码锚点证明不了（能真跑就真跑）。
 *
 * 白名单 mock（范式照 Learning.mount.test.ts）：
 *   - ../api/client：按路径分发假数据，POST/PATCH 收调用参数
 *   - vue-router：useRoute 返回空 query，useRouter 收 push/replace
 *   - ../stores/auth：isLoggedIn=true（免登录门禁分支）
 * MarkdownPreview 真挂载（markdown-it 纯本地渲染，不碰网络）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia } from 'pinia'
import Notes from './Notes.vue'
import { planChipState, planChipLabel, toLocalInputValue, fromLocalInputValue } from '../utils/notePlan'

// ── api mock（vi.hoisted 防 TDZ）───────────────────────────────────────────
const { state, apiGet, apiPost, apiPatch, apiDelete, resetApi } = vi.hoisted(() => {
  const state = {
    postCalls: [] as Array<{ url: string; body: unknown }>,
    patchCalls: [] as Array<{ url: string; body: unknown }>,
    deleteCalls: [] as string[],
  }
  const apiGet = vi.fn(async (url: string) => {
    if (url.includes('/notes/categories')) {
      return { data: [
        { id: 'c_en', name: '英语', sort: 0, count: 1 },
        { id: '__none__', name: '未分类', sort: 9007199254740991, count: 0 },
      ] }
    }
    if (url.includes('/notes/reminders/due')) {
      return { data: { items: [{ id: 'n_plan_overdue', text: '【英语】复习计划（12-01 09:00）' }] } }
    }
    if (url.includes('/notes/notes')) {
      const now = Date.now()
      return { data: [
        { id: 'n_pin', kind: 'note', categoryId: 'c_en', categoryName: '英语', title: '置顶笔记', content: '**要点**', source: 'manual', pinned: true, starred: false, planAt: null, remindAt: null, remindDone: false, createdAt: now, updatedAt: now },
        { id: 'n_plan_overdue', kind: 'plan', categoryId: null, categoryName: null, title: '复习计划', content: '单词复盘', source: 'manual', pinned: false, starred: true, planAt: now - 3600_000, remindAt: now - 3600_000, remindDone: false, createdAt: now, updatedAt: now },
        { id: 'n_today', kind: 'plan', categoryId: null, categoryName: null, title: '今日计划', content: '', source: 'manual', pinned: false, starred: false, planAt: now + 600_000, remindAt: null, remindDone: false, createdAt: now, updatedAt: now },
        { id: 'n_future', kind: 'plan', categoryId: null, categoryName: null, title: '未来计划', content: '', source: 'manual', pinned: false, starred: false, planAt: now + 7 * 86400_000, remindAt: null, remindDone: false, createdAt: now, updatedAt: now },
      ] }
    }
    return { data: null }
  })
  const apiPost = vi.fn(async (url: string, body?: unknown) => {
    state.postCalls.push({ url, body })
    if (url.includes('/star')) return { data: { starred: true } }
    if (url.includes('/pin')) return { data: { pinned: true } }
    if (url.includes('/reminders/ack')) return { data: { acked: 1 } }
    if (url.includes('/notes/notes')) {
      return { data: { id: 'n_new', kind: (body as { kind: string }).kind === 'plan' ? 'plan' : 'note', categoryId: null, categoryName: null, title: (body as { title: string }).title, content: '', source: 'manual', pinned: false, starred: false, planAt: null, remindAt: null, remindDone: false, createdAt: Date.now(), updatedAt: Date.now() } }
    }
    if (url.includes('/categories')) return { data: { id: 'c_new', name: (body as { name: string }).name, sort: 0, count: 0 } }
    return { data: null }
  })
  const apiPatch = vi.fn(async (url: string, body: unknown) => {
    state.patchCalls.push({ url, body })
    return { data: { id: url.split('/').pop(), title: (body as { title: string }).title, content: (body as { content: string }).content, categoryName: (body as { categoryName: string }).categoryName || null, planAt: (body as { planAt: number | null }).planAt, remindAt: null, kind: 'note', categoryId: null, source: 'manual', pinned: false, starred: false, remindDone: false, createdAt: 0, updatedAt: Date.now() } }
  })
  const apiDelete = vi.fn(async (url: string) => {
    state.deleteCalls.push(url)
    return { data: { ok: true } }
  })
  const resetApi = () => {
    state.postCalls = []; state.patchCalls = []; state.deleteCalls = []
    apiGet.mockClear(); apiPost.mockClear(); apiPatch.mockClear(); apiDelete.mockClear()
  }
  return { state, apiGet, apiPost, apiPatch, apiDelete, resetApi }
})

vi.mock('../api/client', () => ({
  api: { get: apiGet, post: apiPost, patch: apiPatch, delete: apiDelete },
}))

const push = vi.fn(async () => {})
const replace = vi.fn(async () => {})
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} as Record<string, unknown> }),
  useRouter: () => ({ push, replace }),
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({ isLoggedIn: true }),
}))

const mounted: Array<{ host: HTMLElement; unmount: () => void }> = []
async function mountAndTrack(): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(Notes as unknown as App)
  app.use(createPinia())
  app.mount(host)
  mounted.push({ host, unmount: () => { try { app.unmount() } catch { /* ignore */ } } })
  await nextTick()
  return host
}

beforeEach(() => {
  resetApi()
  vi.mocked(apiGet).mockClear()
})
afterEach(() => {
  for (const m of mounted) m.unmount()
  mounted.length = 0
  document.body.innerHTML = ''
})

describe('两栏骨架与列表渲染（左=窄导航，右=记录/查看主区）', () => {
  it('两栏容器存在，列表行渲染标题与分类 chip', async () => {
    const el = await mountAndTrack()
    expect(el.querySelector('.np-side')).toBeTruthy()
    expect(el.querySelector('.np-main')).toBeTruthy()
    expect(el.querySelector('.np-col-resizer')).toBeTruthy() // 栏宽可拖拽
    const text = el.textContent || ''
    expect(text).toContain('置顶笔记')
    expect(text).toContain('英语')
    expect(text).toContain('★ 收藏')
    expect(text).toContain('未分类')
  })

  it('★ 沉浸态：点列表行选中后「沉浸」按钮展开整屏层（position fixed），退出还原', async () => {
    const el = await mountAndTrack()
    const row = el.querySelector('.np-row') as HTMLElement
    row.click()
    await nextTick()
    const main = el.querySelector('.np-main') as HTMLElement
    expect(main.classList.contains('immersive')).toBe(false)
    const btn = [...el.querySelectorAll('.np-detail-ops button')].find((b) => b.textContent === '沉浸') as HTMLElement
    btn.click()
    await nextTick()
    expect(main.classList.contains('immersive')).toBe(true)
    const exit = [...el.querySelectorAll('.np-detail-ops button')].find((b) => b.textContent === '退出沉浸') as HTMLElement
    exit.click()
    await nextTick()
    expect(main.classList.contains('immersive')).toBe(false)
  })

  it('★ 计划时间 chip 状态色：逾期红 / 今日橙 / 未来灰（class 真落上）', async () => {
    const el = await mountAndTrack()
    expect(el.querySelector('.np-chip-overdue')).toBeTruthy()
    expect(el.querySelector('.np-chip-today')).toBeTruthy()
    expect(el.querySelector('.np-chip-future')).toBeTruthy()
  })

  it('★ 到期提醒红条出现（Web 端无系统通知的呈现面）', async () => {
    const el = await mountAndTrack()
    expect(el.querySelector('.np-due-bar')).toBeTruthy()
    expect(el.textContent).toContain('1 条到期提醒')
  })
})

describe('主区形态三态（编辑 / 双栏 / 查看，2026-11-15 用户定调）', () => {
  async function selectFirstRow(el: HTMLElement) {
    const row = el.querySelector('.np-row') as HTMLElement
    row.click()
    await nextTick()
  }

  it('★ 三个切换按钮存在；默认查看态（单栏预览、无 textarea）', async () => {
    const el = await mountAndTrack()
    await selectFirstRow(el)
    const labels = [...el.querySelectorAll('.np-mode-btn')].map((b) => b.textContent)
    expect(labels).toEqual(['编辑', '双栏', '查看'])
    const body = el.querySelector('.np-main-body') as HTMLElement
    expect(body.classList.contains('mode-view')).toBe(true)
    expect(body.querySelector('.np-editor')).toBeNull()
    expect(body.querySelector('.np-editor-preview')).toBeTruthy()
  })

  it('★ 切「编辑」：满宽 textarea（mode-edit）；切「双栏」：分屏（mode-split）', async () => {
    const el = await mountAndTrack()
    await selectFirstRow(el)
    const body = el.querySelector('.np-main-body') as HTMLElement
    const modeBtn = (label: string) => [...el.querySelectorAll('.np-mode-btn')].find((b) => b.textContent === label) as HTMLElement
    modeBtn('编辑').click()
    await nextTick()
    expect(body.classList.contains('mode-edit')).toBe(true)
    expect(body.querySelector('.np-editor')).toBeTruthy()
    expect(body.querySelector('.np-editor-preview')).toBeNull()
    modeBtn('双栏').click()
    await nextTick()
    expect(body.classList.contains('mode-split')).toBe(true)
    expect(body.querySelector('.np-editor')).toBeTruthy()
    expect(body.querySelector('.np-editor-preview')).toBeTruthy()
  })

  it('★ 编辑后切「查看」：自动保存（PATCH 真发出，且带改动后的内容）', async () => {
    const el = await mountAndTrack()
    await selectFirstRow(el)
    const modeBtn = (label: string) => [...el.querySelectorAll('.np-mode-btn')].find((b) => b.textContent === label) as HTMLElement
    modeBtn('编辑').click()
    await nextTick()
    const editor = el.querySelector('.np-editor') as HTMLTextAreaElement
    editor.value = '改动后的正文内容'
    editor.dispatchEvent(new Event('input'))
    await nextTick()
    state.patchCalls.length = 0
    modeBtn('查看').click()
    // 自动保存是 async（PATCH → 回写 → 切形态），等最终态到位再断言
    await vi.waitFor(() => {
      expect((el.querySelector('.np-main-body') as HTMLElement).classList.contains('mode-view')).toBe(true)
    })
    const call = state.patchCalls.find((c) => c.url.includes('/notes/notes/'))
    expect(call).toBeTruthy()
    expect((call!.body as { content: string }).content).toBe('改动后的正文内容')
  })
})

describe('交互参数', () => {
  it('新建计划：POST /notes/notes 带 kind=plan', async () => {
    const el = await mountAndTrack()
    const buttons = [...el.querySelectorAll('button')]
    const planBtn = buttons.find((b) => b.textContent === '+ 计划')!
    planBtn.click()
    await vi.waitFor(() => {
      const call = state.postCalls.find((c) => c.url.includes('/notes/notes') && (c.body as { kind?: string })?.kind === 'plan')
      expect(call).toBeTruthy()
    })
  })

  it('新建笔记默认 kind=note', async () => {
    const el = await mountAndTrack()
    const noteBtn = [...el.querySelectorAll('button')].find((b) => b.textContent === '+ 笔记')!
    noteBtn.click()
    await vi.waitFor(() => {
      const call = state.postCalls.find((c) => c.url.includes('/notes/notes') && (c.body as { kind?: string })?.kind === 'note')
      expect(call).toBeTruthy()
    })
  })

  it('到期提醒「知道了」→ ack 带 ids', async () => {
    const el = await mountAndTrack()
    const ackBtn = el.querySelector('.np-due-bar button') as HTMLElement
    ackBtn.click()
    await vi.waitFor(() => {
      const call = state.postCalls.find((c) => c.url.includes('/reminders/ack'))
      expect(call).toBeTruthy()
      expect((call!.body as { ids: string[] }).ids).toContain('n_plan_overdue')
    })
  })
})

describe('计划时间纯函数（chip 判定与本地时间转换）', () => {
  const now = new Date(2026, 10, 14, 12, 0).getTime() // 2026-11-14 12:00 本地

  it('逾期 / 今日 / 未来三态边界（已过时刻一律逾期，含今天早些时候）', () => {
    expect(planChipState(now - 3600_000, now)).toBe('overdue')
    expect(planChipState(new Date(2026, 10, 14, 0, 0).getTime(), now)).toBe('overdue')
    expect(planChipState(new Date(2026, 10, 14, 12, 1).getTime(), now)).toBe('today')
    expect(planChipState(new Date(2026, 10, 14, 23, 59).getTime(), now)).toBe('today')
    expect(planChipState(new Date(2026, 10, 15, 0, 0).getTime(), now)).toBe('future')
    expect(planChipState(null, now)).toBeNull()
    expect(planChipState(0, now)).toBeNull()
  })

  it('datetime-local 双向转换无损（分钟精度）', () => {
    const ms = new Date(2026, 11, 25, 9, 30).getTime()
    expect(fromLocalInputValue(toLocalInputValue(ms))).toBe(ms)
    expect(toLocalInputValue(null)).toBe('')
    expect(fromLocalInputValue('')).toBeNull()
  })

  it('chip 标签 MM-DD HH:mm', () => {
    expect(planChipLabel(new Date(2026, 11, 25, 9, 5).getTime())).toBe('12-25 09:05')
  })
})
