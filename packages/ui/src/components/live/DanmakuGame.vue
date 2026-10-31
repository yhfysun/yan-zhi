<template>
  <div class="dg">
    <canvas ref="canvasEl" class="danmaku-canvas" />
    <Transition name="dg-fade">
      <div v-if="report" class="dg-report">
        <div class="dg-report__k">{{ reportKey }}</div>
        <div class="dg-report__t">{{ report.title }}</div>
        <div class="dg-report__s">{{ report.sub }}</div>

        <div v-if="report.mvp" class="dg-report__mvp">
          <span class="dg-report__crown">★</span>
          本局 MVP：<b>{{ report.mvp.name }}</b>
          <span class="dg-report__dim">{{ report.mvp.coins }} 抖 · 最高连击 ×{{ report.mvp.combo }}</span>
        </div>

        <div class="dg-report__h">谁改写了这一局</div>
        <div class="report-list">
          {{ report.paid.length ? report.paid.join(' · ') : '无人打赏，纯观战' }}
        </div>
        <div v-if="report.acts.length" class="report-list dim">关键一手：{{ report.acts.join('，') }}</div>

        <div class="dg-report__h">接下来会发生什么</div>
        <div class="report-list ok">
          <div v-for="(x, i) in report.live" :key="'a' + i">· {{ x }}</div>
        </div>

        <div class="dg-report__h">败方表彰</div>
        <div class="report-list honor">
          <div v-for="(x, i) in report.honor" :key="'h' + i">· {{ x }}</div>
        </div>

        <div class="dg-report__h">什么不会发生了</div>
        <div class="report-list no">
          <div v-for="(x, i) in report.dead" :key="'b' + i">· {{ x }}</div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
/**
 * 弹幕游戏 · 引擎（直播场景画面源）。
 *
 * 引擎管：60s 一局计时（40s 判定）、拉锯台账、连击/打赏账目、判赏红线
 * （判定后不再改结论）；玩法（danmaku/ 目录）管画面模拟与动作词表。
 * 主播台词通过 say 事件抛给直播页走既有 Cue 队列。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { GIFTS, GIFT_BY_ID } from './danmaku/gifts'
import { GATE, ROUND_MS, JUDGE_AT } from './danmaku/shared-constants'
import { W, H, clamp, hexToRgba, FONT } from './danmaku/shared'
import { createModeByKey, MODE_FACTORIES } from './danmaku/registry'
import type { DanmakuGameMode, EngineState, ModeEvents, Side } from './danmaku/types'

const props = defineProps<{ active?: boolean }>()
const emit = defineEmits<{ (e: 'say', text: string): void }>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
const report = ref<Report | null>(null)
const reportKey = ref('')

interface Report {
  title: string
  sub: string
  paid: string[]
  acts: string[]
  live: string[]
  dead: string[]
  honor: string[]
  mvp: { name: string; coins: number; combo: number } | null
}

let api: {
  gift: (id: string, user?: string) => void
  comment: (text: string, from?: string) => void
  reset: () => void
  dispose: () => void
  setMode: (key: string) => void
  modes: () => Array<{ key: string; name: string }>
} | null = null

defineExpose({
  gift: (id: string, user?: string) => api?.gift(id, user),
  comment: (text: string, from?: string) => api?.comment(text, from),
  reset: () => api?.reset(),
  setMode: (key: string) => api?.setMode(key),
  modeList: () => api?.modes() ?? [],
})

const active = ref(props.active !== false)
watch(
  () => props.active,
  (v) => { active.value = v !== false },
)

onMounted(() => {
  const el = canvasEl.value
  if (!el) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  el.width = W * dpr
  el.height = H * dpr
  el.style.width = '100%'
  el.style.height = '100%'
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  api = createEngine(ctx, (text) => emit('say', text), (r, key) => {
    report.value = r
    reportKey.value = key
  })
})

onBeforeUnmount(() => {
  api?.dispose()
  api = null
})

/* ===================================================================== */

interface Floater { x: number; y: number; text: string; t: number; color: string }
interface Pulse { x: number; y: number; t: number; color: string }
interface Banner { title: string; sub: string; color: string; t: number }

const PHASE_SAY_CD = 1200

