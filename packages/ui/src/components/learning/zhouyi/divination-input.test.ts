/**
 * 测算台表单 → 推演引擎字段契约（正式测试类，不是临时脚本）。
 *
 * 为什么不只测源码锚点：曾经 buildInput() 把表单状态名原样透传（tosses/zuo/xiang/
 * element1/element2/date），引擎读的是 coins/sitting/facing/a,b/year,month,day ——
 * 六爻、玄空、择日静默忽略用户输入，五行直接抛错，而「代码里明明有」锚点断言全绿。
 * 这里把纯函数输出真的喂给 runDivination，验证「填了生效」而非「写了字段」。
 */
import { describe, it, expect } from 'vitest'
import { runDivination, type DivinationMethod } from '@yan-zhi/shared'
import { buildDivinationInput, toInt, parseDivinationUtterance, type DivinationFormState } from './divination-input'

const base: DivinationFormState = {
  year: '2026', month: '11', day: '15', hour: '9',
  tosses: ['', '', '', '', '', ''],
  birthYear: '1990', gender: '男',
  yun: '8', zuo: '', xiang: '',
  element1: '', element2: '',
  date: '', seed: '', caseId: '',
  ceziChars: '', ceziStrokes: '',
  dream: '',
  personName: '', nameStrokes: '',
}

function form(patch: Partial<DivinationFormState> = {}): DivinationFormState {
  return { ...base, tosses: [...base.tosses], ...patch }
}

function run(method: DivinationMethod, f: DivinationFormState) {
  return runDivination({ method, input: buildDivinationInput(method, f), seed: 20261115 })
}

