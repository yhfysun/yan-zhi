// 页面指令 ↔ 命令中枢（CommandDef）的**唯一适配点**（2026-10-16）。
//
// ★ 为什么要有这个文件：本仓有两个"命令"概念 ——
//   · **命令中枢**（`contributes.commands` 的 `CommandDef`）：**声明式**、随代码/插件发布；
//   · **页面指令**（`browser_page_command` 表）：**持久化数据**，用户可增删改、有站点匹配与审计。
//   两边方案文档都把后者定义为"前者的一种"（`kind:'page'` + 页面作用域字段），
//   但字段并不逐名相同 —— 于是**适配在这里做，且只在这里做**。
//
// ★ 为什么不把两边字段强行改名统一（`description→desc` 等）：
//   那要动 19 个引用文件 + `browser_page_command` 表迁移 + 三端种子 + 已上线的导入/导出协议
//   （`page-command-import.test.ts` 钉了导出键集合），代价约 10 倍，还会破坏"旧文件仍可导入"的兼容。
//   两边各保持最适形状、中间架一层，是这笔账的答案。
//
// ★ 本文件是**纯函数**（无 pinia / 无 Vue / 无 IO）：匹配、搜索、分组都是"行为"，
//   写进组件就只能靠静态断言（见 utils/pageCommand.ts 的同类注释）。

import type { CommandDef } from '@yan-zhi/core';
import type { PageCommand } from './pageCommand';

/** 页面指令在命令面板里的分组名（方案文档 §6.1 预留的就是这个字面量） */
export const PAGE_COMMAND_GROUP = 'PAGE';

/** 内置命令（`/agent` `/model` …）的分组名 */
export const SYS_COMMAND_GROUP = 'SYS';

/**
 * 页面指令 → CommandDef。
 * ★ 不搬 `body` / 执行语义，只搬"列出 + 触发"需要的字段：
 *   真要执行时按 `pageCommandId` 回查原始行（`body` 可能很大，且执行口径只该有一处）。
 */
export function pageCommandToDef(c: PageCommand): CommandDef {
  return {
    name: c.name,
    desc: c.description || '',
    group: PAGE_COMMAND_GROUP,
    // ★ kind 用 'page'，而不是复用 'task'/'script'：后者是"指令内容形态"，
    //   与 CommandDef.kind 的"执行分流"不是一回事（同名不同义最容易在合并时出错）。
    kind: 'page',
    pageKind: c.kind,
    matchHost: c.match_host,
    matchUrl: c.match_url || undefined,
    pageCommandId: c.id,
  };
}

/** 批量映射（保持原顺序；调用方通常已经用匹配引擎排过序） */
export function pageCommandsToDefs(list: PageCommand[]): CommandDef[] {
  return (list || []).map(pageCommandToDef);
}

/**
 * 搜索：名称 / 别名 / 说明，大小写不敏感。
 * ★ 说明也参与匹配：用户记得住的往往是"那个导出链接的"（说明里的词），而不是命令名。
 * ★ 空查询返回全部（命令面板一打开就该看到全量、按分组折叠）。
 */
export function searchCommands(list: CommandDef[], q: string): CommandDef[] {
  const kw = String(q || '').trim().toLowerCase();
  if (!kw) return [...list];
  return list.filter((c) =>
    c.name.toLowerCase().includes(kw)
    || (c.aliases || []).some((a) => String(a).toLowerCase().includes(kw))
    || String(c.desc || '').toLowerCase().includes(kw),
  );
}

/** 一个分组的命令集合（命令面板的折叠单元） */
export interface CommandGroup {
  group: string;
  commands: CommandDef[];
}

/**
 * 按 group 归拢。分组顺序 = **首次出现顺序**（调用方把自己想要的分组排在前面即可），
 * 组内保持传入顺序 —— 排序规则留在调用方，本函数不擅自重排。
 */
export function groupCommands(list: CommandDef[]): CommandGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, CommandDef[]>();
  for (const c of list || []) {
    const g = c.group || SYS_COMMAND_GROUP;
    if (!buckets.has(g)) { buckets.set(g, []); order.push(g); }
    buckets.get(g)!.push(c);
  }
  return order.map((g) => ({ group: g, commands: buckets.get(g)! }));
}

/** 命令名 → 展示用的 `/name`（模板里到处拼字符串，必然会有一条漏了斜杠） */
export function slashOf(c: CommandDef): string {
  return `/${c.name}`;
}

/**
 * 命中判定：`q` 是不是这条命令的**前缀**（命令面板的 Tab 补全用）。
 * 与 `searchCommands` 的分工：那个是模糊包含（找人），这个是补全（确认唯一）。
 */
export function isPrefixOf(c: CommandDef, q: string): boolean {
  const kw = String(q || '').trim().toLowerCase();
  if (!kw) return false;
  return c.name.toLowerCase().startsWith(kw)
    || (c.aliases || []).some((a) => String(a).toLowerCase().startsWith(kw));
}
