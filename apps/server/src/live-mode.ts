// 直播模式：观众输入（弹幕）不可信，只允许白名单里的只读工具。
//
// 与只读会话的区别（为什么不能直接复用 permissionMode='readonly'）：
//   readonly 对写类工具是「请求用户授权」——直播时操作者可能顺手点同意，
//   而请求来源是不可信的弹幕。直播模式必须是**硬拒绝**，任何情况下都不弹卡。
//
// 白名单是封闭的：不在名单里的一律拒绝（fail-closed）。漏放一个工具最多是直播体验差，
// 多放一个可能是删文件 / 执行命令。
import { classifyToolAction } from './tool-permission.js'

/** 允许的工具名前缀：只放查询/读取类 */
const LIVE_ALLOW_PREFIXES = [
  'file_read',
  'file_list',
  'file_grep',
  'file_to_markdown',
  'image_analyze',
  'code_',
  'web_search',
  'web_fetch',
  'http_request',
  'browser_read',
  'browser_search',
  'browser_screenshot',
  'browser_open',
  'browser_get',
  'knowledge_',
  'memory_search',
  'experience_read',
]

/** 精确放行的只读工具 */
const LIVE_ALLOW_EXACT = new Set([
  'api_file_list',
  'api_git_status',
  'api_git_log',
  'api_git_diff',
  'api_git_show',
  'api_git_blame',
  'api_git_read_file',
  'api_builtin_tool_list',
  'api_conversation_get',
  'api_conversation_list',
  'api_agent_get',
  'api_agent_list',
  'api_browser_memory_read',
])

let liveOn = false

export function isLiveMode(): boolean {
  return liveOn
}

export function setLiveMode(on: boolean): void {
  liveOn = Boolean(on)
}

/** 给前端/排障看的白名单快照 */
export function liveAllowRules(): { prefixes: string[]; exact: string[] } {
  return { prefixes: [...LIVE_ALLOW_PREFIXES], exact: [...LIVE_ALLOW_EXACT] }
}

export interface LiveVerdict {
  allowed: boolean
  reason: string
}

/**
 * 直播模式下的工具判定。**开关关闭时永远放行**——不能影响正常会话。
 */
export function checkLiveTool(toolName: string): LiveVerdict {
  if (!liveOn) return { allowed: true, reason: '' }
  const name = String(toolName || '')

  const matched = LIVE_ALLOW_EXACT.has(name) || LIVE_ALLOW_PREFIXES.some((p) => name.startsWith(p))
  if (matched) {
    // 名单写错也兜不住：动作分类为写/执行的一律拒
    const action = classifyToolAction(name)
    if (action === 'read') return { allowed: true, reason: '' }
    return { allowed: false, reason: `直播模式下「${name}」属于${action === 'exec' ? '命令执行' : '写操作'}，已拒绝。` }
  }

  return { allowed: false, reason: `直播模式只允许只读查询，已拒绝「${name}」。` }
}
