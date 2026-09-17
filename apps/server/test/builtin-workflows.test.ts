/**
 * 内置工作流结构完整性校验。
 *
 * 为什么必须测：DAG 是手工设计的，节点 id / sourceHandle 拼错**不会报错**，
 * 只会表现为「跑到某一步没动静」或「某段被静默跳过」——排查成本极高。
 * 这里不依赖数据库，直接从定义函数取值做结构断言。
 */
import { describe, it, expect } from 'vitest';
import { WF_MAIN_ID, WF_SUB_ID, WF_DRAMA_ID, WF_DEF_VERSION, seedBuiltinWorkflowAgents } from '../src/builtin-workflow-agents';
import type { Workflow } from '@yan-zhi/shared';

// seed 需要一个极小的假 db；这里只关心定义本身的图结构，故用内存桩捕获写入的定义
function captureDefs(): Record<string, Workflow> {
  const captured: Record<string, Workflow> = {};
  const fake: any = {
    prepare(sql: string) {
      return {
        get: () => undefined, // 视为「不存在」→ 走 INSERT 分支
        run: (...args: unknown[]) => {
          const id = String(args[0]);
          const json = args.find((a) => typeof a === 'string' && String(a).trim().startsWith('{') && String(a).includes('nodes'));
          if (json) captured[id] = JSON.parse(String(json));
        },
      };
    },
  };
  seedBuiltinWorkflowAgents(fake);
  return captured;
}

const defs = captureDefs();

describe('内置工作流 · seed 与版本', () => {
  it('三个内置工作流都被 seed（含新增的短剧流水线）', () => {
    expect(Object.keys(defs).sort()).toEqual([WF_DRAMA_ID, WF_MAIN_ID, WF_SUB_ID].sort());
  });

  it('定义版本号是正整数（升级时会据此覆盖库中旧副本）', () => {
    expect(Number.isInteger(WF_DEF_VERSION)).toBe(true);
    expect(WF_DEF_VERSION).toBeGreaterThan(0);
  });
});

