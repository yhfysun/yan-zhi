// 页面指令「站点匹配 + 模板渲染」的守门测试（P1）。
//
// 为什么必须真跑：这两件事写错都是**静默错行为**——
//   ① 匹配错：指令出现在不该出现的站点上（用户会以为"这指令坏了"），或该出现的没出现（看着像没做过）；
//   ② 非法正则抛出去：整条指令列表渲染直接崩（而且只有一个用户能复现，因为只有他写了错正则）；
//   ③ 模板没替换：模型收到字面量 "${selection}"，会一本正经地去找叫 selection 的东西。

import { describe, it, expect } from 'vitest';
import {
  buildScriptRepairPrompt, buildScriptSource, digestOf, formatScriptResult, inputPromptsOf,
  isCommandEnabled, matchHostPattern, matchPageCommands, matchUrlPattern, needsConfirm,
  renderCommandBody, usedVarsOf, type PageCommand,
} from './pageCommand';

function cmd(p: Partial<PageCommand> & { id: string }): PageCommand {
  return { name: p.id, kind: 'task', body: '做点事', match_host: '*', ...p } as PageCommand;
}

describe('matchHostPattern：站点通配', () => {
  it('"*" 全通过；精确 host 大小写不敏感、忽略端口', () => {
    expect(matchHostPattern('*', 'www.baidu.com')).toBe(true);
    expect(matchHostPattern('www.baidu.com', 'WWW.Baidu.com')).toBe(true);
    expect(matchHostPattern('localhost', 'localhost:5173')).toBe(true);
    expect(matchHostPattern('www.baidu.com', 'm.baidu.com')).toBe(false);
  });

  it('"*.example.com" 命中裸域与所有子域，但**不**命中仿冒域', () => {
    expect(matchHostPattern('*.fanqieopen.com', 'kol.fanqieopen.com')).toBe(true);
    expect(matchHostPattern('*.fanqieopen.com', 'fanqieopen.com')).toBe(true);
    expect(matchHostPattern('*.fanqieopen.com', 'a.b.fanqieopen.com')).toBe(true);
    expect(matchHostPattern('*.fanqieopen.com', 'notfanqieopen.com')).toBe(false);
    expect(matchHostPattern('*.fanqieopen.com', 'fanqieopen.com.evil.com')).toBe(false);
  });

  it('没有 host（起始主页）时只有全局指令通过', () => {
    expect(matchHostPattern('*', '')).toBe(true);
    expect(matchHostPattern('www.baidu.com', '')).toBe(false);
  });
});

describe('matchUrlPattern：非法正则一律降级（绝不抛）', () => {
  it('未设正则 → null（不参与判定）', () => {
    expect(matchUrlPattern('', 'https://x.com')).toBeNull();
    expect(matchUrlPattern(null, 'https://x.com')).toBeNull();
  });

  it('合法正则：命中 true / 不命中 false，大小写不敏感', () => {
    expect(matchUrlPattern('/article/\\d+', 'https://x.com/ARTICLE/12')).toBe(true);
    expect(matchUrlPattern('/article/\\d+', 'https://x.com/list')).toBe(false);
  });

  it('★ 非法正则（"["、"(" 之类）→ 返回 null 且不抛异常', () => {
    expect(() => matchUrlPattern('[', 'https://x.com')).not.toThrow();
    expect(matchUrlPattern('[', 'https://x.com')).toBeNull();
    expect(matchUrlPattern('(unclosed', 'https://x.com')).toBeNull();
  });
});

