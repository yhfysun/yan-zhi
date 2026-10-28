import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useChatStore } from '../stores/chat'
import { collectWaitingIds, derivePetActivity, derivePetState, plainPetSettings, usePetStore } from '../stores/pet'
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
  pet.init()

  /** 最近一次任务终态 */
  const terminal = ref<'ready' | 'error' | null>(null)
  let terminalTimer = 0
  let offTaskFinished: (() => void) | undefined
  let offPetOpened: (() => void) | undefined
  let offPetClosed: (() => void) | undefined
  let offPetAction: (() => void) | undefined
  let offNeedSync: (() => void) | undefined

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
    // 活动气泡：跟"用户正在看/跟着的任务"，没有就取第一个在跑的任务。
    // 只读 messagesByConv 的既有结构，不新起订阅；流式期间每帧重算也只是一次反向扫。
    const followId =
      pinned || String(chat.currentConvId || '') || [...(chat.runningConvIds ?? [])][0] || ''
    const followMsgs = followId ? chat.messagesByConv?.[followId] : null
    const activity =
      state === 'running'
        ? derivePetActivity(followMsgs) || { kind: 'think' as const, label: '思考中', target: '' }
        : null
    // 任务小面板用的轻量列表（≤5 行）：只带 id/标题/状态，宠物窗按行点击回传 open-conv
    const titleOf = new Map<string, string>()
    for (const c of chat.conversations || []) titleOf.set(c.id, c.title || '未命名任务')
    const tasks: Array<{ id: string; title: string; status: string }> = []
    for (const id of waitIds) tasks.push({ id, title: titleOf.get(id) || '任务', status: 'needs-input' })
    for (const id of chat.runningConvIds ?? []) tasks.push({ id, title: titleOf.get(id) || '任务', status: 'running' })
    for (const id of chat.pausedConvIds ?? []) tasks.push({ id, title: titleOf.get(id) || '任务', status: 'paused' })
    return {
      state,
      running,
      waiting,
      activity,
      title: String(chat.currentConversation?.title || ''),
      tasks: tasks.slice(0, 5),
      // 快问条左侧的智能体下拉：优先「可用于对话」的清单，没有就退回全部
      agents: ((agents.chatAgents && agents.chatAgents.length ? agents.chatAgents : agents.agents) || []).map(
        (a: any) => ({ id: a.id, name: a.name })
      ),
      // 工作目录（工作空间）：宠物派活落在哪个目录
      spaces: (spaces.spaces || []).map((x: any) => ({ id: x.id, name: x.name })),
      spaceId: spaces.currentSpaceId || '',
      agentId: agents.selectedId || '',
    }
  }

  const api = () => (window as any).electronAPI?.pet

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
      (v.tasks || []).map((t: any) => t.id + t.status).join(','),
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

  onMounted(() => {
    // 智能体是异步从后端拉的：不主动触发的话，宠物窗的智能体下拉会一直是空的
    try { agents.ensureAgents?.() } catch { /* 后端未就绪时下次渲染再来 */ }
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

    // 宠物窗的动作回传
    const offPetAction = api()?.onAction?.((a: any) => {
      if (!a || !a.type) return
      if (a.type === 'pause') { try { chat.pauseTask?.(a.convId) } catch { /* 会话可能已结束 */ } return }
      if (a.type === 'resume') { try { chat.resumeTask?.(a.convId) } catch { /* ignore */ } return }
      if (a.type === 'space' && a.spaceId) {
        try { spaces.selectSpace?.(String(a.spaceId)) } catch { /* 空间可能已删 */ }
        return
      }
      if (a.type === 'pin') { pet.update({ pinnedConvId: pet.settings.pinnedConvId === a.convId ? '' : a.convId }); return }
      if (a.type === 'open-settings') { window.location.hash = '#/settings?pane=pet'; return }
      if (a.type === 'ask' && a.text) {
        if (a.agentId) { try { agents.selectAgent?.(String(a.agentId)) } catch { /* 智能体可能已删 */ } }
        const text = String(a.text)
        // 走与用户按回车完全相同的链路：预填 → useChat().send()
        // （send 内部处理"运行中追加入队 / 重入锁 / 没配模型时提示"）
        try { chat.prefillInput?.(text) } catch { /* ignore */ }
        try { if (window.location.hash !== '#/chat') window.location.hash = '#/chat' } catch { /* ignore */ }
        // 宠物派活 = 新任务：先把当前会话置空，sendInner 会走"新建会话"分支，
        // 而不是把内容追加进你正在看的那个会话（更不能入队到正在跑的任务里）
        try { chat.currentConvId = '' } catch { /* ignore */ }
        // 由 useChat 的 prefill watcher 消费：预填落地后直接 send()（避免桥里再造一个 useChat 实例）
        try { chat.petAutoSend = true } catch { /* ignore */ }
        try { chat.prefillInput?.(text) } catch { /* ignore */ }
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
    offTaskFinished?.()
    offPetOpened?.()
    offPetClosed?.()
    offPetAction?.()
    offNeedSync?.()
  })
}
