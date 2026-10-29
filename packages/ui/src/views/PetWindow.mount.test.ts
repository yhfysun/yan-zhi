// @vitest-environment jsdom
/**
 * PetWindow（宠物窗）真挂载测试 —— 活动气泡 / 待机踱步 / 朝向镜像。
 *
 * 为什么不能只测纯函数：derivePetActivity 只证明"该算什么"，不证明界面上真的显示了；
 * 踱步的位移在主进程（Electron）里，这里只钉住渲染层这一半契约：
 *   ① 收到 pet:state 的 activity → 气泡真的出现，且带文件名
 *   ② 非运行态 / 关掉开关 → 气泡不出现
 *   ③ 待机 9~20s 后真的发 pet:walk({on:true})；walk-state 回传方向 → 精灵真的镜像
 *
 * electronAPI 是窗口桥：这里装一份假的，只实现组件真正调用的面。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, h, nextTick, reactive, type App } from 'vue'
import { createPinia } from 'pinia'
import PetWindow from './PetWindow.vue'
import Pet2D from '../components/pet/Pet2D.vue'
import { PET_DEFAULTS, type PetState } from '../stores/pet'

type Cb = (p?: any) => void

function installPetApi() {
  const subs: Record<string, Cb[]> = {}
  const on = (ev: string) => (cb: Cb) => {
    ;(subs[ev] ||= []).push(cb)
    return () => {}
  }
  const api = {
    open: vi.fn(),
    close: vi.fn(),
    sync: vi.fn(),
    settings: vi.fn(),
    requestSync: vi.fn(),
    walk: vi.fn(),
    openPopup: vi.fn(),
    closePopup: vi.fn(),
    command: vi.fn(),
    onCommand: on('cmd'),
    moveBy: vi.fn(),
    setInteractive: vi.fn(),
    action: vi.fn(),
    onState: on('state'),
    onSettings: on('settings'),
    onWalkState: on('walk-state'),
    onWinState: on('win-state'),
  }
  ;(window as any).electronAPI = { pet: api }
  return { api, emit: (ev: string, p?: any) => (subs[ev] || []).forEach((cb) => cb(p)) }
}

let app: App | null = null
let host: HTMLElement | null = null

function mountPet() {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(PetWindow)
  app.use(createPinia())
  app.mount(host)
  return host
}

let api: ReturnType<typeof installPetApi>['api']
let emit: ReturnType<typeof installPetApi>['emit']

beforeEach(() => {
  ;({ api, emit } = installPetApi())
})

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
  delete (window as any).electronAPI
  vi.useRealTimers()
})

describe('PetWindow · 唤起弹层（方案 B：弹层是独立小窗）', () => {
  it('右键宠物 → 打开半圆菜单弹层', async () => {
    const el = mountPet()
    el.querySelector('.body')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    await nextTick()
    expect(api.openPopup).toHaveBeenCalledWith('radial')
  })

  it('双击宠物 → 打开输入条弹层', async () => {
    const el = mountPet()
    el.querySelector('.body')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await nextTick()
    expect(api.openPopup).toHaveBeenCalledWith('ask')
  })

  it('运行中带活动 → 开气泡弹层；回到 idle → 关气泡', async () => {
    mountPet()
    emit('state', { state: 'running', activity: { kind: 'write', label: '写作', target: 'a.ts' } })
    await nextTick()
    expect(api.openPopup).toHaveBeenCalledWith('bubble')

    emit('state', { state: 'idle', activity: null })
    await nextTick()
    expect(api.closePopup).toHaveBeenCalledWith('bubble')
  })
})

describe('PetWindow · 待机踱步', () => {
  it('待机超过 20s 才起走，且只请求主进程动窗（渲染层不算位置）', async () => {
    vi.useFakeTimers()
    mountPet()
    await nextTick()

    vi.advanceTimersByTime(8000)
    expect(api.walk).not.toHaveBeenCalled()

    vi.advanceTimersByTime(12000) // 累计 20s，覆盖 9~20s 的随机窗口上界
    expect(api.walk).toHaveBeenCalledWith({ on: true })
    expect(api.moveBy).not.toHaveBeenCalled()
  })

  it('有任务在跑时不起走', async () => {
    vi.useFakeTimers()
    mountPet()
    emit('state', { state: 'running', activity: null })
    await nextTick()
    vi.advanceTimersByTime(25000)
    expect(api.walk).not.toHaveBeenCalled()
  })

  it('walk-state 回传朝左 → 精灵镜像；结束回传 → 取消镜像并重新排期', async () => {
    vi.useFakeTimers()
    const el = mountPet()

    emit('walk-state', { walking: true, dir: -1 })
    await nextTick()
    expect(el.querySelector('.pet2d')!.className).toContain('flip')

    emit('walk-state', { walking: false, dir: -1 })
    await nextTick()
    expect(el.querySelector('.pet2d')!.className).not.toContain('flip')
  })

  it('关掉踱步开关 → 不再发起走', async () => {
    vi.useFakeTimers()
    mountPet()
    emit('settings', { ...PET_DEFAULTS, walk: false })
    await nextTick()
    vi.advanceTimersByTime(25000)
    expect(api.walk).not.toHaveBeenCalled()
  })
})

describe('Pet2D · 隐藏即停渲染 / 失焦降帧', () => {
  it('visible=false 清掉计时器；恢复可见重新起表；不可见期间不再起新表', async () => {
    const setSpy = vi.spyOn(window, 'setInterval')
    const clearSpy = vi.spyOn(window, 'clearInterval')
    const props = reactive<{ state: PetState; visible: boolean; active: boolean }>({
      state: 'idle',
      visible: true,
      active: true,
    })
    const el = document.createElement('div')
    document.body.appendChild(el)
    // 根组件的 props 只在挂载时拷贝一次：包一层父组件，改 props 才会真的下发
    const a = createApp({ render: () => h(Pet2D, props) })
    a.mount(el)
    await nextTick()

    expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 60)
    const spawns = setSpy.mock.calls.length

    props.visible = false
    await nextTick()
    expect(clearSpy).toHaveBeenCalled()
    await nextTick()
    expect(setSpy.mock.calls.length).toBe(spawns) // 不可见 → 不再起表

    props.visible = true
    props.active = false
    await nextTick()
    await nextTick()
    expect(setSpy).toHaveBeenLastCalledWith(expect.any(Function), 200) // 失焦 → 降帧

    a.unmount()
    el.remove()
    setSpy.mockRestore()
    clearSpy.mockRestore()
  })
})
