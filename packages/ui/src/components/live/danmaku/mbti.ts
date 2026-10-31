/**
 * 玩法 · MBTI 人格矩阵（团队抢榜）。
 *
 * 十六型人格各自为战：发自己的四字母就亮灯，全型合力点亮本格，最亮一格占榜。
 * 视觉：4×4 亮度矩阵，领先格描边高亮。
 */
import type { DanmakuGameMode, EngineState, ModeEvents } from './types'
import { type Ctx, type Side, W, H, clamp, rand, FONT } from './shared'

interface Team { id: string; name: string; score: number; color: string }

const TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
]
const PALETTE = ['#7c9cff', '#6ee7ff', '#9b7bff', '#ff8ac0', '#ffb347', '#7fd8a8', '#ff6b6b', '#ffe066']

export function createMbti(): DanmakuGameMode {
  let teams: Team[] = []
  let pops: Array<{ x: number; y: number; t: number; txt: string; color: string }> = []

  const teamTotal = () => teams.reduce((s, t) => s + t.score, 0) || 1
  const teamLeader = () => teams.reduce((a, b) => (b.score > a.score ? b : a), teams[0])
  const teamOf = (id: string) => teams.find((t) => t.id === id)

  function reset() {
    teams = TYPES.map((n, i) => ({
      id: n,
      name: n,
      score: 1,
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

  function draw(g: Ctx, t: number, dt: number, s: EngineState): void {
    void t; void dt; void s
    g.fillStyle = '#0b0c14'
    g.fillRect(0, 0, W, H)
    const total = teamTotal()
    const cols = 4
    const cw = 76
    const ch = 80
    const gap = 6
    const x0 = (W - (cols * cw + (cols - 1) * gap)) / 2
    const y0 = 150
    const lead = teamLeader()

    g.textAlign = 'center'
    g.fillStyle = '#6f7888'
    g.font = `10px ${FONT}`
    g.fillText('人格矩阵 · 谁最亮', W / 2, 132)

    teams.forEach((team, i) => {
      const cx = x0 + (i % cols) * (cw + gap)
      const cy = y0 + Math.floor(i / cols) * (ch + gap)
      const share = team.score / total
      const fill = Math.min(1, share * 3)
      g.fillStyle = 'rgba(255,255,255,.045)'
      g.fillRect(cx, cy, cw, ch)
      g.fillStyle = team.color
      g.globalAlpha = 0.1 + share * 2.4
      g.fillRect(cx, cy + ch * (1 - fill), cw, ch * fill)
      g.globalAlpha = 1
      g.strokeStyle = team === lead ? team.color : 'rgba(255,255,255,.10)'
      g.lineWidth = team === lead ? 2 : 1
      g.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1)
      g.fillStyle = '#e8ecf3'
      g.font = `700 13px ${FONT}`
      g.fillText(team.name, cx + cw / 2, cy + 24)
      g.fillStyle = 'rgba(255,255,255,.6)'
      g.font = `600 10px ${FONT}`
      g.fillText(`${team.score} 票`, cx + cw / 2, cy + 40)
    })

    for (const p of pops) {
      g.globalAlpha = Math.max(0, 1 - p.t / 1.1)
      g.fillStyle = p.color
      g.font = `700 12px ${FONT}`
      g.fillText(p.txt, p.x, p.y)
      g.globalAlpha = 1
    }
  }

  return {
    key: 'mbti',
    name: 'MBTI 人格矩阵',
    note: '十六型抢榜：发自己的四字母点亮本型，最亮一格占领矩阵。',
    freeWords: ['亮灯', '拉人', '报名'],
    phases: [
      { at: 0, label: '自报型号' },
      { at: 10, label: '点亮' },
      { at: 25, label: '连线' },
      { at: 52, label: '定格' },
    ],
    sides: { a: '最亮人格', b: '追赶者', colorA: '#ffe066', colorB: '#6ea8ff' },
    giftLabels: {
      fairy: ['点亮一格', '点亮一格'],
      pill: ['连亮三格', '连亮三格'],
      mirror: ['人格投影', '人格投影'],
      donut: ['点亮本型', '点亮本型'],
      battery: ['聚光本型', '聚光本型'],
      bomb: ['干扰别格', '干扰别格'],
      airdrop: ['空降盟友', '空降盟友'],
      super: ['整列点亮', '整列点亮'],
      jet: ['定格榜首', '定格榜首'],
    },
    gate: 0,
    startAt: 0,
    team: true,

    reset,
    tick,
    draw,

    onPhase(i) {
      const lines = ['自报型号。发你的四字母，点亮本型。', '点亮开始，看看谁是稀有人格。', '连线了，大阵营对撞。', '定格，点票出榜首。']
      return lines[i] ? { say: lines[i] } : null
    },

    onGift(id, side, user, mult, s) {
      void s; void id
      const isA = side === 'a'
      const target = isA ? teamLeader() : teams[Math.floor(Math.random() * teams.length)]
      const n = Math.round(8 * mult)
      reward(target.id, n)
      return {
        floater: { text: `${target.name} +${n}`, color: target.color, at: isA ? 'a' : 'b' },
        say: `${user} 给 ${target.name} 聚光 +${n}`,
      }
    },

    onComment(text, from, side) {
      const key = text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
      const t = teamOf(key)
      if (t) {
        reward(t.id, 1)
        return true
      }
      void from; void side
      return false
    },

    onJudge(altered, lead) {
      void altered; void lead
      const lead0 = teamLeader()
      return { say: `本局 ${lead0.name} 占领矩阵！` }
    },

    report(ctx) {
      void ctx
      const lead = teamLeader()
      const total = teamTotal()
      return {
        title: `${lead.name} 占领矩阵`,
        sub: `共 ${total} 票 · 领先 ${lead.score} 票`,
        live: [`${lead.name} 拿到下一场的开局聚光`, '其余人格下一局大概率反扑'],
        dead: ['其他人格本场再无登顶机会'],
        honor: [],
      }
    },
  }
}
