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
import { computed } from 'vue';
import type { CommandDef } from '@yan-zhi/core';
import { usePluginStore } from './plugin';
import { usePageCommandsStore } from './page-commands';
import { matchPageCommands, type PageCommand } from '../utils/pageCommand';
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
];

export const useCommandsStore = defineStore('commands', () => {
  /** 全局命令 = 内置 + 插件贡献（页面指令不在其列，理由见文件头） */
  const globalCommands = computed<CommandDef[]>(() => [
    ...BUILTIN_COMMANDS,
    ...usePluginStore().commands,
  ]);

  /** 全局命令按分组归拢（命令面板的折叠单元；顺序 = 首次出现顺序） */
  const globalGroups = computed<CommandGroup[]>(() => groupCommands(globalCommands.value));

  /** 全局命令搜索（名称 / 别名 / 说明；空查询 = 全部） */
  function search(q: string): CommandDef[] {
    return searchCommands(globalCommands.value, q);
  }

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

  return { globalCommands, globalGroups, search, pageDefsFor, pageCommandById };
});
