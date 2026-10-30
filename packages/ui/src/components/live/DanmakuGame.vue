<template>
  <div class="dg">
    <canvas ref="canvasEl" class="dg__canvas" />
    <Transition name="dg-fade">
      <div v-if="report" class="dg-report">
        <div class="dg-report__k">赤壁 · 战报</div>
        <div class="dg-report__t" :class="{ 'is-alt': report.title === '历史被改写' }">{{ report.title }}</div>
        <div class="dg-report__s">{{ report.sub }}</div>

        <div v-if="report.mvp" class="dg-report__mvp">
          <span class="dg-report__crown">★</span>
          本局 MVP：<b>{{ report.mvp.name }}</b>
          <span class="dg-report__dim">{{ report.mvp.coins }} 抖 · 最高连击 ×{{ report.mvp.combo }}</span>
        </div>

        <div class="dg-report__h">谁改写了这一局</div>
        <div class="dg-report__l">
          {{ report.paid.length ? report.paid.join(' · ') : '无人打赏，纯观战' }}
        </div>
        <div v-if="report.acts.length" class="dg-report__l dg-report__l--dim">
          关键一手：{{ report.acts.join('，') }}
        </div>

        <div class="dg-report__h">接下来会发生什么</div>
        <div class="dg-report__l dg-report__l--ok">
          <div v-for="(x, i) in report.live" :key="'a' + i">· {{ x }}</div>
        </div>

        <div class="dg-report__h">败方表彰</div>
        <div class="dg-report__l dg-report__l--honor">
          <div v-for="(x, i) in report.honor" :key="'h' + i">· {{ x }}</div>
        </div>

        <div class="dg-report__h">什么不会发生了</div>
        <div class="dg-report__l dg-report__l--no">
          <div v-for="(x, i) in report.dead" :key="'b' + i">· {{ x }}</div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
/**
 * 弹幕游戏 · 赤壁（直播场景画面源）
 *
 * 内核仍是「基线 + 干预 + 判定」：改写度到 60% 才掀翻史实结局。
 * 渲染是等距战场：菱形地块、长江斜穿、两岸舰队与小队。
 * 组件只管画面与模拟；主播台词通过 say 事件抛给直播页走既有 Cue 队列。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ active?: boolean }>()
const emit = defineEmits<{ (e: 'say', text: string): void }>()

const canvasEl = ref<HTMLCanvasElement | null>(null)

interface BattleReport {
  title: string
  sub: string
  paid: string[]
  acts: string[]
  live: string[]
  dead: string[]
  honor: string[]
  mvp: { name: string; coins: number; combo: number } | null
}
const report = ref<BattleReport | null>(null)

const W = 360
const H = 640
const GATE = 60
const ROUND_MS = 60_000
const JUDGE_AT = 40_000

let api: {
  gift: (id: string, user?: string) => void
  comment: (text: string, from?: string) => void
  reset: () => void
  dispose: () => void
} | null = null

defineExpose({
  gift: (id: string, user?: string) => api?.gift(id, user),
  comment: (text: string, from?: string) => api?.comment(text, from),
  reset: () => api?.reset(),
})

const active = ref(props.active !== false)
watch(
  () => props.active,
  (v) => { active.value = v !== false }
)

onMounted(() => {
  const el = canvasEl.value
  if (!el) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  el.width = W * dpr
  el.height = H * dpr
  el.style.width = W + 'px'
  el.style.height = H + 'px'
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  api = createGame(ctx, (text) => emit('say', text), (r) => { report.value = r })
})

onBeforeUnmount(() => {
  api?.dispose()
  api = null
})

/* ===================================================================== */
type Ctx = CanvasRenderingContext2D

const GIFTS: Record<string, { name: string; coins: number; push: number; label: string }> = {
  fairy: { name: '仙女棒', coins: 1, push: 2, label: '擂鼓助威' },
  pill: { name: '能力药丸', coins: 10, push: 3, label: '箭雨压制' },
  mirror: { name: '魔法镜', coins: 19, push: 4, label: '疑兵之计' },
  donut: { name: '甜甜圈', coins: 52, push: 8, label: '解开铁索' },
  battery: { name: '能量电池', coins: 99, push: 12, label: '逆转风向' },
  bomb: { name: '恶魔炸弹', coins: 199, push: 16, label: '识破诈降' },
  airdrop: { name: '神秘空投', coins: 520, push: 10, label: '北方援军' },
  super: { name: '超级空投', coins: 888, push: 24, label: '改判战局' },
  jet: { name: '超能喷射', coins: 1200, push: 36, label: '锁定结局' },
}

