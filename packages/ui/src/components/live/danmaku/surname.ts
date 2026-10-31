/**
 * 玩法 · 姓氏大作战（团队抢榜）。
 *
 * 无基线，多族抢城：发自己的姓加入本族，全族合力把旗插上城楼，票数最高夺城。
 * 视觉：八条氏族赛道、领先方旗子、打赏 +N 弹跳。
 */
import type { DanmakuGameMode, EngineState, ModeEvents } from './types'
import { type Ctx, type Side, W, H, clamp, rand, FONT } from './shared'

interface Team { id: string; name: string; score: number; color: string }

const CLANS = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄']
const PALETTE = ['#ff6b6b', '#ffb347', '#ffe066', '#7fd8a8', '#5fd0e0', '#6ea8ff', '#a98bff', '#ff8ac0']

export function createSurname(): DanmakuGameMode {
  let teams: Team[] = []
  let pops: Array<{ x: number; y: number; t: number; txt: string; color: string }> = []

  const teamTotal = () => teams.reduce((s, t) => s + t.score, 0) || 1
  const teamLeader = () => teams.reduce((a, b) => (b.score > a.score ? b : a), teams[0])
  const teamOf = (id: string) => teams.find((t) => t.id === id)

  function reset() {
    teams = CLANS.map((n, i) => ({
      id: n,
      name: `${n}姓`,
      score: 2,
      color: PALETTE[i % PALETTE.length],
    }))
    pops = []
  }

  function reward(id: string, n: number) {
    const t = teamOf(id)
    if (!t) return
    t.score += n
    pops.push({ x: rand(50, 310), y: 320, t: 0, txt: `+${n}`, color: t.color })
  }

  function tick(t: number, dt: number, s: EngineState): ModeEvents | null {
    void t
    if (!s.resolved && Math.random() < dt * 2.4) {
      teams[Math.floor(Math.random() * teams.length)].score += 1
    }
    for (const p of pops) { p.t += dt; p.y -= dt * 34 }
    pops = pops.filter((p) => p.t < 1.1)
    return { share: Math.round((teamLeader().score / teamTotal()) * 100) }
  }

  function flag(g: Ctx, x: number, y: number, color: string) {
    g.strokeStyle = 'rgba(220,225,230,.5)'
    g.lineWidth = 1
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 16); g.stroke()
    g.fillStyle = color
    g.beginPath(); g.moveTo(x, y - 16); g.lineTo(x + 11, y - 13); g.lineTo(x, y - 8)
    g.closePath(); g.fill()
  }

  function draw(g: Ctx, t: number, dt: number, s: EngineState): void {
    void t; void dt; void s
    g.fillStyle = '#0f1216'
    g.fillRect(0, 0, W, H)
    const total = teamTotal()
    const rowH = 46
    const y0 = 150
    const lead = teamLeader()

    g.textAlign = 'center'
    g.fillStyle = '#6f7888'
    g.font = `10px ${FONT}`
    g.fillText('百家姓 · 抢城楼', W / 2, 132)

    teams.forEach((team, i) => {
      const y = y0 + i * rowH
      const pct = Math.min(1, (team.score / total) * 2.4)
      g.fillStyle = 'rgba(255,255,255,.035)'
      g.fillRect(30, y, W - 60, 22)
      g.fillStyle = team.color
      g.globalAlpha = 0.72
      g.fillRect(30, y, (W - 60) * pct, 22)
      g.globalAlpha = 1
      g.fillStyle = '#fff'
      g.font = `700 13px ${FONT}`
      g.textAlign = 'left'
      g.fillText(team.name, 36, y + 16)
      g.textAlign = 'right'
      g.font = `600 10px ${FONT}`
      g.fillStyle = 'rgba(255,255,255,.72)'
      g.fillText(String(team.score), W - 36, y + 16)
      if (team === lead) flag(g, 30 + (W - 60) * pct, y + 26, team.color)
    })

    for (const p of pops) {
      g.globalAlpha = Math.max(0, 1 - p.t / 1.1)
      g.fillStyle = p.color
      g.font = `700 12px ${FONT}`
      g.textAlign = 'center'
      g.fillText(p.txt, p.x, p.y)
      g.globalAlpha = 1
    }
  }

  return {
    key: 'surname',
    name: '姓氏大作战',
    note: '百家姓抢城楼：发自己的姓加入本族，人多就是硬道理。',
    freeWords: ['冲锋', '助威', '报名'],
    phases: [
      { at: 0, label: '列阵' },
      { at: 10, label: '冲锋' },
      { at: 25, label: '攻城' },
      { at: 52, label: '封城' },
    ],
    sides: { a: '领先一族', b: '追赶者', colorA: '#ffe066', colorB: '#6ea8ff' },
    giftLabels: {
      fairy: ['本族助威', '本族助威'],
      pill: ['本族十兵', '本族十兵'],
      mirror: ['本族旗号', '本族旗号'],
      donut: ['本族募兵', '本族募兵'],
      battery: ['本族金鼓', '本族金鼓'],
      bomb: ['冲击敌族', '冲击敌族'],
      airdrop: ['本族援军', '本族援军'],
      super: ['举族总攻', '举族总攻'],
      jet: ['定鼎城楼', '定鼎城楼'],
    },
    gate: 0,
    startAt: 0,
    team: true,

    reset,
    tick,
    draw,

    onPhase(i) {
      const lines = ['列阵完毕。发自己的姓，加入本族。', '冲锋开始，族人多就是硬道理。', '攻城！每一票都把旗往前推。', '封城，点票定输赢。']
      return lines[i] ? { say: lines[i] } : null
    },

    onGift(id, side, user, mult, s) {
      void s
      const isA = side === 'a'
      const target = isA ? teamLeader() : teams[Math.floor(Math.random() * teams.length)]
      const n = Math.round(8 * mult)
      reward(target.id, n)
      return {
        floater: { text: `${target.name} +${n}`, color: target.color, at: isA ? 'a' : 'b' },
        say: `${user} 给${target.name}募兵 +${n}`,
      }
    },

    onComment(text, from, side) {
      const t = teamOf(text) || teamOf(text.replace(/姓$/, ''))
      if (t) {
        reward(t.id, 1)
        return true // join 语义已在本玩法内记账
      }
      void from; void side
      return false
    },

    onJudge(altered, lead) {
      void altered
      const lead0 = teamLeader()
      void lead
      return { say: `本局 ${lead0.name} 拿下城楼！` }
    },

    report(ctx) {
      const lead = teamLeader()
      const total = teamTotal()
      return {
        title: `${lead.name} 夺城`,
        sub: `共 ${total} 票 · 领先 ${lead.score} 票`,
        live: [`${lead.name} 拿到下一场的开局鼓点`, '其余姓氏下一局大概率会更拼'],
        dead: ['其他姓氏本场再无翻盘机会'],
        honor: [],
      }
    },
  }
}
