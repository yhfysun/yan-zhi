/**
 * 玩法 · 赤壁之战（拉锯门槛）。
 *
 * 基线：史实——火攻奏效，曹军大败。改写度 ≥60% 才掀翻史实结局。
 * 视觉沿用上一场在组件里打磨好的等距战场：菱形地块、长江斜穿、两岸舰队。
 */
import type { DanmakuGameMode, EngineState, ModeEvents } from './types'
import { type Ctx, type Side, W, H, clamp, rand, FONT } from './shared'

/** 等距投影：格坐标 → 画布坐标 */
const isoP = (gx: number, gy: number) => ({ x: 180 + (gx - gy) * 31, y: 56 + (gx + gy) * 31 })

interface Boat { col: number; burn: boolean }
interface Particle { x: number; y: number; vy: number; life: number; r?: number }
interface Pulse { x: number; y: number; t: number; color: string }

export function createChibi(): DanmakuGameMode {
  let front = 0.85
  let boats: Boat[] = []
  let flames: Particle[] = []
  let smoke: Particle[] = []
  let fireships: Array<{ x: number; y: number; vy: number }> = []
  let pulses: Pulse[] = []
  let outcome: 'base' | 'altered' | null = null
  let phaseIdx = -1

  const caoShipPos = (i: number) => isoP(0.5 + i * 1.6, 3.05 + (1 - front) * 0.7)
  const allyShipPos = (i: number) => isoP(1.0 + i * 1.6, 4.5 - (front - 0.5) * 1.1)

  const PHASES = [
    { at: 0, label: '列阵' },
    { at: 10_000, label: '交锋' },
    { at: 25_000, label: '白热化' },
    { at: 52_000, label: '封账' },
  ]

  function reset() {
    front = 0.85
    boats = Array.from({ length: 5 }, (_, i) => ({ col: i, burn: false }))
    flames = []
    smoke = []
    fireships = []
    pulses = []
    outcome = null
    phaseIdx = -1
  }

  /** 火船波次与粒子推进；判定后 outcome=base 时船队起火 */
  function tick(t: number, dt: number, s: EngineState): ModeEvents | null {
    const target = 0.85 - (s.rewrite / 100) * 0.7
    front += (target - front) * Math.min(1, dt * 2.2)

    if (!s.resolved && t > 22_000 && t < 40_000 && fireships.length < 8 && Math.random() < dt * 2.4) {
      fireships.push({ x: rand(90, 270), y: 560, vy: -rand(70, 95) })
    }
    for (const f of fireships) {
      f.y += f.vy * dt
      if (Math.random() < dt * 10) flames.push({ x: f.x, y: f.y - 4, vy: -rand(10, 24), life: 1 })
    }
    fireships = fireships.filter((f) => f.y > 300)

    if (s.resolved && outcome === 'base') {
      for (const b of boats) {
        if (!b.burn) continue
        const p = caoShipPos(b.col)
        if (Math.random() < dt * 18) {
          flames.push({ x: p.x + rand(-6, 6), y: p.y - 4, vy: -rand(20, 44), life: 1 })
          smoke.push({ x: p.x + rand(-5, 5), y: p.y - 12, vy: 0, life: 1, r: rand(4, 9) })
        }
      }
    }

    for (const f of flames) { f.y += f.vy * dt; f.life -= dt * 1.5 }
    for (const sm of smoke) { sm.y -= dt * 18; sm.life -= dt * 0.7; if (sm.r != null) sm.r += dt * 8 }
    flames = flames.filter((f) => f.life > 0)
    smoke = smoke.filter((sm) => sm.life > 0)
    for (const p of pulses) p.t += dt
    pulses = pulses.filter((p) => p.t < 1.2)
    return null
  }

  /** 沿用组件版画法：三层远山 + 菱形地块 + 岸线泡沫 + 水面高光 + 底部收边 */
  function draw(g: Ctx, t: number, dt: number, s: EngineState): void {
    void dt
    const now = performance.now()
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#0b1220')
    sky.addColorStop(0.4, '#141d2d')
    sky.addColorStop(0.7, '#1c2333')
    sky.addColorStop(1, '#07090f')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)

    // 远山三层，越远越淡
    ridge(g, 150, 86, '#0d1420', 1.1)
    ridge(g, 164, 66, '#131c2b', 2.3)
    ridge(g, 176, 48, '#1a2434', 0.6)

    const LAND = ['#2b3526', '#303c2a', '#273120', '#35422e']
    const WATER = ['#17445f', '#123a56']
    const EDGE = '#151b14'
    for (let sRow = 0; sRow <= 16; sRow++) {
      for (let gx = 0; gx <= 8; gx++) {
        const gy = sRow - gx
        if (gy < 0 || gy > 8) continue
        const n = (gx * 3 + gy * 5) % 4
        const col =
          gy === 8 || gx === 8
            ? EDGE
            : gy === 3
              ? WATER[n % 2]
              : gy === 4
                ? WATER[(n + 1) % 2]
                : LAND[n]
        isoCell(g, gx, gy, col)
      }
    }

    // 草地细节
    g.strokeStyle = 'rgba(150,180,120,.35)'
    g.lineWidth = 1
    for (let sRow = 0; sRow <= 16; sRow++) {
      for (let gx = 0; gx <= 8; gx++) {
        const gy = sRow - gx
        if (gy < 0 || gy > 8 || gy === 3 || gy === 4 || gy === 8 || gx === 8) continue
        const p = isoP(gx + 0.5, gy + 0.5)
        for (let k = 0; k < 3; k++) {
          const ox = ((gx * 7 + k * 5) % 17) - 8
          const oy = ((gy * 11 + k * 7) % 13) - 6
          g.beginPath()
          g.moveTo(p.x + ox, p.y + oy)
          g.lineTo(p.x + ox + 1.5, p.y + oy - 4)
          g.stroke()
        }
      }
    }

    // 岸线泡沫
    g.strokeStyle = 'rgba(168,214,240,.28)'
    g.lineWidth = 1.4
    for (let gx = 0; gx <= 8; gx++) {
      const a = isoP(gx, 3)
      const b = isoP(gx + 1, 3)
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke()
      const c = isoP(gx, 5)
      const d = isoP(gx + 1, 5)
      g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(d.x, d.y); g.stroke()
    }

    // 水面高光（缓慢横移）
    g.strokeStyle = 'rgba(150,205,240,.16)'
    g.lineWidth = 1
    const drift = ((now / 26) % 200) / 200
    for (let i = 0; i < 7; i++) {
      const gx = 0.6 + ((drift + i * 0.14) % 1) * 6
      const a = isoP(gx, 3.55)
      const b = isoP(gx + 0.55, 3.55)
      g.beginPath(); g.moveTo(a.x, a.y + (i % 3)); g.lineTo(b.x, b.y + (i % 3)); g.stroke()
    }

    // 底部收边
    const fg = g.createLinearGradient(0, 500, 0, H)
    fg.addColorStop(0, 'rgba(8,11,9,0)')
    fg.addColorStop(1, 'rgba(6,9,7,.92)')
    g.fillStyle = fg
    g.fillRect(0, 500, W, H - 500)

    // 实体按 y 排序绘制（等距遮挡）
    const ents: Array<{ y: number; draw: () => void }> = []
    boats.forEach((b) => {
      const p = caoShipPos(b.col)
      ents.push({ y: p.y, draw: () => ship(g, p.x, p.y, 1.4, '#7a3a32', '#e06a5f', b.burn) })
    })
    for (let i = 0; i < 4; i++) {
      const p = allyShipPos(i)
      ents.push({ y: p.y, draw: () => ship(g, p.x, p.y, 1.25, '#2b5a74', '#5aa8e0', false) })
    }
    for (let i = 0; i < 5; i++) {
      const p = isoP(0.45, 0.5 + i * 0.8)
      ents.push({ y: p.y, draw: () => squad(g, p.x, p.y, '#ff7a72', 'rgba(255,110,110,.65)') })
    }
    for (let i = 0; i < 5; i++) {
      const p = isoP(7.15, 3.5 + i * 0.8)
      ents.push({ y: p.y, draw: () => squad(g, p.x, p.y, '#6db6ff', 'rgba(110,190,255,.65)') })
    }
    ents.sort((a, b) => a.y - b.y)
    ents.forEach((e) => e.draw())

    for (const f of fireships) ship(g, f.x, f.y, 0.55, '#7a3a12', 'rgba(255,196,120,.95)', false)

    for (const sm of smoke) {
      g.beginPath(); g.arc(sm.x, sm.y, sm.r ?? 6, 0, 6.28)
      g.fillStyle = `rgba(58,58,64,${0.22 * sm.life})`; g.fill()
    }
    for (const f of flames) {
      const a = clamp(f.life, 0, 1)
      g.beginPath(); g.arc(f.x, f.y, 2.8 * a + 1, 0, 6.28)
      g.fillStyle = `rgba(255,${Math.round(120 + 90 * a)},60,${0.8 * a})`; g.fill()
    }

    // 暗角
    const vig = g.createRadialGradient(W / 2, H * 0.56, 130, W / 2, H * 0.56, 400)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(0,0,0,.55)')
    g.fillStyle = vig
    g.fillRect(0, 0, W, H)

    // 火船尾焰已并入 flames；这里补一波援军脉冲的绘制
    for (const p of pulses) {
      const k = p.t / 1.2
      g.beginPath(); g.arc(p.x, p.y, 10 + k * 90, 0, 6.28)
      g.globalAlpha = 1 - k
      g.strokeStyle = p.color
      g.lineWidth = 3
      g.stroke()
      g.globalAlpha = 1
    }
  }

  /* ---------------- 船/兵/山/地块基础画法（模块内复用） ---------------- */

  function ridge(g: Ctx, yBase: number, h: number, color: string, seed: number) {
    g.beginPath()
    g.moveTo(-12, yBase + 40)
    let x = -12
    let i = 0
    while (x < W + 12) {
      const step = 24 + (i % 3) * 9
      const peak = yBase - h * (0.5 + 0.5 * Math.abs(Math.sin(i * 1.7 + seed)))
      g.lineTo(x + step * 0.5, peak)
      g.lineTo(x + step, yBase)
      x += step
      i++
    }
    g.lineTo(W + 12, yBase + 40)
    g.closePath()
    g.fillStyle = color
    g.fill()
  }

  function isoCell(g: Ctx, gx: number, gy: number, color: string) {
    const a = isoP(gx, gy)
    const b = isoP(gx + 1, gy)
    const c = isoP(gx + 1, gy + 1)
    const d = isoP(gx, gy + 1)
    g.beginPath()
    g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y)
    g.closePath()
    g.fillStyle = color
    g.fill()
  }

  function ship(
    g: Ctx, x: number, y: number, s: number,
    hull: string, sail: string, burning: boolean,
  ) {
    const w = 15 * s
    const h = 6 * s

    g.beginPath(); g.ellipse(x, y + h * 1.0, w * 1.08, h * 0.62, 0, 0, 6.28)
    g.fillStyle = 'rgba(0,0,0,.38)'; g.fill()

    g.beginPath()
    g.moveTo(x - w, y); g.lineTo(x - w * 0.5, y + h * 0.95)
    g.lineTo(x + w * 0.5, y + h * 0.95); g.lineTo(x + w, y)
    g.closePath()
    g.fillStyle = burning ? '#4a1c14' : hull
    g.fill()
    g.globalAlpha = 0.45
    g.fillStyle = '#000'
    g.fill()
    g.globalAlpha = 1

    g.beginPath()
    g.moveTo(x - w, y); g.lineTo(x - w * 0.55, y - h)
    g.lineTo(x + w * 0.55, y - h); g.lineTo(x + w, y)
    g.closePath()
    g.fillStyle = burning ? '#7a3320' : hull
    g.fill()
    g.strokeStyle = burning ? '#ff8a4c' : 'rgba(255,255,255,.18)'
    g.lineWidth = 1
    g.stroke()

    g.strokeStyle = 'rgba(0,0,0,.20)'
    g.lineWidth = 0.8
    for (let i = -1; i <= 1; i++) {
      g.beginPath()
      g.moveTo(x + i * w * 0.42, y - h * 0.88)
      g.lineTo(x + i * w * 0.5, y - h * 0.08)
      g.stroke()
    }

    g.strokeStyle = burning ? 'rgba(255,176,102,.6)' : 'rgba(226,232,240,.45)'
    g.lineWidth = 1
    for (let i = -1; i <= 1; i++) {
      g.beginPath()
      g.moveTo(x + i * w * 0.5, y - h * 0.05)
      g.lineTo(x + i * w * 0.62, y + h * 0.9)
      g.stroke()
    }

    const top = y - h * 1.55
    g.strokeStyle = 'rgba(232,228,216,.6)'
    g.lineWidth = 1
    g.beginPath(); g.moveTo(x, top); g.lineTo(x, top - 16 * s); g.stroke()

    g.fillStyle = sail
    g.beginPath()
    g.moveTo(x, top - 15 * s)
    g.lineTo(x + 10 * s, top - 7 * s)
    g.lineTo(x, top - 1 * s)
    g.closePath(); g.fill()
    g.strokeStyle = 'rgba(0,0,0,.28)'
    g.lineWidth = 0.8
    g.stroke()

    g.fillStyle = burning ? '#ffb066' : sail
    g.beginPath()
    g.moveTo(x, top - 17 * s)
    g.lineTo(x + 5 * s, top - 15 * s)
    g.lineTo(x, top - 13 * s)
    g.closePath(); g.fill()
  }

  function squad(g: Ctx, x: number, y: number, color: string, flag: string) {
    g.beginPath(); g.ellipse(x + 3, y + 5, 12, 3.6, 0, 0, 6.28)
    g.fillStyle = 'rgba(0,0,0,.30)'; g.fill()

    g.strokeStyle = 'rgba(228,232,238,.55)'
    g.lineWidth = 1
    g.beginPath(); g.moveTo(x + 11, y + 4); g.lineTo(x + 11, y - 18); g.stroke()
    g.fillStyle = flag
    g.beginPath(); g.moveTo(x + 11, y - 18); g.lineTo(x + 22, y - 15); g.lineTo(x + 11, y - 9)
    g.closePath(); g.fill()
    g.strokeStyle = 'rgba(0,0,0,.30)'
    g.lineWidth = 0.8
    g.stroke()

    for (let i = 0; i < 3; i++) {
      const sx = x - 7 + i * 7
      g.strokeStyle = 'rgba(226,232,240,.5)'
      g.lineWidth = 0.8
      g.beginPath(); g.moveTo(sx + 2, y - 1); g.lineTo(sx + 4.5, y - 8); g.stroke()

      g.fillStyle = color
      g.beginPath(); g.arc(sx, y - 1, 2, 0, 6.28); g.fill()

      g.fillStyle = 'rgba(242,246,252,.9)'
      g.beginPath(); g.arc(sx, y - 4.2, 1.25, 0, 6.28); g.fill()

      g.fillStyle = 'rgba(255,255,255,.24)'
      g.beginPath(); g.arc(sx - 1.7, y - 0.2, 1.35, 0, 6.28); g.fill()
    }
  }

  /* ---------------- DanmakuGameMode 实现 ---------------- */

  function ignite(boat: Boat) {
    if (boat.burn) return
    boat.burn = true
    const p = caoShipPos(boat.col)
    for (let i = 0; i < 8; i++) {
      flames.push({ x: p.x + rand(-8, 8), y: p.y - rand(0, 6), vy: -rand(20, 46), life: 1 })
    }
  }

  return {
    key: 'chibi',
    name: '赤壁之战',
    note: '改写度到 60% 就掀翻史实结局：火攻不奏效，曹军全身而退。',
    freeWords: ['擂鼓', '放箭', '固守'],
    phases: PHASES.map((p) => ({ at: p.at / 1000, label: p.label })),
    sides: { a: '曹军（改写方）', b: '孙刘联军（守常方）', colorA: '#ff5b63', colorB: '#5aa8e0' },
    giftLabels: {
      fairy: ['擂鼓助威', '擂鼓助威'],
      pill: ['箭雨压制', '箭雨压制'],
      mirror: ['疑兵之计', '疑兵之计'],
      donut: ['解开铁索', '增派火船'],
      battery: ['逆转风向', '东风助火'],
      bomb: ['识破诈降', '截断退路'],
      airdrop: ['北方援军', '江夏援军'],
      super: ['改判战局', '火势更烈'],
      jet: ['锁定结局', '锁定史实'],
    },
    gate: 60,
    startAt: 0,
    team: false,

    reset,
    tick,
    draw,

    onPhase(i, label) {
      phaseIdx = i
      const lines = ['两军列阵，发 1 或 2 选边。', '交锋开始，每一票都在推战线。', '白热化了，现在每一票都算数。', '封账，倒计时结束就定局。']
      void label
      return lines[i] ? { say: lines[i] } : null
    },

    onGift(id, side, user, mult) {
      const isA = side === 'a'
      if (id === 'donut' && isA) return { say: `${user} 解开铁索！连环船散成一片`, banner: { title: '铁索断开', sub: '连环船散成一片', color: '#9b7bff' } }
      if (id === 'battery' && isA) return { say: `${user} 逆转风向，西北风起，火船难行`, banner: { title: '风向逆转', sub: '西北风起，火船难行', color: '#9b7bff' } }
      if (id === 'battery' && !isA) return { say: `${user} 请来东风，火势更烈`, banner: { title: '东风助火', sub: '火势助长', color: '#ffb347' } }
      if (id === 'bomb') {
        for (const b of boats) if (!b.burn && Math.random() < 0.4) ignite(b)
        return { banner: { title: isA ? '识破诈降' : '截断退路', sub: '战局再生变数', color: '#ffc857' }, pulse: isA ? 'a' : 'b' }
      }
      if (id === 'airdrop') {
        front = clamp(front + (isA ? -0.12 : 0.12), 0.05, 0.95)
        pulses.push({ x: isA ? caoShipPos(2).x : allyShipPos(2).x, y: isA ? caoShipPos(2).y + 10 : allyShipPos(2).y + 10, t: 0, color: isA ? 'rgba(255,140,140,.6)' : 'rgba(140,200,255,.6)' })
        return { say: `${user} 请来援军，战线前推`, pulse: null }
      }
      const p = isA ? caoShipPos(2) : allyShipPos(2)
      return {
        floater: { text: mult > 1 ? `+${Math.round(2 * mult)} 推力` : '', color: isA ? '#ffb3b8' : '#b3d9ff', x: p.x, y: p.y - 8 },
        pulse: isA ? 'a' : 'b',
      }
    },

    onComment(text: string, _from: string, _side: Side | null): boolean {
      if (text === '擂鼓') {
        const p = caoShipPos(2)
        for (let i = 0; i < 3; i++) {
          flames.push({ x: p.x + rand(-10, 10), y: p.y - rand(0, 6), vy: -rand(10, 20), life: 1 })
        }
        return true
      }
      return false
    },

    onJudge(altered: boolean, lead: Side | null, s: EngineState): ModeEvents | null {
      void s
      outcome = altered ? 'altered' : 'base'
      if (altered) {
        fireships = []
        return { say: '风向变了，火船靠不上来——曹军的船阵散开了，历史要改写！' }
      }
      boats.forEach((b) => { if (Math.random() < 0.8) ignite(b) })
      void lead
      return { say: '东南风起了！火船撞进船阵，连环船一烧就是一片！' }
    },

    report(ctx) {
      const alt = ctx.outcome === 'altered'
      return {
        title: alt ? '历史被改写' : '史实复现',
        sub: `改写度 ${Math.round(ctx.percent)}% · ${alt ? '越过了 60% 门槛' : '没越过 60% 门槛'}`,
        live: alt
          ? ['曹军保全水军，退回江北整顿', '孙刘联军守住江防，却没能扩大战果', '曹操仍握着南下通道，统一只是延后']
          : ['曹操烧船北撤，荆州落入孙刘之手', '刘备借荆州站稳，三分天下开始成形'],
        dead: alt
          ? ['三国鼎立不会出现', '刘备不会再有借荆州的机会', '孙权不会因大胜坐稳江东']
          : ['曹军一鼓作气吞并江东'],
        honor: [],
      }
    },
  }
}
