/**
 * 工作流引擎的「取消 / 断点 / 单节点执行」单测。
 *
 * 这三件事的共同点是**错了不会报错，只会表现得很怪**：
 *   - 取消不生效 → 用户点了取消，进度条还在跑，历史里记成失败
 *   - 断点不停 → 调试面板拿到的是跑完整条流程的结果，看不出中间态
 *   - 单节点执行串到下游 → 「改个变量重跑一个节点」变成整条流程重跑（烧 token）
 * 所以这里直接用假 handler 断言执行顺序，不依赖真实 LLM/MCP。
 */
import { describe, it, expect } from 'vitest';
import {
  WorkflowEngine,
  WorkflowAbortError,
  createRunContext,
  buildSubgraphPlan,
} from '@yan-zhi/core';

/** 记录执行顺序的假 handler（config.id 用来识别节点） */
function recorder(done: string[]) {
  return {
    type: 'test',
    async execute(config: Record<string, unknown>) {
      done.push(String(config.id || '?'));
      return { output: `out-${config.id}` };
    },
  };
}

function mkAgent(ids: string[]) {
  const nodes = ids.map((id) => ({ id, type: 'test', config: { id } }));
  const edges = ids.slice(0, -1).map((id, i) => ({ source: id, target: ids[i + 1] }));
  return { id: 'agent_test', workflow: { nodes, edges } } as any;
}

describe('引擎 · 取消运行', () => {
  it('★ signal 已取消 → 抛 WorkflowAbortError，且一个节点都不跑', async () => {
    const done: string[] = [];
    const eng = new WorkflowEngine();
    eng.register(recorder(done));
    const ac = new AbortController();
    ac.abort();

    await expect(eng.run(mkAgent(['n1', 'n2']), {}, { signal: ac.signal })).rejects.toThrow(WorkflowAbortError);
    expect(done).toEqual([]);
  });

  it('跑到一半取消 → 停在下一个检查点，已完成的节点产出保留', async () => {
    const done: string[] = [];
    const eng = new WorkflowEngine();
    const ac = new AbortController();
    eng.register({
      type: 'test',
      async execute(config: Record<string, unknown>) {
        done.push(String(config.id));
        // 第一个节点执行时取消 → 第二个节点前应该停下来
        if (config.id === 'n1') ac.abort();
        return { output: config.id };
      },
    });

    await expect(eng.run(mkAgent(['n1', 'n2', 'n3']), {}, { signal: ac.signal })).rejects.toThrow(WorkflowAbortError);
    expect(done).toEqual(['n1']); // n2/n3 不应执行
  });

  it('取消的 error 带 name=WorkflowAbortError（后端据此落成 aborted 而不是 failed）', async () => {
    const eng = new WorkflowEngine();
    eng.register(recorder([]));
    const ac = new AbortController();
    ac.abort();
    const err = await eng.run(mkAgent(['n1']), {}, { signal: ac.signal }).catch((e) => e);
    expect(err.name).toBe('WorkflowAbortError');
  });
});

describe('引擎 · 断点（单节点调试）', () => {
  it('★ stopAtNodeId：执行完目标节点就停，下游不跑', async () => {
    const done: string[] = [];
    const eng = new WorkflowEngine();
    eng.register(recorder(done));

    const result = await eng.run(mkAgent(['n1', 'n2', 'n3']), {}, { stopAtNodeId: 'n2' });
    expect(done).toEqual(['n1', 'n2']);
    // output 节点（n3）没跑到 → 最终结果里取不到它的值
    expect(result).toEqual({});
  });

  it('stopAtNodeId 在第一个节点 → 只跑一个', async () => {
    const done: string[] = [];
    const eng = new WorkflowEngine();
    eng.register(recorder(done));
    await eng.run(mkAgent(['n1', 'n2']), {}, { stopAtNodeId: 'n1' });
    expect(done).toEqual(['n1']);
  });
});

describe('引擎 · 单节点执行（runPlan + 快照恢复）', () => {
  it('★ 只跑指定节点：用已有快照当上下文，不重跑上游', async () => {
    const done: string[] = [];
    const eng = new WorkflowEngine();
    eng.register({
      type: 'test',
      async execute(config: Record<string, unknown>, ctx: any) {
        done.push(String(config.id));
        // 能读到上游节点的输出快照 = 上下文恢复成功
        return { output: `n2-saw-${String(ctx.get('n1'))}` };
      },
    });

    const agent = mkAgent(['n1', 'n2', 'n3']);
    const ctx = createRunContext({ topic: 't' }, ['agent_test']);
    ctx.set('n1', 'snapshot-of-n1'); // 调试快照

    const nodeMap = new Map(agent.workflow.nodes.map((n: any) => [n.id, n]));
    const plan = buildSubgraphPlan(nodeMap as any, 'n2', agent.workflow.edges as any);
    await eng.runPlan(plan, agent, ctx, { stopAtNodeId: 'n2' });

    expect(done).toEqual(['n2']); // n1 没重跑、n3 没串下去
    expect(ctx.get('n2')).toBe('n2-saw-snapshot-of-n1');
  });

  it('改完变量后从该节点继续：下游读到的就是新值', async () => {
    const eng = new WorkflowEngine();
    eng.register({
      type: 'test',
      async execute(config: Record<string, unknown>, ctx: any) {
        // 真实调试语义：n2 读的是「n1 的输出快照」，不是「最后一个输出」
        const up = config.id === 'n2' ? ctx.get('n1') : ctx.inputs.topic;
        return { output: `saw:${String(up)}` };
      },
    });
    const agent = mkAgent(['n1', 'n2']);
    const ctx = createRunContext({ topic: '主题A' }, ['agent_test']);
    const nodeMap = new Map(agent.workflow.nodes.map((n: any) => [n.id, n]));
    const plan = buildSubgraphPlan(nodeMap as any, 'n1', agent.workflow.edges as any);
    await eng.runPlan(plan, agent, ctx, {});
    expect(ctx.get('n1')).toBe('saw:主题A');

    // 用户在变量检查器里把 n1 的输出改成别的值，再从 n2 继续
    ctx.set('n1', '改过的值');
    await eng.runPlan({ pending: ['n2'] } as any, agent, ctx, { stopAtNodeId: 'n2' });
    expect(ctx.get('n2')).toBe('saw:改过的值');
  });
});
