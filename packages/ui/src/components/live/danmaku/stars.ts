/**
 * 玩法 · 观星台 · 天命（拉锯门槛）。
 *
 * 基线：客星犯心宿，主兵灾——天命注定。星力 ≥60% 才让「天命可违」成立。
 * 视觉：夜空星野、三环星盘、八颗主星亮度随星力走、客星沿轨道移动。
 */
import type { DanmakuGameMode, EngineState, ModeEvents } from './types'
import { type Ctx, type Side, W, H, clamp, rand, FONT } from './shared'

const CX = W / 2
const CY = 316

export function createStars(): DanmakuGameMode {
  interface Star { name: string; x: number; y: number; a: number; lit: number }
  interface Ripple { x: number; y: number; r: number; life: number }

  let field: Array<{ x: number; y: number; r: number; p: number }> = []
  let stars: Star[] = []
  let comet = { a: -2.5, r: 150 }
  let tail: Array<{ x: number; y: number; life: number }> = []
  let ripples: Ripple[] = []
  let banner: { title: string; sub: string; color: string; t: number } | null = null

  function reset() {
    field = Array.from({ length: 90 }, () => ({
      x: rand(0, W), y: rand(0, H), r: rand(0.5, 1.4), p: rand(0, 6.28),
    }))
    const names = ['紫微', '天机', '太阳', '武曲', '天同', '廉贞', '天府', '破军']
    stars = names.map((n, i) => {
      const a = -Math.PI / 2 + (i / names.length) * Math.PI * 2
      return { name: n, x: CX + Math.cos(a) * 108, y: CY + Math.sin(a) * 108, a, lit: 0.35 }
    })
    comet = { a: -2.5, r: 150 }
    tail = []
    ripples = []
    banner = null
  }

  function tick(t: number, dt: number, s: EngineState): ModeEvents | null {
    // 客星沿轨道走
    if (!s.resolved) {
      comet.a += dt * 0.42
      const cx = CX + Math.cos(comet.a) * comet.r
      const cy = CY + Math.sin(comet.a) * comet.r
      tail.push({ x: cx, y: cy, life: 1 })
    }
    for (const p of tail) p.life -= dt * 1.1
    tail = tail.filter((p) => p.life > 0)
    if (tail.length > 60) tail.splice(0, tail.length - 60)

    // 主星亮度：星力越高人力侧越亮
    const target = 0.25 + (s.rewrite / 100) * 0.75
    for (const st of stars) st.lit += (target - st.lit) * Math.min(1, dt * 1.6)

    // 凶兆涟漪（判定前零星出现）
    if (!s.resolved && t > 30_000 && Math.random() < dt * 1.4) {
      ripples.push({ x: rand(60, 300), y: rand(180, 460), r: 2, life: 1 })
    }
    for (const r of ripples) { r.r += dt * 70; r.life -= dt * 0.8 }
    ripples = ripples.filter((r) => r.life > 0)

    if (banner) {
      banner.t += dt
      if (banner.t > 2.2) banner = null
    }
    return null
  }

  function draw(g: Ctx, t: number, dt: number, s: EngineState): void {
    void t; void dt; void s
    const now = performance.now()
    const grd = g.createLinearGradient(0, 0, 0, H)
    grd.addColorStop(0, '#070a18')
    grd.addColorStop(0.55, '#0a0d1c')
    grd.addColorStop(1, '#05060f')
    g.fillStyle = grd
    g.fillRect(0, 0, W, H)

    // 星野
    for (const sp of field) {
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(now / 1400 + sp.p))
      g.beginPath(); g.arc(sp.x, sp.y, sp.r, 0, 6.28)
      g.fillStyle = `rgba(210,225,255,${0.55 * tw})`; g.fill()
    }

    // 星盘三环 + 刻度
    g.lineWidth = 1
    ;[70, 108, 146].forEach((r) => {
      g.beginPath(); g.arc(CX, CY, r, 0, 6.28)
      g.strokeStyle = 'rgba(140,170,255,.13)'; g.stroke()
    })
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 - Math.PI / 2
      const r0 = 146
      const r1 = i % 7 === 0 ? 156 : 151
      g.beginPath()
      g.moveTo(CX + Math.cos(a) * r0, CY + Math.sin(a) * r0)
      g.lineTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1)
      g.strokeStyle = i % 7 === 0 ? 'rgba(180,200,255,.30)' : 'rgba(140,170,255,.14)'
      g.stroke()
    }

    // 凶兆涟漪
    for (const r of ripples) {
      g.beginPath(); g.arc(r.x, r.y, r.r, 0, 6.28)
      g.strokeStyle = `rgba(255,120,120,${0.22 * r.life})`
      g.stroke()
    }

    // 亮星连线
    const lit = stars.filter((st) => st.lit > 0.55)
    g.strokeStyle = 'rgba(150,190,255,.34)'
    g.lineWidth = 1
    for (let i = 0; i < lit.length - 1; i++) {
      g.beginPath()
      g.moveTo(lit[i].x, lit[i].y)
      g.lineTo(lit[i + 1].x, lit[i + 1].y)
      g.stroke()
    }

    // 主星
    for (const st of stars) {
      const r = 2.2 + st.lit * 3.4
      const gr = g.createRadialGradient(st.x, st.y, 0, st.x, st.y, r * 4)
      gr.addColorStop(0, `rgba(190,215,255,${0.5 * st.lit})`)
      gr.addColorStop(1, 'rgba(190,215,255,0)')
      g.beginPath(); g.arc(st.x, st.y, r * 4, 0, 6.28)
      g.fillStyle = gr; g.fill()
      g.beginPath(); g.arc(st.x, st.y, r, 0, 6.28)
      g.fillStyle = `rgba(235,242,255,${0.55 + 0.45 * st.lit})`; g.fill()
      g.fillStyle = `rgba(180,196,225,${0.35 + 0.4 * st.lit})`
      g.font = `8px ${FONT}`
      g.textAlign = 'center'
      g.fillText(st.name, st.x, st.y - r - 6)
    }

    // 客星尾
    for (const p of tail) {
      g.beginPath(); g.arc(p.x, p.y, 1.4 * p.life + 0.4, 0, 6.28)
      g.fillStyle = `rgba(255,200,150,${0.5 * p.life})`; g.fill()
    }
    const cx = CX + Math.cos(comet.a) * comet.r
    const cy = CY + Math.sin(comet.a) * comet.r
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 16)
    gr.addColorStop(0, 'rgba(255,220,170,.85)')
    gr.addColorStop(1, 'rgba(255,180,120,0)')
    g.beginPath(); g.arc(cx, cy, 16, 0, 6.28); g.fillStyle = gr; g.fill()
    g.beginPath(); g.arc(cx, cy, 2.6, 0, 6.28); g.fillStyle = '#fff1d0'; g.fill()

    // 横幅（礼物/判定的大字提示，引擎不画 banner，由玩法自画——避免拉锯玩法横幅位置不一致）
    if (banner) {
      g.globalAlpha = Math.min(1, (2.2 - banner.t) / 0.4)
      g.fillStyle = 'rgba(8,10,16,.78)'
      g.fillRect(0, 150, W, 46)
      g.fillStyle = banner.color
      g.font = `700 16px ${FONT}`
      g.textAlign = 'center'
      g.fillText(banner.title, W / 2, 172)
      g.fillStyle = 'rgba(232,236,246,.85)'
      g.font = `600 11px ${FONT}`
      g.fillText(banner.sub, W / 2, 188)
      g.globalAlpha = 1
    }
  }

  function showBanner(title: string, sub: string, color: string) {
    banner = { title, sub, color, t: 0 }
  }

  return {
    key: 'stars',
    name: '观星台 · 天命',
    note: '客星犯心宿主兵灾。星力到 60%，这一夜天命可违。',
    freeWords: ['点灯', '观星', '守心'],
    phases: [
      { at: 0, label: '夜观星象' },
      { at: 10, label: '客星入垣' },
      { at: 25, label: '荧惑守心' },
      { at: 52, label: '封盘' },
    ],
    sides: { a: '人力（改写方）', b: '天命（守常方）', colorA: '#c3a6ff', colorB: '#8fa6ff' },
    giftLabels: {
      fairy: ['点亮一星', '点亮一星'],
      pill: ['续明三刻', '续明三刻'],
      mirror: ['分光成影', '分光成影'],
      donut: ['点亮主星', '点亮主星'],
      battery: ['聚星成座', '聚星成座'],
      bomb: ['驱散凶兆', '驱散凶兆'],
      airdrop: ['流星入怀', '流星入怀'],
      super: ['移星改轨', '星轨如常'],
      jet: ['天命改写', '天命不改'],
    },
    gate: 60,
    startAt: 0,
    team: false,

    reset,

    tick,
    draw,

    onPhase(i) {
      const lines = ['夜观星象，客星犯垣。发 1 或 2 选边。', '客星入垣，主星暗了几分。', '荧惑守心，就在今晚。', '封盘，倒计时结束定局。']
      return lines[i] ? { say: lines[i] } : null
    },

    onGift(id, side, user, mult, s) {
      const isA = side === 'a'
      const superG = id === 'super' || id === 'jet'
      if (id === 'donut') {
        stars.forEach((st) => { st.lit = Math.min(1, st.lit + 0.25) })
        showBanner('点亮主星', '主星增辉', '#ffc857')
        return { say: `${user} 点亮主星，星力 +${Math.round(8 * mult)}` }
      }
      if (id === 'battery') {
        stars.forEach((st) => { st.lit = Math.min(1, st.lit + 0.35) })
        showBanner('聚星成座', '星光连成一线', '#9b7bff')
        return { say: `${user} 聚星成座，星光连成一线` }
      }
      if (id === 'bomb') {
        ripples.forEach((r) => { r.life = 0 })
        ripples = []
        showBanner('驱散凶兆', '凶兆消散', '#7fd8a8')
        return { say: `${user} 驱散凶兆，凶象暂退` }
      }
      if (id === 'airdrop') {
        tail.push({ x: rand(60, 300), y: rand(120, 220), life: 1 })
        showBanner('流星入怀', '流星划过', '#ffd479')
        return { say: `${user} 引来流星入怀` }
      }
      if (superG) {
        comet.r += 10
        showBanner(isA ? '移星改轨' : '星轨如常', isA ? '客星被推离轨道' : '客星如期犯垣', '#c3a6ff')
        return { say: isA ? `${user} 移星改轨，客星离了心宿` : `守常方稳住星轨，客星如期犯垣` }
      }
      void s
      return {
        floater: { text: mult > 1 ? `星力 ×${mult}` : '', color: isA ? '#d8c8ff' : '#b3d9ff', at: isA ? 'a' : 'b' },
        pulse: isA ? 'a' : 'b',
      }
    },

    onComment(text, from, side) {
      if (text === '点灯') {
        stars.forEach((st) => { st.lit = Math.min(1, st.lit + 0.05) })
        return true
      }
      if (text === '观星') {
        field.forEach((sp) => { sp.r = Math.min(2, sp.r + 0.02) })
        return true
      }
      if (text === '守心') {
        if (side === 'b') ripples.push({ x: rand(60, 300), y: rand(180, 460), r: 2, life: 1 })
        return true
      }
      void from
      return false
    },

    onJudge(altered) {
      if (altered) {
        showBanner('天命可违 · 星轨偏移', '客星被推离心宿', '#9b7bff')
        return { say: '星轨偏了！这一夜，人力压过了天命。' }
      }
      showBanner('天命难违 · 荧惑守心', '客星如期犯心宿', '#ff8a4c')
      return { say: '客星还是落进了心宿……天命没有改。' }
    },

    report(ctx) {
      const alt = ctx.outcome === 'altered'
      return {
        title: alt ? '天命被改写' : '天命应验',
        sub: `星力 ${Math.round(ctx.percent)}% · ${alt ? '越过了 60% 门槛' : '没能越过 60% 门槛'}`,
        live: alt
          ? ['凶兆未应，朝野对旧星占的信任松动', '观星者从此多了一分话语权']
          : ['朝野按旧例备战，兵灾如期而至', '星占之说继续被奉为圭臬'],
        dead: alt
          ? ['兵灾不会如期发生', '旧有的星占权威不会原封不动']
          : ['人力改天的说法不会流传'],
        honor: [],
      }
    },
  }
}
