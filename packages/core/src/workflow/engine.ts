// 工作流引擎 - DAG 图遍历执行
import type { Agent, WorkflowNode, WorkflowEdge } from '@yan-zhi/shared';

export interface NodeResult {
  output: unknown;
}

export interface RunContext {
  inputs: Record<string, unknown>;
  outputs: Map<string, unknown>;
  callStack: string[];
  /** 取消信号：运行台点「取消」或调试中断时置 aborted，节点之间会检查 */
  signal?: AbortSignal;
  get(nodeId: string): unknown;
  set(nodeId: string, value: unknown): void;
}

/**
 * 运行被取消。
 *
 * 单独的 Error 子类是为了让调用方能区分「跑挂了」与「用户主动取消」——
 * 后者在后端要落成 `aborted` 状态而不是 `failed`，否则运行历史里全是红叉，
 * 用户分不清是自己点的取消还是流程出错。
 */
export class WorkflowAbortError extends Error {
  constructor(msg = '运行已取消') {
    super(msg);
    this.name = 'WorkflowAbortError';
  }
}

/** 取消检查点：只在节点之间检查，不打断单个节点内部的执行 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new WorkflowAbortError();
}

export function createRunContext(
  inputs: Record<string, unknown>,
  callStack: string[] = [],
  signal?: AbortSignal,
): RunContext {
  const outputs = new Map<string, unknown>();
  return {
    inputs,
    outputs,
    callStack,
    signal,
    get: (id) => outputs.get(id),
    set: (id, val) => outputs.set(id, val),
  };
}

export interface NodeHandler {
  type: string;
  execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult>;
}

export interface NodeEvent {
  type: 'node:start' | 'node:ok' | 'node:error';
  nodeId: string;
  nodeType: string;
  msg?: string;
}

export interface RunOptions {
  maxDepth?: number;
  callStack?: string[];
  /** 节点级事件回调。常规节点由外部 wrap handler 发事件；loop 节点由引擎内联分支直发。 */
  onNodeEvent?: (e: NodeEvent) => void;
  /** 取消信号：非空时每个节点执行前检查，已取消则抛 WorkflowAbortError */
  signal?: AbortSignal;
  /** 断点：执行完这个节点后暂停（单节点调试的「运行到指定节点」） */
  stopAtNodeId?: string;
  /**
   * 无依赖节点的并行度（2026-10-08）。
   * ★ 默认 1 = 严格按原串行语义执行（行为不变，单节点调试/取消/断点全部原样）。
   * ★ >1 时把「依赖已就绪的节点」成批并发派发 —— 即**显式画出的并行分支**
   *   （一个节点 fan-out 到多个子节点）会真正同时跑，跑完再汇合给下游 join 节点。
   * ★ 判定依赖时**排除 condition 的 true/false 互斥边**：那是二选一，不能阻塞汇合点
   *   （否则「A --true--> B --\, C --false--> D」的 D 会永远等不到另一条分支而入度不减）。
   */
  concurrency?: number;
}

/** executePlan 的内部参数（run 与 runPlan 共用，避免散着传 6 个位置参数） */
interface PlanOptions {
  maxDepth: number;
  callStack: string[];
  onNodeEvent?: (e: NodeEvent) => void;
  signal?: AbortSignal;
  stopAtNodeId?: string;
  concurrency?: number;
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
    const { maxDepth = 3, callStack = [], onNodeEvent, signal, stopAtNodeId, concurrency = 1 } = opts;
    const ctx = createRunContext(inputs, callStack, signal);
    const plan = buildExecutionPlan(agent.workflow.nodes, agent.workflow.edges);
    await this.executePlan(plan, agent, ctx, { maxDepth, callStack, onNodeEvent, signal, stopAtNodeId, concurrency });