describe('★ matchPageCommands：命中与排序', () => {
  const list: PageCommand[] = [
    cmd({ id: 'g1', match_host: '*', created_at: 1 }),
    cmd({ id: 'g2', match_host: '*', created_at: 2 }),
    cmd({ id: 'site', match_host: '*.fanqieopen.com', created_at: 3 }),
    cmd({ id: 'exact', match_host: 'kol.fanqieopen.com', created_at: 4 }),
    cmd({ id: 're', match_host: '*', match_url: '/book/\\d+', created_at: 5 }),
    cmd({ id: 'other-site', match_host: 'www.baidu.com', created_at: 6 }),
    cmd({ id: 'disabled', match_host: '*', enabled: 0, created_at: 7 }),
  ];

  it('全局指令在任何站点都命中', () => {
    const got = matchPageCommands(list, 'https://www.baidu.com').map((c) => c.id);
    expect(got).toContain('g1');
    expect(got).toContain('g2');
    expect(got).toContain('other-site');
  });

  it('★ 排序：URL 正则命中 → 站点专属 → 全局', () => {
    const got = matchPageCommands(list, 'https://kol.fanqieopen.com/book/123').map((c) => c.id);
    // 同档（站点专属）内按创建时间：site(3) 在 exact(4) 之前
    expect(got.slice(0, 4)).toEqual(['re', 'site', 'exact', 'g1']);
  });

  it('站点专属指令在别的站点不出现', () => {
    const got = matchPageCommands(list, 'https://www.baidu.com').map((c) => c.id);
    expect(got).not.toContain('site');
    expect(got).not.toContain('exact');
  });

  it('★ 设了 match_url 的指令**只**按正则判：正则不命中时即使 host 是 "*" 也不出现', () => {
    const got = matchPageCommands(list, 'https://www.baidu.com/list').map((c) => c.id);
    expect(got).not.toContain('re');
  });

  it('未启用的指令不出现（可以停用内置指令）', () => {
    expect(matchPageCommands(list, 'https://x.com').map((c) => c.id)).not.toContain('disabled');
  });

  it('kind=script 也会命中（P2 起可用）：执行前由 needsConfirm 决定要不要弹确认', () => {
    const withScript = [...list, cmd({ id: 'scr', kind: 'script', match_host: '*' })];
    expect(matchPageCommands(withScript, 'https://x.com').map((c) => c.id)).toContain('scr');
  });

  it('非法正则 → 降级为按 host 判定（不崩，也不因为"有正则"就整体不命中）', () => {
    const bad = [cmd({ id: 'badre', match_host: '*', match_url: '[' })];
    expect(matchPageCommands(bad, 'https://x.com').map((c) => c.id)).toEqual(['badre']);
  });

  it('同档内按创建时间稳定排序（界面不会每次刷新换位置）', () => {
    const got = matchPageCommands(list, 'https://x.com').map((c) => c.id);
    expect(got).toEqual(['g1', 'g2']);
  });
});

describe('isCommandEnabled / usedVarsOf', () => {
  it('enabled 兼容 undefined/boolean/0|1', () => {
    expect(isCommandEnabled({})).toBe(true);
    expect(isCommandEnabled({ enabled: true })).toBe(true);
    expect(isCommandEnabled({ enabled: 1 })).toBe(true);
    expect(isCommandEnabled({ enabled: false })).toBe(false);
    expect(isCommandEnabled({ enabled: 0 })).toBe(false);
  });

  it('usedVarsOf 找出正文用到的变量（用于决定要不要现采选区）', () => {
    expect(usedVarsOf('总结 ${url} 并翻译 ${selection}')).toEqual(['url', 'selection']);
    expect(usedVarsOf('总结这一页')).toEqual([]);
  });
});

describe('★ 模板渲染', () => {
  const vars = { url: 'https://x.com/a', title: '标题', host: 'x.com', selection: '选中的文字' };

  it('已知变量全部替换', () => {
    const out = renderCommandBody('看 ${url}（${title} / ${host}），重点 ${selection}', vars);
    expect(out).toBe('看 https://x.com/a（标题 / x.com），重点 选中的文字');
  });

  it('${input:提示} 用用户输入替换；跳过输入时留空而不是塞占位串', () => {
    expect(renderCommandBody('用 ${input:关键词} 搜索', vars, { 关键词: '特斯拉' })).toBe('用 特斯拉 搜索');
    expect(renderCommandBody('用 ${input:关键词} 搜索', vars)).toBe('用  搜索');
  });

  it('inputPromptsOf：按顺序、去重、空提示兜底', () => {
    expect(inputPromptsOf('${input:关键词} 和 ${input:篇数} 还有 ${input:关键词}')).toEqual(['关键词', '篇数']);
    expect(inputPromptsOf('${input:}')).toEqual(['请输入']);
  });

  it('选区过长时截断（指令正文要进 prompt，不该被选区挤爆）', () => {
    const long = 'y'.repeat(2500);
    const out = renderCommandBody('${selection}', { ...vars, selection: long });
    expect(out.length).toBeLessThan(2200);
    expect(out).toContain('原长 2500 字');
  });
});

