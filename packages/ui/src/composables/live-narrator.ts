/**
 * 任务旁白（2026-10-29）。
 *
 * 直播时观众看不到工具调用细节，只听到"我打开页面看一下"这类人话。
 * 输入是 `derivePetActivity()` 已经算好的当前活动（复用宠物那套工具→动作映射），
 * 这里只负责把它变成一句可以念出来的话——纯函数，便于单测。
 *
 * 为什么不直接念工具名：`browser_open` 对观众没有意义，而且会把实现细节播出去。
 */
import type { PetActivity } from '../stores/pet'

const esc = (v: string) => String(v || '').trim()

export function narrateActivity(a: PetActivity | null | undefined): string {
  if (!a || !a.kind) return ''
  const target = esc(a.target)
  switch (a.kind) {
    case 'read':
      return target ? `我读一下 ${target}。` : '我读一下这个文件。'
    case 'search':
      return target ? `我搜一下 ${target}。` : '我搜一下。'
    case 'write':
      return target ? `我把结果写进 ${target}。` : '我把结果记下来。'
    case 'act':
      return '我操作一下。'
    case 'think':
      return '我理一下思路。'
    case 'tool':
      return '我调一下工具。'
    default:
      return ''
  }
}

/** 同一句旁白不必重复念：kind+target 相同视为同一动作 */
export function sameActivity(a: PetActivity | null | undefined, b: PetActivity | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return a.kind === b.kind && esc(a.target) === esc(b.target)
}
