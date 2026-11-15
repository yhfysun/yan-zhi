// @vitest-environment jsdom
/**
 * CompositionStudio（编曲台）真挂载测试 —— docs/音乐双方向重构方案-2026-11-15.md §八。
 *
 * 三种编曲模式（手动 / 自动 / AI）+ 播放 + 保存 + 记到笔记是 Vue 运行时行为，纯函数测不出来。
 * 白名单 mock：api/client（按路径分发）、useScoreAudio（记录调用）、AudioPlayer（stub，无真播放）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import CompositionStudio from './CompositionStudio.vue'
import type { Score } from '../../utils/learning/score-render'

const audio = vi.hoisted(() => ({
  playNote: vi.fn(),
  playSequence: vi.fn(() => ({ stop: vi.fn() })),
  stopAll: vi.fn(),
}))
vi.mock('../../composables/useScoreAudio', () => ({
  useScoreAudio: () => ({ playNote: audio.playNote, playSequence: audio.playSequence, stopAll: audio.stopAll }),
}))

vi.mock('../media/AudioPlayer.vue', () => ({
  default: { name: 'AudioPlayer', template: '<div class="audio-player-stub" />' },
}))

const autoScore = {
  id: 'comp_auto_7',
  title: '自动编曲 #7',
  track: 'western',
  clef: 'treble',
  key: 'C',
  meter: [4, 4],
  mode: { kind: 'major', tonic: 'C' },
  notes: [
    { step: 'C', octave: 4, beats: 1 }, { step: 'E', octave: 4, beats: 1 },
    { step: 'G', octave: 4, beats: 2 }, { step: 'C', octave: 5, beats: 4 },
  ],
}

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
vi.mock('../../api/client', () => ({ api }))

beforeEach(() => {
  document.body.innerHTML = ''
  audio.playNote.mockClear()
  audio.playSequence.mockClear()
  api.get.mockImplementation(async (url: string) => {
    if (String(url).includes('/learning/music/compositions')) return { data: [] }
    return { data: null }
  })
  api.post.mockReset()
  api.patch.mockReset()
})

async function mountStudio(): Promise<HTMLElement> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app: App = createApp({ setup: () => () => h(CompositionStudio) })
  app.mount(el)
  await vi.waitFor(() => expect(el.querySelector('.cs-main')).toBeTruthy())
  // 等 onMounted 的作品列表加载与 resetEditor 落定（grid 才有 7 行）
  await vi.waitFor(() => expect(el.querySelectorAll('.cs-grid-row').length).toBeGreaterThan(0))
  return el
}

/** 等 .cs-btn 从 disabled 变为可点（Vue 异步更新后 disabled 属性才移除） */
async function clickEnabled(el: HTMLElement, text: string): Promise<void> {
  await vi.waitFor(() => {
    const btn = [...el.querySelectorAll('.cs-btn')].find((b) => b.textContent === text) as HTMLButtonElement | undefined
    expect(btn, `找不到按钮「${text}」`).toBeTruthy()
    expect(btn!.disabled, `按钮「${text}」仍 disabled`).toBe(false)
  })
  ;([...el.querySelectorAll('.cs-btn')].find((b) => b.textContent === text) as HTMLElement).click()
}