function createEngine(
  g: CanvasRenderingContext2D,
  say: (text: string) => void,
  onReport: (r: Report | null, key: string) => void,
) {
  /* ---------------- 引擎台账 ---------------- */
  let mode: DanmakuGameMode
  let modeKey = ''
  let rewrite = 0
  let resolved = false
  let outcome: 'base' | 'altered' | null = null
  let running = true
  let startedAt = performance.now()
  let raf = 0
  let last = 0
  let endTimer = 0
  let lastShare = 50

  const sides = new Map<string, Side>()
  const paidBy = new Map<string, number>()
  let contribs: Array<{ name: string; action: string; coins: number }> = []
  const combos = new Map<string, { n: number; last: number }>()

  let floaters: Floater[] = []
  let pulses: Pulse[] = []
  let banner: Banner | null = null
  let countdown = 0
  let phaseIdx = -1
  let comebackSide: Side | null = null
  let pendingRevenge: Side | null = null
  let revengeSide: Side | null = null
  let lastSayAt = 0

  /* ---------------- 玩法切换 ---------------- */
  function setMode(key: string) {
    const next = createModeByKey(key)
    if (!next) return
    modeKey = key
    mode = next
    startRound()
  }

  function modes() {
    // 每个工厂跑一次拿元数据；工厂无外部副作用，实例即弃
    return MODE_FACTORIES.map((f) => {
      const m = f()
      return { key: m.key, name: m.name }
    })
  }

  /* ---------------- 一局生命周期 ---------------- */
  function startRound() {
    rewrite = mode.startAt
    resolved = false
    outcome = null
    running = true
    startedAt = performance.now()
    sides.clear()
    paidBy.clear()
    contribs = []
    combos.clear()
    floaters = []
    pulses = []
    banner = null
    countdown = 0
    phaseIdx = -1
    comebackSide = null
    revengeSide = pendingRevenge
    pendingRevenge = null
    lastShare = 50
    mode.reset()
    onReport(null, modeKey)
    say(mode.note)
  }

  /** 弱势方：拉锯玩法专用。开局 10 秒内不判，免得一开播就叫 */
  function losingSideNow(): Side | null {
    if (mode.team) return null
    if (performance.now() - startedAt < 10_000) return null
    if (rewrite < 25) return 'a'
    if (rewrite > 75) return 'b'
    return null
  }

  function judge() {
    if (resolved) return
    resolved = true
    if (mode.team) {
      outcome = 'altered'
    } else {
      outcome = rewrite >= mode.gate ? 'altered' : 'base'
    }
    const lead: Side | null = mode.team ? null : outcome === 'altered' ? 'a' : 'b'
    const ev = mode.onJudge(outcome === 'altered', lead, engineState())
    if (ev) applyEvents(ev)
  }

  function finish() {
    if (!running) return
    running = false
    buildReport()
  }

  function engineState(): EngineState {
    return { rewrite, resolved }
  }

  /* ---------------- 战报 ---------------- */
  function buildReport() {
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

    // 败方表彰（团队玩法：无基线，不表彰，战报由玩法给）
    const loser: Side | null = mode.team
      ? null
      : outcome === 'altered' ? 'b' : 'a'
    const loserTop = loser
      ? [...paidBy.entries()]
          .filter(([n]) => (sides.get(n) || 'a') === loser)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([n, v]) => `${n} ${v} 抖`)
      : []
    const honor = mode.team
      ? []
      : [
          (loser === 'a' ? `${mode.sides.a} · 虽败犹荣` : `${mode.sides.b} · 守土有责`) +
            '：' + (loserTop.length ? loserTop.join(' · ') : '本局无人应援'),
          '下一局该方享有 15 秒复仇加成 ×3',
        ]
    if (loser) pendingRevenge = loser

    const percent = mode.team ? lastShare : Math.round(rewrite)
    const rep = mode.report({
      outcome: outcome ?? 'base',
      lead: mode.team ? null : outcome === 'altered' ? 'a' : 'b',
      percent,
      top: topEntry ? { name: topEntry[0], coins: topEntry[1] } : null,
      comboTop: null,
      contribs,
      losers: loserTop,
    })
    onReport(
      {
        title: rep.title,
        sub: rep.sub,
        paid,
        acts,
        live: rep.live,
        dead: rep.dead,
        honor,
        mvp,
      },
      modeKey,
    )
    say('这一局收场了。')
    endTimer = window.setTimeout(startRound, 9000)
  }

  /* ---------------- 事件应用 ---------------- */
  function applyEvents(ev: ModeEvents) {
    if (ev.say) {
      const now = performance.now()
      // 主播台词节流 1.2s，大额礼物/判定话不被淹没
      if (now - lastSayAt >= PHASE_SAY_CD) {
        lastSayAt = now
        say(ev.say)
      }
    }
    if (ev.floater) {
      const anchor = anchorOf(ev.floater.at ?? 'a')
      floaters.push({
        x: ev.floater.x ?? anchor.x,
        y: ev.floater.y ?? anchor.y,
        text: ev.floater.text,
        t: 0,
        color: ev.floater.color,
      })
    }
    if (ev.banner) banner = { ...ev.banner, t: 0 }
    if (ev.pulse) {
      const keys: Array<'a' | 'b'> = ev.pulse === 'both' ? ['a', 'b'] : [ev.pulse]
      for (const k of keys) {
        const a = anchorOf(k)
        pulses.push({ x: a.x, y: a.y, t: 0, color: k === 'a' ? 'rgba(255,140,140,.6)' : 'rgba(140,200,255,.6)' })
      }
    }
  }

  function anchorOf(side: 'a' | 'b') {
    const custom = mode.anchors?.()
    const base = custom ?? {
      a: { x: W * 0.3, y: H * 0.42 },
      b: { x: W * 0.7, y: H * 0.42 },
    }
    return base[side]
  }

  /* ---------------- 输入：礼物 ---------------- */
  function gift(id: string, user = '主播') {
    const gf = GIFT_BY_ID[id]
    if (!gf || !running || !mode) return
    const side = sides.get(user) || 'a'
    // 复仇加成（上局败方，开局 15 秒）优先于绝地反击（弱势方小额）
    const revenge = revengeSide === side && performance.now() - startedAt < 15_000
    const comeback = !revenge && comebackSide === side && gf.coins <= 52
    const mult = revenge ? 3 : comeback ? 2.5 : 1
    const gain = Math.round(gf.push * mult)

    if (!resolved && !mode.team) {
      const dir = side === 'a' ? 1 : -1
      rewrite = clamp(rewrite + gain * dir, 0, 100)
    }
    paidBy.set(user, (paidBy.get(user) || 0) + gf.coins)
    contribs.push({ name: user, action: mode.giftLabels[id]?.[side === 'a' ? 0 : 1] ?? gf.name, coins: gf.coins })

    // 连击：8 秒内连刷算同一串，只做展示不给数值加成
    const stamp = performance.now()
    const rec = combos.get(user) || { n: 0, last: 0 }
    rec.n = stamp - rec.last < 8000 ? rec.n + 1 : 1
    rec.last = stamp
    combos.set(user, rec)

    // 玩法反应：判定后也照发（玩法在回调里读 resolved 自律，只做展示）
    const ev = mode.onGift(id, side, user, mult, engineState())
    if (ev) applyEvents(ev)

    // 引擎级飘字：倍率与连击（玩法没画时兜底可见）
    const anchor = anchorOf(side)
    if (mult > 1) {
      floaters.push({
        x: anchor.x,
        y: anchor.y - 8,
        text: mult === 3 ? `+${gain} ×3` : `+${gain} ×2.5`,
        t: 0,
        color: mult === 3 ? '#c9b6ff' : '#5fe0b0',
      })
    }
    if (rec.n >= 3) {
      floaters.push({ x: anchor.x, y: anchor.y - 26, text: `连击 ×${rec.n}`, t: 0, color: '#ffc857' })
      pulses.push({ x: anchor.x, y: anchor.y + 8, t: 0, color: 'rgba(255,200,87,.55)' })
    }
  }

  /* ---------------- 输入：弹幕 ---------------- */
  function comment(text: string, from = '观众') {
    if (!running || !mode) return
    const t = String(text || '').trim()
    if (!t) return

    // 1/2 选边是引擎级约定
    if (t === '1') {
      sides.set(from, 'a')
      return
    }
    if (t === '2') {
      sides.set(from, 'b')
      return
    }

    const side = sides.get(from) ?? null
    const consumed = mode.onComment(t, from, side, engineState())
    if (consumed && typeof consumed === 'object' && 'join' in consumed) {
      // 玩法识别出主题站队词（如「甜」）：记队 + 按方向推拉锯
      sides.set(from, consumed.join)
      if (!resolved && !mode.team) {
        const dir = consumed.join === 'a' ? 1.2 : -1.2
        rewrite = clamp(rewrite + dir, 0, 100)
      }
      return
    }
    if (consumed === false && !resolved && !mode.team) {
      // 引擎兜底：拉锯玩法按观众所属侧小幅推动（没站队默认改写方）
      const dir = (side ?? 'a') === 'a' ? 0.8 : -0.8
      rewrite = clamp(rewrite + dir, 0, 100)
    }
  }

  /* ---------------- 主循环 ---------------- */
  function tick(dt: number, t: number) {
    // 阶段推进
    let pi = 0
    for (let i = 0; i < mode.phases.length; i++) if (t >= mode.phases[i].at * 1000) pi = i
    if (pi !== phaseIdx) {
      phaseIdx = pi
      const ev = mode.onPhase?.(pi, mode.phases[pi].label)
      if (ev) applyEvents(ev)
    }

    const ls = losingSideNow()
    if (ls !== comebackSide) {
      comebackSide = ls
      if (ls === 'a') say(`${mode.sides.a}快顶不住了——现在小额打赏效果加倍。`)
      else if (ls === 'b') say(`${mode.sides.b}快顶不住了——现在小额打赏效果加倍。`)
    }

    if (!resolved && t > JUDGE_AT - 5000) countdown = Math.max(0, Math.ceil((JUDGE_AT - t) / 1000))
    else if (resolved && t > ROUND_MS - 5000) countdown = Math.max(0, Math.ceil((ROUND_MS - t) / 1000))
    else countdown = 0

    if (t >= JUDGE_AT && !resolved) judge()
    if (t >= ROUND_MS && running) finish()

    if (running) {
      const ev = mode.tick(t, dt, engineState())
      if (ev) {
        if (typeof ev.share === 'number') lastShare = ev.share
        applyEvents(ev)
      }
    }
  }

  function draw() {
    mode.draw(g, performance.now() - startedAt, 0.016, engineState())

    // 引擎叠加层：横幅
    if (banner) {
      banner.t += 0.016
      if (banner.t > 2.2) {
        banner = null
      } else {
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
  }

  function drawOverlays() {
    // 脉冲
    for (const p of pulses) p.t += 0.016
    pulses = pulses.filter((p) => p.t < 1.2)
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
    for (const f of floaters) f.t += 0.016
    floaters = floaters.filter((f) => f.t < 1.4)
    for (const f of floaters) {
      const k = f.t / 1.4
      g.globalAlpha = 1 - k
      g.fillStyle = f.color
      g.font = `700 15px ${FONT}`
      g.textAlign = 'center'
      g.fillText(f.text, f.x, f.y - k * 34)
      g.globalAlpha = 1
    }

    // 顶部战况条（白线 = 门槛；团队玩法显示玩法名）
    const barW = 260
    const barX = (W - barW) / 2
    const barY = 26
    g.fillStyle = 'rgba(4,6,10,.55)'
    g.fillRect(barX - 3, barY - 3, barW + 6, 14)
    g.fillStyle = 'rgba(255,255,255,.12)'
    g.fillRect(barX, barY, barW, 8)
    if (!mode.team) {
      g.fillStyle = '#ff5b63'
      g.fillRect(barX, barY, barW * (rewrite / 100), 8)
      g.fillStyle = rewrite >= mode.gate ? 'rgba(195,166,255,.95)' : 'rgba(255,255,255,.7)'
      g.fillRect(barX + barW * (mode.gate / 100) - 1, barY - 4, 2, 16)
    }
    g.fillStyle = 'rgba(232,236,246,.9)'
    g.font = `600 9px ${FONT}`
    g.textAlign = 'center'
    g.fillText(mode.team ? mode.name : `改写 ${Math.round(rewrite)}%`, W / 2, barY - 7)

    // 复仇/绝地提示（拉锯玩法才有）
    if (!mode.team && revengeSide && performance.now() - startedAt < 15_000) {
      const a = anchorOf(revengeSide)
      g.textAlign = 'center'
      g.font = `700 10px ${FONT}`
      g.fillStyle = 'rgba(201,182,255,.95)'
      g.fillText('复仇加成 ×3', a.x, a.y - 44)
    }
    if (!mode.team && comebackSide) {
      const a = anchorOf(comebackSide)
      g.textAlign = 'center'
      g.font = `700 10px ${FONT}`
      g.fillStyle = 'rgba(95,224,176,.95)'
      g.fillText('绝地反击 ×2.5', a.x, a.y - 30)
    }

    // 阶段标签
    if (phaseIdx >= 0 && mode.phases[phaseIdx]) {
      const lbl = mode.phases[phaseIdx].label
      g.font = `600 10px ${FONT}`
      g.textAlign = 'center'
      const tw = g.measureText(lbl).width
      g.fillStyle = 'rgba(8,11,17,.62)'
      g.fillRect(W / 2 - tw / 2 - 9, 40, tw + 18, 17)
      g.fillStyle = 'rgba(206,218,238,.92)'
      g.fillText(lbl, W / 2, 52)
    }

    // 倒数
    if (countdown > 0) {
      g.globalAlpha = 0.9
      g.fillStyle = '#ffc857'
      g.font = `800 58px ${FONT}`
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
    drawOverlays()
  }
  raf = requestAnimationFrame(loop)

  startRound()

  return {
    gift,
    comment,
    reset: startRound,
    setMode,
    modes,
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
.danmaku-canvas {
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
.dg-report__s { font-size: 10.5px; color: #9aa3b4; margin-bottom: 6px; }
.dg-report__h { align-self: flex-start; margin-top: 9px; font-size: 9.5px; letter-spacing: 1px; color: #6f7888; }
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
.report-list { align-self: flex-start; text-align: left; font-size: 10.5px; line-height: 1.55; color: #d3dae6; }
.report-list.dim { color: #8b93a3; }
.report-list.ok { color: #8fe0b6; }
.report-list.no { color: #ff9ea4; }
.report-list.honor { color: #c9b6ff; }
</style>
