// 页面指令导入校验的守门测试（P3-2）。
//
// ★ 最要紧的一条：**导入进来的脚本永远要确认**。
//   导入是外部数据入口 —— 别人给的文件里写 `need_confirm: 0`、或"导出→改→导入"绕一圈，
//   都不能把 P2 的双层门控（设置总闸 + 单条信任）绕掉。这条规则失效时**没有任何报错**，
//   用户会以为"这条脚本是安全的"。

import { describe, it, expect } from 'vitest';
import {
  IMPORT_MAX_ITEMS, isValidMatchHost, sanitizeImportedCommands, toExportPayload,
} from './page-command-import';

describe('★ 导入：脚本一律强制确认（安全边界）', () => {
  it('文件里写 need_confirm:0 也没用 —— 导入后恒为 1', () => {
    const r = sanitizeImportedCommands([
      { name: '别人的脚本', kind: 'script', body: 'return 1', need_confirm: 0 },
      { name: '别人的脚本2', kind: 'script', body: 'return 2', need_confirm: false, trust: true },
    ]);
    expect(r.commands.length).toBe(2);
    expect(r.commands.every((c) => c.need_confirm === 1)).toBe(true);
  });

  it('导出 → 导入：往返后仍是要确认的（不能被"导出再导入"洗成免确认）', () => {
    const exported = toExportPayload([
      { name: '我的脚本', kind: 'script', body: 'return 1', match_host: '*', match_url: null, need_confirm: 0 },
    ]);
    // 导出**不带** need_confirm（带过去只会误导）
    expect(exported.commands[0]).not.toHaveProperty('need_confirm');
    const back = sanitizeImportedCommands(exported);
    expect(back.commands[0].need_confirm).toBe(1);
  });
});

describe('导入：逐条校验，坏的跳过而不是整份拒绝', () => {
  it('好的一条进、坏的三条被跳过并给出原因', () => {
    const r = sanitizeImportedCommands([
      { name: '好的', kind: 'task', body: '做点事', match_host: '*.fanqieopen.com' },
      { name: '', body: '缺名' },
      { name: '缺内容', body: '   ' },
      { name: '坏正则', body: 'x', match_url: '[' },
    ]);
    expect(r.commands.map((c) => c.name)).toEqual(['好的']);
    expect(r.skipped.length).toBe(3);
    const reasons = r.skipped.map((s) => s.reason).join('|');
    expect(reasons).toContain('缺少名称');
    expect(reasons).toContain('缺少内容');
    expect(reasons).toContain('URL 正则不合法');
  });

  it('内置来源的条目跳过（导入副本只会造成"改了不生效"）', () => {
    const r = sanitizeImportedCommands([{ name: '内置的', kind: 'task', body: 'x', source: 'builtin' }]);
    expect(r.commands.length).toBe(0);
    expect(r.skipped[0].reason).toContain('内置');
  });

  it('整份格式不对：明确说清要什么样的数据，而不是静默导 0 条', () => {
    const r = sanitizeImportedCommands({ foo: 1 });
    expect(r.commands.length).toBe(0);
    expect(r.skipped[0].reason).toContain('{ commands: [...] }');
    expect(sanitizeImportedCommands(null).commands.length).toBe(0);
  });

  it('URL 正则 / 站点匹配合法值原样保留，host 归一成小写', () => {
    const r = sanitizeImportedCommands([
      { name: 'x', kind: 'task', body: 'y', match_host: 'WWW.Baidu.com', match_url: '/article/\\d+' },
    ]);
    expect(r.commands[0].match_host).toBe('www.baidu.com');
    expect(r.commands[0].match_url).toBe('/article/\\d+');
  });

  it('条数上限：超出部分跳过并说明（防止畸形文件塞成上万条）', () => {
    const many = Array.from({ length: IMPORT_MAX_ITEMS + 5 }, (_, i) => ({ name: 'n' + i, body: 'b' }));
    const r = sanitizeImportedCommands(many);
    expect(r.commands.length).toBe(IMPORT_MAX_ITEMS);
    expect(r.skipped.some((s) => s.reason.includes('单次最多导入'))).toBe(true);
  });
});

describe('isValidMatchHost / toExportPayload', () => {
  it('host 通配：* / 裸域 / 子域通配合法；带协议、带端口、带路径的都不合法', () => {
    expect(isValidMatchHost('*')).toBe(true);
    expect(isValidMatchHost('example.com')).toBe(true);
    expect(isValidMatchHost('*.example.com')).toBe(true);
    expect(isValidMatchHost('https://example.com')).toBe(false);
    expect(isValidMatchHost('example.com:8080')).toBe(false);
    expect(isValidMatchHost('example.com/path')).toBe(false);
  });

  it('导出只带可移植字段（无 id / 无归属 / 无统计 / 无 need_confirm）', () => {
    const p = toExportPayload([
      {
        id: 'pc_1', user_id: 'u1', name: 'x', description: null, kind: 'task', body: 'b',
        match_host: '*', match_url: null, run_count: 9, need_confirm: 1,
      },
    ]);
    expect(Object.keys(p.commands[0]).sort()).toEqual(['body', 'description', 'kind', 'match_host', 'match_url', 'name']);
    expect(p.version).toBe(1);
    expect(typeof p.exportedAt).toBe('string');            // ISO8601
    expect(new Date(p.exportedAt).toString()).not.toBe('Invalid Date');
  });
});
