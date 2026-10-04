import { describe, it, expect } from 'vitest';
import { runInSandbox } from './sandbox';

describe('runInSandbox 自定义工具沙箱', () => {
  it('普通同步函数：字符串入参 → 字符串结果', async () => {
    const code = `function wordCount(input) {
      var text = String(input.text || '');
      return 'words=' + text.split(/\\s+/).filter(Boolean).length;
    }`;
    const r = await runInSandbox(code, 'wordCount', { text: 'hello world foo' }, { timeout: 2000 });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toBe('words=3');
  });

  it('返回对象 → JSON 序列化输出', async () => {
    const code = `function stats(input) {
      var nums = input.nums || [];
      var sum = 0;
      for (var i = 0; i < nums.length; i++) sum += nums[i];
      return { count: nums.length, sum: sum, avg: nums.length ? sum / nums.length : 0 };
    }`;
    const r = await runInSandbox(code, 'stats', { nums: [1, 2, 3, 4] }, { timeout: 2000 });
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(String(r.content[0].text));
    expect(parsed).toEqual({ count: 4, sum: 10, avg: 2.5 });
  });

  it('while(true) 死循环 → timeout 兜住，返回「工具执行超时」而不是永久挂死', async () => {
    const code = `function evil(input) { while (true) {} }`;
    const t0 = Date.now();
    const r = await runInSandbox(code, 'evil', {}, { timeout: 300 });
    const elapsed = Date.now() - t0;
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('超时');
    expect(elapsed).toBeLessThan(5000);
  });

  it('函数抛错 → isError + 错误信息', async () => {
    const code = `function boom(input) { throw new Error('boom: ' + input.x); }`;
    const r = await runInSandbox(code, 'boom', { x: 42 }, { timeout: 2000 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('boom: 42');
  });

  it('入口名不存在 → isError 且错误信息含入口名', async () => {
    const code = `function other(input) { return 1; }`;
    const r = await runInSandbox(code, 'notExists', {}, { timeout: 2000 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('notExists');
  });

  it('沙箱内 require 是受限白名单（调用即拒）、无 process/globalThis —— 无法逃逸读环境', async () => {
    // 2026-10-03 更新：依赖注入功能引入后，沙箱**有意**暴露一个受限 require
    //（白名单外的名字一律抛错，见 sandbox.ts 注释）。旧断言"typeof require === 'undefined'"
    // 已过时 —— 真正要守住的是：① process/globalThis 不可见；② require 拿不到任何宿主能力。
    const code = `function probe(input) {
      const parts = [];
      parts.push('require:' + typeof require);
      parts.push('process:' + typeof process);
      parts.push('globalThis:' + typeof globalThis);
      try { require('node:child' + '_process'); parts.push('require-escape:yes'); }
      catch (e) { parts.push('require-escape:blocked'); }
      return parts.join('|');
    }`;
    const r = await runInSandbox(code, 'probe', {}, { timeout: 2000 });
    expect(r.isError).toBeFalsy();
    const text = String(r.content[0].text);
    expect(text).toContain('process:undefined');
    expect(text).toContain('globalThis:undefined');
    expect(text).toContain('require-escape:blocked'); // 受限 require 拒绝 node: 内置模块
  });

  it('字符串结果原样返回（不包 JSON 引号）', async () => {
    const code = `function greet(input) { return 'hi ' + input.name; }`;
    const r = await runInSandbox(code, 'greet', { name: 'yz' }, { timeout: 2000 });
    expect(r.content[0].text).toBe('hi yz');
  });
});
