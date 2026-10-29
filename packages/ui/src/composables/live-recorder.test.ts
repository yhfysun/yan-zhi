// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { elementRect, stageCropPlan, windowDisplay } from './live-recorder'

describe('live-recorder 坐标换算', () => {
  it('窗口内容尺寸为 0 时兜底为 1，不会除零', () => {
    const d = windowDisplay(0, 0)
    expect(d.bounds.width).toBe(1)
    expect(d.bounds.height).toBe(1)
  })

  it('按窗口内容区缩放裁剪：2 倍缩放下矩形与尺寸同步放大', () => {
    const crop = stageCropPlan(1600, 1200, 800, 600, { x: 100, y: 50, width: 300, height: 400 })
    expect(crop).toEqual({ x: 200, y: 100, width: 600, height: 800, scale: 2 })
  })

  it('矩形超出采集画面时被钳制，不会越界读取', () => {
    const crop = stageCropPlan(800, 600, 800, 600, { x: 700, y: 500, width: 400, height: 400 })
    expect(crop.x).toBe(700)
    expect(crop.y).toBe(500)
    expect(crop.width).toBe(100)
    expect(crop.height).toBe(100)
  })

  it('元素矩形取整，宽高至少为 1', () => {
    const el = document.createElement('div')
    el.getBoundingClientRect = () =>
      ({ left: 10.4, top: 20.6, width: 0, height: 0, right: 10.4, bottom: 20.6 }) as DOMRect
    expect(elementRect(el)).toEqual({ x: 10, y: 21, width: 1, height: 1 })
  })
})