describe('CompositionStudio · 挂载契约', () => {
  it('★ 方向分段 + 格子行数按方向（western 7 行 / traditional 5 行）', async () => {
    const el = await mountStudio()
    expect(el.querySelectorAll('.cs-grid-row')).toHaveLength(7)
    ;(el.querySelector('.cs-track-switch button:nth-child(2)') as HTMLElement).click()
    await vi.waitFor(() => expect(el.querySelectorAll('.cs-grid-row')).toHaveLength(5))
  })

  it('★ 课程送谱（seedScore）：载入标题/方向/格子投影 —— 写奏步 ↔ 编曲台双向', async () => {
    const seed: Score = {
      id: 'lesson_mus_w_compose1', title: '七音格子第一次落音 · 我的编曲', track: 'traditional',
      clef: 'treble', key: 'C 宫', meter: [4, 4], mode: { kind: 'pentatonic', tonic: 'gong' },
      notes: [{ step: 'C', octave: 4, beats: 1 }, { step: 'E', octave: 4, beats: 1 }, { step: 'G', octave: 4, beats: 1 }],
    }
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app: App = createApp({ setup: () => () => h(CompositionStudio, { seedScore: seed }) })
    app.mount(el)
    await vi.waitFor(() => expect(el.querySelectorAll('.cs-grid-row')).toHaveLength(5)) // 方向随谱切到 traditional
    expect((el.querySelector('.cs-title') as HTMLInputElement).value).toBe(seed.title)
    expect(el.querySelectorAll('.cs-cell.active').length).toBe(3)
    app.unmount()
    el.remove()
  })

  it('★ 手动模式：落块即发声（step+octave 对象入参）', async () => {
    const el = await mountStudio()
    ;(el.querySelector('.cs-cell[data-row="0"]') as HTMLElement)?.click()
      ?? (el.querySelector('.cs-grid-row:first-child .cs-cell') as HTMLElement).click()
    expect(audio.playNote).toHaveBeenCalledWith(expect.objectContaining({ step: 'C', octave: 4 }), 0.5)
  })

  it('★ 自动编曲：产物谱面显示（SVG 音符数）、fallbackNote 清空', async () => {
    api.post.mockImplementation(async (url: string) => {
      if (String(url).includes('/compose/auto')) return { data: { score: autoScore, spec: {}, origin: 'auto' } }
      return { data: null }
    })
    const el = await mountStudio()
    const autoBtn = [...el.querySelectorAll('.cs-btn')].find((b) => b.textContent === '自动编曲') as HTMLElement
    autoBtn.click()
    await vi.waitFor(() => expect(el.querySelectorAll('.cs-staff ellipse').length + el.querySelectorAll('.cs-staff .cs-filled').length).toBeGreaterThan(0))
    expect(el.querySelector('.cs-fallback')).toBeFalsy()
    expect((el.querySelector('.cs-title') as HTMLInputElement).value).toBe('自动编曲 #7')
  })

  it('★ AI 辅助：fallbackReason 如实标注（不静默串体系）', async () => {
    api.post.mockImplementation(async (url: string) => {
      if (String(url).includes('/compose/assist')) {
        return { data: { score: autoScore, spec: {}, origin: 'auto', fallbackReason: '旋律出现五声外音 F#5' } }
      }
      return { data: null }
    })
    const el = await mountStudio()
    const input = el.querySelector('.cs-ai-input') as HTMLInputElement
    input.value = '来段五声小曲'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await clickEnabled(el, 'AI 辅助编曲')
    await vi.waitFor(() => expect(el.querySelector('.cs-fallback')?.textContent ?? '').toContain('五声外音'))
  })

  it('★ 保存作品：POST /compositions 带 track + score.notes（谱面=格子投影）', async () => {
    const post = vi.fn(async () => ({ data: { id: 'comp_new' } }))
    api.post.mockImplementation(post)
    const el = await mountStudio()
    ;(el.querySelector('.cs-grid-row:first-child .cs-cell') as HTMLElement).click()
    await nextTick()
    await clickEnabled(el, '保存作品')
    await vi.waitFor(() => expect(post).toHaveBeenCalled())
    const [url, body] = post.mock.calls[0] as unknown as [string, { track: string; score: { notes: Array<{ step: string }> } }]
    expect(url).toBe('/learning/music/compositions')
    expect(body.track).toBe('western')
    expect(body.score.notes.length).toBeGreaterThan(0)
  })

  it('★ 渲染真音频：POST /compose/render → audioUrl 状态（AudioPlayer stub 收到）', async () => {
    api.post.mockImplementation(async (url: string) => {
      if (String(url).includes('/compose/render')) return { data: { url: '/api/generated/audios/x.m4a' } }
      return { data: null }
    })
    const el = await mountStudio()
    ;(el.querySelector('.cs-grid-row:first-child .cs-cell') as HTMLElement).click()
    await nextTick()
    await clickEnabled(el, '渲染成音频')
    await vi.waitFor(() => expect(el.querySelector('.cs-audio')).toBeTruthy())
  })

  it('★ 记到笔记：POST /notes/media（SVG）+ 片段含谱面图与方向', async () => {
    const post = vi.fn(async (_url: string, body: { name: string }) => ({ data: { url: `/api/generated/images/${encodeURIComponent(body.name)}` } }))
    api.post.mockImplementation(post)
    const el = await mountStudio()
    ;(el.querySelector('.cs-grid-row:first-child .cs-cell') as HTMLElement).click()
    await nextTick()
    await clickEnabled(el, '记到笔记')
    await vi.waitFor(() => expect(post).toHaveBeenCalled())
    const [url, body] = post.mock.calls[0] as unknown as [string, { name: string; base64: string }]
    expect(url).toBe('/notes/media')
    expect(body.name).toContain('.svg')
  })
})
