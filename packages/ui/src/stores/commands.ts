// 前端**命令总线**（命令中枢 P0 的前端半边，2026-10-16）。
//
// ★ 它解决什么：命令此前**写死在前端** —— `ChatInputArea.vue` 里一个 5 项的数组，
//   每加一个能力就要改那个数组（"界面随能力增长"）。收口后：
//   各能力**声明**命令（内置的在本文件、插件在 `contributes.commands`、页面指令在指令库表），
//   前端只负责"列出 + 搜索 + 分组 + 触发"。
//
// ★ 为什么页面指令走同一个总线而不是各留一套（两边方案文档都写死的一条）：
//   页面对话的 chips 与聊天框的 `/` 菜单本质是同一件事 —— "列出一批可执行命令并执行其中一个"。
//   分成两套的代价是：加一种命令要改两处 UI、两处搜索、两处分组，且迟早漂移。
//
// ★ 但页面指令**不进** `globalCommands`：它要有"当前页"才有意义。
//   聊天输入框那边没有页上下文，列出来只会是一堆点了没用的项。
//   ⇒ 页面指令通过 `pageDefsFor(url)` 按页取（浏览器面板用）。
//
// ★ 执行**不在这里**：本文件只回答"有哪些命令、怎么搜、怎么分组"，
//   真正跑起来仍走各自的既有通道（内置命令在 ChatInputArea 的 switch、页面指令在 PageChatDock
//   的 runCommand / runScriptCommand）。命令总线不该成为第二条执行链。

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { CommandDef, PlaybookDef } from '@yan-zhi/core';
import { api } from '../api/client';
import { activeMode } from './mode';
import { usePluginStore } from './plugin';
import { usePageCommandsStore } from './page-commands';
import { matchPageCommands, type PageCommand } from '../utils/pageCommand';
import { buildToolArgs, type ParsedCommand } from '../utils/commandParser';
import {
  groupCommands, pageCommandsToDefs, searchCommands, SYS_COMMAND_GROUP, type CommandGroup,
} from '../utils/commandBridge';

/**
 * 内置命令（**从 ChatInputArea.vue 搬过来的**，逐字保留原有的 cmd / hint）。
 * `run` 是动作 id，由消费方（ChatInputArea 的 `enterSlashCommand`）分发 ——
 * 命令总线不认识任何 UI 弹窗，只报"要执行哪一条"。
 */
export const BUILTIN_COMMANDS: CommandDef[] = [
  { name: 'agent', desc: '切换当前任务智能体', group: SYS_COMMAND_GROUP, kind: 'ui', run: 'agent' },
  { name: 'model', desc: '切换使用的模型', group: SYS_COMMAND_GROUP, kind: 'ui', run: 'model' },
  { name: 'skill', desc: '挂载 / 卸载 Skill', group: SYS_COMMAND_GROUP, kind: 'ui', run: 'skill' },
  { name: 'dir', desc: '设置工作目录', group: SYS_COMMAND_GROUP, kind: 'ui', run: 'dir' },
  { name: 'new', desc: '新建任务', group: SYS_COMMAND_GROUP, kind: 'ui', run: 'new' },
  // ★ 帮助由 CommandDef **自动生成**（`formatHelp`）—— 手写的帮助清单必然随命令增长而漂移，
  //   而"帮助里没有这条命令"会让用户以为它不存在。
  { name: 'help', aliases: ['?'], desc: '查看可用命令（/help <命令> 看单条用法）', usage: '/help [命令名]', group: SYS_COMMAND_GROUP, kind: 'builtin', run: 'help' },
  // ★ 下面两条是**安全控制台的交互**，不是插件能力，所以放内置而不是 contributes.commands：
  //   插件只知道 `target` 参数，没有"当前焦点目标"这个概念；剧本的增删也是控制台的会话状态。
  //   `mode:'sec'` ⇒ 只在安全模式的面板里出现（办公模式列出来毫无意义）。
  { name: 'target', desc: '设定焦点目标（之后带 target 的命令可省略；不带参数=清空）', usage: '/target <域名|IP>', group: SYS_COMMAND_GROUP, mode: 'sec', kind: 'ui', run: 'target' },
  { name: 'playbook', aliases: ['pb'], desc: '自定义剧本：list / save / rm', usage: '/playbook <list|save|rm> [--name=名] [--steps="/recon ${target};/portscan ${target}"]', group: SYS_COMMAND_GROUP, mode: 'sec', kind: 'ui', run: 'playbook' },
];

