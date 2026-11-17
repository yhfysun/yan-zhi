// @vitest-environment jsdom
/**
 * MusicWorkbench（音乐谱面工作台）v2 真挂载测试 —— docs/音乐双方向重构方案-2026-11-15.md §八。
 *
 * 为什么不能只测纯函数：方向切换、记法切换、点音符发声、编曲格子落音、记到笔记、Escape 退出
 * 是 Vue 运行时行为 —— score-render/useScoreAudio 的单测证明不了接线正确。
 *
 * 白名单 mock（范式照 Learning.mount.test.ts）：
 *   - ../../api/client：按路径分发假数据（paths / lessons/:id / scores/:id / lesson-progress / notes/media）
 *   - ../../composables/useScoreAudio：记录 playNote / playSequence 调用（无声环境降级口径）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import MusicWorkbench from './MusicWorkbench.vue'

// ── mock：谱面音频（记录调用，不真发声） ─────────────────────────────────────────
const audio = vi.hoisted(() => ({
  playNote: vi.fn(),
  playSequence: vi.fn(() => ({ stop: vi.fn() })),
  stopAll: vi.fn(),
}))
vi.mock('../../composables/useScoreAudio', () => ({
  useScoreAudio: () => ({ playNote: audio.playNote, playSequence: audio.playSequence, stopAll: audio.stopAll }),
}))

const testLesson = {
  id: 'mus_test_read',
  kind: 'read',
  title: '五线谱与高音谱号',
  goal: '认识线和间',
  minutes: 10,
  level: '识谱',
  track: 'western',
  steps: ['listen', 'recognize', 'write', 'play', 'check'],
  scoreId: 'score_test',
  quickCheck: {
    question: 'fa 对应哪个音名？',
    options: ['F', 'E', 'G'],
    answer: 'F',
    explanation: 'do=C re=D mi=E fa=F。',
  },
}
const testScore = {
  id: 'score_test',
  title: '测试小曲（节选）',
  track: 'western',
  clef: 'treble',
  key: 'C',
  meter: [4, 4],
  mode: { kind: 'major', tonic: 'C' },
  notes: [
    { step: 'C', octave: 4, beats: 1 },
    { step: 'C', octave: 4, beats: 1 },
    { step: 'G', octave: 4, beats: 1 },
    { step: 'G', octave: 4, beats: 1 },
    { step: 'A', octave: 4, beats: 1 },
    { step: 'A', octave: 4, beats: 1 },
    { step: 'G', octave: 4, beats: 2 },
  ],
}

function baseGet(url: string) {
  if (url.includes('/learning/music/paths')) {
    return { data: { stages: [{ level: '识谱', lessons: [{ id: 'mus_test_read', kind: 'read', title: '五线谱与高音谱号', goal: '认识线和间', minutes: 10, steps: ['listen', 'recognize', 'write', 'play', 'check'], track: 'western' }] }] } }
  }
  if (url.includes('/learning/music/lessons/')) return { data: testLesson }
  if (url.includes('/learning/music/scores/')) return { data: testScore }
  if (url.includes('/learning/lesson-progress')) return { data: { lessonIds: [] } }
  return { data: null }
}

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
vi.mock('../../api/client', () => ({ api }))

/** 挂载并捕获 focus-change / open-studio 事件（包一层函数式根组件接 emit） */
async function mountWorkbench(): Promise<{ el: HTMLElement; focusSpy: ReturnType<typeof vi.fn>; studioSpy: ReturnType<typeof vi.fn> }> {
  const focusSpy = vi.fn()
  const studioSpy = vi.fn()
  const el = document.createElement('div')
  document.body.appendChild(el)
  const focusSpyRef = ref(focusSpy)
  const studioSpyRef = ref(studioSpy)
  const app: App = createApp({
    setup() {
      return () => h(MusicWorkbench, {
        onFocusChange: (v: boolean) => focusSpyRef.value(v),
        onOpenStudio: (s: unknown) => studioSpyRef.value(s),
      })
    },
  })
  app.mount(el)
  await nextTick()
  return { el, focusSpy, studioSpy }
}

async function enterImmersive(el: HTMLElement): Promise<void> {
  api.get.mockImplementation(async (url: string) => baseGet(url))
  await vi.waitFor(() => expect(el.querySelector('.mw-lesson')).toBeTruthy())
  ;(el.querySelector('.mw-lesson') as HTMLElement).click()
  await vi.waitFor(() => expect(el.querySelector('.mw-focus')).toBeTruthy())
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  audio.playNote.mockClear()
  audio.playSequence.mockClear()
  audio.stopAll.mockClear()
  api.get.mockImplementation(async (url: string) => baseGet(url))
  api.post.mockReset()
  api.post.mockImplementation(async () => ({}))
})

