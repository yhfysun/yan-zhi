// 命令行解析的守门测试（命令中枢 P0，2026-10-16）。
//
// 为什么必须真跑：解析错了的表现是"命令跑到了别的目标上"（参数咬错、`;` 切错），
// 而且不会报错 —— 这类错在安全工具上尤其贵。纯文本断言完全抓不住。

import { describe, it, expect } from 'vitest';
import type { CommandDef } from '@yan-zhi/core';
import {
  findCommand, formatCommandHelp, formatHelp, parseCommandChain, parseCommandLine,
  planCommandInput, pushHistory, splitChain,
} from './commandParser';

function def(p: Partial<CommandDef> & { name: string }): CommandDef {
  return { desc: '', group: 'SCAN', kind: 'ui', ...p };
}

describe('splitChain：按 ; 串联', () => {
  it('普通切分；空片段丢掉（手滑多打的分号不该变成一条空命令）', () => {
    expect(splitChain('/a 1; /b 2')).toEqual(['/a 1', '/b 2']);
    expect(splitChain('/a;; /b;')).toEqual(['/a', '/b']);
    expect(splitChain('   ')).toEqual([]);
  });

  it('★ 引号内的分号是内容不是分隔符（否则带引号的参数会被腰斩）', () => {
    expect(splitChain('/a "x;y"; /b')).toEqual(['/a "x;y"', '/b']);
    expect(splitChain("/a 'x;y'")).toEqual(["/a 'x;y'"]);
  });
});

describe('parseCommandLine：名称 / 位置参数 / 选项', () => {
  it('非命令（不以 / 开头）与空返回 null —— 调用方据此当普通文本处理', () => {
    expect(parseCommandLine('你好')).toBeNull();
    expect(parseCommandLine('   ')).toBeNull();
    expect(parseCommandLine('/')).toBeNull();
  });

  it('名称 + 位置参数', () => {
    expect(parseCommandLine('/portscan 10.0.0.1 10.0.0.2')).toMatchObject({
      name: 'portscan', args: ['10.0.0.1', '10.0.0.2'], flags: {},
    });
  });

  it('★ 短选项吃下一个词；长选项是布尔（这条规则写死在注释里，这里把它钉住）', () => {
    const p = parseCommandLine('/portscan 10.0.0.1 -p 80-443 --banner')!;
    expect(p.args).toEqual(['10.0.0.1']);
    expect(p.flags).toEqual({ p: '80-443', banner: true });
    // ★ 长选项**不**吃下一个词：这正是规则的可验证形式（否则目标会被 flag 吞掉）
    const q = parseCommandLine('/scan --fast 10.0.0.1')!;
    expect(q.flags).toEqual({ fast: true });
    expect(q.args).toEqual(['10.0.0.1']);
  });

  it('`=` 形式对长短选项都成立（长选项要带值时用它）', () => {
    const p = parseCommandLine('/crawl --url=https://x.y/z -p=443')!;
    expect(p.flags).toEqual({ url: 'https://x.y/z', p: '443' });
    expect(p.args).toEqual([]);
  });

  it('引号参数去掉引号后原样保留（含空格）', () => {
    const p = parseCommandLine('/say "hello world" \'a b\'')!;
    expect(p.args).toEqual(['hello world', 'a b']);
  });

  it('选项值本身可以带 `=`（只按第一个 `=` 切）', () => {
    expect(parseCommandLine('/c --query=a=b=c')!.flags.query).toBe('a=b=c');
  });

  it('raw 保留原文（历史与错误回显要能原样引用）', () => {
    expect(parseCommandLine('  /a 1  ')!.raw).toBe('/a 1');
  });
});

describe('parseCommandChain / findCommand', () => {
  it('整行解析出多条；非命令片段被丢掉', () => {
    const chain = parseCommandChain('/a 1; 随便说句话; /b');
    expect(chain.map((c) => c.name)).toEqual(['a', 'b']);
  });

  it('按名称或别名找，大小写不敏感；找不到返回 null', () => {
    const list = [def({ name: 'portscan', aliases: ['ps'] }), def({ name: 'whois' })];
    expect(findCommand(list, 'PORTSCAN')?.name).toBe('portscan');
    expect(findCommand(list, 'ps')?.name).toBe('portscan');
    expect(findCommand(list, 'nope')).toBeNull();
    expect(findCommand(list, '')).toBeNull();
  });
});

