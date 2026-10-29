import { describe, expect, it } from 'vitest'
import { manifestFor, planSheet, sanitizePackId } from './import-pack'

describe('形象工坊 · 导入参数', () => {
  it('id 只留安全字符且带时间戳（可当目录名，不会重名）', () => {
    const a = sanitizePackId('我的 猫猫/v2.gif')
    expect(a).toMatch(/^[a-zA-Z0-9_-]+$/)
    expect(sanitizePackId('')).toMatch(/^pack-/)
  })

  it('帧高超过 256 会等比缩小', () => {
    const p = planSheet(200, 512, 4)
    expect(p.sheetHeight).toBeLessThanOrEqual(256)
    expect(p.sheetWidth).toBe(p.sheetHeight / 512 * 200 * 4 | 0 || p.sheetWidth)
  })

  it('帧数封顶 32，整表宽度不超 4096', () => {
    expect(planSheet(64, 64, 200).frames).toBe(32)
    const wide = planSheet(400, 100, 32)
    expect(wide.sheetWidth).toBeLessThanOrEqual(4096)
  })

  it('manifest 归一化 fps 与帧数', () => {
    const m = manifestFor('猫猫', { frames: 0, frameWidth: 10, frameHeight: 12, fps: 999, source: 'gif' })
    expect(m.frames).toBe(1)
    expect(m.fps).toBeLessThanOrEqual(24)
    expect(m.label).toBe('猫猫')
  })
})

describe('形象工坊 · 用户形象映射', () => {
  it('注册表条目能转成 Pet2D 认的配置（单行、所有状态共用）', async () => {
    const { userPacks, userPackConfig } = await import('./user-packs')
    userPacks['demo-pack'] = {
      manifest: { id: 'demo-pack', label: 'Demo', frameWidth: 32, frameHeight: 32, frames: 5, fps: 10, source: 'gif' },
      url: 'blob:demo',
    }
    const cfg = userPackConfig('demo-pack')!
    expect(cfg.img).toBe('blob:demo')
    expect(cfg.cols).toBe(5)
    expect(cfg.states.idle).toEqual({ r: 0, n: 5, fps: 10 })
    expect(cfg.states.running).toEqual(cfg.states.idle)
    expect(userPackConfig('nope')).toBeNull()
    delete userPacks['demo-pack']
  })
})