function createGame(g: Ctx, say: (text: string) => void, onReport: (r: BattleReport | null) => void) {
  const isoP = (gx: number, gy: number) => ({ x: 180 + (gx - gy) * 31, y: 56 + (gx + gy) * 31 })

  interface Boat { col: number; burn: boolean }
  interface Particle { x: number; y: number; vy: number; life: number; r?: number }

  let rewrite = 0
  let front = 0.85
  let resolved = false
  let outcome: 'base' | 'altered' | null = null
  let running = true
  let startedAt = performance.now()
  let boats: Boat[] = []
  let flames: Particle[] = []
  let smoke: Particle[] = []
  let fireships: Array<{ x: number; y: number; vy: number }> = []
  let raf = 0
  let last = 0
  let sides = new Map<string, 'cao' | 'ally'>()
  let contribs: Array<{ name: string; action: string; coins: number }> = []
  let paidBy = new Map<string, number>()
  let combos = new Map<string, { n: number; last: number }>()
  let endTimer = 0
  let pulses: Array<{ x: number; y: number; t: number; color: string }> = []
  let floaters: Array<{ x: number; y: number; text: string; t: number; color: string }> = []
  let nextWaveAt = 15_000
  let phaseIdx = -1
  let phaseLabel = ''
  let countdown = 0
  let comebackSide: 'cao' | 'ally' | null = null
  let pendingRevenge: 'cao' | 'ally' | null = null
  let revengeSide: 'cao' | 'ally' | null = null

  /** 弱势方：改写度 <25 曹军落后，>75 联军落后。开局 10 秒内不判，免得一开播就叫 */
  function losingSideNow(): 'cao' | 'ally' | null {
    if (performance.now() - startedAt < 10_000) return null
    if (rewrite < 25) return 'cao'
    if (rewrite > 75) return 'ally'
    return null
  }

  const caoShipPos = (i: number) => isoP(0.5 + i * 1.6, 3.05 + (1 - front) * 0.7)
  const allyShipPos = (i: number) => isoP(1.0 + i * 1.6, 4.5 - (front - 0.5) * 1.1)
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
  const rand = (a: number, b: number) => a + Math.random() * (b - a)

  function reset() {
    clearTimeout(endTimer)
    rewrite = 0
    front = 0.85
    resolved = false
    outcome = null
    running = true
    startedAt = performance.now()
    boats = Array.from({ length: 5 }, (_, i) => ({ col: i, burn: false }))
    flames = []
    smoke = []
    fireships = []
    sides = new Map()
    contribs = []
    paidBy = new Map()
    combos = new Map()
    pulses = []
    floaters = []
    nextWaveAt = 15_000
    phaseIdx = -1
    phaseLabel = ''
    countdown = 0
    comebackSide = null
    revengeSide = pendingRevenge
    pendingRevenge = null
    onReport(null)
  }

  function ignite(boat: Boat) {
    if (boat.burn) return
    boat.burn = true
    const p = caoShipPos(boat.col)
    for (let i = 0; i < 8; i++) {
      flames.push({ x: p.x + rand(-8, 8), y: p.y - rand(0, 6), vy: -rand(20, 46), life: 1 })
    }
  }

  function judge() {
    if (resolved) return
    resolved = true
    if (rewrite >= GATE) {
      outcome = 'altered'
      fireships = []
      say('风向变了，火船靠不上来——曹军的船阵散开了，历史要改写！')
    } else {
      outcome = 'base'
      boats.forEach((b) => { if (Math.random() < 0.8) ignite(b) })
      say('东南风起了！火船撞进船阵，连环船一烧就是一片！')
    }
  }

  function finish() {
    if (!running) return
    running = false
    const altered = outcome === 'altered'
    const paid = [...paidBy.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([n, v]) => `${n} ${v} 抖`)
    const acts = contribs.slice(-3).reverse().map((c) => `${c.name} 的「${c.action}」`)
    const topEntry = [...paidBy.entries()].sort((a, b) => b[1] - a[1])[0]
    const mvp = topEntry
      ? { name: topEntry[0], coins: topEntry[1], combo: combos.get(topEntry[0])?.n ?? 1 }
      : null

    // 败方表彰：输了也给名分，下一局还带 15 秒复仇加成
    const loser = altered ? 'ally' : 'cao'
    const loserTop = [...paidBy.entries()]
      .filter(([n]) => (sides.get(n) || 'cao') === loser)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([n, v]) => `${n} ${v} 抖`)
    const honor = [
      (loser === 'cao' ? '曹军 · 虽败犹荣' : '联军 · 守土有责') +
        '：' + (loserTop.length ? loserTop.join(' · ') : '本局无人应援'),
      '下一局该方享有 15 秒复仇加成 ×3',
    ]
    pendingRevenge = loser

    onReport({
      title: altered ? '历史被改写' : '史实复现',
      sub: `改写度 ${Math.round(rewrite)}% · ${altered ? '越过了 60% 门槛' : '没越过 60% 门槛'}`,
      paid,
      acts,
      mvp,
      honor,
      live: altered
        ? ['曹军保全水军，退回江北整顿', '孙刘联军守住江防，却没能扩大战果', '曹操仍握着南下通道，统一只是延后']
        : ['曹操烧船北撤，荆州落入孙刘之手', '刘备借荆州站稳，三分天下开始成形'],
      dead: altered
        ? ['三国鼎立不会出现', '刘备不会再有借荆州的机会', '孙权不会因大胜坐稳江东']
        : ['曹军一鼓作气吞并江东'],
    })
    say(altered ? '我们真的把结局改掉了。' : '这一局，还是按史书收场。')
    endTimer = window.setTimeout(reset, 9000)
  }

  function tick(dt: number, t: number) {
    const target = 0.85 - rewrite / 100 * 0.7
    front += (target - front) * Math.min(1, dt * 2.2)

    if (t > 22_000 && t < JUDGE_AT && fireships.length < 8 && Math.random() < dt * 2.4) {
      fireships.push({ x: rand(90, 270), y: 560, vy: -rand(70, 95) })
    }
    for (const f of fireships) {
      f.y += f.vy * dt
      if (Math.random() < dt * 10) {
        flames.push({ x: f.x, y: f.y - 4, vy: -rand(10, 24), life: 1 })
      }
    }
    fireships = fireships.filter((f) => f.y > 300)

    if (resolved && outcome === 'base') {
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
    for (const s of smoke) { s.y -= dt * 18; s.life -= dt * 0.7; if (s.r != null) s.r += dt * 8 }
    flames = flames.filter((f) => f.life > 0)
    smoke = smoke.filter((s) => s.life > 0)

    // 阶段推进 + 倒数
    const ls = losingSideNow()
    if (ls !== comebackSide) {
      comebackSide = ls
      if (ls === 'cao') say('曹军快顶不住了——现在小额打赏效果加倍，便宜的也能顶上去。')
      else if (ls === 'ally') say('联军快守不住了——现在小额打赏效果加倍。')
    }
    const PHASES = [
      { at: 0, label: '列阵' },
      { at: 10_000, label: '交锋' },
      { at: 25_000, label: '白热化' },
      { at: 52_000, label: '封账' },
    ]
    let pi = 0
    for (let i = 0; i < PHASES.length; i++) if (t >= PHASES[i].at) pi = i
    if (pi !== phaseIdx) {
      phaseIdx = pi
      phaseLabel = PHASES[pi].label
      if (pi === 1) say('交锋开始，发 1 或者 2 选边。')
      else if (pi === 2) say('白热化了，现在每一票都算数。')
      else if (pi === 3) say('封账，倒计时结束就定局。')
    }
    if (!resolved && t > JUDGE_AT - 5000) countdown = Math.max(0, Math.ceil((JUDGE_AT - t) / 1000))
    else if (resolved && t > ROUND_MS - 5000) countdown = Math.max(0, Math.ceil((ROUND_MS - t) / 1000))
    else countdown = 0

    if (t >= nextWaveAt) {
      nextWaveAt += 15_000
      const cp = caoShipPos(2)
      const ap = allyShipPos(2)
      pulses.push({ x: cp.x, y: cp.y + 10, t: 0, color: 'rgba(255,120,120,.55)' })
      pulses.push({ x: ap.x, y: ap.y + 10, t: 0, color: 'rgba(120,190,255,.55)' })
      floaters.push({ x: W / 2, y: 300, text: '援军抵达', t: 0, color: 'rgba(255,230,180,.9)' })
      say('新一波援军到了，战线要动了！')
    }
    for (const p of pulses) p.t += dt
    for (const f of floaters) f.t += dt
    pulses = pulses.filter((p) => p.t < 1.2)
    floaters = floaters.filter((f) => f.t < 1.4)

    if (t >= JUDGE_AT) judge()
    if (t >= ROUND_MS) finish()
  }

  /* ---------------- 绘制 ---------------- */
  function ridge(yBase: number, h: number, color: string, seed: number) {
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

  function isoCell(gx: number, gy: number, color: string) {
    const a = isoP(gx, gy)
    const b = isoP(gx + 1, gy)
    const c = isoP(gx + 1, gy + 1)
    const d = isoP(gx, gy + 1)
    g.beginPath()
    g.moveTo(a.x, a.y)
    g.lineTo(b.x, b.y)
    g.lineTo(c.x, c.y)
    g.lineTo(d.x, d.y)
    g.closePath()
    g.fillStyle = color
    g.fill()
  }

  function ship(x: number, y: number, s: number, hull: string, sail: string, burning: boolean) {
    const w = 15 * s
    const h = 6 * s

    // 水面投影
    g.beginPath(); g.ellipse(x, y + h * 1.0, w * 1.08, h * 0.62, 0, 0, 6.28)
    g.fillStyle = 'rgba(0,0,0,.38)'; g.fill()

    // 船身下半（暗）
    g.beginPath()
    g.moveTo(x - w, y)
    g.lineTo(x - w * 0.5, y + h * 0.95)
    g.lineTo(x + w * 0.5, y + h * 0.95)
    g.lineTo(x + w, y)
    g.closePath()
    g.fillStyle = burning ? '#4a1c14' : hull
    g.fill()
    g.globalAlpha = 0.45
    g.fillStyle = '#000'
    g.fill()
    g.globalAlpha = 1

    // 甲板
    g.beginPath()
    g.moveTo(x - w, y)
    g.lineTo(x - w * 0.55, y - h)
    g.lineTo(x + w * 0.55, y - h)
    g.lineTo(x + w, y)
    g.closePath()
    g.fillStyle = burning ? '#7a3320' : hull
    g.fill()
    g.strokeStyle = burning ? '#ff8a4c' : 'rgba(255,255,255,.18)'
    g.lineWidth = 1
    g.stroke()

    // 木纹
    g.strokeStyle = 'rgba(0,0,0,.20)'
    g.lineWidth = 0.8
    for (let i = -1; i <= 1; i++) {
      g.beginPath()
      g.moveTo(x + i * w * 0.42, y - h * 0.88)
      g.lineTo(x + i * w * 0.5, y - h * 0.08)
      g.stroke()
    }

    // 桨
    g.strokeStyle = burning ? 'rgba(255,176,102,.6)' : 'rgba(226,232,240,.45)'
    g.lineWidth = 1
    for (let i = -1; i <= 1; i++) {
      g.beginPath()
      g.moveTo(x + i * w * 0.5, y - h * 0.05)
      g.lineTo(x + i * w * 0.62, y + h * 0.9)
      g.stroke()
    }

    // 桅杆 + 帆 + 桅顶旗
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

  function squad(x: number, y: number, color: string, flag: string) {
    g.beginPath(); g.ellipse(x + 3, y + 5, 12, 3.6, 0, 0, 6.28)
    g.fillStyle = 'rgba(0,0,0,.30)'; g.fill()

    // 军旗
    g.strokeStyle = 'rgba(228,232,238,.55)'
    g.lineWidth = 1
    g.beginPath(); g.moveTo(x + 11, y + 4); g.lineTo(x + 11, y - 18); g.stroke()
    g.fillStyle = flag
    g.beginPath(); g.moveTo(x + 11, y - 18); g.lineTo(x + 22, y - 15); g.lineTo(x + 11, y - 9)
    g.closePath(); g.fill()
    g.strokeStyle = 'rgba(0,0,0,.30)'
    g.lineWidth = 0.8
    g.stroke()

    // 三名士兵：矛 + 身 + 头 + 盾
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

  function draw() {
    const now = performance.now()
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#0b1220')
    sky.addColorStop(0.4, '#141d2d')
    sky.addColorStop(0.7, '#1c2333')
    sky.addColorStop(1, '#07090f')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)

    // 远山三层，越远越淡
    ridge(150, 86, '#0d1420', 1.1)
    ridge(164, 66, '#131c2b', 2.3)
    ridge(176, 48, '#1a2434', 0.6)

    const LAND = ['#2b3526', '#303c2a', '#273120', '#35422e']
    const WATER = ['#17445f', '#123a56']
    const EDGE = '#151b14'
    for (let s = 0; s <= 16; s++) {
      for (let gx = 0; gx <= 8; gx++) {
        const gy = s - gx
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
        isoCell(gx, gy, col)
      }
    }

    // 草地细节：每块地上几簇草
    g.strokeStyle = 'rgba(150,180,120,.35)'
    g.lineWidth = 1
    for (let s = 0; s <= 16; s++) {
      for (let gx = 0; gx <= 8; gx++) {
        const gy = s - gx
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

    // 底部收边：把地图下缘融进舞台底色，不留死黑
    const fg = g.createLinearGradient(0, 500, 0, H)
    fg.addColorStop(0, 'rgba(8,11,9,0)')
    fg.addColorStop(1, 'rgba(6,9,7,.92)')
    g.fillStyle = fg
    g.fillRect(0, 500, W, H - 500)

    const ents: Array<{ y: number; draw: () => void }> = []
    boats.forEach((b) => {
      const p = caoShipPos(b.col)
      ents.push({ y: p.y, draw: () => ship(p.x, p.y, 1.4, '#7a3a32', '#e06a5f', b.burn) })
    })
    for (let i = 0; i < 4; i++) {
      const p = allyShipPos(i)
      ents.push({ y: p.y, draw: () => ship(p.x, p.y, 1.25, '#2b5a74', '#5aa8e0', false) })
    }
    for (let i = 0; i < 5; i++) {
      const p = isoP(0.45, 0.5 + i * 0.8)
      ents.push({ y: p.y, draw: () => squad(p.x, p.y, '#ff7a72', 'rgba(255,110,110,.65)') })
    }
    for (let i = 0; i < 5; i++) {
      const p = isoP(7.15, 3.5 + i * 0.8)
      ents.push({ y: p.y, draw: () => squad(p.x, p.y, '#6db6ff', 'rgba(110,190,255,.65)') })
    }
    ents.sort((a, b) => a.y - b.y)
    ents.forEach((e) => e.draw())

    for (const f of fireships) ship(f.x, f.y, 0.55, '#7a3a12', 'rgba(255,196,120,.95)', false)

    for (const s of smoke) {
      g.beginPath(); g.arc(s.x, s.y, s.r ?? 6, 0, 6.28)
      g.fillStyle = `rgba(58,58,64,${0.22 * s.life})`; g.fill()
    }
    for (const f of flames) {
      const a = clamp(f.life, 0, 1)
      g.beginPath(); g.arc(f.x, f.y, 2.8 * a + 1, 0, 6.28)
      g.fillStyle = `rgba(255,${Math.round(120 + 90 * a)},60,${0.8 * a})`; g.fill()
    }

    // 暗角，把注意力压回战场中心
    const vig = g.createRadialGradient(W / 2, H * 0.56, 130, W / 2, H * 0.56, 400)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(0,0,0,.55)')
    g.fillStyle = vig
    g.fillRect(0, 0, W, H)

    // 援军脉冲
    for (const p of pulses) {
      const k = p.t / 1.2
      g.beginPath(); g.arc(p.x, p.y, 10 + k * 90, 0, 6.28)
      g.globalAlpha = 1 - k
      g.strokeStyle = p.color
      g.lineWidth = 3
      g.stroke()
      g.globalAlpha = 1
    }

    // 飘字
    for (const f of floaters) {
      const k = f.t / 1.4
      g.globalAlpha = 1 - k
      g.fillStyle = f.color
      g.font = '700 15px -apple-system,"PingFang SC",sans-serif'
      g.textAlign = 'center'
      g.fillText(f.text, f.x, f.y - k * 34)
      g.globalAlpha = 1
    }

    // 顶部战况条（白线 = 60% 门槛）
    const barW = 260
    const barX = (W - barW) / 2
    const barY = 26
    g.fillStyle = 'rgba(4,6,10,.55)'
    g.fillRect(barX - 3, barY - 3, barW + 6, 14)
    g.fillStyle = 'rgba(255,255,255,.12)'
    g.fillRect(barX, barY, barW, 8)
    g.fillStyle = '#ff5b63'
    g.fillRect(barX, barY, barW * (rewrite / 100), 8)
    g.fillStyle = rewrite >= GATE ? 'rgba(195,166,255,.95)' : 'rgba(255,255,255,.7)'
    g.fillRect(barX + barW * (GATE / 100) - 1, barY - 4, 2, 16)
    g.fillStyle = 'rgba(232,236,246,.9)'
    g.font = '600 9px -apple-system,"PingFang SC",sans-serif'
    g.textAlign = 'center'
    g.fillText(`改写 ${Math.round(rewrite)}%`, W / 2, barY - 7)

    // 复仇加成提示
    if (revengeSide && performance.now() - startedAt < 15_000) {
      const rp = revengeSide === 'cao' ? caoShipPos(0) : allyShipPos(0)
      g.textAlign = 'center'
      g.font = '700 10px -apple-system,"PingFang SC",sans-serif'
      g.fillStyle = 'rgba(201,182,255,.95)'
      g.fillText('复仇加成 ×3', rp.x, rp.y - 44)
    }

    // 绝地反击提示
    if (comebackSide) {
      const cp = comebackSide === 'cao' ? caoShipPos(0) : allyShipPos(0)
      g.textAlign = 'center'
      g.font = '700 10px -apple-system,"PingFang SC",sans-serif'
      g.fillStyle = 'rgba(95,224,176,.95)'
      g.fillText('绝地反击 ×2.5', cp.x, cp.y - 30)
    }

    // 阶段标签
    if (phaseLabel) {
      g.font = '600 10px -apple-system,"PingFang SC",sans-serif'
      g.textAlign = 'center'
      const tw = g.measureText(phaseLabel).width
      g.fillStyle = 'rgba(8,11,17,.62)'
      g.fillRect(W / 2 - tw / 2 - 9, 40, tw + 18, 17)
      g.fillStyle = 'rgba(206,218,238,.92)'
      g.fillText(phaseLabel, W / 2, 52)
    }

    // 倒数
    if (countdown > 0) {
      g.globalAlpha = 0.9
      g.fillStyle = '#ffc857'
      g.font = '800 58px -apple-system,"PingFang SC",sans-serif'
      g.textAlign = 'center'
      g.fillText(String(countdown), W / 2, H * 0.46)
      g.globalAlpha = 1
    }
  }

  function loop(ts: number) {
    raf = requestAnimationFrame(loop)
    const now = ts || performance.now()
    const dt = Math.min(0.05, (now - (last || now)) / 1000 || 0.016)
    last = now
    if (!active.value) return
    tick(dt, now - startedAt)
    draw()
  }
  raf = requestAnimationFrame(loop)

  reset()

  return {
    gift(id: string, user = '主播') {
      const gf = GIFTS[id]
      if (!gf || !running) return
      const side = sides.get(user) || 'cao'
      const dir = side === 'cao' ? 1 : -1
      // 复仇加成（上局败方，开局 15 秒）优先于绝地反击（弱势方小额）
      const revenge = revengeSide === side && performance.now() - startedAt < 15_000
      const comeback = !revenge && comebackSide === side && gf.coins <= 52
      const mult = revenge ? 3 : comeback ? 2.5 : 1
      const gain = Math.round(gf.push * mult)
      rewrite = clamp(rewrite + gain * dir, 0, 100)
      paidBy.set(user, (paidBy.get(user) || 0) + gf.coins)
      contribs.push({ name: user, action: gf.label, coins: gf.coins })

      // 连击：8 秒内连刷算同一串，只做展示不给数值加成
      const stamp = performance.now()
      const rec = combos.get(user) || { n: 0, last: 0 }
      rec.n = stamp - rec.last < 8000 ? rec.n + 1 : 1
      rec.last = stamp
      combos.set(user, rec)

      const p = side === 'cao' ? caoShipPos(2) : allyShipPos(2)
      floaters.push({
        x: p.x,
        y: p.y - 8,
        text: revenge ? `+${gain} ×3` : comeback ? `+${gain} ×2.5` : '+' + gain,
        t: 0,
        color: revenge ? '#c9b6ff' : comeback ? '#5fe0b0' : side === 'cao' ? '#ffb3b8' : '#b3d9ff',
      })
      pulses.push({ x: p.x, y: p.y + 8, t: 0, color: side === 'cao' ? 'rgba(255,140,140,.6)' : 'rgba(140,200,255,.6)' })
      if (rec.n >= 3) {
        floaters.push({ x: p.x, y: p.y - 26, text: `连击 ×${rec.n}`, t: 0, color: '#ffc857' })
        pulses.push({ x: p.x, y: p.y + 8, t: 0, color: 'rgba(255,200,87,.55)' })
      }
      if (id === 'donut' && side === 'cao') say('铁索解开！连环船散成一片')
      else if (id === 'battery' && side === 'cao') say('风向逆转，西北风起，火船难行')
      else say(`${gf.label}！改写度 ${Math.round(rewrite)}%`)
    },
    comment(text: string, from = '观众') {
      if (!running) return
      const t = String(text || '').trim()
      if (!t) return
      if (t === '1' || t === '曹' || t === '曹军') {
        sides.set(from, 'cao')
        say(`${from} 加入曹军`)
        return
      }
      if (t === '2' || t === '孙' || t === '联军') {
        sides.set(from, 'ally')
        say(`${from} 加入孙刘联军`)
        return
      }
      const side = sides.get(from) || 'cao'
      rewrite = clamp(rewrite + (side === 'cao' ? 0.8 : -0.8), 0, 100)
    },
    reset,
    dispose() {
      cancelAnimationFrame(raf)
      clearTimeout(endTimer)
    },
  }
}
</script>

<style scoped>
.dg {
  position: absolute;
  inset: 0;
}
.dg__canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.dg-report {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 26px 20px;
  text-align: center;
  background: rgba(4, 6, 10, 0.84);
  backdrop-filter: blur(4px);
}
.dg-report__k { font-size: 9px; letter-spacing: 2px; color: #7b8496; }
.dg-report__t { font-size: 22px; font-weight: 800; letter-spacing: 2px; color: #8fa6ff; }
.dg-report__t.is-alt { color: #c3a6ff; }
.dg-report__s { font-size: 10.5px; color: #9aa3b4; margin-bottom: 6px; }
.dg-report__h { align-self: flex-start; margin-top: 9px; font-size: 9.5px; letter-spacing: 1px; color: #6f7888; }
.dg-report__l { align-self: flex-start; text-align: left; font-size: 10.5px; line-height: 1.55; color: #d3dae6; }
.dg-report__l--dim { color: #8b93a3; }
.dg-report__l--ok { color: #8fe0b6; }
.dg-report__l--no { color: #ff9ea4; }
.dg-report__l--honor { color: #c9b6ff; }
.dg-report__mvp {
  align-self: flex-start;
  text-align: left;
  margin: 6px 0 2px;
  font-size: 10.5px;
  color: #e8ecf3;
}
.dg-report__mvp b { color: #ffc857; }
.dg-report__crown { color: #ffc857; margin-right: 2px; }
.dg-report__dim { color: #8b93a3; margin-left: 4px; }
.dg-fade-enter-active,
.dg-fade-leave-active { transition: opacity 0.25s; }
.dg-fade-enter-from,
.dg-fade-leave-to { opacity: 0; }
</style>
