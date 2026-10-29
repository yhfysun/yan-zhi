import { afterEach, describe, expect, it } from 'vitest'
import { checkLiveTool, isLiveMode, liveAllowRules, setLiveMode } from '../src/live-mode.js'

afterEach(() => {
  setLiveMode(false)
})

describe('直播模式工具白名单', () => {
  it('默认关闭，关闭时一切放行', () => {
    expect(isLiveMode()).toBe(false)
    expect(checkLiveTool('file_write').allowed).toBe(true)
    expect(checkLiveTool('cmd_exec').allowed).toBe(true)
  })

  it('开启后只读/查询工具放行', () => {
    setLiveMode(true)
    for (const name of ['file_read', 'file_list', 'file_grep', 'web_search', 'web_fetch', 'code_outline', 'browser_screenshot', 'api_git_status']) {
      expect(checkLiveTool(name).allowed, name).toBe(true)
    }
  })

  it('写、执行、外部来源工具一律硬拒', () => {
    setLiveMode(true)
    for (const name of ['file_write', 'file_edit', 'cmd_exec', 'python_exec', 'browser_click', 'mcp_github', 'custom_foo', 'wf_run', 'install_resource']) {
      const v = checkLiveTool(name)
      expect(v.allowed, name).toBe(false)
      expect(v.reason).toContain('直播模式')
    }
  })

  it('拒绝原因直接可读，便于模型解释给观众', () => {
    setLiveMode(true)
    expect(checkLiveTool('cmd_exec').reason).toContain('cmd_exec')
  })

  it('白名单快照可导出，方便排障', () => {
    const rules = liveAllowRules()
    expect(rules.prefixes).toContain('file_read')
    expect(rules.exact).toContain('api_git_status')
  })

  it('关闭后立即恢复放行', () => {
    setLiveMode(true)
    expect(checkLiveTool('cmd_exec').allowed).toBe(false)
    setLiveMode(false)
    expect(checkLiveTool('cmd_exec').allowed).toBe(true)
  })
})
