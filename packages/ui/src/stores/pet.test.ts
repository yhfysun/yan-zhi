import { describe, expect, it } from 'vitest'
import { classifyTool, collectWaitingIds, derivePetActivity, derivePetState, shortTarget, toolTarget } from './pet'

const base = { running: 0, paused: 0, waiting: 0 }

describe('derivePetState（宠物状态优先级）', () => {
  it('等待输入压过一切（宠物存在的意义就是该你的时候叫你）', () => {
    expect(derivePetState({ running: 3, paused: 2, waiting: 1, terminal: 'error' })).toBe('needs-input')
  })

  it('出错压过完成与运行中', () => {
    expect(derivePetState({ running: 1, paused: 0, waiting: 0, terminal: 'error' })).toBe('error')
  })

  it('完成压过暂停与运行中', () => {
    expect(derivePetState({ running: 1, paused: 1, waiting: 0, terminal: 'ready' })).toBe('ready')
  })

  it('终态过期（null）后回到运行中', () => {
    expect(derivePetState({ running: 1, paused: 0, waiting: 0, terminal: null })).toBe('running')
  })

  it('只有暂停 → paused', () => {
    expect(derivePetState({ ...base, paused: 2 })).toBe('paused')
  })

  it('全都没有 → idle', () => {
    expect(derivePetState(base)).toBe('idle')
  })
})

describe('collectWaitingIds（跨会话等你输入）', () => {
  it('多张表求并集并去重', () => {
    const a = { c1: { q: 1 }, c2: null }
    const b = { c2: { q: 2 }, c3: { q: 3 } }
    expect(collectWaitingIds([a, b]).sort()).toEqual(['c1', 'c2', 'c3'])
  })

  it('兼容 ref 形态与空值', () => {
    expect(collectWaitingIds([{ value: { c9: 1 } }, undefined, null, {}])).toEqual(['c9'])
  })
})

describe('classifyTool（工具 → 活动类别）', () => {
  it('文件读写分到阅读 / 写作', () => {
    expect(classifyTool('file_read').label).toBe('阅读')
    expect(classifyTool('file_write').label).toBe('写作')
    expect(classifyTool('file_edit').label).toBe('写作')
  })

  it('browser_* 与命令执行都算操作电脑', () => {
    expect(classifyTool('browser_navigate').label).toBe('操作电脑')
    expect(classifyTool('cmd_exec').label).toBe('操作电脑')
    expect(classifyTool('python_exec').label).toBe('操作电脑')
  })

  it('未知工具回落"调用工具"，不抛错', () => {
    expect(classifyTool('')).toEqual({ kind: 'tool', label: '调用工具' })
    expect(classifyTool('some_mcp_tool').kind).toBe('tool')
  })
})

describe('shortTarget / toolTarget（气泡里那一行对象名）', () => {
  it('路径取末段，网址取域名', () => {
    expect(shortTarget('C:\\Users\\me\\Desktop\\ai-assistant\\package.json')).toBe('package.json')
    expect(shortTarget('/home/me/proj/src/main.ts')).toBe('main.ts')
    expect(shortTarget('https://github.com/foo/bar?x=1')).toBe('github.com')
  })

  it('过长截断', () => {
    expect(shortTarget('a'.repeat(50)).length).toBe(29)
  })

  it('参数可能是 JSON 字符串', () => {
    expect(toolTarget({ function: { arguments: '{"path":"src/a/b.vue"}' } })).toBe('b.vue')
    expect(toolTarget({ arguments: { command: 'pnpm test' } })).toBe('pnpm test')
    expect(toolTarget({ function: { arguments: '{坏 JSON' } })).toBe('')
  })
})

describe('derivePetActivity（此刻在干什么）', () => {
  const call = (id: string, name: string, args: any = {}) => ({
    id,
    function: { name, arguments: JSON.stringify(args) },
  })

  it('取最近一个未完成的工具调用', () => {
    const msgs = [
      { role: 'assistant', toolCalls: [call('t1', 'file_read', { path: 'README.md' })] },
      { role: 'tool', toolCallId: 't1' },
      { role: 'assistant', toolCalls: [call('t2', 'browser_navigate', { url: 'https://a.com/x' })] },
    ]
    expect(derivePetActivity(msgs)).toEqual({ kind: 'act', label: '操作电脑', target: 'a.com' })
  })

  it('工具都有结果 → null（由调用方回落"思考中"）', () => {
    const msgs = [
      { role: 'assistant', toolCalls: [call('t1', 'file_read')] },
      { role: 'tool', toolCallId: 't1' },
    ]
    expect(derivePetActivity(msgs)).toBeNull()
  })

  it('空消息 / 脏数据不抛错', () => {
    expect(derivePetActivity(undefined)).toBeNull()
    expect(derivePetActivity([null, {}, { role: 'assistant' }])).toBeNull()
  })
})
