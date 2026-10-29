import { describe, expect, it } from 'vitest'
import { narrateActivity, sameActivity } from './live-narrator'

describe('narrateActivity', () => {
  it('有目标时把目标念出来', () => {
    expect(narrateActivity({ kind: 'read', label: '阅读', target: 'package.json' })).toBe('我读一下 package.json。')
    expect(narrateActivity({ kind: 'search', label: '搜索', target: '天气' })).toBe('我搜一下 天气。')
    expect(narrateActivity({ kind: 'write', label: '写作', target: 'result.md' })).toBe('我把结果写进 result.md。')
  })

  it('没有目标时用兜底句，不会念念出空对象', () => {
    expect(narrateActivity({ kind: 'read', label: '阅读', target: '' })).toBe('我读一下这个文件。')
    expect(narrateActivity({ kind: 'act', label: '操作电脑', target: '' })).toBe('我操作一下。')
    expect(narrateActivity({ kind: 'think', label: '思考', target: '' })).toBe('我理一下思路。')
  })

  it('空活动不产生台词', () => {
    expect(narrateActivity(null)).toBe('')
    expect(narrateActivity(undefined)).toBe('')
  })
})

describe('sameActivity', () => {
  it('kind 与 target 都相同才算同一动作', () => {
    const a = { kind: 'read' as const, label: '阅读', target: 'a.ts' }
    expect(sameActivity(a, { ...a })).toBe(true)
    expect(sameActivity(a, { ...a, target: 'b.ts' })).toBe(false)
    expect(sameActivity(a, { ...a, kind: 'search' })).toBe(false)
  })

  it('两端都为空视为相同（都不该播报）', () => {
    expect(sameActivity(null, null)).toBe(true)
    expect(sameActivity(null, { kind: 'act', label: '操作', target: '' })).toBe(false)
  })
})
