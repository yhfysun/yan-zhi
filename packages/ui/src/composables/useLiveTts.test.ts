// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { pickInstalledPacks } from './useLiveTts'

describe('pickInstalledPacks', () => {
  it('只保留已安装且有 id 的语音包', () => {
    const list = [
      { id: 'zh-female', name: '中文女声', installed: true },
      { id: 'zh-male', name: '中文男声', installed: false },
      { id: '', name: '空 id', installed: true },
      { name: '没有 id', installed: true },
      null,
      'garbage',
    ]
    expect(pickInstalledPacks(list)).toEqual([{ id: 'zh-female', name: '中文女声' }])
  })

  it('非数组输入返回空列表，不抛错', () => {
    expect(pickInstalledPacks(null)).toEqual([])
    expect(pickInstalledPacks({ items: [] })).toEqual([])
  })

  it('缺 name 时用 id 兜底', () => {
    expect(pickInstalledPacks([{ id: 'p1', installed: true }])).toEqual([{ id: 'p1', name: 'p1' }])
  })
})
