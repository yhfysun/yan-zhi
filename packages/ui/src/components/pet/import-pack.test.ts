import { describe, expect, it } from 'vitest'
import { manifestFor, planAtlas, planSheet, sanitizePackId, suggestCols } from './import-pack'

describe('形象工坊 · 导入参数', () => {
  it('id 只留安全字符且带时间戳（可当目录名，不会重名）', () => {
    const a = sanitizePackId('我的 猫猫/v2.gif')
    expect(a).toMatch(/^[a-zA-Z0-9_-]+$/)
    expect(sanitizePackId('')).toMatch(/^pack-/)
  })

  it('帧高超过 256 会等比缩小', () => {
    const p = planSheet(200, 512, 4)
    expect(p.sheetHeight).toBeLessThanOrEqual(256)
    expect(p.sheetWidth).toBe(p.frames * Math.max(1, Math.round(200 * p.scale)))
  })

  it('帧数封顶 32，整表宽度不超 4096', () => {
    expect(planSheet(64, 64, 200).frames).toBe(32)
    const wide = planSheet(400, 100, 32)
    expect(wide.sheetWidth).toBeLessThanOrEqual(4096)
  })

  it('manifest 归一化 fps、帧数与动作行', () => {
    const m = manifestFor('猫猫', {
      cols: 8,
      rows: 3,
      frameWidth: 64,
      frameHeight: 64,
      fps: 999,
      source: 'sheet',
      states: { idle: { r: 0, n: 8, fps: 6 }, running: { r: 99, n: 99, fps: 999 } },
    })
    expect(m.cols).toBe(8)
    expect(m.rows).toBe(3)
    expect(m.frames).toBe(24)
    expect(m.fps).toBeLessThanOrEqual(24)
    expect(m.states!.running.r).toBe(2) // 行号钳到 rows-1
    expect(m.states!.running.n).toBe(8) // 列数钳到 cols
    expect(m.states!.running.fps).toBe(24)
  })

  it('没有帧数时回落 1 帧', () => {
    const m = manifestFor('x', { cols: 0, rows: 0, frameWidth: 10, frameHeight: 12, fps: 6, source: 'image' })
    expect(m.frames).toBe(1)
    expect(m.rows).toBe(1)
  })
})

describe('形象工坊 · 图集校验', () => {
  it('能整除时给出帧尺寸与 9 态行映射', () => {
    const p = planAtlas(1024, 208, 8, 1)
    expect(p.ok).toBe(true)
    expect(p.frameWidth).toBe(128)
    expect(p.frameHeight).toBe(208)
    expect(p.states.idle).toEqual({ r: 0, n: 8, fps: 6 })
    expect(p.states.walking).toBeUndefined() // 只有 1 行
  })

  it('多行图集按行映射状态，超出 9 行的部分不参与', () => {
    const p = planAtlas(640, 576, 5, 9)
    expect(p.ok).toBe(true)
    expect(Object.keys(p.states)).toHaveLength(7)
    expect(p.states.paused.r).toBe(6)
  })

  it('行数不足 7 时只映射前几行并给出提示', () => {
    const p = planAtlas(640, 320, 5, 5)
    expect(p.ok).toBe(true)
    expect(Object.keys(p.states)).toHaveLength(5)
    expect(p.states.paused).toBeUndefined()
    expect(p.warnings.join()).toContain('只映射')
  })

  it('宽高不能被行列整除时拒绝导入', () => {
    const p = planAtlas(1000, 208, 6, 1)
    expect(p.ok).toBe(false)
    expect(p.errors[0]).toContain('不能被 6 列整除')
  })

  it('帧太小、行列超上限都拒绝', () => {
    expect(planAtlas(40, 40, 8, 1).ok).toBe(false)
    expect(planAtlas(4096, 208, 40, 1).ok).toBe(false)
    expect(planAtlas(100, 1000, 1, 10).ok).toBe(false)
  })

  it('建议列数优先按正方形帧，其次按常见帧高', () => {
    expect(suggestCols(1024, 128)).toBe(8)
    expect(suggestCols(1664, 208)).toBe(8)
    expect(suggestCols(100, 97)).toBe(1)
  })
})

describe('形象工坊 · 用户形象映射', () => {
  it('旧版单行 manifest 仍能转成 Pet2D 配置（所有状态共用）', async () => {
    const { userPacks, userPackConfig } = await import('./user-packs')
    userPacks['demo-pack'] = {
      manifest: { id: 'demo-pack', label: 'Demo', frameWidth: 32, frameHeight: 32, frames: 5, fps: 10, source: 'gif' },
      url: 'blob:demo',
    }
    const cfg = userPackConfig('demo-pack')!
    expect(cfg.img).toBe('blob:demo')
    expect(cfg.cols).toBe(5)
    expect(cfg.rows).toBe(1)
    expect(cfg.states.idle).toEqual({ r: 0, n: 5, fps: 10 })
    expect(cfg.states.running).toEqual(cfg.states.idle)
    // 缺动作行时「逗一下」回落到状态行，不会播到空行
    expect(cfg.actions.wave.r).toBe(0)
    expect(userPackConfig('nope')).toBeNull()
    delete userPacks['demo-pack']
  })

  it('图集 manifest 按行动作，动作行跟随状态行', async () => {
    const { userPacks, userPackConfig, packAspectOf } = await import('./user-packs')
    userPacks['atlas-pack'] = {
      manifest: {
        id: 'atlas-pack',
        label: 'Atlas',
        frameWidth: 64,
        frameHeight: 96,
        cols: 4,
        rows: 3,
        frames: 12,
        fps: 8,
        source: 'sheet',
        states: {
          idle: { r: 0, n: 4, fps: 8 },
          walking: { r: 1, n: 4, fps: 10 },
          running: { r: 2, n: 4, fps: 12 },
        },
      },
      url: 'blob:atlas',
    }
    const cfg = userPackConfig('atlas-pack')!
    expect(cfg.rows).toBe(3)
    expect(cfg.states.walking).toEqual({ r: 1, n: 4, fps: 10 })
    expect(cfg.states.error).toEqual({ r: 0, n: 4, fps: 8 }) // 缺行回落 idle
    expect(cfg.actions.pet.r).toBe(0)
    expect(packAspectOf('atlas-pack')).toBeCloseTo(64 / 96)
    delete userPacks['atlas-pack']
  })
})