describe.each([
  ['调研报告生成助手', WF_MAIN_ID],
  ['短剧流水线', WF_DRAMA_ID],
  ['调研要点提炼子助手', WF_SUB_ID],
])('%s (%s) · DAG 结构完整性', (_name, id) => {
  const wf = defs[id];

  it('节点 id 唯一', () => {
    const ids = wf.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('边 id 唯一', () => {
    const ids = wf.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每条边的 source/target 都指向真实节点（断开即静默不执行）', () => {
    const ids = new Set(wf.nodes.map((n) => n.id));
    for (const e of wf.edges) {
      expect(ids.has(e.source), `边的 source 不存在: ${e.source}`).toBe(true);
      expect(ids.has(e.target), `边的 target 不存在: ${e.target}`).toBe(true);
    }
  });

  it('有且仅有一个 input 节点至少一个 output 节点', () => {
    expect(wf.nodes.filter((n) => n.type === 'input').length).toBe(1);
    expect(wf.nodes.filter((n) => n.type === 'output').length).toBeGreaterThanOrEqual(1);
  });

  it('每个节点都有坐标（画布可渲染）', () => {
    for (const n of wf.nodes) {
      expect(typeof (n as any).position?.x, `节点 ${n.id} 缺 position.x`).toBe('number');
      expect(typeof (n as any).position?.y, `节点 ${n.id} 缺 position.y`).toBe('number');
    }
  });

  it('从 input 沿边可达全部节点（无孤立节点）', () => {
    const start = wf.nodes.find((n) => n.type === 'input')!.id;
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of wf.edges.filter((x) => x.source === cur)) {
        if (!seen.has(e.target)) { seen.add(e.target); queue.push(e.target); }
      }
    }
    const unreachable = wf.nodes.map((n) => n.id).filter((id) => !seen.has(id));
    expect(unreachable, `存在从 input 不可达的节点: ${unreachable.join(', ')}`).toEqual([]);
  });

  it('无环（DFS 检测回边）', () => {
    const adj = new Map<string, string[]>();
    for (const e of wf.edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    const state = new Map<string, 0 | 1 | 2>(); // 0=未访问 1=访问中 2=完成
    let cycle: string | null = null;
    const dfs = (n: string): void => {
      state.set(n, 1);
      for (const nx of adj.get(n) || []) {
        const st = state.get(nx) ?? 0;
        if (st === 1) { cycle = nx; return; }
        if (st === 0) dfs(nx);
        if (cycle) return;
      }
      state.set(n, 2);
    };
    for (const n of wf.nodes) { if ((state.get(n.id) ?? 0) === 0) dfs(n.id); if (cycle) break; }
    expect(cycle, `检测到环，经过节点: ${cycle}`).toBeNull();
  });
});

describe('短剧流水线 · 链路语义（易错点专项）', () => {
  const wf = defs[WF_DRAMA_ID];
  const byId = (id: string) => wf.nodes.find((n) => n.id === id)!;

  it('api 工具必须用 toolSource=api（它们不在 core 的 getToolRegistry 里）', () => {
    const tools = wf.nodes.filter((n) => n.type === 'tool');
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect((t.config as any).toolSource, `工具节点 ${t.id} 的 toolSource 应为 api`).toBe('api');
    }
  });

  it('工具节点 arguments 为空对象 —— 依赖「回落上游输出」语义', () => {
    for (const t of wf.nodes.filter((n) => n.type === 'tool')) {
      expect(Object.keys((t.config as any).arguments || {}).length).toBe(0);
    }
  });

  it('每个工具节点前面都有 code 节点构造入参（紧邻上游）', () => {
    for (const t of wf.nodes.filter((n) => n.type === 'tool')) {
      const inEdge = wf.edges.find((e) => e.target === t.id)!;
      expect(inEdge, `工具 ${t.id} 没有入边`).toBeTruthy();
      expect(byId(inEdge.source).type, `工具 ${t.id} 的上游不是 code 节点`).toBe('code');
    }
  });

  it('loop 的迭代源是纯数组（对象会导致只迭代一次）', () => {
    const loop = wf.nodes.find((n) => n.type === 'loop')!;
    const inEdge = wf.edges.find((e) => e.target === loop.id)!;
    const src = byId(inEdge.source);
    expect(src.type).toBe('code');
    // 提取节点的表达式应返回数组（含 Array.isArray 兜底）
    expect(String((src.config as any).expression)).toContain('Array.isArray');
  });

  it('loop 同时具备 body 与 exit 两条出边（缺一个流水线会断）', () => {
    const loop = wf.nodes.find((n) => n.type === 'loop')!;
    const outs = wf.edges.filter((e) => e.source === loop.id);
    expect(outs.some((e) => e.sourceHandle === 'loop_body')).toBe(true);
    expect(outs.some((e) => e.sourceHandle === 'loop_exit')).toBe(true);
  });

  it('loop body 内先用 code 取 ctx.inputs.shot（body 首节点拿到的是 loop 自身输出）', () => {
    const loop = wf.nodes.find((n) => n.type === 'loop')!;
    const bodyEdge = wf.edges.find((e) => e.source === loop.id && e.sourceHandle === 'loop_body')!;
    const first = byId(bodyEdge.target);
    expect(first.type).toBe('code');
    expect(String((first.config as any).expression)).toContain('ctx.inputs.shot');
  });

  it('llm 节点留空模型（由 ensureBuiltinWorkflowModel 按平台回填）', () => {
    const llm = wf.nodes.find((n) => n.type === 'llm')!;
    expect((llm.config as any).platformId).toBe('');
    expect((llm.config as any).modelId).toBe('');
  });

  it('code 节点用 ctx.get(上游id) 精确取数，不依赖输出顺序', () => {
    const shots = byId('d_shots');
    expect(String((shots.config as any).expression)).toContain("ctx.get('d_llm')");
  });

  it('分镜规范化时补 character 默认值（缺角色归为旁白）', () => {
    const expr = String((byId('d_shots').config as any).expression);
    expect(expr).toContain('character');
    expect(expr).toContain("'旁白'");
  });

  it('配音节点把 character 传给 api_tts_speak（多角色音色分配依赖它）', () => {
    const expr = String((byId('d_tts_args').config as any).expression);
    expect(expr).toContain('character');
    expect(expr).toContain("ctx.inputs.shot");
  });

  it('input schema 声明 roles（可选角色限定）', () => {
    const schema = JSON.stringify((byId('d_in').config as any).schema || {});
    expect(schema).toContain('roles');
    expect(schema).toContain('topic');
  });

  it('交付清单含角色列（便于核对音色分配）', () => {
    const expr = String((byId('d_manifest').config as any).expression);
    expect(expr).toContain('角色');
  });
});