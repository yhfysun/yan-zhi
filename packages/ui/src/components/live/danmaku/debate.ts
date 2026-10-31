/**
 * 玩法 · 甜咸之争（拉锯 · 起始 50）。
 *
 * 无基线，纯投票：甜派 vs 咸派，多数决。每局随机话题，判定线是 50/50 分界。
 * 视觉：左右分色海、分界波浪随票数移动、投票碎片上飘、话题卡置顶。
 */
import type { DanmakuGameMode, EngineState, ModeEvents } from './types'
import { type Ctx, type Side, W, H, clamp, rand, pick, FONT } from './shared'

interface Topic { a: string; b: string; q: string }

const TOPICS: Array<Topic> = [
  { a: '甜粽', b: '咸粽', q: '粽子到底该甜还是该咸？' },
  { a: '甜豆花', b: '咸豆花', q: '豆腐脑放糖还是浇卤？' },
  { a: '加香菜', b: '不加香菜', q: '香菜是不是人类之敌？' },
  { a: '五仁月饼', b: '非五仁', q: '五仁月饼该不该保留？' },
  { a: '番茄炒蛋放糖', b: '不放糖',  q: '番茄炒蛋要不要放糖？' },
  { a: '汤圆有馅', b: '汤圆无馅', q: '汤圆到底算不算点心？' },
]

interface Chip { x: number; y: number; vx: number; vy: number; life: number; side: 'a' | 'b'; text: string }

