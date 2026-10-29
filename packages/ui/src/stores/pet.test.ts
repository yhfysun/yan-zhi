import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import {
  PET_DEFAULTS,
  PET_SLOT_DEFAULTS,
  classifyTool,
  collectWaitingIds,
  derivePetActivity,
  derivePetState,
  affinityOf,
  bumpPetStats,
  emptyPetStats,
  lastUserText,
  petMemoryContent,
  petStatsFromRows,
  plainPetSettings,
  setPetSlot,
  shortTarget,
  toolTarget,
} from './pet'

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

describe('setPetSlot（半圆菜单槽位编辑）', () => {
  it('换到没人用的槽位：直接替换，其余不动', () => {
    const next = setPetSlot([...PET_SLOT_DEFAULTS], 0, 'renderer');
    expect(next[0]).toBe('renderer');
    expect(next.slice(1)).toEqual(PET_SLOT_DEFAULTS.slice(1));
  })

  it('换到已被占用的槽位：两者互换，不出重复项', () => {
    const next = setPetSlot([...PET_SLOT_DEFAULTS], 0, 'settings');
    expect(next[0]).toBe('settings');
    // 原第 1 位顶到 settings 原来的位置（默认槽位数会随菜单项增加，别钉死下标）
    expect(next[PET_SLOT_DEFAULTS.indexOf('settings')]).toBe('play');
    expect(new Set(next).size).toBe(next.length);
  })

  it('换成本来的值 / 越界 / 空 key：一律原样返回', () => {
    const base = [...PET_SLOT_DEFAULTS];
    expect(setPetSlot(base, 2, 'panel')).toEqual(base);
    expect(setPetSlot(base, 9, 'play')).toEqual(base);
    expect(setPetSlot(base, 0, '')).toEqual(base);
  })

  it('入参坏了（非数组）回落默认 6 槽', () => {
    expect(setPetSlot(undefined as never, 0, 'walk')).toEqual(['walk', ...PET_SLOT_DEFAULTS.slice(1)]);
  })
})

describe('plainPetSettings（设置要跨进程发给宠物窗）', () => {
  it('Vue 响应式对象过不了结构化克隆，转普通对象后可以', () => {
    const live = reactive({ ...PET_DEFAULTS, slots: ['walk', 'settings'] })
    expect(() => structuredClone(live)).toThrow() // 这就是原 bug：异常被 catch 吞掉，宠物窗静默不更新
    expect(() => structuredClone(plainPetSettings(live))).not.toThrow()
  })

  it('slots 复制成新数组（浅拷贝只解顶层，数组那层仍是 Proxy）', () => {
    const live = reactive({ ...PET_DEFAULTS, slots: ['walk'] })
    const out = plainPetSettings(live)
    expect(out.slots).not.toBe(live.slots)
    expect(out.slots).toEqual(['walk'])
  })

  it('slots 坏数据回落空数组', () => {
    expect(plainPetSettings({ ...PET_DEFAULTS, slots: undefined as never }).slots).toEqual([])
  })
})

describe('lastUserText（重试用上一次的请求内容）', () => {
  it('取最后一条有正文的用户消息，跳过空消息与助手消息', () => {
    const msgs = [
      { role: 'user', content: '第一问' },
      { role: 'assistant', content: '答' },
      { role: 'user', content: '   ' },
      { role: 'user', content: '第二问' },
      { role: 'assistant', content: '答2' },
    ]
    expect(lastUserText(msgs)).toBe('第二问')
  })

  it('没有用户消息 / 坏入参 → 空串（调用方据此不发请求）', () => {
    expect(lastUserText([{ role: 'assistant', content: 'x' }])).toBe('')
    expect(lastUserText(undefined)).toBe('')
    expect(lastUserText([null, {}])).toBe('')
  })
})

describe('宠物记忆（统计与好感）', () => {
  it('按种类累加，空入参当全新统计', () => {
    const a = bumpPetStats(emptyPetStats(), 'pet', 1000)
    const b = bumpPetStats(a, 'wave', 2000)
    const c = bumpPetStats(b, 'follow', 3000)
    expect(c).toMatchObject({ pet: 1, wave: 1, follow: 1, lastAt: 3000 })
    expect(bumpPetStats(null, 'pet').pet).toBe(1)
  })

  it('好感加权并封顶 100', () => {
    expect(affinityOf(emptyPetStats())).toBe(0)
    expect(affinityOf({ pet: 3, wave: 2, follow: 1, lastAt: 0 })).toBe(9) // 3*2+2+1
    expect(affinityOf({ pet: 100, wave: 100, follow: 100, lastAt: 0 })).toBe(100)
  })

  it('正文可读、含次数与好感', () => {
    const text = petMemoryContent({ pet: 2, wave: 1, follow: 0, lastAt: 0 })
    expect(text).toContain('摸头 2 次')
    expect(text).toContain('好感 5/100')
  })

  it('从 memory 行恢复统计（metadata 可能是对象或 JSON 串），坏数据回落 null', () => {
    expect(petStatsFromRows([{ metadata: { petStats: { pet: 4, wave: 2, follow: 1, lastAt: 9 } } }]))
      .toMatchObject({ pet: 4, wave: 2, follow: 1 })
    expect(petStatsFromRows([{ metadata_json: '{"petStats":{"pet":2}}' }])).toMatchObject({ pet: 2 })
    expect(petStatsFromRows([{ metadata: {} }])).toBeNull()
    expect(petStatsFromRows('nope')).toBeNull()
  })
})
