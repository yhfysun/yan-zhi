import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useChatStore } from '../stores/chat'
import {
  affinityOf,
  bumpPetStats,
  collectWaitingIds,
  derivePetActivity,
  derivePetState,
  derivePetStateWithGame,
  emptyPetStats,
  lastUserText,
  petMemoryContent,
  petOutcome,
  petStatsFromRows,
  plainPetSettings,
  usePetStore,
  type PetInteraction,
  type PetStats,
} from '../stores/pet'
import { useMemoryStore } from '../stores/memory'
import { useAgentStore } from '../stores/agent'
import { useSpaceStore } from '../stores/space'

/** 任务终态在宠物上停留的时长：短到不长期占状态，长到用户能看见 */
const READY_TTL = 12_000
const ERROR_TTL = 30_000

/**
 * 主窗口 → 宠物窗的状态桥（2026-10-28）
 *
 * 宠物窗是独立渲染进程，**不重复连 WS**（否则双订阅、内存翻倍）。主窗口把派生后的
 * 轻量任务视图经 IPC 推过去，宠物窗只做渲染。信号全部来自 chat store 既有实现：
 *   runningConvIds / pausedConvIds / 四类 scopedPending.current
 *   onTaskFinished(convId) → runStatsByConv[convId].status 判 ready / error
 *
 * 优先级：needs-input > error > ready > paused > running > idle（方案 §2.3）。
 * 终态是**瞬态**：ready 停 12s、error 停 30s，之后回落；又开新任务时立即清掉。
 */
