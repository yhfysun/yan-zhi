// 工作流引擎 - DAG 图遍历执行
import type { Agent, WorkflowNode, WorkflowEdge } from '@yan-zhi/shared';

export interface NodeResult {
  output: unknown;
}

export interface RunContext {
  inputs: Record<string, unknown>;
  outputs: Map<string, unknown>;
  callStack: string[];
  get(nodeId: string): unknown;
  set(nodeId: string, value: unknown): void;
}

export function createRunContext(inputs: Record<string, unknown>, callStack: string[] = []): RunContext {
  const outputs = new Map<string, unknown>();
  return {
    inputs,
    outputs,
    callStack,
    get: (id) => outputs.get(id),
    set: (id, val) => outputs.set(id, val),
  };
}

export interface NodeHandler {
  type: string;
  execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult>;
}

export interface RunOptions {
  maxDepth?: number;
  callStack?: string[];
}

export class WorkflowEngine {
  private handlers = new Map<string, NodeHandler>();

  register(handler: NodeHandler): void {
    this.handlers.set(handler.type, handler);
  }

  /** DAG 图遍历执行，支持 Condition/Loop 路由 */
  async run(
    agent: Agent,
    inputs: Record<string, unknown>,
    opts: RunOptions = {},
  ): Promise<Record<string, unknown>> {
    const { maxDepth = 3, callStack = [] } = opts;
    const ctx = createRunContext(inputs);
    const plan = buildExecutionPlan(agent.workflow.nodes, agent.workflow.edges);
    await this.executePlan(plan, agent, ctx, maxDepth, callStack);

    const finalResult: Record<string, unknown> = {};
    for (const node of agent.workflow.nodes) {
      if (node.type === 'output') {
        const key = (node.config.key as string) || 'result';
        finalResult[key] = ctx.get(node.id);
      }
    }
    return finalResult;
  }

  private async executePlan(
    plan: ExecutionPlan,
    agent: Agent,
    ctx: RunContext,
    maxDepth: number,
    callStack: string[],
  ) {
    const { nodes, edges } = agent.workflow;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const { pending } = plan;

    while (pending.length > 0) {
      const nodeId = pending.shift()!;
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const handler = this.handlers.get(node.type);
      if (!handler) {
        ctx.set(nodeId, null);
        continue;
      }

      // ── Loop 节点 ──
      if (node.type === 'loop') {
        let source = ctx.outputs.size > 0
          ? Array.from(ctx.outputs.values()).pop()
          : ctx.inputs;
        const key = (node.config.iterateKey as string) || 'item';
        const maxIter = Number(node.config.maxIterations) || 5;
        const results: unknown[] = [];

        const bodyEdges = edges.filter((e) => e.source === nodeId && e.sourceHandle === 'loop_body');
        const exitEdges = edges.filter((e) => e.source === nodeId && e.sourceHandle === 'loop_exit');

        if (bodyEdges.length > 0) {
          const arr: unknown[] = Array.isArray(source) ? source : (source ? [source] : []);
          const limit = Math.min(arr.length, maxIter);
          for (let i = 0; i < limit; i++) {
            const itemCtx = createRunContext({ ...ctx.inputs, [key]: arr[i], index: i });
            for (const [k, v] of ctx.outputs) itemCtx.set(k, v);
            for (const e of bodyEdges) {
              const subPlan = buildSubgraphPlan(nodeMap, e.target, edges);
              await this.executePlan(subPlan, agent, itemCtx, maxDepth, callStack);
            }
            results.push(Array.from(itemCtx.outputs.values()));
          }
        }
        ctx.set(nodeId, results.length > 0 ? results : source);

        for (const e of exitEdges) {
          if (!pending.includes(e.target)) pending.push(e.target);
        }
        continue;
      }

      // ── SubAgent 循环检测 ──
      if (node.type === 'sub_agent') {
        const subId = node.config.subAgentId as string;
        if (callStack.includes(subId)) {
          throw new Error(`循环调用: ${callStack.join(' → ')} → ${subId}`);
        }
        if (callStack.length >= maxDepth) {
          throw new Error(`子智能体嵌套超过 ${maxDepth} 层`);
        }
      }

      // 执行节点
      const result = await handler.execute(node.config, ctx);
      ctx.set(nodeId, result.output);

      // 根据 sourceHandle 路由下游
      for (const e of edges.filter((x) => x.source === nodeId)) {
        if (!shouldFollowEdge(e, result)) continue;
        if (!pending.includes(e.target)) pending.push(e.target);
      }
    }
  }
}

function shouldFollowEdge(edge: WorkflowEdge, result: NodeResult): boolean {
  const h = edge.sourceHandle;
  if (!h) return true;
  if (h === 'true' || h === 'false') {
    const output = result.output as Record<string, unknown> | null;
    return (h === 'true') === !!(output && output.matched);
  }
  if (h === 'loop_body' || h === 'loop_exit') return false; // loop 节点自己处理
  return true;
}

// ── 执行计划 ──

interface ExecutionPlan {
  pending: string[];
}

function buildExecutionPlan(nodes: WorkflowNode[], edges: WorkflowEdge[]): ExecutionPlan {
  const inDegree = new Map<string, number>();
  for (const n of nodes) inDegree.set(n.id, 0);
  for (const e of edges) inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  const pending = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0).map((n) => n.id);
  return { pending };
}

/** 从 startId 出发收集子图节点构建执行计划 */
function buildSubgraphPlan(
  nodeMap: Map<string, WorkflowNode>,
  startId: string,
  edges: WorkflowEdge[],
): ExecutionPlan {
  const visited = new Set<string>();
  const subIds = new Set<string>();
  const q = [startId];
  while (q.length > 0) {
    const id = q.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    subIds.add(id);
    for (const e of edges.filter((x) => x.source === id)) {
      if (e.sourceHandle === 'loop_exit') continue;
      if (!visited.has(e.target)) q.push(e.target);
    }
  }
  const subEdges = edges.filter((e) => subIds.has(e.source) && subIds.has(e.target));
  const subNodes = Array.from(subIds).map((id) => nodeMap.get(id)!).filter(Boolean);
  return buildExecutionPlan(subNodes, subEdges);
}