describe('buildDivinationInput · 八法字段契约', () => {
  it('toInt 只接受整数字符串', () => {
    expect(toInt('2026')).toBe(2026)
    expect(toInt('')).toBeNull()
    expect(toInt('1.5')).toBeNull()
    expect(toInt('abc')).toBeNull()
    // Vue 对 type=number 的 v-model 会自动转 number
    expect(toInt(2026)).toBe(2026)
    expect(toInt(1.5)).toBeNull()
  })

  it('八法输出键与 divination.ts 读取键逐一对齐', () => {
    expect(buildDivinationInput('meihua', form())).toEqual({ year: 2026, month: 11, day: 15, hour: 9 })
    expect(buildDivinationInput('sizhu', form())).toEqual({ year: 2026, month: 11, day: 15, hour: 9 })
    expect(buildDivinationInput('dayan', form())).toEqual({})
    expect(buildDivinationInput('bazhai', form())).toEqual({ year: 1990, gender: '男' })
    expect(buildDivinationInput('liuyao', form({ tosses: ['背', '字', '背', '字', '背', '字'] })))
      .toEqual({ coins: '背字背字背字' })
    expect(buildDivinationInput('xuankong', form({ zuo: '坎', xiang: '离' })))
      .toEqual({ yun: 8, sitting: '坎', facing: '离' })
    expect(buildDivinationInput('wuxing', form({ element1: '金', element2: '木' })))
      .toEqual({ a: '金', b: '木' })
    expect(buildDivinationInput('zari', form({ date: '2026-11-15' })))
      .toEqual({ year: 2026, month: 11, day: 15 })
  })

  it('六个方法把表单输出喂给真引擎都不抛错', () => {
    const cases: Array<[DivinationMethod, DivinationFormState]> = [
      ['meihua', form()],
      ['dayan', form()],
      ['liuyao', form({ tosses: ['背', '字', '背', '字', '背', '字'] })],
      ['sizhu', form()],
      ['bazhai', form()],
      ['xuankong', form({ zuo: '坎', xiang: '离' })],
      ['wuxing', form({ element1: '金', element2: '木' })],
      ['zari', form({ date: '2026-11-15' })],
    ]
    for (const [method, f] of cases) {
      expect(() => run(method, f), `${method} 推演不应抛错`).not.toThrow()
      expect(run(method, f).steps.length).toBeGreaterThan(0)
    }
  })

  it('同 seed 换输入结果必须不同：证明用户填的值真的进了引擎', () => {
    expect(JSON.stringify(run('liuyao', form({ tosses: ['背', '背', '背', '背', '背', '背'] }))))
      .not.toBe(JSON.stringify(run('liuyao', form({ tosses: ['字', '字', '字', '字', '字', '字'] }))))
    expect(JSON.stringify(run('xuankong', form({ zuo: '坎', xiang: '离' }))))
      .not.toBe(JSON.stringify(run('xuankong', form({ zuo: '离', xiang: '坎' }))))
    expect(JSON.stringify(run('wuxing', form({ element1: '金', element2: '木' }))))
      .not.toBe(JSON.stringify(run('wuxing', form({ element1: '木', element2: '水' }))))
    expect(JSON.stringify(run('zari', form({ date: '2026-11-15' }))))
      .not.toBe(JSON.stringify(run('zari', form({ date: '2026-11-16' }))))
  })

  it('五行关系按用户所选两行给出古籍规则口径', () => {
    const result = run('wuxing', form({ element1: '金', element2: '木' }))
    expect(result.steps.some((s) => s.output.includes('金克木'))).toBe(true)
  })

  it('事类命中后 caseId 随推演入参下发；未选事类时不带该键', () => {
    expect(buildDivinationInput('liuyao', form({ tosses: ['背', '背', '背', '背', '背', '背'], caseId: 'case_qiucai' })))
      .toEqual({ coins: '背背背背背背', caseId: 'case_qiucai' })
    expect(buildDivinationInput('liuyao', form({ tosses: ['背', '背', '背', '背', '背', '背'] })))
      .not.toHaveProperty('caseId')
    expect(buildDivinationInput('dayan', form({ caseId: 'case_yixi' })))
      .toEqual({ caseId: 'case_yixi' })
    // 空白字符串视同未选
    expect(buildDivinationInput('zari', form({ date: '2026-11-15', caseId: '  ' })))
      .toEqual({ year: 2026, month: 11, day: 15 })
  })

  it('杂占三法的入参组装', () => {
    expect(buildDivinationInput('cezi', form({ ceziChars: '明' }))).toEqual({ chars: '明', strokes: 0 })
    expect(buildDivinationInput('cezi', form({ ceziStrokes: '8' }))).toEqual({ chars: '', strokes: 8 })
    expect(buildDivinationInput('jiemeng', form({ dream: '梦见掉牙' }))).toEqual({ dream: '梦见掉牙' })
    expect(buildDivinationInput('xingming', form({ personName: '王小明' }))).toEqual({ name: '王小明', strokes: '' })
    expect(buildDivinationInput('xingming', form({ nameStrokes: '4,3,4' }))).toEqual({ name: '', strokes: '4,3,4' })
  })

  it('三个杂占法把表单输出喂给真引擎都不抛错（显式笔画路径）', () => {
    expect(() => run('cezi', form({ ceziStrokes: '8' }))).not.toThrow()
    expect(() => run('jiemeng', form({ dream: '梦见大水' }))).not.toThrow()
    expect(() => run('xingming', form({ nameStrokes: '4,3,4' }))).not.toThrow()
    expect(run('cezi', form({ ceziStrokes: '8' })).steps.length).toBeGreaterThan(0)
    expect(run('jiemeng', form({ dream: '梦见大水' })).verdict?.label).toContain('占梦')
  })

  it('一句话解析：梦见 / 测字 / 生辰 / 事类口语', () => {
    const dream = parseDivinationUtterance('昨天梦见掉牙了')
    expect(dream?.method).toBe('jiemeng')
    expect(dream?.patch.dream).toContain('掉牙')

    const cezi = parseDivinationUtterance('帮我测个「明」字')
    expect(cezi?.method).toBe('cezi')
    expect(cezi?.patch.ceziChars).toBe('明')

    const bazi = parseDivinationUtterance('农历不管，公历 1988.3.24 13:30 男 看看生辰八字')
    expect(bazi?.method).toBe('sizhu')
    expect(bazi?.patch.year).toBe('1988')
    expect(bazi?.patch.month).toBe('3')
    expect(bazi?.patch.day).toBe('24')
    expect(bazi?.patch.hour).toBe('13')
    expect(bazi?.patch.gender).toBe('男')

    const meihua = parseDivinationUtterance('2026.11.15 9 占一卦')
    expect(meihua?.method).toBe('meihua')

    const yixi = parseDivinationUtterance('想搬家，哪天合适')
    expect(yixi?.method).toBe('zari')
    expect(yixi?.caseId).toBe('case_yixi')

    const gongming = parseDivinationUtterance('想问问前程')
    expect(gongming?.caseId).toBe('case_gongming')

    // 「今天天气不错」其实命中「天时」事类（天气）——属于合理误触发；真正无关的句子才返回 null
    expect(parseDivinationUtterance('帮我写一份周报')).toBeNull()
    expect(parseDivinationUtterance('')).toBeNull()
  })
})
