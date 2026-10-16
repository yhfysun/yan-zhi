// 命令中枢适配层（页面指令 ↔ CommandDef / 搜索 / 分组）的守门测试（2026-10-16）。
//
// 为什么必须真跑：这里每一条写错都是**静默错行为** ——
//   ① 适配字段搬错（如把 `kind: 'task'|'script'` 直接透传上去）⇒ 页面指令在命令面板里
//      被当成"后端工具"，点下去走错执行通道，而且不一定报错；
//   ② 搜索漏了说明/别名 ⇒ 用户搜"链接"找不到"提取全部链接"，只会以为没有这条命令；
//   ③ 分组顺序乱了 ⇒ 面板里 SYS 跑到 PAGE 后面（或反之），与设计的分组呈现不符。

import { describe, it, expect } from 'vitest';
import type { CommandDef } from '@yan-zhi/core';
import {
  PAGE_COMMAND_GROUP, SYS_COMMAND_GROUP, groupCommands, isPrefixOf,
  pageCommandToDef, pageCommandsToDefs, searchCommands, slashOf,
} from './commandBridge';
import type { PageCommand } from './pageCommand';

function pageCmd(p: Partial<PageCommand> & { id: string }): PageCommand {
  return {
    name: p.id, description: '', kind: 'task', body: '做点事', match_host: '*', match_url: null,
    ...p,
  } as PageCommand;
}

function def(p: Partial<CommandDef> & { name: string }): CommandDef {
  return { desc: '', group: SYS_COMMAND_GROUP, kind: 'builtin', ...p };
}

describe('页面指令 → CommandDef', () => {
  it('搬「列出 + 触发」需要的字段，kind 固定为 page（不把 task/script 透传上去）', () => {
    const d = pageCommandToDef(pageCmd({
      id: 'pc_1', name: '提取本页表格', description: '结构化成 markdown', kind: 'script',
      match_host: '*.taobao.com', match_url: '^https://item\\.', body: 'return 1',
    }));
    expect(d).toEqual({
      name: '提取本页表格',
      desc: '结构化成 markdown',
      group: PAGE_COMMAND_GROUP,
      kind: 'page',
      pageKind: 'script',
      matchHost: '*.taobao.com',
      matchUrl: '^https://item\\.',
      pageCommandId: 'pc_1',
    });
    // ★ body 不搬（可能很大，且执行口径只该有一处）；执行时按 pageCommandId 回查
    expect((d as any).body).toBeUndefined();
  });

  it('缺 description 落空串（不是 undefined —— 面板模板要拼字符串）', () => {
    expect(pageCommandToDef(pageCmd({ id: 'pc_2', description: undefined })).desc).toBe('');
  });

  it('批量映射保持原顺序（匹配引擎已排好序，这里不许重排）', () => {
    const defs = pageCommandsToDefs([
      pageCmd({ id: 'pc_a' }), pageCmd({ id: 'pc_b' }), pageCmd({ id: 'pc_c' }),
    ]);
    expect(defs.map((d) => d.pageCommandId)).toEqual(['pc_a', 'pc_b', 'pc_c']);
  });
});

describe('搜索 / 分组 / 前缀补全', () => {
  const list: CommandDef[] = [
    def({ name: 'agent', desc: '切换当前任务智能体' }),
    def({ name: 'portscan', aliases: ['ps'], desc: '端口扫描' }),
    def({ name: '提取全部链接', desc: '列出本页所有可点击链接' }),
  ];

  it('空查询返回全部（面板一打开就要看到全量）', () => {
    expect(searchCommands(list, '  ').length).toBe(3);
  });

  it('名称 / 别名 / 说明都能搜到，且大小写不敏感', () => {
    expect(searchCommands(list, 'PORT').map((c) => c.name)).toEqual(['portscan']);
    expect(searchCommands(list, 'ps').map((c) => c.name)).toEqual(['portscan']);       // 别名
    expect(searchCommands(list, '链接').map((c) => c.name)).toEqual(['提取全部链接']);   // 说明
  });

  it('搜不到就是空数组（不是"全部"—— 那会让用户以为搜索没生效）', () => {
    expect(searchCommands(list, 'zzz')).toEqual([]);
  });

  it('分组按首次出现顺序，组内保持传入顺序', () => {
    const grouped = groupCommands([
      def({ name: 'a', group: 'SYS' }), def({ name: 'b', group: 'PAGE' }),
      def({ name: 'c', group: 'SYS' }),
    ]);
    expect(grouped.map((g) => g.group)).toEqual(['SYS', 'PAGE']);
    expect(grouped[0].commands.map((c) => c.name)).toEqual(['a', 'c']);
    expect(grouped[1].commands.map((c) => c.name)).toEqual(['b']);
  });

  it('group 缺省归到 SYS（不给没有分组的命令留一个空名字的分组）', () => {
    const grouped = groupCommands([{ name: 'x', desc: '', kind: 'builtin', group: '' } as CommandDef]);
    expect(grouped[0].group).toBe(SYS_COMMAND_GROUP);
  });

  it('slashOf 补斜杠；前缀补全认名称与别名，空串不算命中', () => {
    expect(slashOf(list[0])).toBe('/agent');
    expect(isPrefixOf(list[1], 'port')).toBe(true);
    expect(isPrefixOf(list[1], 'ps')).toBe(true);
    expect(isPrefixOf(list[1], '')).toBe(false);
    expect(isPrefixOf(list[1], 's')).toBe(false);
  });
});