describe('帮助文本（由 CommandDef 自动生成）', () => {
  it('/help <cmd> 给出用法、说明、别名、风险', () => {
    const text = formatCommandHelp(def({
      name: 'portscan', aliases: ['ps'], desc: '端口扫描', usage: '/portscan <target> [-p spec]',
      danger: 'A', group: 'SCAN',
    }));
    expect(text).toContain('/portscan');
    expect(text).toContain('端口扫描');
    expect(text).toContain('/portscan <target> [-p spec]');
    expect(text).toContain('/ps');
    expect(text).toContain('风险：A');
  });

  it('/help <页面指令> 说明它要去浏览器面板里点，而不是在这儿敲', () => {
    const text = formatCommandHelp(def({
      name: '提取本页表格', kind: 'page', pageKind: 'script', group: 'PAGE', matchHost: '*.taobao.com',
    }));
    expect(text).toContain('脚本型，执行前确认');
    expect(text).toContain('*.taobao.com');
    expect(text).toContain('浏览器面板');
  });

  it('/help 按分组列出全部；没有命令时给一句人话', () => {
    const text = formatHelp([def({ name: 'a', group: 'SYS', desc: '甲' }), def({ name: 'b', group: 'SCAN', desc: '乙' })]);
    expect(text).toContain('【SYS】');
    expect(text).toContain('【SCAN】');
    expect(text).toContain('/a');
    expect(text).toContain('/b');
    expect(formatHelp([])).toContain('没有可用命令');
  });
});

describe('历史（纯函数，持久化由调用方做）', () => {  it('新条目排最前；重复的挪到最前而不是出现两次；容量封顶', () => {
    let h = pushHistory([], '/a');
    h = pushHistory(h, '/b');
    expect(h).toEqual(['/b', '/a']);
    h = pushHistory(h, '/a');
    expect(h).toEqual(['/a', '/b']);
    let big: string[] = [];
    for (let i = 0; i < 60; i++) big = pushHistory(big, `/c${i}`, 50);
    expect(big.length).toBe(50);
    expect(big[0]).toBe('/c59');
  });

  it('空白输入不入历史', () => {
    expect(pushHistory(['/a'], '   ')).toEqual(['/a']);
  });
});

describe('★ 回车提交的动作计划（"命令绝不能被当成聊天发给模型"这条规则的可验证形式）', () => {
  const list = [
    def({ name: 'help', aliases: ['?'], kind: 'builtin', run: 'help', group: 'SYS' }),
    def({ name: 'agent', kind: 'ui', run: 'agent', group: 'SYS' }),
    def({ name: 'new', kind: 'ui', run: 'new', group: 'SYS' }),
    def({ name: 'portscan', kind: 'tool', tool: 'portscan', group: 'SCAN' }),
  ];

  it('普通文本 → chat（调用方据此走 send()）', () => {
    expect(planCommandInput('帮我看看这个页面', list)).toEqual([{ kind: 'chat' }]);
    expect(planCommandInput('', list)).toEqual([{ kind: 'chat' }]);
  });

  it('★ 带空格/别名的命令行仍被认成命令，不会被送去聊天', () => {
    const plan = planCommandInput('/help agent', list);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ kind: 'run', def: { name: 'help' } });
    expect((plan[0] as any).parsed.args).toEqual(['agent']);

    // 别名同样成立
    expect(planCommandInput('/? ', list)[0]).toMatchObject({ kind: 'run', def: { name: 'help' } });
  });

  it('「/」这种解析不出命令的输入仍按聊天处理（用户可能就是想发这句话）', () => {
    expect(planCommandInput('/', list)).toEqual([{ kind: 'chat' }]);
    expect(planCommandInput('  /  ', list)).toEqual([{ kind: 'chat' }]);
  });

  it('多条串联 → 依次的计划', () => {
    const plan = planCommandInput('/help; /new', list);
    expect(plan.map((p) => (p as any).def?.name)).toEqual(['help', 'new']);
  });

  it('不认识的命令 → unknown（调用方提示，而不是静默发出去）', () => {
    expect(planCommandInput('/nope 1', list)).toEqual([{ kind: 'unknown', name: 'nope' }]);
  });

  it('★ 需要交互选择的命令标成 interactive（串联里做不了，单条照常）', () => {
    expect(planCommandInput('/agent', list)[0]).toMatchObject({ kind: 'interactive', def: { name: 'agent' } });
    expect(planCommandInput('/new; /agent', list).map((p) => p.kind)).toEqual(['run', 'interactive']);
  });

  it('工具型命令进 run（交给执行通道，不在计划里做任何执行）', () => {
    const plan = planCommandInput('/portscan 10.0.0.1 -p 80', list);
    expect(plan[0]).toMatchObject({ kind: 'run', def: { name: 'portscan', tool: 'portscan' } });
    expect((plan[0] as any).parsed.args).toEqual(['10.0.0.1']);
    expect((plan[0] as any).parsed.flags).toEqual({ p: '80' });
  });
});
