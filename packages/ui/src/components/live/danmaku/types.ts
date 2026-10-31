/**
 * 弹幕游戏 · 玩法接口。
 *
 * 引擎（DanmakuGame.vue）管：局计时（40s 判定 / 60s 结算）、拉锯台账、连击与打赏账目、
 * 判赏红线（判定后不再改结论）。玩法实现管：画面模拟、动作词表、主题判定/战报文案。
 * 赤壁/观星/甜咸走拉锯门槛（gate），姓氏/MBTI 走团队抢榜（team: true）。
 *
 * 两条硬规矩（方案 §3.4）：
 * 1. 没人干预 → 严格复现基线：拉锯从 startAt 起步（历史局 0、甜咸 50），判定只看是否过 gate。
 * 2. 判定后 gift/comment 不再动拉锯与票数，只加展示特效（各玩法在回调里读 s.resolved 自律）。
 */
import type { Ctx, Side } from './shared'

export type { Ctx, Side } from './shared'

/** 引擎实时状态：回调参数里只读 */
export interface EngineState {
  /** 当前拉锯值 0..100（团队玩法恒为 startAt，票数在玩法内部） */
  rewrite: number
  /** 判定是否已锁定；锁定后玩法不得再改战局数值 */
  resolved: boolean
}

export interface ModeEvents {
  /** 主播台词：走 say 管道 */
  say?: string
  /** 飘字：x/y 缺省时落在 at 侧锚点（mode.anchor） */
  floater?: { text: string; color: string; x?: number; y?: number; at?: 'a' | 'b' } | null
  /** 大字横幅（判定/大额礼物），引擎画在画布上部 */
  banner?: { title: string; sub: string; color: string } | null
  /** 在锚点爆一圈脉冲；'both' = 两侧同时 */
  pulse?: 'a' | 'b' | 'both' | null
  /** 弹幕带来的入队：玩法识别出主题站队词（如「甜」）时回传，引擎记录该观众所属 */
  join?: 'a' | 'b' | null
  /** 团队玩法每帧回传领先方占比 0..100，引擎用于顶栏百分比 */
  share?: number
}

export interface ModeReportContext {
  /** 拉锯玩法：过 gate 为 altered；团队玩法无基线，恒为 altered（玩法自行忽略） */
  outcome: 'base' | 'altered'
  /** 胜方侧（团队玩法为 null，玩法自行从票数取胜者） */
  lead: Side | null
  /** 拉锯=最终改写度；团队=领先方占比 */
  percent: number
  /** 打赏最多的人，无人打赏为 null */
  top: { name: string; coins: number } | null
  /** 连击最高的人 */
  comboTop: { name: string; combo: number } | null
  /** 本局支援记录 */
  contribs: Array<{ name: string; action: string; coins: number }>
  /** 败方里打赏最多的名字（团队玩法为空数组） */
  losers: string[]
}

export interface DanmakuGameMode {
  /** 玩法键，用于面板切换与战报抬头 */
  key: string
  name: string
  /** 一句话说明（面板提示） */
  note: string
  /** 免费关键词提示（1/2 选边是引擎级约定，不进这里） */
  freeWords: string[]
  /** 阶段时间轴（秒）；引擎切到新阶段时调 onPhase */
  phases: Array<{ at: number; label: string }>
  /** 双方名与色 */
  sides: { a: string; b: string; colorA: string; colorB: string }
  /** 礼物动作词：键 = 礼物 id，值 = [改写方(a)词, 守常方(b)词] */
  giftLabels: Record<string, [string, string]>
  /** 拉锯门槛（改写方 ≥ gate 算改写成功）。团队玩法忽略 */
  gate: number
  /** 拉锯起始值（甜咸 50，其余 0） */
  startAt: number
  /** 团队抢榜玩法（姓氏/MBTI）：弹幕/礼物记票到玩法内部队伍，不走拉锯 */
  team: boolean

  /** 飘字/脉冲的两侧锚点；缺省 = 画布左右 30%/70% 高度 42% */
  anchors?(): { a: { x: number; y: number }; b: { x: number; y: number } }

  /** 开局/重开：清空本局状态 */
  reset(): void
  /** t 本局毫秒、dt 秒；返回本帧事件（可 null） */
  tick(t: number, dt: number, s: EngineState): ModeEvents | null
  draw(g: Ctx, t: number, dt: number, s: EngineState): void
  /** 阶段切换台词（可选） */
  onPhase?(index: number, label: string): ModeEvents | null
  /** 礼物反应：拉锯数值由引擎入账（团队玩法票数由玩法自行记），返回画面表现 */
  onGift(giftId: string, side: Side, user: string, mult: number, s: EngineState): ModeEvents | null
  /**
   * 免费弹幕。返回值：
   * - false：没匹配玩法关键词，引擎兜底（1/2 选边 + 拉锯玩法 ±0.8）
   * - true：玩法已消费（展示/记账自理），引擎不做数值动作
   * - { join: Side }：把该观众记到对应侧，并按该方向推拉锯（团队玩法不适用）
   */
  onComment(text: string, from: string, side: Side | null, s: EngineState): boolean | { join: Side }
  onJudge(altered: boolean, lead: Side | null, s: EngineState): ModeEvents | null
  report(ctx: ModeReportContext): {
    title: string
    sub: string
    live: string[]
    dead: string[]
    honor: string[]
  }
}
