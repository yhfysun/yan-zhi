// 前端命令总线（命令中枢 P0 前端半边）的守门测试（2026-10-16）。
//
// 为什么必须真跑：总线是"列出 / 搜索 / 取页命令"的唯一入口，错了全是**静默错行为** ——
//   ① 插件命令没进列表 ⇒ 插件作者声明了命令却永远看不见（而插件本身"装上了"）；
//   ② 页面指令没按页过滤 ⇒ 面板 chips 列出别的站点的指令，点下去必然失败；
//   ③ 回查不到原始行 ⇒ 执行时拿不到 body，等于点了没反应（或报一个看不懂的错）。
//
// 只 mock 两个数据源（plugin / page-commands store），总线逻辑走真实现。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CommandDef } from '@yan-zhi/core';
import type { PageCommand } from '../utils/pageCommand';

// ★ vi.mock 会被提升到文件顶部 ⇒ 工厂里引用的可变状态必须放进 vi.hoisted
//   （否则报 "Cannot access 'x' before initialization"，本仓多处测试都是这个写法）
const hoisted = vi.hoisted(() => ({
  /** 假插件贡献（可测中途改写） */
  pluginCommands: [] as unknown[],
  /** 假指令库 */
  pageRows: [] as unknown[],
  /** HTTP 边界（工具执行走这里）；带上入参类型，测试才能断言"发出去的 URL 与 body" */
  post: vi.fn(async (_url?: string, _body?: unknown) => ({ data: { ok: true, text: '扫描完成' } })),
}));

vi.mock('./plugin', () => ({
  usePluginStore: () => ({
    get commands() { return hoisted.pluginCommands; },
  }),
}));
vi.mock('./page-commands', () => ({
  usePageCommandsStore: () => ({ get list() { return hoisted.pageRows; } }),
}));
// ★ 必须返回**真 ref**（不是 { value } 普通对象）：总线里是 computed，普通对象不触发重算，
//   测试切成 sec 模式后面板还是旧的 —— 那样测出来的是"假失败/假通过"
vi.mock('./mode', async () => {
  const { ref } = await import('vue');
  return { activeMode: ref('office') };
});
vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: hoisted.post, patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  API_BASE: 'http://localhost:3001/api',
  buildRequestHeaders: () => ({}),
}));

const pluginCommands = hoisted.pluginCommands as CommandDef[];
const pageRows = hoisted.pageRows as PageCommand[];
const post = hoisted.post;

import { activeMode } from './mode';
import { BUILTIN_COMMANDS, useCommandsStore } from './commands';

function pageCmd(p: Partial<PageCommand> & { id: string }): PageCommand {
  return {
    name: p.id, description: '', kind: 'task', body: '做点事', match_host: '*', match_url: null,
    ...p,
  } as PageCommand;
}

beforeEach(() => {
  setActivePinia(createPinia());
  pluginCommands.length = 0;
  pageRows.length = 0;
  activeMode.value = 'office';
  post.mockClear();
});

