// @vitest-environment node
// 直播弹幕网页抓取 —— 解析层纯函数契约（2026-11-01）。
//
// 为什么只测解析层：抓取链路（浏览器桥 → get_visible_text → ingestDanmaku）
// 全是 IO + 桥依赖，vitest 里无法真跑；能钉住的是「一段可见文本 → 弹幕条目」
// 这层纯函数 —— 它是"平台改版后还认不认得出弹幕"的唯一防线。
import { describe, expect, it } from 'vitest'
import { parseDanmakuLine, parseDanmakuText } from '../src/live-web-source.js'

describe('弹幕行解析 parseDanmakuLine', () => {
  it('「昵称：内容」与「昵称: 内容」都认', () => {
    expect(parseDanmakuLine('小满：主播好厉害')).toEqual({ from: '小满', text: '主播好厉害' })
    expect(parseDanmakuLine('momo: 666')).toEqual({ from: 'momo', text: '666' })
  })

  it('内容里的冒号不被拆散', () => {
    expect(parseDanmakuLine('阿飞：时间：12:30 开打')).toEqual({ from: '阿飞', text: '时间：12:30 开打' })
  })

  it('emoji 昵称不丢', () => {
    expect(parseDanmakuLine('🐟咸鱼：今天吃什么')).toEqual({ from: '🐟咸鱼', text: '今天吃什么' })
  })

  it('纯数字行头不是昵称（人气值等被换行拆出来的碎片）', () => {
    expect(parseDanmakuLine('1234：')).toBeNull()
    expect(parseDanmakuLine('1234')).toBeNull()
  })

  it('界面噪声词开头的行不算弹幕', () => {
    expect(parseDanmakuLine('说点什么…')).toBeNull()
    expect(parseDanmakuLine('人气：1.2万')).toBeNull()
    expect(parseDanmakuLine('点赞：888')).toBeNull()
  })

  it('空行/无冒号行返回 null', () => {
    expect(parseDanmakuLine('')).toBeNull()
    expect(parseDanmakuLine('   ')).toBeNull()
    expect(parseDanmakuLine('这是一句没有冒号的话')).toBeNull()
  })
})

describe('弹幕文本解析 parseDanmakuText', () => {
  it('整页文本里只抽出弹幕行，保序', () => {
    const page = [
      '主播标题：今晚聊AI',
      '人气 1.2万',
      '小满：主播好',
      'momo: 666',
      '说点什么…',
    ].join('\n')
    expect(parseDanmakuText(page)).toEqual([
      { from: '小满', text: '主播好' },
      { from: 'momo', text: '666' },
    ])
  })

  it('空文本返回空数组（不抛错）', () => {
    expect(parseDanmakuText('')).toEqual([])
  })
})
