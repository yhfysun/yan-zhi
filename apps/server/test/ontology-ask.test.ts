/**
 * L3 自纠循环（P4.7）：只测编排，不打模型/数据库。
 *  ① 首答成功 → attempts=1；
 *  ② 编译失败 → 把 [compile] 错误与上一轮 intent 回喂，第二轮成功；
 *  ③ 连续失败 → 最多 1+2 轮后放弃，返回最后一次结构化错误；
 *  ④ 非法 JSON 也能进入下一轮；生成器抛错立即终止。
 */
import { describe, it, expect } from 'vitest';
import { askWithSelfCorrection, type AskDeps } from '../src/services/ontology-ask.js';

const schema = '本体：订单（orders）\n- 维度 region\n- 度量 amount(sum)';

function fail(stage: 'compile' | 'exec', errors: string[]): Error {
  return Object.assign(new Error(errors[0] || 'failed'), { structured: { stage, errors } });
}

describe('askWithSelfCorrection', () => {
  it('首答成功', async () => {
    const prompts: string[] = [];
    const deps: AskDeps = {
      generate: async (p) => { prompts.push(p.user); return { intent: { measures: [{ name: 'amount' }] } }; },
      dryRun: async (intent) => ({ sql: `SQL:${JSON.stringify(intent)}`, warnings: ['w'] }),
    };
    const r = await askWithSelfCorrection({ question: '总金额', schema }, deps);
    expect(r.attempts).toBe(1);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual(['w']);
    expect(r.intent).toMatchObject({ measures: [{ name: 'amount' }] });
    expect(r.sql).toContain('SQL:');
    expect(prompts[0]).toContain('总金额');
    expect(prompts[0]).toContain('amount(sum)');
  });

  it('编译失败 → 回喂结构化错误，第二轮修正成功', async () => {
    const prompts: string[] = [];
    let call = 0;
    const deps: AskDeps = {
      generate: async (p) => {
        prompts.push(p.user);
        call += 1;
        return call === 1 ? { intent: { dimensions: ['nope'] } } : { intent: { dimensions: ['region'] } };
      },
      dryRun: async (intent) => {
        if ((intent as any).dimensions?.[0] === 'nope') throw fail('compile', ['字段「nope」不存在']);
        return { sql: 'SELECT region' };
      },
    };
    const r = await askWithSelfCorrection({ question: '各区域金额', schema }, deps);
    expect(r.attempts).toBe(2);
    expect(r.intent).toMatchObject({ dimensions: ['region'] });
    expect(prompts[1]).toContain('[compile]');
    expect(prompts[1]).toContain('字段「nope」不存在');
    expect(prompts[1]).toContain('上一轮 intent');
  });

  it('连续失败 → 最多 1+2 轮后放弃，保留最后一次错误', async () => {
    let calls = 0;
    const deps: AskDeps = {
      generate: async () => { calls += 1; return { intent: { dimensions: ['bad'] } }; },
      dryRun: async () => { throw fail('exec', [`第 ${calls} 次执行失败`]); },
    };
    const r = await askWithSelfCorrection({ question: 'x', schema }, deps);
    expect(calls).toBe(3);
    expect(r.attempts).toBe(3);
    expect(r.intent).toBeNull();
    expect(r.errors.join('')).toContain('第 3 次执行失败');
  });

  it('非法 JSON 进入下一轮；生成器抛错立即终止', async () => {
    let call = 0;
    const r1 = await askWithSelfCorrection({ question: 'x', schema }, {
      generate: async () => { call += 1; return call === 1 ? 'not json' : { intent: { measures: [{ name: 'amount' }] } }; },
      dryRun: async () => ({ sql: 'ok' }),
    });
    expect(r1.attempts).toBe(2);
    expect(r1.errors).toEqual([]);

    const r2 = await askWithSelfCorrection({ question: 'x', schema }, {
      generate: async () => { throw new Error('no-model'); },
      dryRun: async () => ({ sql: 'never' }),
    });
    expect(r2.attempts).toBe(1);
    expect(r2.errors[0]).toContain('生成失败');
  });
});