describe('★ 全局命令 = 内置 + 插件贡献', () => {
  it('内置命令仍是原来的 5 条 + 自动生成的 /help，且执行分流标成 ui/builtin + run', () => {
    const store = useCommandsStore();
    expect(store.globalCommands.map((c) => c.name)).toEqual(['agent', 'model', 'skill', 'dir', 'new', 'help']);
    for (const c of BUILTIN_COMMANDS) {
      expect(['ui', 'builtin']).toContain(c.kind);
      expect(c.run).toBe(c.name);
      expect(c.group).toBe('SYS');
    }
    // 逐字保留原 UI 文案（搬家的东西不许在搬家时改字）；/help 是新增的那条
    expect(BUILTIN_COMMANDS.slice(0, 5).map((c) => c.desc)).toEqual([
      '切换当前任务智能体', '切换使用的模型', '挂载 / 卸载 Skill', '设置工作目录', '新建任务',
    ]);
    expect(BUILTIN_COMMANDS[5]).toMatchObject({ name: 'help', aliases: ['?'], run: 'help' });
  });

  it('★ /target 与 /playbook 标了 mode:"sec" —— 只在安全模式出现，不污染别的模式的面板', () => {
    const store = useCommandsStore();
    // 默认 office：两条都不该出现（列出来点了没用，比不列更糟）
    expect(store.globalCommands.map((c) => c.name)).not.toContain('target');
    activeMode.value = 'sec';
    const names = store.globalCommands.map((c) => c.name);
    expect(names).toContain('target');
    expect(names).toContain('playbook');
    expect(store.globalCommands.find((c) => c.name === 'target'))
      .toMatchObject({ kind: 'ui', run: 'target' });
    expect(store.globalCommands.find((c) => c.name === 'playbook'))
      .toMatchObject({ kind: 'ui', run: 'playbook' });
  });

  it('插件贡献的命令会出现在列表里（内置在前，插件在后）', () => {
    pluginCommands.push({ name: 'findings', desc: '列出发现', group: 'SEC', kind: 'ui', run: 'open-findings' });
    const store = useCommandsStore();
    expect(store.globalCommands.map((c) => c.name))
      .toEqual(['agent', 'model', 'skill', 'dir', 'new', 'help', 'findings']);
    // 搜索也覆盖插件命令
    expect(store.search('发现').map((c) => c.name)).toEqual(['findings']);
    // 分组里能看到 SEC
    expect(store.globalGroups.map((g) => g.group)).toEqual(['SYS', 'SEC']);
  });

  it('★ 页面指令**不在**全局命令里（聊天框没有页上下文，列出来只会是点了没用的项）', () => {
    pageRows.push(pageCmd({ id: 'pc_1', name: '总结本页' }));
    const store = useCommandsStore();
    expect(store.globalCommands.map((c) => c.name)).not.toContain('总结本页');
  });
});

describe('★ 页面指令按页取（浏览器面板 chips 的数据源）', () => {
  it('空 URL 返回空（没打开页面就不该列出页面指令）', () => {
    pageRows.push(pageCmd({ id: 'pc_1', name: '总结本页', match_host: '*' }));
    const store = useCommandsStore();
    expect(store.pageDefsFor('')).toEqual([]);
    expect(store.pageDefsFor('   ')).toEqual([]);
  });

  it('命中当前页的才给，且映射成 kind=page（站点专属在前、全局在后由匹配引擎决定）', () => {
    pageRows.push(
      pageCmd({ id: 'pc_all', name: '总结本页', match_host: '*' }),
      pageCmd({ id: 'pc_tb', name: '提取本页表格', match_host: '*.taobao.com', kind: 'script' }),
    );
    const store = useCommandsStore();
    const onTaobao = store.pageDefsFor('https://item.taobao.com/1');
    expect(onTaobao.map((d) => d.name)).toEqual(['提取本页表格', '总结本页']);
    expect(onTaobao[0]).toMatchObject({ kind: 'page', pageKind: 'script', pageCommandId: 'pc_tb' });

    const onOther = store.pageDefsFor('https://example.com/');
    expect(onOther.map((d) => d.name)).toEqual(['总结本页']);
  });

  it('★ 按 pageCommandId 能回查到原始行（执行时拿 body / kind / 统计口径就靠它）', () => {
    pageRows.push(pageCmd({ id: 'pc_tb', name: '提取本页表格', body: '把主表格结构化成 markdown' }));
    const store = useCommandsStore();
    expect(store.pageCommandById('pc_tb')?.body).toBe('把主表格结构化成 markdown');
    // 回查不到（指令被删了）返回 null —— 调用方据此提示"刷新后再试"，而不是拿个空 body 去跑
    expect(store.pageCommandById('pc_gone')).toBeNull();
    expect(store.pageCommandById(undefined)).toBeNull();
  });
});

