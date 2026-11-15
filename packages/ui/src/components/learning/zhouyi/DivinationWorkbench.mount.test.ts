// @vitest-environment jsdom
/**
 * DivinationWorkbench（周易 · 测算实践台）真挂载测试。
 *
 * 推演引擎不 mock：runDivination / zhouyiBlockToShapes 是 packages/shared 纯函数，
 * 宿主与测试共用真实现（同 seed 可复现，符合周易课程方案 §6 硬约束 1）。
 *
 * 断言（周易课程方案 §6 五步 + 护栏）：
 *   ① 全屏沉浸契约（源码锚点 fixed/z-index:3000/锁滚动）+ 顶栏四项 + 教学演示标识
 *   ② 梅花易数填年月日时真跑：推演步渲染规则与出处，结果与纯函数直跑一致（唯一实现）
 *   ③ 逐步推进一次一步、无行内折叠；Escape 退出 emit focus-change false
 *   ④ 隐私：记录不落输入原值（源码锚点 + localStorage 检查）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, nextTick, h, defineComponent, type App } from 'vue'
import { createPinia } from 'pinia'
import { runDivination } from '@yan-zhi/shared'
import DivinationWorkbench from './DivinationWorkbench.vue'

const BENCH_SRC = () => readFileSync(resolve(__dirname, 'DivinationWorkbench.vue'), 'utf8')

const mountedApps: App[] = []

async function mountBench(): Promise<HTMLElement> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const Host = defineComponent({
    setup() {
      return () => h(DivinationWorkbench, {})
    },
  })
  const app: App = createApp(Host)
  // 组件内含对话测算（useChatStore/usePlatformStore），真 pinia + jsdom localStorage
  app.use(createPinia())
  mountedApps.push(app)
  app.mount(el)
  await nextTick()
  return el
}

function setNumberInputs(el: HTMLElement, values: string[]): void {
  const inputs = Array.from(el.querySelectorAll('.dv-form input[type="number"]')) as HTMLInputElement[]
  values.forEach((v, i) => {
    if (!inputs[i]) return
    inputs[i].value = v
    inputs[i].dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function clickPrimary(el: HTMLElement): Promise<void> {
  const btn = el.querySelector('.dv-primary') as HTMLElement
  expect(btn, '找不到主按钮').toBeTruthy()
  btn.click()
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  for (const app of mountedApps) app.unmount()
  mountedApps.length = 0
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('DivinationWorkbench · 挂载契约', () => {
  it('① 中栏内嵌契约（源码锚点）+ 教学演示标识 + 无折叠；不再是全屏弹窗（用户实报「实战为啥要弹窗」）', async () => {
    const source = BENCH_SRC()
    // 不再是 fixed 全屏弹窗：不锁 body 滚动、不遮盖学习页
    expect(source).not.toContain('position: fixed')
    expect(source).not.toContain('z-index: 3000')
    expect(source).not.toContain("document.body.style.overflow = 'hidden'")
    // 内嵌工作台：高度链由宿主 .lp-col-mid:has(> .dv-root) 供足
    expect(source).toContain('.dv-root')
    expect(source).toContain('height: 100%')
    expect(source).toContain('民俗文化体验 · 教学演示')

    const el = await mountBench()
    expect(el.querySelector('.dv-root')).toBeTruthy()
    expect(el.querySelector('.dv-banner')?.textContent).toContain('民俗文化体验 · 教学演示')
    expect(el.querySelector('.dv-head')?.textContent).toContain('周易测算')
    expect(el.querySelector('.dv-count')?.textContent).toContain('/5')
    expect(el.querySelectorAll('.dv-step').length).toBe(1)
    expect(el.querySelectorAll('details').length).toBe(0)
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('② 梅花易数真跑：填年月日时 → 推演步渲染规则与出处；结果与纯函数直跑一致', async () => {
    const el = await mountBench()
    setNumberInputs(el, ['2026', '11', '15', '9'])
    await clickPrimary(el) // 开始推演
    await nextTick()
    // 进入推演步：步骤 2/5（输入 → 推演 → 原文 → 复盘 → 记录）
    expect(el.querySelector('.dv-count')?.textContent).toContain('2/5')
    const text = el.querySelector('.dv-paper')?.textContent ?? ''
    expect(text).toContain('梅花易数')
    // 唯一实现：组件结果与 shared 直跑同 seed 一致
    const direct = runDivination({ method: 'meihua', input: { year: 2026, month: 11, day: 15, hour: 9 }, seed: 20260202 })
    expect(direct.steps.length).toBeGreaterThanOrEqual(4)
    for (const s of direct.steps) {
      expect(s.rule.length).toBeGreaterThan(0)
      expect(s.sourceRef.work.length).toBeGreaterThan(0)
      expect(s.sourceRef.license).toBe('公版')
    }
    expect(direct.canonRefs.every((c) => c.annotations.length >= 1 && c.interpretations.length >= 1)).toBe(true)
    expect(direct.disclaimer).toContain('教学演示')
    // 逐步推进（下一步）：仍在推演屏内逐条，不折叠
    ;(el.querySelector('.dv-primary') as HTMLElement).click()
    await nextTick()
    expect(el.querySelectorAll('.dv-step').length).toBe(1)
  })

  it('③ Escape 不再退出（工作台常驻中栏）；记录不落输入原值（源码锚点）', async () => {
    const el = await mountBench()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    // 内嵌工作台不会被 Escape 卸载（离开用 Tab 切换）；body 滚动从不被锁
    expect(el.querySelector('.dv-root')).toBeTruthy()
    expect(document.body.style.overflow).not.toBe('hidden')
    // 隐私锚点：持久化函数不得序列化输入对象（源码级断言，防止回归）
    const src = BENCH_SRC()
    expect(src).not.toContain('JSON.stringify(spec.input)')
    expect(src).not.toContain('JSON.stringify(buildDivinationInput')
  })

  it('④ 推演一完成就落盘，不必走到第 5 步；记录不含输入原值', async () => {
    const el = await mountBench()
    setNumberInputs(el, ['2026', '11', '15', '9'])
    await clickPrimary(el) // 输入 → 推演（2/5），刻意不走到记录步
    expect(el.querySelector('.dv-count')?.textContent).toContain('2/5')
    const raw = localStorage.getItem('yz.zhouyi.divination.v1') || '{}'
    const store = JSON.parse(raw)
    expect(store.meihua?.length).toBe(1)
    expect(store.meihua[0].summary.length).toBeGreaterThan(0)
    // 脱敏输入：年保留、月日时打码；断语 label 落盘
    expect(store.meihua[0].inputMasked).toBe('2026-**-** **时')
    expect(store.meihua[0].verdictLabel?.length).toBeGreaterThan(0)
    // 隐私契约：原始 input 字段名绝不落盘（mask 是派生摘要，非 input 对象）
    expect(raw).not.toContain('"year"')
    expect(raw).not.toContain('"month"')
    expect(raw).not.toContain('"hour"')
  })

  it('⑤ 输入页可直接进记录页，点条目展开详情（结果断语 + 摘要 + 脱敏输入）', async () => {
    localStorage.setItem('yz.zhouyi.divination.v1', JSON.stringify({
      meihua: [{ method: 'meihua', methodLabel: '梅花易数', summary: '上卦乾下卦坤', seed: 1, createdAt: '2026-11-15T00:00:00.000Z', inputMasked: '2026-**-** **时', verdictLabel: '体用比和' }],
      bazhai: [{ method: 'bazhai', methodLabel: '八宅命卦', summary: '命卦为坎', seed: 2, createdAt: '2026-11-15T01:00:00.000Z', inputMasked: '1990 年 · 男', verdictLabel: '东西四命' }],
    }))
    const el = await mountBench()
    const entryBtn = [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('演练记录')) as HTMLElement
    expect(entryBtn, '输入页找不到演练记录入口').toBeTruthy()
    expect(entryBtn.textContent).toContain('2')
    entryBtn.click()
    await nextTick()
    const text = el.querySelector('.dv-paper')?.textContent ?? ''
    expect(text).toContain('全部演练记录（2 条）')
    expect(text).toContain('梅花易数')
    expect(text).toContain('八宅命卦')
    // 点击条目 → 展开详情：结果断语、摘要、脱敏输入都要看得见
    const item = [...el.querySelectorAll('.dv-history-item')][0] as HTMLElement
    item.click()
    await nextTick()
    const detail = el.querySelector('.dv-history-detail')?.textContent ?? ''
    expect(detail).toContain('结果 ·')
    expect(detail).toContain('输入（脱敏）')
    expect(detail).toContain('1990 年 · 男')
    // 没有 result 时「上一步」应回输入页，不能退到不存在的规则复盘
    const prevBtn = [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === '上一步') as HTMLElement
    expect(prevBtn, '记录页找不到上一步').toBeTruthy()
    prevBtn.click()
    await nextTick()
    expect(el.querySelector('.dv-count')?.textContent).toContain('1/5')
  })

  it('⑥ 事类条：热门 chips 命中后切到推荐占法并显示古法口径', async () => {
    const el = await mountBench()
    const chip = [...el.querySelectorAll('.dv-case-chips button')]
      .find((b) => b.textContent?.trim() === '搬家') as HTMLElement
    expect(chip, '找不到「搬家」chip').toBeTruthy()
    chip.click()
    await nextTick()
    // 搬家 → 移徙；推荐占法首选 zari（简易择日）
    expect(el.querySelector('.dv-case-picked')?.textContent).toContain('移徙')
    expect(el.querySelector('.dv-case-guide')?.textContent).toContain('鬼爻乱动')
    expect(el.querySelector('.dv-case-guide')?.textContent).toContain('钦定协纪辨方书')
    expect((el.querySelector('.dv-method.is-active') as HTMLElement)?.textContent).toContain('简易择日')
  })

  it('⑦ 事类搜索：输入「姻缘」列出婚姻事类并给用神口径', async () => {
    const el = await mountBench()
    const input = el.querySelector('.dv-case-input') as HTMLInputElement
    input.value = '姻缘'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    const list = el.querySelector('.dv-case-list')?.textContent ?? ''
    expect(list).toContain('婚姻')
    ;([...el.querySelectorAll('.dv-case-item')] as HTMLElement[])
      .find((b) => b.textContent?.includes('婚姻'))!.click()
    await nextTick()
    expect(el.querySelector('.dv-case-picked')?.textContent).toContain('事类 · 婚姻')
    expect(el.querySelector('.dv-case-guide')?.textContent).toContain('卜筮正宗')
    // 选中事类后起卦方法切到六爻（婚姻推荐首位）
    expect((el.querySelector('.dv-method.is-active') as HTMLElement)?.textContent).toContain('六爻纳甲')
  })
})
