/**
 * 弹幕游戏玩法注册表。
 * 面板切换与战报抬头都从这里取；新增玩法：实现 DanmakuGameMode + 在这里注册一行。
 */
import type { DanmakuGameMode } from './types'
import { createChibi } from './chibi'
import { createStars } from './stars'
import { createDebate } from './debate'
import { createSurname } from './surname'
import { createMbti } from './mbti'

export const MODE_FACTORIES: Array<() => DanmakuGameMode> = [
  createChibi,
  createStars,
  createDebate,
  createSurname,
  createMbti,
]

/** 每次切换玩法建新实例，玩法内状态不跨局残留 */
export function createModeByKey(key: string): DanmakuGameMode | null {
  for (const f of MODE_FACTORIES) {
    const m = f()
    if (m.key === key) return m
    // 工厂顺带创建了其他实例：立刻丢弃（工厂无副作用，仅多一次分配）
  }
  return null
}