export function createDebate(): DanmakuGameMode {
  let topic: Topic
  let chips: Chip[] = []
  let pop: Array<{ x: number; y: number; t: number; txt: string }> = []
  let pct = 50
  let pctSmooth = 50

  function reset() {
    topic = pick(TOPICS)
    chips = []
    pop = []
    pct = 50
    pctSmooth = 50
  }

  function tick(t: number, dt: number, s: EngineState): ModeEvents | null {
    void t
    pctSmooth += (pct - pctSmooth) * Math.min(1, dt * 4)
    for (const c of chips) {
      c.x += c.vx * dt
      c.y += c.vy * dt
      c.vy += 40 * dt
      c.life -= dt * 0.55
    }
    chips = chips.filter((c) => c.life > 0)
    for (const p of pop) { p.t += dt; p.y -= dt * 22 }
    pop = pop.filter((p) => p.t < 0.9)
    // 背景零星投票，制造热闹
    if (!s.resolved && Math.random() < dt * 3.2) {
      spawnChip(Math.random() < s.rewrite / 100 ? 'a' : 'b', '')
    }
    return null
  }

  function spawnChip(side: 'a' | 'b', text: string) {
    const toLeft = side === 'a'
    chips.push({
      x: W / 2 + rand(-30, 30),
      y: H * 0.62 + rand(-20, 20),
      vx: (toLeft ? -1 : 1) * rand(30, 75),
      vy: -rand(30, 80),
      life: 1,
      side,
      text: String(text || '').slice(0, 6),
    })
  }

  function draw(g: Ctx, t: number, dt: number, s: EngineState): void {
    void t; void dt; void s
    const now = performance.now()
    g.fillStyle = '#120f16'
    g.fillRect(0, 0, W, H)

    const bx = W * clamp(pctSmooth, 3, 97) / 100
    // 两派底色
    g.fillStyle = 'rgba(255,110,150,.16)'
    g.fillRect(0, 0, bx, H)
    g.fillStyle = 'rgba(255,190,90,.16)'
    g.fillRect(bx, 0, W - bx, H)

    // 分界波浪
    g.beginPath()
    for (let y = 0; y <= H; y += 8) {
      const x = bx + Math.sin(y / 42 + now / 760) * 6
      y === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
    }
    g.strokeStyle = 'rgba(255,255,255,.55)'
    g.lineWidth = 2
    g.stroke()

    // 两派大字 + 占比
    g.textAlign = 'center'
    g.font = `800 26px ${FONT}`
    g.fillStyle = 'rgba(255,140,170,.92)'
    g.fillText(topic.a, W * 0.24, H * 0.47)
    g.fillStyle = 'rgba(255,200,110,.92)'
    g.fillText(topic.b, W * 0.76, H * 0.47)

    g.font = `700 22px ${FONT}`
    g.fillStyle = '#ffd7e1'
    g.fillText(`${Math.round(pctSmooth)}%`, W * 0.24, H * 0.47 + 30)
    g.fillStyle = '#ffe6b0'
    g.fillText(`${Math.round(100 - pctSmooth)}%`, W * 0.76, H * 0.47 + 30)

    // 话题卡
    const cardW = 300
    const cardH = 62
    const cx0 = (W - cardW) / 2
    const cy0 = 132
    g.fillStyle = 'rgba(8,10,16,.72)'
    g.strokeStyle = 'rgba(255,255,255,.14)'
    g.lineWidth = 1
    g.beginPath()
    if (typeof g.roundRect === 'function') g.roundRect(cx0, cy0, cardW, cardH, 12)
    else g.rect(cx0, cy0, cardW, cardH)
    g.fill()
    g.stroke()
    g.fillStyle = '#8b93a3'
    g.font = `9px ${FONT}`
    g.fillText('本局话题', W / 2, cy0 + 16)
    g.fillStyle = '#eef2f8'
    g.font = `600 14px ${FONT}`
    g.fillText(topic.q || '甜还是咸？', W / 2, cy0 + 40)

    // 投票碎片
    for (const c of chips) {
      const a = clamp(c.life, 0, 1)
      const col = c.side === 'a' ? `rgba(255,140,175,${0.85 * a})` : `rgba(255,200,110,${0.85 * a})`
      g.beginPath()
      g.arc(c.x, c.y, 3.4 * a + 1.2, 0, 6.28)
      g.fillStyle = col
      g.fill()
      if (c.text) {
        g.fillStyle = `rgba(255,255,255,${0.55 * a})`
        g.font = `8px ${FONT}`
        g.fillText(c.text, c.x, c.y - 7)
      }
    }

    // +1 弹跳
    for (const p of pop) {
      g.globalAlpha = Math.max(0, 1 - p.t / 0.9)
      g.fillStyle = '#fff'
      g.font = `700 12px ${FONT}`
      g.fillText(p.txt, p.x, p.y)
      g.globalAlpha = 1
    }

    // 底部提示条
    g.fillStyle = 'rgba(255,255,255,.06)'
    g.fillRect(0, H - 96, W, 34)
  }

  return {
    key: 'debate',
    name: '甜咸之争',
    note: '纯投票局：每局换话题，甜咸各凭人数，50% 分界见输赢。',
    freeWords: ['投甜', '投咸', '说理', '抬杠'],
    phases: [
      { at: 0, label: '开题' },
      { at: 10, label: '第一轮' },
      { at: 25, label: '白热化' },
      { at: 52, label: '封票' },
    ],
    sides: { a: '甜派', b: '咸派', colorA: '#ffa9c0', colorB: '#ffd479' },
    giftLabels: {
      fairy: ['甜派加票', '咸派加票'],
      pill: ['甜派十票', '咸派十票'],
      mirror: ['甜派助威', '咸派助威'],
      donut: ['甜派拉票', '咸派拉票'],
      battery: ['甜派金句', '咸派金句'],
      bomb: ['甜派拆台', '咸派拆台'],
      airdrop: ['甜派援军', '咸派援军'],
      super: ['甜派翻盘', '咸派翻盘'],
      jet: ['甜派定论', '咸派定论'],
    },
    gate: 50,
    startAt: 50,
    team: false,

    reset,
    tick,
    draw,

    onPhase(i) {
      const lines = [
        `开题：${topic.q} 发「${topic.a}」或「${topic.b}」投票。`,
        '第一轮开吵，站好队别跑。',
        '白热化了，现在每一票都算数。',
        '封票，倒计时结束点票。',
      ]
      return lines[i] ? { say: lines[i] } : null
    },

    onGift(id, side, user, mult) {
      const isA = side === 'a'
      const tone = isA ? '#ffa9c0' : '#ffd479'
      const label = id === 'super' || id === 'jet' ? (isA ? '局势逆转' : '局势逆转') : '加票'
      for (let i = 0; i < 3; i++) spawnChip(isA ? 'a' : 'b', i === 0 ? user.slice(0, 5) : '')
      if (id === 'bomb') {
        showPop(isA ? W * 0.2 : W * 0.8, isA ? '对面哑火！' : '对面哑火！', tone)
        return { say: `${user} 拆台，对面哑火三秒` }
      }
      if (id === 'airdrop') {
        for (let i = 0; i < 6; i++) spawnChip(isA ? 'a' : 'b', '')
        return { say: `${user} 带来援军投票` }
      }
      if (id === 'super' || id === 'jet') {
        showPop(W / 2, '局势逆转！', '#c3a6ff')
        return { say: `${user} 一手${label}，局势逆转！` }
      }
      showPop(isA ? W * 0.2 : W * 0.8, `+${Math.round(8 * mult)}`, tone)
      return {
        floater: { text: mult > 1 ? `票力 ×${mult}` : '', color: tone, at: isA ? 'a' : 'b' },
        pulse: isA ? 'a' : 'b',
      }
    },

    onComment(text, from, side) {
      const voteA = text === topic.a || text === '甜' || text === '投甜'
      const voteB = text === topic.b || text === '咸' || text === '投咸'
      if (voteA) return { join: 'a' }
      if (voteB) return { join: 'b' }
      void from; void side
      return false
    },

    onJudge(altered, lead) {
      const aWin = altered
      const name = aWin ? topic.a : topic.b
      if (lead === 'a') showPop(W * 0.2, '赢了', '#ffa9c0')
      else showPop(W * 0.8, '赢了', '#ffd479')
      return { say: `本局 ${name} 赢了！${aWin ? '甜党今晚最大声。' : '咸党今晚最大声。'}` }
    },

    report(ctx) {
      const aWin = ctx.lead === 'a' || ctx.outcome === 'altered'
      const loser = aWin ? topic.b : topic.a
      return {
        title: `${aWin ? topic.a : topic.b} 赢了`,
        sub: `${topic.a} ${Math.round(ctx.percent)}% · ${topic.b} ${Math.round(100 - ctx.percent)}%`,
        live: [
          `${aWin ? topic.a : topic.b} 这一派今晚说话最大声`,
          '下一局换个话题，阵营会重新洗牌',
        ],
        dead: [`${loser} 想在本场翻案已经不可能`],
        honor: [],
      }
    },
  }

  function showPop(x: number, txt: string, color: string) {
    pop.push({ x, y: H * 0.46, t: 0, txt: `${txt}` })
    void color
  }
}