describe('★ P2 脚本型：确认口径与脚本组装', () => {
  it('needsConfirm：脚本默认**要**确认；显式 need_confirm=0 才免确认；任务型永不确认', () => {
    expect(needsConfirm({ kind: 'script', need_confirm: 1 })).toBe(true);
    expect(needsConfirm({ kind: 'script' })).toBe(true);            // 缺省也是要确认
    expect(needsConfirm({ kind: 'script', need_confirm: 0 })).toBe(false);
    expect(needsConfirm({ kind: 'task', need_confirm: 1 })).toBe(false);
    expect(needsConfirm({ kind: 'task', need_confirm: 0 })).toBe(false);
  });

  it('buildScriptSource：注入只读 ctx（已 freeze）并完成模板插值', () => {
    const src = buildScriptSource('return ctx.host + "|" + ctx.title;', {
      url: 'https://kol.fanqieopen.com/book/1', title: '作品页', host: 'kol.fanqieopen.com', selection: '',
    });
    expect(src).toContain('Object.freeze(');
    expect(src).toContain('"host":"kol.fanqieopen.com"');
    expect(src).toContain('return ctx.host + "|" + ctx.title;');
    expect(src.trim().startsWith('(() => {')).toBe(true);
  });

  it('buildScriptSource：${input:提示} 在脚本里也被替换（用户填的值直接进脚本）', () => {
    const src = buildScriptSource('return "${input:关键词}";', {
      url: 'https://x.com', title: 't', host: 'x.com', selection: '',
    }, { 关键词: '特斯拉' });
    expect(src).toContain('return "特斯拉";');
    expect(src).not.toContain('${input:');
  });

  it('digestOf：只给长度+短哈希，**不含原文**（审计不落页面数据）', () => {
    const secret = '用户手机号 13800000000 的页面内容';
    const d = digestOf(secret);
    expect(d).toMatch(/^len=\d+ hash=[0-9a-f]+$/);
    expect(d).not.toContain('13800000000');
    expect(d).not.toContain('手机号');
    expect(digestOf(secret)).toBe(d);        // 同一输入稳定
    expect(digestOf(secret + 'x')).not.toBe(d);
  });

  it('formatScriptResult：对象走 JSON 代码块、字符串原样、超长截断、无返回值有兜底', () => {
    const json = formatScriptResult('导出链接', { count: 2, links: ['a', 'b'] }, 42);
    expect(json).toContain('**导出链接** · 用时 42ms');
    expect(json).toContain('```json');
    expect(json).toContain('"count": 2');

    expect(formatScriptResult('纯文本', 'hello', 1)).toContain('hello');
    expect(formatScriptResult('空', undefined, 1)).toContain('(脚本没有返回值)');

    const long = formatScriptResult('长', 'z'.repeat(9000), 1);
    expect(long).toContain('已截断，原长 9000 字');
    expect(long.length).toBeLessThan(7000);
  });

  it('自愈请求（P3-4）：带上原脚本与真实报错，且明确"只出文本、不要执行"', () => {
    const src = 'return document.querySelectorAll("a").length();';
    const p = buildScriptRepairPrompt('导出链接', src, 'TypeError: document.querySelectorAll(...).length is not a function');
    expect(p).toContain('导出链接');
    expect(p).toContain(src);                                        // 原脚本原样带上
    expect(p).toContain('TypeError: document.querySelectorAll');     // 真实报错带上
    expect(p).toMatch(/不要执行任何浏览器操作/);                        // 不允许它顺手动手
    expect(p).toContain('```js');                                    // 要求给可直接替换的完整脚本
    expect(buildScriptRepairPrompt('x', 'return 1', '')).toContain('(无错误信息)');   // 没报错也不留空
  });
});
