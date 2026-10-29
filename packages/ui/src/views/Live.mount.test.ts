// @vitest-environment jsdom
/**
 * 直播页真挂载测试 —— 开播/下播/字幕/弹幕这一圈 UI 契约。
 *
 * 为什么不能只测 store：store 只证明"该不该播"，不证明界面真的换了状态。
 * 这里钉住的是用户能看到的那几件事：
 *   ① 未开播 → 舞台压着遮罩
 *   ② 点「开播」→ 遮罩消失、字幕上屏、状态变 live
 *   ③ 弹幕进队列 → 舞台真的画出弹幕
 *   ④ 点「下播」→ 遮罩回来、字幕清空
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, type Pinia } from 'pinia'
import Live from './Live.vue'
import { useLiveStore } from '../stores/live'

let app: App | null = null
let host: HTMLElement | null = null
let pinia: Pinia

function mount(): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  pinia = createPinia()
  app = createApp(Live)
  app.use(pinia)
  app.mount(host)
  return host
}

function findButton(text: string): HTMLElement {
  const nodes = Array.from(host!.querySelectorAll('button, el-button'))
  const hit = nodes.find((el) => (el.textContent || '').includes(text))
  if (!hit) throw new Error(`找不到按钮：${text}`)
  return hit as HTMLElement
}

async function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await nextTick()
}

afterEach(() => {
  app?.unmount()
  host?.remove()
  document.body.innerHTML = ''
  app = null
  host = null
})

describe('Live 页面', () => {
  it('未开播时舞台压着遮罩', () => {
    mount()
    expect(host!.querySelector('.live-offline')).toBeTruthy()
    expect(host!.querySelector('.live-caption')).toBeNull()
  })

  it('点开播后遮罩消失、字幕上屏', async () => {
    mount()
    await click(findButton('开播'))
    const live = useLiveStore(pinia)

    expect(live.status).toBe('live')
    expect(host!.querySelector('.live-offline')).toBeNull()
    expect(host!.querySelector('.live-caption')?.textContent).toContain('大家好')
    expect(host!.querySelector('.live-tag--on')).toBeTruthy()
  })

  it('切换场景改变出场主播', async () => {
    mount()
    expect(host!.querySelector('.live-avatar')).toBeNull()

    await click(findButton('虚拟人单口'))
    expect(host!.querySelector('.live-avatar')).toBeTruthy()
    expect(host!.querySelector('.live-slot--pet')).toBeNull()

    await click(findButton('虚拟人 + 宠物'))
    expect(host!.querySelector('.live-avatar')).toBeTruthy()
    expect(host!.querySelector('.live-slot--pet')).toBeTruthy()

    await click(findButton('宠物主播'))
    expect(host!.querySelector('.live-avatar')).toBeNull()
    expect(host!.querySelector('.live-slot--pet')).toBeTruthy()
  })

  it('画面场景都可用并渲染采集层', async () => {
    mount()
    expect((findButton('任务实录') as HTMLButtonElement).disabled).toBe(false)
    expect((findButton('游戏解说') as HTMLButtonElement).disabled).toBe(false)

    await click(findButton('游戏解说'))
    expect(host!.querySelector('.live-capture')).toBeTruthy()
    expect(host!.querySelector('.live-slot--pet')).toBeTruthy()

    await click(findButton('任务实录'))
    expect(host!.querySelector('.live-capture')).toBeTruthy()
    expect(host!.querySelector('.live-slot--avatar')).toBeTruthy()
    // 直播工作区入口：一键开任务执行窗（不含侧边栏的采集目标）
    expect(findButton('打开任务执行窗')).toBeTruthy()
  })

  it('开播前没有录制/推流按钮，开播后出现', async () => {
    mount()
    expect(() => findButton('录制')).toThrow()
    expect(() => findButton('推流')).toThrow()
    await click(findButton('开播'))
    expect(findButton('录制').textContent).toContain('录制')
    expect(findButton('推流').textContent).toContain('推流')
  })

  it('弹幕进队列后舞台画出弹幕', async () => {
    mount()
    const live = useLiveStore(pinia)
    live.start()
    live.pushDanmaku('主播好')
    await nextTick()

    const dm = host!.querySelectorAll('.live-dm')
    expect(dm.length).toBe(1)
    expect(dm[0].textContent).toContain('主播好')
  })

  it('下播后遮罩回来、字幕清空', async () => {
    mount()
    await click(findButton('开播'))
    const live = useLiveStore(pinia)
    expect(live.caption).not.toBe('')

    await click(findButton('下播'))
    expect(live.status).toBe('ended')
    expect(live.caption).toBe('')
    expect(host!.querySelector('.live-offline')).toBeTruthy()
    // jsdom 不跑 transition：离场节点会停在 leave 态，真浏览器 200ms 后才移除
    const cap = host!.querySelector('.live-caption') as HTMLElement | null
    expect(cap === null || cap.className.includes('leave')).toBe(true)
  })
})