describe('MusicWorkbench v2 · 挂载契约', () => {
  it('★ 方向切换：分段按钮换路线请求（track=traditional），进度 key 按方向隔离', async () => {
    localStorage.setItem('yz.learning.music.western.completed.v1', JSON.stringify({ mus_w_done: true }))
    const { el } = await mountWorkbench()
    await vi.waitFor(() => expect(el.querySelector('.mw-track-switch')).toBeTruthy())
    ;(el.querySelector('.mw-track-switch button:nth-child(2)') as HTMLElement).click()
    await vi.waitFor(() => {
      const calls = api.get.mock.calls.map((c) => String(c[0]))
      expect(calls.some((u) => u.includes('/learning/music/paths?track=traditional'))).toBe(true)
    })
    // 切回 western：本地进度 key 不串
    const done = JSON.parse(localStorage.getItem('yz.learning.music.western.completed.v1') || '{}') as Record<string, boolean>
    expect(done.mus_w_done).toBe(true)
  })

  it('★ 记法切换只换渲染器：标签变化、切回五线谱后 SVG 音符数不变（C 大调口径）', async () => {
    const { el } = await mountWorkbench()
    await enterImmersive(el)
    expect(el.querySelectorAll('.mw-staff-note')).toHaveLength(7)
    expect(el.querySelector('.mw-label-row')).toBeFalsy()
    ;(el.querySelector('.mw-notation-tabs button[data-mode="num"]') as HTMLElement).click()
    await nextTick()
    const cards = el.querySelectorAll('.mw-label-card')
    expect(cards).toHaveLength(7)
    expect([...cards].map((c) => c.textContent)).toEqual(['1', '1', '5', '5', '6', '6', '5'])
    expect(el.querySelector('.mw-staff')).toBeFalsy()
    ;(el.querySelector('.mw-notation-tabs button[data-mode="staff"]') as HTMLElement).click()
    await nextTick()
    expect(el.querySelectorAll('.mw-staff-note')).toHaveLength(7)
  })

  it('★ 调性控件分域：western 显示「调性」（C/G/F 大调、A 小调），无宫调式选项', async () => {
    const { el } = await mountWorkbench()
    await enterImmersive(el)
    const label = el.querySelector('.mw-mode-label')
    expect(label?.textContent).toContain('调性')
    const options = [...el.querySelectorAll('.mw-mode-select option')].map((o) => o.textContent)
    expect(options).toContain('C 大调')
    expect(options.join()).not.toContain('调式')
  })

  it('★ 点音符与点音名块调用 playNote（step+octave 对象入参）', async () => {
    const { el } = await mountWorkbench()
    await enterImmersive(el)
    ;(el.querySelector('.mw-staff-note') as Element).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(audio.playNote).toHaveBeenCalledWith(expect.objectContaining({ step: 'C', octave: 4 }), 0.6)
    await nextTick()
    expect(el.querySelector('.mw-staff-note.active')).toBeTruthy()
    audio.playNote.mockClear()
    // 认步音名块：第 0 行 = C
    const railButtons = el.querySelectorAll('.mw-step-rail button')
    ;(railButtons[1] as HTMLElement).click()
    await nextTick()
    ;(el.querySelector('.mw-block[data-row="0"]') as HTMLElement).click()
    expect(audio.playNote).toHaveBeenCalledWith(expect.objectContaining({ step: 'C', octave: 4 }), 0.6)
  })

  it('★ 编曲格子（western 7 行）：落块即发声，试听按列取最靠下的已点行', async () => {
    const { el } = await mountWorkbench()
    await enterImmersive(el)
    const railButtons = el.querySelectorAll('.mw-step-rail button')
    ;(railButtons[2] as HTMLElement).click()
    await nextTick()
    expect(el.querySelector('.mw-grid')).toBeTruthy()
    expect(el.querySelectorAll('.mw-grid-row')).toHaveLength(7)
    ;(el.querySelector('.mw-grid-cell[data-row="0"][data-col="0"]') as HTMLElement).click()
    ;(el.querySelector('.mw-grid-cell[data-row="6"][data-col="0"]') as HTMLElement).click()
    ;(el.querySelector('.mw-grid-cell[data-row="2"][data-col="1"]') as HTMLElement).click()
    expect(audio.playNote).toHaveBeenCalledWith(expect.objectContaining({ step: 'C', octave: 4 }), 0.5)
    expect(audio.playNote).toHaveBeenCalledWith(expect.objectContaining({ step: 'B', octave: 4 }), 0.5)
    audio.playSequence.mockClear()
    ;(el.querySelector('.mw-grid-play') as HTMLElement).click()
    const events = (audio.playSequence.mock.calls[0] as unknown as [Array<{ step: string }>])[0]
    expect(events.map((e) => e.step)).toEqual(['B', 'E']) // 每列取最靠下行
  })

  it('★ 在编曲台打开：写步格子 → emit open-studio（Score 含 track/mode/notes）并退出沉浸台', async () => {
    const { el, studioSpy, focusSpy } = await mountWorkbench()
    await enterImmersive(el)
    const railButtons = el.querySelectorAll('.mw-step-rail button')
    ;(railButtons[2] as HTMLElement).click()
    await nextTick()
    ;(el.querySelector('.mw-grid-cell[data-row="0"][data-col="0"]') as HTMLElement).click()
    ;(el.querySelector('.mw-grid-cell[data-row="2"][data-col="1"]') as HTMLElement).click()
    ;(el.querySelector('.mw-grid-play[data-action="open-studio"]') as HTMLElement).click()
    await nextTick()
    expect(studioSpy).toHaveBeenCalledTimes(1)
    const score = studioSpy.mock.calls[0][0] as { track: string; mode: { kind: string }; notes: Array<{ step: string }> }
    expect(score.track).toBe('western')
    expect(score.mode).toEqual({ kind: 'major', tonic: 'C' })
    expect(score.notes.map((n) => n.step)).toEqual(['C', 'E'])
    expect(el.querySelector('.mw-focus')).toBeFalsy() // 送谱后退出沉浸台
    expect(focusSpy).toHaveBeenLastCalledWith(false)
  })

  it('★ 记到笔记：谱面 SVG 序列化 → POST /notes/media → 预填片段含谱面图', async () => {
    const post = vi.fn(async (_url: string, body: { name: string }) => ({ data: { url: `/api/generated/images/${encodeURIComponent(body.name)}` } }))
    api.post.mockImplementation(post)
    const { el } = await mountWorkbench()
    await enterImmersive(el)
    ;(el.querySelector('.mw-note') as HTMLElement).click()
    await vi.waitFor(() => expect(post).toHaveBeenCalled())
    const [url, body] = post.mock.calls[0] as unknown as [string, { name: string; base64: string }]
    expect(url).toBe('/notes/media')
    expect(body.name).toContain('.svg')
    expect(body.base64.length).toBeGreaterThan(0)
  })

  it('★ 沉浸台 fixed 全屏（锁滚动 + 源码锚点）+ Escape 退出并 emit focus-change', async () => {
    const { el, focusSpy } = await mountWorkbench()
    await enterImmersive(el)
    expect(document.body.style.overflow).toBe('hidden')
    const source = readFileSync(resolve(process.cwd(), 'src/components/learning/MusicWorkbench.vue'), 'utf8')
    expect(source).toMatch(/\.mw-focus\s*\{[^}]*position: fixed/)
    expect(source).toMatch(/\.mw-focus\s*\{[^}]*bottom: var\(--app-statusbar-h, 0px\)/)
    expect(source).toMatch(/\.mw-focus\s*\{[^}]*z-index: 3000/)
    expect(focusSpy).toHaveBeenCalledWith(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(el.querySelector('.mw-focus')).toBeFalsy()
    expect(document.body.style.overflow).toBe('')
    expect(focusSpy).toHaveBeenLastCalledWith(false)
    expect(audio.stopAll).toHaveBeenCalled()
  })

  it('★ 跨端读回：server lessonIds 并集合并进本地（本地不清空）', async () => {
    localStorage.setItem('yz.learning.music.western.completed.v1', JSON.stringify({ mus_local_only: true }))
    api.get.mockImplementation(async (url: string) => {
      if (url.includes('/learning/lesson-progress')) return { data: { lessonIds: ['mus_test_read', 'mus_server_only'] } }
      return baseGet(url)
    })
    const { el } = await mountWorkbench()
    await vi.waitFor(() => {
      const done = JSON.parse(localStorage.getItem('yz.learning.music.western.completed.v1') || '{}') as Record<string, boolean>
      expect(done.mus_server_only).toBe(true)
      expect(done.mus_test_read).toBe(true)
      expect(done.mus_local_only).toBe(true)
    })
  })
})