export const useCommandsStore = defineStore('commands', () => {
  /**
   * 按当前模式过滤命令。
   * ★ 为什么要过滤：安全工具的命令（`mode:'sec'`）出现在办公模式的面板里毫无意义，
   *   而"列出来但不能用"比"没列出来"更糟 —— 用户会以为功能坏了。
   * ★ 不过滤（`mode` 缺省）的命令全局可用（`/agent` `/model` `/help` 这些）。
   */
  function commandsForMode<T extends { mode?: string }>(list: T[], mode: string): T[] {
    return list.filter((c) => !c.mode || c.mode === mode);
  }

  /**
   * 通用内置工具的命令（服务端下发，2026-10-17）。
   * ★ 为什么**不在前端写死清单**：读写判定只有服务端有（`WRITE_TOOLS`），
   *   前端再维护一份必然漂移，漂移的后果是"只读的命令跑出了写工具"。
   *   服务端 `/api/tools/builtin/commands` 已按 `readonly` 过滤，前端拿到即是只读。
   */
  const builtinToolCommands = ref<CommandDef[]>([]);

  /** 拉取只读内置工具清单；失败**不抛**（拿不到就当没有，内置命令与插件命令照旧可用） */
  async function loadBuiltinToolCommands(): Promise<void> {
    try {
      const r: any = await api.get('/tools/builtin/commands');
      const list = r?.data;
      builtinToolCommands.value = Array.isArray(list)
        ? list.map((t: any) => ({
            name: String(t?.name || ''),
            desc: String(t?.desc || t?.name || ''),
            group: String(t?.group || 'TOOLS'),
            kind: 'builtin-tool' as const,
            tool: String(t?.name || ''),
            params: Array.isArray(t?.params) ? t.params.map(String) : undefined,
          })).filter((c: CommandDef) => !!c.name)
        : [];
    } catch { /* 保持现状 */ }
  }

  /**
   * 全局命令 = 内置 + 只读内置工具 + 插件贡献，且**只留当前模式可用的**（页面指令不在其列，理由见文件头） */
  const globalCommands = computed<CommandDef[]>(() => commandsForMode(
    [...BUILTIN_COMMANDS, ...builtinToolCommands.value, ...usePluginStore().commands],
    activeMode.value,
  ));

  /** 全局命令按分组归拢（命令面板的折叠单元；顺序 = 首次出现顺序） */
  const globalGroups = computed<CommandGroup[]>(() => groupCommands(globalCommands.value));

  /** 全局命令搜索（名称 / 别名 / 说明；空查询 = 全部） */
  function search(q: string): CommandDef[] {
    return searchCommands(globalCommands.value, q);
  }

  /** 用户自定义剧本（存后端 `plugin_storage` 的 `playbooks` 键，`/playbook save` 写入） */
  const userPlaybooks = ref<PlaybookDef[]>([]);

  /**
   * 拉取用户剧本。
   * ★ 失败**不抛**：拿不到就当没有 —— 内置剧本仍然可用，
   *   不该因为一个接口抖动让整个"@剧本"功能消失（那是把可降级的事做成了硬故障）。
   */
  async function loadUserPlaybooks(): Promise<void> {
    try {
      const r: any = await api.get('/plugin/sec-lab/playbooks');
      const list = r?.data;
      userPlaybooks.value = Array.isArray(list) ? list : [];
    } catch { /* 保持现状 */ }
  }

  /**
   * 剧本（`@名字` 召唤）= 插件声明的内置剧本 + 用户自定义剧本，同样**按模式过滤**。
   * ★ 剧本只是"命令的序列"，本 store 不执行它 —— 调用方拿展开后的命令行走同一条命令通道。
   */
  const playbooks = computed<PlaybookDef[]>(() => commandsForMode(
    [...(usePluginStore().playbooks || []), ...userPlaybooks.value],
    activeMode.value,
  ));

  /**
   * 当前页命中的**页面指令**（CommandDef 形态）—— 浏览器面板的 chips 用。
   * ★ 匹配与排序口径仍归 `utils/pageCommand.ts` 的 `matchPageCommands`
   *   （URL 正则 > 站点专属 > 全局；非法正则降级为不参与），本函数只做形态转换。
   */
  function pageDefsFor(url: string): CommandDef[] {
    if (!String(url || '').trim()) return [];
    return pageCommandsToDefs(matchPageCommands(usePageCommandsStore().list, url));
  }

  /**
   * 按 id 回查页面指令的原始行 —— **执行时**要用它的 `body` / `kind` / 统计口径。
   * 总线只搬"列出 + 触发"需要的字段（`body` 可能很大），执行口径始终只有一处。
   */
  function pageCommandById(id?: string): PageCommand | null {
    if (!id) return null;
    return usePageCommandsStore().list.find((c) => c.id === id) || null;
  }

  /**
   * 执行一条 `kind:'tool'` 命令（工具型命令的**唯一执行出口**）。
   *
   * ★★ 端点 `/plugin/<pluginId>/run` **不是新造的**：安全控制台每个「▶ 执行」按钮走的就是它
   *    （`SecConsole.vue` 的 `postRun` → `POST /plugin/sec-lab/run`），
   *    服务端在那条路由里写入进程内 Symbol 人工标记（模型参数无法伪造），再统一过 `withGuard`
   *    （授权范围 → 风险级 → 交战模式 → HUMAN_ONLY → 危险黑名单）并写审计。
   *    ⇒ 命令层**没有新增任何绕过路径**，与方案 §九.2 一致：命令只是"更好用的入口"。
   * ★ 因此这里**不**做任何权限判断：判断只在服务端一处，前端判一遍必然与它漂移。
   * ★ 也**不**走 `/api/tools/builtin/execute`：那个端点不过 permissionMode、也没有 sec 的护栏，
   *    拿它跑安全工具等于把护栏绕过去（这正是"命令层不新增绕过路径"要防的事）。
   */
  async function runTool(def: CommandDef, parsed: ParsedCommand): Promise<{ ok: boolean; text: string; jobId?: string }> {
    // ★ 通用内置工具走**另一条端点**（`/api/tools/builtin/execute`）——
    //   它与插件工具的 `/plugin/<id>/run` 是两套：那个端点没有 sec 护栏，
    //   所以**绝不能**拿它跑 sec-lab 的工具（`secConsoleCommandBar.test.ts` 有守门），
    //   反过来这里也**只**接 `kind:'builtin-tool'`，不混用。
    //   `permissionMode` 固定传 `'readonly'`：我们只放开了只读工具，
    //   把这一点**在服务端也钉死**（服务端会据此拒绝任何写工具），
    //   比"信任前端列出来的都对"更稳。
    if (def.kind === 'builtin-tool') {
      if (!def.tool) return { ok: false, text: `「${def.name}」没有声明工具名` };
      const args = buildToolArgs(def, parsed);
      const r: any = await api.post('/tools/builtin/execute', { name: def.tool, args, permissionMode: 'readonly' });
      if (r && 'error' in r) return { ok: false, text: String(r.error) };
      const d = r?.data as { content?: Array<{ text?: string }>; isError?: boolean } | undefined;
      const text = (d?.content || []).map((c) => c?.text || '').filter(Boolean).join('\n') || '(无输出)';
      return { ok: d?.isError !== true, text };
    }
    if (!def.pluginId || !def.tool) return { ok: false, text: `「${def.name}」没有声明执行端点（缺 pluginId / tool）` };
    const args = buildToolArgs(def, parsed);
    const r: any = await api.post(`/plugin/${def.pluginId}/run`, { tool: def.tool, args });
    if (r && 'error' in r) return { ok: false, text: String(r.error) };
    const d = r?.data as { ok?: boolean; text?: string; jobId?: string } | undefined;
    // ★ jobId 只有扫描工具会给（服务端从 ToolOutput.raw 透出）：控制台据此导出"本次扫描"。
    //   缺省时不写这个键 —— 既有调用方的精确断言与形状保持不变。
    const jobId = typeof d?.jobId === 'string' && d.jobId ? d.jobId : undefined;
    return { ok: d?.ok !== false, text: String(d?.text || '(无输出)'), ...(jobId ? { jobId } : {}) };
  }

  // 首次实例化时拉一次「只读内置工具」清单：失败静默降级（拿不到就是少几条命令，
  // 不该因为一个接口抖动让内置命令与插件命令一起消失），也不阻塞任何调用方。
  void loadBuiltinToolCommands();

  return { globalCommands, globalGroups, search, playbooks, loadUserPlaybooks, loadBuiltinToolCommands, pageDefsFor, pageCommandById, runTool };
});