export function usePetBridge() {
  // 宠物窗自己也挂 App.vue，别在它里面再跑一遍
  if (window.location.hash.includes('/pet-window')) return

  const chat = useChatStore() as any
  const agents = useAgentStore() as any
  const spaces = useSpaceStore() as any
  const pet = usePetStore()
  const mem = useMemoryStore() as any
  pet.init()

  // 主窗口当前会话上报（2026-10-29）：游戏窗点「交给智能体代玩」时，
  // 主进程缺省把这一页挂到用户在主窗正在看的会话上（游戏窗自己的 store 未必同步）。
  // 主进程只认主窗口的发送者，子窗口发来会被忽略。
  watch(
    () => chat.currentConvId,
    (id: string) => {
      try { (window as any).electronAPI?.chatSession?.currentConv?.(String(id || '')) } catch { /* 非桌面端忽略 */ }
    },
    { immediate: true }
  )

  /** 最近一次任务终态 */
  const terminal = ref<'ready' | 'error' | null>(null)
  let terminalTimer = 0
  let offTaskFinished: (() => void) | undefined
  let offPetOpened: (() => void) | undefined
  let offPetClosed: (() => void) | undefined
  let offPetAction: (() => void) | undefined
  let offNeedSync: (() => void) | undefined
  let offHandoff: (() => void) | undefined

  /**
   * 显式移交状态（2026-10-29）：用户在独立游戏窗点「交给智能体代玩」后，
   * 主进程广播 {on:true,...}。宠物据此显示「代玩中」气泡，并在结束时演动作。
   */
  const gameHandoff = ref<{ on: boolean; tabId: string; convId: string; title: string; url: string }>({
    on: false, tabId: '', convId: '', title: '', url: '',
  })
  /** 结束演出用：广播的 on:false 可能不带 convId（关 tab / 关窗口），留最后一份 */
  let lastGameConvId = ''
  let outcomeTimer = 0

  function pushTerminal(kind: 'ready' | 'error') {
    terminal.value = kind
    window.clearTimeout(terminalTimer)
    terminalTimer = window.setTimeout(() => {
      terminal.value = null
    }, kind === 'error' ? ERROR_TTL : READY_TTL)
  }

  const snapshot = () => {
    const running = chat.runningConvIds?.size ?? 0
    const paused = chat.pausedConvIds?.size ?? 0
    // 四类「等你输入」按会话求并集：面板要跨会话显示，不能只看当前会话
    const waitIds = collectWaitingIds([
      chat.questionPendingByConv,
      chat.confirmationPendingByConv,
      chat.pathAuthPendingByConv,
      chat.toolAuthPendingByConv,
    ])
    const waiting = waitIds.length
    const pinned = pet.settings.pinnedConvId
    let pinnedState: any = null
    if (pinned) {
      const isRunning = chat.runningConvIds?.has?.(pinned)
      const isPaused = chat.pausedConvIds?.has?.(pinned)
      if (isRunning) pinnedState = 'running'
      else if (isPaused) pinnedState = 'paused'
    }
    const state = pinnedState || derivePetState({ running, paused, waiting, terminal: terminal.value })
    // ── 代玩切片（2026-10-29）：来源全部是既有字段 + 主进程的移交广播，不新起订阅 ──
    const g = gameHandoff.value
    const gameActive = !!g.on
    const gamePaused = !!(g.convId && chat.pausedConvIds?.has?.(g.convId))
    const steps = (chat.browserSteps || []) as Array<{ action?: string; label?: string }>
    const lastStep = steps.length ? steps[steps.length - 1] : null
    const stepLabel = String((lastStep && (lastStep.label || lastStep.action)) || '')
    const finalState = pinnedState || derivePetStateWithGame({
      running, paused, waiting, terminal: terminal.value, gameActive, gamePaused,
    })
    // 活动气泡：跟"用户正在看/跟着的任务"，没有就取第一个在跑的任务。
    // 只读 messagesByConv 的既有结构，不新起订阅；流式期间每帧重算也只是一次反向扫。
    const followId =
      pinned || String(chat.currentConvId || '') || [...(chat.runningConvIds ?? [])][0] || ''
    const followMsgs = followId ? chat.messagesByConv?.[followId] : null
    const activity =
      finalState === 'running'
        ? (gameActive
            ? { kind: 'act' as const, label: '代玩中', target: stepLabel || g.title || '' }
            : derivePetActivity(followMsgs) || { kind: 'think' as const, label: '思考中', target: '' })
        : null
    // 任务小面板用的轻量列表（≤5 行）：带分区、进度条、行内快答要的字段
    const titleOf = new Map<string, string>()
    const agentOf = new Map<string, string>()
    const agentNameById = new Map<string, string>()
    for (const a of ((agents.agents as any[]) || [])) agentNameById.set(String(a.id), String(a.name || ''))
    for (const c of chat.conversations || []) {
      titleOf.set(c.id, c.title || '未命名任务')
      const an = c.agentId ? agentNameById.get(String(c.agentId)) : ''
      if (an) agentOf.set(c.id, an)
    }
    const stats = (chat.runStatsByConv || {}) as Record<
      string,
      { status: string; startedAt?: number; endedAt?: number }
    >
    /** 面板一行：状态之外的 agent / 起止时间 / 计划进度 / 待答问题都由这里补齐 */
    const rowOf = (id: string, status: string) => {
      const plan = chat.planOf?.(id) || null
      const st = stats[id]
      return {
        id,
        title: titleOf.get(id) || '任务',
        status,
        agent: agentOf.get(id) || '',
        startedAt: Number(st?.startedAt) || 0,
        endedAt: Number(st?.endedAt) || 0,
        planDone: Number(plan?.done) || 0,
        planTotal: Number(plan?.total) || 0,
        question:
          status === 'needs-input' ? String((chat.questionPendingByConv as any)?.[id]?.question || '') : '',
      }
    }
    const tasks: Array<ReturnType<typeof rowOf>> = []
    for (const id of waitIds) tasks.push(rowOf(id, 'needs-input'))
    for (const id of chat.runningConvIds ?? []) tasks.push(rowOf(id, 'running'))
    for (const id of chat.pausedConvIds ?? []) tasks.push(rowOf(id, 'paused'))
    // 已结束的任务也列出来（按结束时间倒序）：出错的行上要能点「重试」
    const finished = Object.entries(stats)
      .filter(([id, r]) => (r.status === 'error' || r.status === 'completed') && !tasks.some((t) => t.id === id))
      .sort((a, b) => (Number(b[1].endedAt) || 0) - (Number(a[1].endedAt) || 0))
      .slice(0, 3)
    for (const [id, r] of finished) {
      if (tasks.some((t) => t.id === id)) continue
      tasks.push(rowOf(id, String((r as any).status)))
    }
    return {
      state: finalState,
      running,
      waiting,
      activity,
      game: {
        active: gameActive,
        paused: gamePaused,
        lastAt: Number(chat.lastBrowserToolAt) || 0,
        stepLabel,
        title: g.title || '',
        url: g.url || '',
      },
      memory: { affinity: affinityOf(petStats.value), ...petStats.value },
      title: String(chat.currentConversation?.title || ''),
      tasks: tasks.slice(0, 5),
      // 快问条左侧的智能体下拉：优先「可用于对话」的清单，没有就退回全部
      agents: ((agents.chatAgents && agents.chatAgents.length ? agents.chatAgents : agents.agents) || []).map(
        (a: any) => ({ id: a.id, name: a.name })
      ),
      // 工作目录（工作空间）：宠物派活落在哪个目录
      spaces: (spaces.spaces || []).map((x: any) => ({ id: x.id, name: x.name })),
      spaceId: spaces.currentSpaceId || '',
      // 每个空间下最近的会话：宠物菜单「工作目录 → 会话」二级列表用
      spaceConvs: ((chat as any).conversations || [])
        .filter((c: any) => c && c.spaceId && !c.archivedAt)
        .slice(0, 80)
        .map((c: any) => ({ id: c.id, title: c.title || '未命名会话', spaceId: c.spaceId, updatedAt: c.updatedAt || 0 })),
      agentId: agents.selectedId || '',
    }
  }

  const api = () => (window as any).electronAPI?.pet

  /* ===== 宠物记忆（memory 维度 pet）=====
   * 统计只存"相处次数"，不存对话内容。写盘双保险：
   *   ① 后端 memory 表（记忆管理页可见，需登录）
   *   ② localStorage 兜底（未登录 / 后端不可用时也记得住）
   */
  const PET_STATS_KEY = 'yz:pet:memory'
  const petStats = ref<PetStats>(emptyPetStats())
  let petMemoryId = ''

  function readLocalStats(): PetStats | null {
    try {
      const raw = localStorage.getItem(PET_STATS_KEY)
      if (!raw) return null
      return petStatsFromRows([{ metadata: JSON.parse(raw) }])
    } catch {
      return null
    }
  }
  function writeLocalStats(stats: PetStats) {
    try {
      localStorage.setItem(PET_STATS_KEY, JSON.stringify({ petStats: stats }))
    } catch {
      /* 存储不可用：只影响下次启动的恢复 */
    }
  }
  let persistTimer = 0
  function persistPetStats() {
    writeLocalStats(petStats.value)
    window.clearTimeout(persistTimer)
    persistTimer = window.setTimeout(async () => {
      const body = petMemoryContent(petStats.value)
      const metadata = { petStats: petStats.value }
      try {
        if (petMemoryId) await mem.updateMemory?.(petMemoryId, { content: body, metadata })
        else {
          const row = await mem.createMemory?.({ content: body, type: 'pet', tags: ['pet'], metadata })
          if (row?.id) petMemoryId = String(row.id)
        }
      } catch {
        /* 未登录 / 后端不可用：localStorage 已经记住，不打扰用户 */
      }
    }, 2500)
  }
  async function loadPetMemory() {
    petStats.value = readLocalStats() || emptyPetStats()
    try {
      const r = await mem.loadMemories?.({ dimension: 'pet', page: 1, pageSize: 5 })
      const rows = Array.isArray(r?.rows) ? r.rows : []
      const fromServer = petStatsFromRows(rows)
      if (fromServer) {
        petStats.value = fromServer
        petMemoryId = String(rows.find((x: any) => x?.id)?.id || '')
        writeLocalStats(fromServer)
      }
    } catch {
      /* 未登录时静默：用本地统计 */
    }
  }
  function recordPetInteraction(kind: PetInteraction) {
    petStats.value = bumpPetStats(petStats.value, kind)
    persistPetStats()
  }

  /** 同一会话 5 秒内只弹一条，防刷屏 */
  const lastNotifyAt = new Map<string, number>()
  function notifyPet(kind: 'ready' | 'error' | 'input', convId: string, text: string) {
    const mode = pet.settings.notifyMode
    if (mode === 'off') return
    if (mode === 'input' && kind !== 'input') return
    const now = Date.now()
    const last = lastNotifyAt.get(convId) || 0
    if (now - last < 5000) return
    lastNotifyAt.set(convId, now)
    const title = kind === 'ready' ? '任务完成' : kind === 'error' ? '任务出错' : '智能体在等你'
    try { api()?.notify?.({ title, body: String(text || '').slice(0, 80), convId }) } catch { /* 非桌面端忽略 */ }
  }
  const titleOf = (convId: string) =>
    String((chat.conversations || []).find((c: any) => c.id === convId)?.title || '任务')

  /** 流式期间 snapshot 每帧都变，但宠物只关心状态/活动/清单这几项：签名没变就不跨进程推 */
  let lastSig = ''
  watch(snapshot, (v: any) => {
    pet.lastSync = v
    const sig = [
      v.state,
      v.title,
      v.running,
      v.waiting,
      v.activity?.kind,
      v.activity?.label,
      v.activity?.target,
      // 代玩切片：状态/步骤变化要能推给宠物窗（气泡文案「代玩中：<动作>」）
      v.game?.active,
      v.game?.paused,
      v.game?.stepLabel,
      v.game?.title,
      (v.tasks || [])
        .map((t: any) => [t.id, t.status, t.agent, t.startedAt, t.planDone, t.planTotal, t.question].join('~'))
        .join(','),
      (v.agents || []).map((a: any) => a.id).join(','),
      (v.spaces || []).map((s: any) => s.id).join(','),
      v.spaceId,
      v.agentId,
    ].join('|')
    if (sig === lastSig) return
    lastSig = sig
    try {
      api()?.sync?.(v)
    } catch {
      /* 非桌面端忽略 */
    }
  })

  // 「等你输入」只在 0 → 有 的那一刻弹一次
  let waitingPrev = 0
  watch(
    () => (snapshot() as any).waiting as number,
    (n) => {
      if (n > waitingPrev) {
        const convId = String(chat.currentConvId || '')
        notifyPet('input', convId, titleOf(convId))
      }
      waitingPrev = n
    }
  )

  // 新任务开跑 → 立刻撤掉上一次的完成/出错状态（否则"完成了"会一直盖着正在跑的任务）
  watch(
    () => chat.runningConvIds?.size ?? 0,
    (n) => {
      if (n > 0) {
        window.clearTimeout(terminalTimer)
        terminal.value = null
      }
    }
  )

  /**
   * 代玩结束演出（2026-10-29）：用**已有动作**（hop/spin/nap），不新做动画。
   *   · 失败（最近 15s 内该会话 error）→ nap
   *   · 完成 / 用户收回 → hop，1s 后 spin
   *   · 用户主动中止 → 不打扰
   */
  watch(
    () => gameHandoff.value.on,
    (on, prev) => {
      const info = gameHandoff.value
      if (on) {
        lastGameConvId = info.convId || lastGameConvId
        return
      }
      if (!prev) return
      const convId = info.convId || lastGameConvId || String(chat.currentConvId || '')
      const rec = (chat.runStatsByConv || {})[convId]
      const recentlyEnded = !!rec && Date.now() - (Number(rec.endedAt) || 0) < 15_000
      const out = petOutcome(recentlyEnded ? String(rec.status) : '')
      if (!out.key) return
      window.clearTimeout(outcomeTimer)
      try { api()?.command?.({ type: 'play', key: out.key }) } catch { /* 非桌面端忽略 */ }
      if (out.follow) {
        outcomeTimer = window.setTimeout(() => {
          try { api()?.command?.({ type: 'play', key: out.follow }) } catch { /* ignore */ }
        }, 1000)
      }
    }
  )

  onMounted(() => {
    // 智能体是异步从后端拉的：不主动触发的话，宠物窗的智能体下拉会一直是空的
    try { agents.ensureAgents?.() } catch { /* 后端未就绪时下次渲染再来 */ }
    void loadPetMemory()
    // 任务终态：钩子在 markRunEnd 之后 30ms 派发，此时 runStatsByConv 已落定
    offTaskFinished = chat.onTaskFinished?.((convId: string) => {
      const rec = chat.runStatsByConv?.[convId]
      if (!rec) return
      if (rec.status === 'error') {
        pushTerminal('error')
        notifyPet('error', convId, titleOf(convId))
      } else if (rec.status === 'completed') {
        pushTerminal('ready')
        notifyPet('ready', convId, titleOf(convId))
      }
      // aborted（用户主动停止）不打扰
    })

    // 显式移交状态：先拉一次（可能在本窗挂载前游戏窗就开始代玩了），再订阅广播
    const bv = (window as any).electronAPI?.browserView
    try {
      bv?.getHandoff?.().then((st: any) => {
        if (!st || !st.on) return
        gameHandoff.value = {
          on: true, tabId: String(st.tabId || ''), convId: String(st.convId || ''),
          title: String(st.title || ''), url: String(st.url || ''),
        }
        lastGameConvId = String(st.convId || '')
      }).catch(() => { /* 非桌面端 / 老版本忽略 */ })
    } catch { /* ignore */ }
    try {
      offHandoff = bv?.onHandoff?.((p: any) => {
        gameHandoff.value = {
          on: !!(p && p.on),
          tabId: String((p && p.tabId) || ''),
          convId: String((p && p.convId) || ''),
          title: String((p && p.title) || ''),
          url: String((p && p.url) || ''),
        }
      })
    } catch { /* ignore */ }

    // 宠物窗的动作回传
    const offPetAction = api()?.onAction?.((a: any) => {
      if (!a || !a.type) return
      if (a.type === 'pause') { try { chat.pauseTask?.(a.convId) } catch { /* 会话可能已结束 */ } return }
      if (a.type === 'resume') { try { chat.resumeTask?.(a.convId) } catch { /* ignore */ } return }
      if (a.type === 'answer' && a.convId) {
        // 面板行内快答：等价于在聊天页回答该会话的反问卡（面板是独立窗口，只知道 convId）
        const text = String(a.text || '')
        if (text.trim()) try { chat.submitPendingQuestionFor?.(String(a.convId), text) } catch { /* 卡已收回 */ }
        return
      }
      if (a.type === 'toggle-mute') {
        pet.update({ notifyMode: pet.settings.notifyMode === 'off' ? 'all' : 'off' })
        return
      }
      if (a.type === 'open-all-tasks') {
        try { if (window.location.hash !== '#/chat') window.location.hash = '#/chat' } catch { /* ignore */ }
        return
      }
      if (a.type === 'space' && a.spaceId) {
        // 切空间要连带把工作目录同步过去，否则新会话仍落在旧目录
        try {
          if (typeof (chat as any).selectSpaceAndSyncDir === 'function') (chat as any).selectSpaceAndSyncDir(String(a.spaceId))
          else spaces.selectSpace?.(String(a.spaceId))
        } catch {
          /* 空间可能已删 */
        }
        return
      }
      if (a.type === 'pin') { pet.update({ pinnedConvId: pet.settings.pinnedConvId === a.convId ? '' : a.convId }); return }
      if (a.type === 'set-pack' && a.packId) {
        // 形象托盘选中：宽高比一起写，主进程按它重算宠物窗宽度
        pet.update({ pack: String(a.packId), packAspect: Number(a.aspect) || 192 / 208, renderer: '2d' })
        return
      }
      if (a.type === 'open-conv' && a.convId) {
        // 宠物「工作目录 → 会话」选中：打开该会话，用户可直接在里面追问
        try { chat.selectConv?.(String(a.convId)) } catch { /* 会话可能已删 */ }
        try { if (window.location.hash !== '#/chat') window.location.hash = '#/chat' } catch { /* ignore */ }
        return
      }
      if (a.type === 'open-settings') { window.location.hash = '#/settings?pane=pet'; return }
      if (a.type === 'ask' && a.text) {
        if (a.agentId) { try { agents.selectAgent?.(String(a.agentId)) } catch { /* 智能体可能已删 */ } }
        const text = String(a.text)
        // 走与用户按回车完全相同的链路：预填 → useChat().send()
        // （send 内部处理"运行中追加入队 / 重入锁 / 没配模型时提示"）
        try { chat.prefillInput?.(text) } catch { /* ignore */ }
        try { if (window.location.hash !== '#/chat') window.location.hash = '#/chat' } catch { /* ignore */ }
        // 宠物派活三态：
        //   绑了会话 → 追加到那个会话里追问；
        //   只绑目录 → 先切主窗目录，再新建会话（任务落在该目录）；
        //   都不绑   → 不动主窗现状，直接新建会话。
        if (a.convId) {
          try { chat.selectConv?.(String(a.convId)) } catch { /* 会话可能已删 */ }
        } else {
          if (a.spaceId) {
            try {
              if (typeof (chat as any).selectSpaceAndSyncDir === 'function') (chat as any).selectSpaceAndSyncDir(String(a.spaceId))
              else spaces.selectSpace?.(String(a.spaceId))
            } catch { /* 目录可能已删 */ }
          }
          try { chat.currentConvId = '' } catch { /* ignore */ }
        }
        // 由 useChat 的 prefill watcher 消费：预填落地后直接 send()（避免桥里再造一个 useChat 实例）
        try { chat.petAutoSend = true } catch { /* ignore */ }
        try { chat.prefillInput?.(text) } catch { /* ignore */ }
        return
      }
      if (a.type === 'pet-interaction' && a.kind) {
        recordPetInteraction(String(a.kind) as PetInteraction)
        return
      }
      if (a.type === 'retry' && a.convId) {
        // 重试 = 拿该会话最后一条用户消息，在原会话里再发一次（sendInner 会走"追加到当前会话"分支）
        const convId = String(a.convId)
        const text = lastUserText(chat.messagesByConv?.[convId])
        if (!text) return
        try { chat.selectConv?.(convId) } catch { /* 会话可能已删 */ }
        try { chat.currentConvId = convId } catch { /* ignore */ }
        try { chat.prefillInput?.(text) } catch { /* ignore */ }
        try { chat.petAutoSend = true } catch { /* ignore */ }
        try { if (window.location.hash !== '#/chat/' + convId) window.location.hash = '#/chat/' + convId } catch { /* ignore */ }
        return
      }
      if (a.type === 'open-conv' && a.convId) {
        // ★ 必须走 selectConv：只 push 路由 /chat/:convId 参数没人消费（会静默停在错的会话）
        try { chat.selectConv?.(a.convId) } catch { /* 会话可能已被删 */ }
        window.location.hash = '#/chat/' + a.convId
        return
      }
      // new-task / open-chat：回对话页并把焦点给输入框
      window.location.hash = '#/chat'
      setTimeout(() => {
        const box = document.querySelector('textarea, input[type="text"]') as HTMLElement | null
        box?.focus?.()
      }, 120)
    })

    // 宠物窗（重新）加载完会来要一次：否则它重载后智能体/任务列表是空的
    offNeedSync = api()?.onNeedSync?.(() => {
      const v = snapshot()
      pet.lastSync = v
      try { api()?.sync?.(v) } catch { /* ignore */ }
    })

    // 托盘 / Alt+P 开合宠物时，把设置里的开关同步回来（否则界面与实际不一致）
    offPetOpened = api()?.onOpened?.(() => {
      if (!pet.settings.enabled) pet.update({ enabled: true })
    })
    offPetClosed = api()?.onClosed?.(() => {
      if (pet.settings.enabled) pet.update({ enabled: false })
    })

    // 上次开着宠物就自动恢复；关闭状态不动
    if (pet.settings.enabled) {
      try {
        api()?.open?.()
      } catch {
        /* ignore */
      }
    }
    try {
      // 必须推一次"当前快照"而不是 lastSync：刚启动时 lastSync 还是默认值，
      // 没有 agents/tasks，宠物窗的智能体下拉和任务面板会是空的
      const v = snapshot()
      pet.lastSync = v
      api()?.sync?.(v)
      api()?.settings?.(plainPetSettings(pet.settings))
    } catch {
      /* ignore */
    }
  })

  // 设置改动同步给宠物窗（update() 里已发一次，这里覆盖"没走 update 直接改字段"的情况）
  // ★ 必须用 plainPetSettings 转普通对象：reactive/Proxy 过 IPC 会被结构化克隆拒绝
  watch(
    () => ({ ...pet.settings, slots: [...(pet.settings.slots || [])] }),
    (v) => {
      try {
        api()?.settings?.(plainPetSettings(v))
      } catch {
        /* ignore */
      }
    },
    { deep: true }
  )

  onBeforeUnmount(() => {
    window.clearTimeout(terminalTimer)
    window.clearTimeout(outcomeTimer)
    offTaskFinished?.()
    offPetOpened?.()
    offPetClosed?.()
    offPetAction?.()
    offNeedSync?.()
    offHandoff?.()
  })
}
