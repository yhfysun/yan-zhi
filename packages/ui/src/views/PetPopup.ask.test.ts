// @vitest-environment jsdom
/**
 * PetPopup 快问条的「工作目录 → 会话」三态绑定：
 *   ① 不绑定目录 → 不改主窗现状，新建会话
 *   ② 只绑目录   → 发送时切到该目录再新建会话
 *   ③ 绑目录+会话 → 发进那个会话追问
 * 另外钉住：选择要跨弹层记住（localStorage），别关掉就忘。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia } from 'pinia'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { kind: 'ask' } }) }))

import PetPopup from './PetPopup.vue'

type Cb = (p?: any) => void

function installPetApi() {
  const subs: Record<string, Cb[]> = {}
  const on = (ev: string) => (cb: Cb) => {
    ;(subs[ev] ||= []).push(cb)
    return () => {}
  }
  const api = {
    action: vi.fn(),
    closePopup: vi.fn(),
    openPopup: vi.fn(),
    requestSync: vi.fn(),
    resizePopup: vi.fn(),
    popupReady: vi.fn(),
    onState: on('state'),
    onSettings: on('settings'),
  }
  ;(window as any).electronAPI = { pet: api }
  return { api, emit: (ev: string, p?: any) => (subs[ev] || []).forEach((cb) => cb(p)) }
}

const PAYLOAD = {
  spaces: [
    { id: 's1', name: '项目甲' },
    { id: 's2', name: '项目乙' },
  ],
  spaceConvs: [
    { id: 'c1', title: '竞品分析', spaceId: 's1' },
    { id: 'c2', title: '周报草稿', spaceId: 's2' },
  ],
  spaceId: 's2',
  agents: [{ id: 'a1', name: '办公助手' }],
  agentId: 'a1',
}

let api: ReturnType<typeof installPetApi>['api']
let emit: ReturnType<typeof installPetApi>['emit']
let app: App | null = null
let host: HTMLElement | null = null

function mountAsk() {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(PetPopup)
  app.use(createPinia())
  app.mount(host)
  return host
}

const label = (el: HTMLElement) => el.querySelector('.ask-dir-label')!.textContent?.trim()
const dirItems = (el: HTMLElement) => [...el.querySelectorAll('.dir-list .dir-item')] as HTMLElement[]
const click = async (node: HTMLElement) => {
  node.click()
  await nextTick()
}
async function send(el: HTMLElement, text: string) {
  const input = el.querySelector('.ask input[placeholder*="派个活"]') as HTMLInputElement
  input.value = text
  input.dispatchEvent(new Event('input'))
  await nextTick()
  ;(el.querySelector('.ask-go') as HTMLElement).click()
  await nextTick()
}

beforeEach(() => {
  localStorage.clear()
  ;({ api, emit } = installPetApi())
})

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
  delete (window as any).electronAPI
})

describe('PetPopup · 快问条三态绑定', () => {
  it('默认不绑定目录，发送时不带目录也不带会话', async () => {
    const el = mountAsk()
    emit('state', PAYLOAD)
    await nextTick()

    expect(label(el)).toBe('不绑定目录')
    await send(el, '整理一下周报')
    expect(api.action).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ask', text: '整理一下周报', convId: '', spaceId: '' })
    )
  })

  it('只绑目录：菜单里有「不绑定会话」，发送带该目录且不带会话', async () => {
    const el = mountAsk()
    emit('state', PAYLOAD)
    await nextTick()

    await click(el.querySelector('.ask-dir') as HTMLElement)
    const root = dirItems(el)
    expect(root[0].textContent).toContain('不绑定目录')
    await click(root[1]) // 项目甲

    const convs = dirItems(el)
    expect(convs[0].textContent).toContain('不绑定会话')
    await click(convs[0])
    expect(label(el)).toBe('项目甲')

    await send(el, '跑个竞品分析')
    expect(api.action).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ask', convId: '', spaceId: 's1' })
    )
  })

  it('绑目录+会话：标签显示「目录 › 会话」，发送带会话 id', async () => {
    const el = mountAsk()
    emit('state', PAYLOAD)
    await nextTick()

    await click(el.querySelector('.ask-dir') as HTMLElement)
    await click(dirItems(el)[1]) // 项目甲
    await click(dirItems(el)[1]) // 竞品分析（第 0 项是「不绑定会话」）
    expect(label(el)).toBe('项目甲 › 竞品分析')

    await send(el, '继续抓淘宝')
    expect(api.action).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ask', convId: 'c1', spaceId: '' })
    )
  })

  it('可以再切回「不绑定目录」', async () => {
    const el = mountAsk()
    emit('state', PAYLOAD)
    await nextTick()

    await click(el.querySelector('.ask-dir') as HTMLElement)
    await click(dirItems(el)[1])
    await click(dirItems(el)[0]) // 不绑定会话
    expect(label(el)).toBe('项目甲')

    await click(el.querySelector('.ask-dir') as HTMLElement)
    await click(dirItems(el)[0]) // 不绑定目录
    expect(label(el)).toBe('不绑定目录')
  })

  it('两个下拉互斥：开一个就收起另一个', async () => {
    const el = mountAsk()
    emit('state', PAYLOAD)
    await nextTick()

    await click(el.querySelector('.ask-dir') as HTMLElement)
    expect(el.querySelector('.dir-pop')).toBeTruthy()

    await click(el.querySelector('.ask-agent') as HTMLElement)
    expect(el.querySelector('.dir-pop')).toBeNull()
    expect(el.querySelector('.agent-pop')).toBeTruthy()

    await click(el.querySelector('.ask-dir') as HTMLElement)
    expect(el.querySelector('.agent-pop')).toBeNull()
    expect(el.querySelector('.dir-pop')).toBeTruthy()
  })

  it('选择会记住：重开弹层从 localStorage 恢复', async () => {
    const el = mountAsk()
    emit('state', PAYLOAD)
    await nextTick()

    await click(el.querySelector('.ask-dir') as HTMLElement)
    await click(dirItems(el)[1])
    await click(dirItems(el)[1])
    expect(JSON.parse(localStorage.getItem('yz:pet:ask-target')!)).toEqual({ spaceId: 's1', convId: 'c1' })

    // 模拟关掉弹层再打开
    app!.unmount()
    host!.remove()
    ;({ api, emit } = installPetApi())
    const el2 = mountAsk()
    emit('state', PAYLOAD)
    await nextTick()
    expect(label(el2)).toBe('项目甲 › 竞品分析')
  })

  it('绑定的会话被删掉 → 降级成只绑目录', async () => {
    localStorage.setItem('yz:pet:ask-target', JSON.stringify({ spaceId: 's1', convId: 'gone' }))
    const el = mountAsk()
    emit('state', PAYLOAD)
    await nextTick()
    expect(label(el)).toBe('项目甲')
  })
})