    const finalResult: Record<string, unknown> = {};
    for (const node of agent.workflow.nodes) {
      if (node.type === 'output') {
        const key = (node.config.key as string) || 'result';
        finalResult[key] = ctx.get(node.id);
      }
    }
    return finalResult;
  }

  /**
   * 按给定的执行计划跑（单节点调试用）。
   *
   * 与 run() 的区别：不重新算入口计划、不重新建 ctx —— 调试时 ctx 里已经填好了
   * 上游节点的输出快照（可能还被用户改过），plan 是「从某个节点出发」的子图计划。
   */
  async runPlan(
    plan: ExecutionPlan,
    agent: Agent,
    ctx: RunContext,
    opts: RunOptions = {},
  ): Promise<void> {
    const { maxDepth = 3, callStack = ctx.callStack, onNodeEvent, signal, stopAtNodeId, concurrency = 1 } = opts;
    await this.executePlan(plan, agent, ctx, {
      maxDepth,
      callStack,
      onNodeEvent,
      signal: signal ?? ctx.signal,
      stopAtNodeId,
      concurrency,
    });
  }

  private async executePlan(
    plan: ExecutionPlan,
    agent: Agent,
    ctx: RunContext,
    o: PlanOptions,
  ) {
    const { nodes, edges } = agent.workflow;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const signal = o.signal ?? ctx.signal;
    const concurrency = Math.max(1, Math.floor(o.concurrency ?? 1));

    // 工作队列模型（与旧串行逐字兼容）。plan.pending 是**入口节点队列**（初始 = 入度 0 者），
    // 节点跑完把「被跟随边指向的下游」推入队列 —— 不是"全图节点 + 就绪判定"。
    //
    // 并行（concurrency>1）：从队首取一批，**仅当批内任意两个节点互不可达**才可同批 ——
    //   这正是「明确画出来的分支并行」：一个节点 fan-out 到多个子节点时，这些子节点会被
    //   同批并发；有依赖的（含 condition 分出的下游、join 汇合点）自动留到后续波次，不抢跑。
    //
    // 为什么不用入度计数：condition 的 true/false 是**互斥二选一**，未走的那支永不进队列，
    //   用入度会让 join 点永远等不齐 → 死锁。改用「可达性」无需为互斥边特判。
    const queue: string[] = [...plan.pending];
    const enqueued = new Set<string>(queue);

    const canReach = (from: string, to: string): boolean => {
      if (from === to) return true;
      const seen = new Set<string>([from]);
      const stack = [from];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        for (const e of edges) {
          if (e.source !== cur || seen.has(e.target)) continue;
          if (e.target === to) return true;
          seen.add(e.target);
          stack.push(e.target);
        }
      }
      return false;
    };

    while (queue.length > 0) {
      throwIfAborted(signal);

      const batch: string[] = [];
      if (concurrency === 1) {
        batch.push(queue.shift()!);
      } else {
        while (queue.length > 0 && batch.length < concurrency) {
          const cand = queue[0];
          const conflict = batch.some((b) => canReach(b, cand) || canReach(cand, b));
          if (conflict) break; // 与已入批节点有依赖 → 留到下一波
          batch.push(queue.shift()!);
        }
        if (batch.length === 0) batch.push(queue.shift()!);
      }

      const results = await Promise.all(batch.map((id) =>
        this.executeNode(id, nodeMap, edges, agent, ctx, o, signal).then((downstream) => ({ id, downstream })),
      ));

      for (const { id, downstream } of results) {
        // 断点：执行完目标节点就停（单节点调试「运行到此节点」）—— 不再推下游
        if (o.stopAtNodeId && id === o.stopAtNodeId) return;
        for (const t of downstream) {
          if (!enqueued.has(t)) { queue.push(t); enqueued.add(t); }
        }
      }
    }
  }

  /** 执行单个节点；返回「被跟随边指向的下游节点 id」（交回 executePlan 入队） */
  private async executeNode(
    nodeId: string,
    nodeMap: Map<string, WorkflowNode>,
    edges: WorkflowEdge[],
    agent: Agent,
    ctx: RunContext,
    o: PlanOptions,
    signal: AbortSignal | undefined,
  ): Promise<string[]> {
    throwIfAborted(signal);
    const node = nodeMap.get(nodeId);
    if (!node) return [];

    const handler = this.handlers.get(node.type);
    if (!handler) {
      ctx.set(nodeId, null);
      return [];
    }

    // ── Loop 节点（内联展开 body，再走 loop_exit）──
    if (node.type === 'loop') {
      o.onNodeEvent?.({ type: 'node:start', nodeId, nodeType: 'loop' });
      try {
        const source = ctx.outputs.size > 0
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
            throwIfAborted(signal); // 每轮迭代都要能停，否则长循环取消不掉
            const itemCtx = createRunContext({ ...ctx.inputs, [key]: arr[i], index: i }, o.callStack, signal);
            for (const [k, v] of ctx.outputs) itemCtx.set(k, v);
            for (const e of bodyEdges) {
              const subPlan = buildSubgraphPlan(nodeMap, e.target, edges);
              await this.executePlan(subPlan, agent, itemCtx, o);
            }
            results.push(Array.from(itemCtx.outputs.values()));
          }
        }
        ctx.set(nodeId, results.length > 0 ? results : source);
        o.onNodeEvent?.({ type: 'node:ok', nodeId, nodeType: 'loop' });
        return exitEdges.map((e) => e.target);
      } catch (e: any) {
        o.onNodeEvent?.({ type: 'node:error', nodeId, nodeType: 'loop', msg: e?.message });
        throw e;
      }
    }

    // ── SubAgent 循环检测 ──
    if (node.type === 'sub_agent') {
      const subId = node.config.subAgentId as string;
      if (o.callStack.includes(subId)) {
        throw new Error(`循环调用: ${o.callStack.join(' → ')} → ${subId}`);
      }
      if (o.callStack.length >= o.maxDepth) {
        throw new Error(`子智能体嵌套超过 ${o.maxDepth} 层`);
      }
    }

    // 执行节点
    const result = await handler.execute(node.config, ctx);
    ctx.set(nodeId, result.output);

    // 根据 sourceHandle 路由下游（交回 executePlan 入队）
    const downstream: string[] = [];
    for (const e of edges.filter((x) => x.source === nodeId)) {
      if (!shouldFollowEdge(e, result)) continue;
      downstream.push(e.target);
    }
    return downstream;
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

// ── 执行计划（导出给单节点调试：从某节点出发跑子图）──

export interface ExecutionPlan {
  pending: string[];
}

export function buildExecutionPlan(nodes: WorkflowNode[], edges: WorkflowEdge[]): ExecutionPlan {
  const inDegree = new Map<string, number>();
  for (const n of nodes) inDegree.set(n.id, 0);
  for (const e of edges) inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  const pending = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0).map((n) => n.id);
  return { pending };
}

/** 从 startId 出发收集子图节点构建执行计划 */
export function buildSubgraphPlan(
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