describe('★ 模式过滤 + 工具型命令的执行出口', () => {
  it('限定模式的命令只在那个模式出现（办公模式列一堆扫描命令没有意义）', () => {
    pluginCommands.push(
      { name: 'portscan', desc: '端口扫描', group: 'SCAN', mode: 'sec', danger: 'A', kind: 'tool', pluginId: 'sec-lab', tool: 'portscan', params: ['target'] },
      { name: 'findings', desc: '列出发现', group: 'SEC', kind: 'ui', run: 'open-findings' },
    );
    const store = useCommandsStore();
    expect(store.globalCommands.map((c) => c.name)).toContain('findings');   // 不限模式 ⇒ 全局
    expect(store.globalCommands.map((c) => c.name)).not.toContain('portscan');

    activeMode.value = 'sec';
    expect(store.globalCommands.map((c) => c.name)).toContain('portscan');
    expect(store.search('端口').map((c) => c.name)).toEqual(['portscan']);
  });

  it('★ runTool 走插件的既有端点 `/plugin/<id>/run`，并把位置参数映射成工具入参', async () => {
    const store = useCommandsStore();
    const def: CommandDef = {
      name: 'portscan', desc: '端口扫描', group: 'SCAN', mode: 'sec',
      kind: 'tool', pluginId: 'sec-lab', tool: 'portscan', params: ['target'],
    };
    const r = await store.runTool(def, {
      raw: '/portscan 10.0.0.1 --ports=80,443 --banner --concurrency 50',
      name: 'portscan', args: ['10.0.0.1'], flags: { ports: '80,443', banner: true, concurrency: '50' },
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe('/plugin/sec-lab/run');
    // 位置参数进 params[0]；纯数字/布尔的选项值转成数字/布尔（工具 schema 要的是 number/boolean）
    expect(post.mock.calls[0][1]).toEqual({
      tool: 'portscan',
      args: { target: '10.0.0.1', ports: '80,443', banner: true, concurrency: 50 },
    });
    expect(r).toEqual({ ok: true, text: '扫描完成' });
  });

  it('★ 不自己判权限、也不走别的执行端点（护栏只在服务端一处）', async () => {
    const store = useCommandsStore();
    await store.runTool(
      { name: 'attack', desc: 'x', group: 'LAB', mode: 'sec', danger: 'S', kind: 'tool', pluginId: 'sec-lab', tool: 'attack_sim', params: ['target'] },
      { raw: '/attack t', name: 'attack', args: ['t'], flags: {} },
    );
    // ★ 只有一条路径：/plugin/sec-lab/run（它会写入进程内 Symbol 人工标记再统一过 withGuard）。
    //   走 /api/tools/builtin/execute 就等于把护栏绕过去 —— 那是"命令层不新增绕过路径"要防的事。
    expect(post.mock.calls[0][0]).toBe('/plugin/sec-lab/run');
    expect(JSON.stringify(post.mock.calls)).not.toContain('/api/tools/builtin/execute');
  });

  it('工具返回 ok:false 时如实回错（不是抛异常，也不是吞掉）', async () => {
    post.mockResolvedValueOnce({ data: { ok: false, text: '目标不在授权范围内' } });
    const store = useCommandsStore();
    const r = await store.runTool(
      { name: 'recon', desc: 'x', group: 'RECON', mode: 'sec', kind: 'tool', pluginId: 'sec-lab', tool: 'recon', params: ['target'] },
      { raw: '/recon t', name: 'recon', args: ['t'], flags: {} },
    );
    expect(r.ok).toBe(false);
    expect(r.text).toContain('不在授权范围内');
  });

  it('缺 pluginId / tool 的命令不静默（返回可读原因，而不是发一个空请求）', async () => {
    const store = useCommandsStore();
    const r = await store.runTool({ name: 'x', desc: '', group: 'SYS', kind: 'tool' } as CommandDef,
      { raw: '/x', name: 'x', args: [], flags: {} });
    expect(r.ok).toBe(false);
    expect(r.text).toContain('没有声明执行端点');
    expect(post).not.toHaveBeenCalled();
  });
});

describe('★ 接线契约：两处消费方都必须走总线（否则又变成两套列表）', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
  const INPUT = read('components/chat/ChatInputArea.vue');
  const DOCK = read('components/browser/PageChatDock.vue');

  it('聊天输入框：命令清单从总线来，且不再硬编码那个 5 项数组', () => {
    expect(INPUT).toContain('useCommandsStore');
    expect(INPUT).toContain('commandsStore.globalCommands');
    expect(INPUT, '★ 又写死了一份命令数组 —— 加能力就要改这里，正是命令中枢要消灭的').not.toMatch(
      /const COMMANDS: Array<\{ cmd: string; hint: string; icon: Component \}> = \[/,
    );
  });

  it('浏览器面板：chips 经总线按页取，执行仍回查原始行后走同一通道', () => {
    expect(DOCK).toContain('commandsStore.pageDefsFor');
    expect(DOCK).toContain('commandsStore.pageCommandById');
    expect(DOCK, '★ 执行必须仍走 runCommand（脚本型带确认与审计），不能另起一条').toContain('runCommand(raw)');
  });
});
