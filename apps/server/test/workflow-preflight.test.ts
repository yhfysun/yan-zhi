/**
 * 运行前预检单测（services/workflow-preflight.ts）。
 *
 * 为什么值得单独钉：预检的两类错误都会造成明显伤害，而且方向相反 ——
 *   1. **漏报**：用户跑到第 N 个节点才看到「模型不存在」，白等半天（真实故障：
 *      某 LLM 节点的 modelId 指向已下线模型 agnes-2.5-flash，跑到那个节点才爆）。
 *   2. **误报**：把合法工作流拦死，比不预检更糟。实测踩到过 ——
 *      api_image_generate / api_tts_speak 这类 API 工具**不走 ToolRegistry**
 *      （在 executeApiTool 里按名字分发），只查 registry 会把短剧流水线整条拦掉。
 *
 * 断言习惯：按 code 过滤后再比，而不是整体 toEqual。
 * 因为预检会有意产出 NO_OUTPUT 这类「非阻断提示」，整体比对会让用例被无关提示干扰。
 */
import { describe, it, expect } from 'vitest';
import { preflightWorkflow, canStart, type PreflightContext } from '../src/services/workflow-preflight';
import type { WorkflowInputFieldDef } from '../src/services/workflow-delegate';

const CTX = (models: string[] = ['m-ok'], tools: string[] = []): PreflightContext => ({
  availableModelIds: new Set(models),
  registeredTools: new Set(tools),
});

/** 默认补一个 output 节点，避免每个用例都被 NO_OUTPUT 提示干扰 */
function wf(nodes: any[], edges: any[] = [], withOutput = true) {
  const all = withOutput ? [...nodes, { id: '__out__', type: 'output', config: { key: 'result' } }] : nodes;
  return { nodes: all, edges } as any;
}

function byCode(issues: ReturnType<typeof preflightWorkflow>, code: string) {
  return issues.filter((i) => i.code === code);
}

const fields = (...f: Partial<WorkflowInputFieldDef>[]): WorkflowInputFieldDef[] =>
  f.map((x) => ({
    key: x.key || 'topic',
    label: x.label || x.key || 'topic',
    type: x.type || 'string',
    required: x.required ?? true,
  }));

describe('预检 · 结构性错误', () => {
  it('空工作流（没有节点）→ 阻断', () => {
    const issues = preflightWorkflow(wf([], [], false), {}, [], CTX());
    expect(issues[0]).toMatchObject({ blocking: true, code: 'NO_NODES' });
    expect(canStart(issues)).toBe(false);
  });

  it('★ 缺 output 节点 → 只提示不阻断（可能是刻意的中间态调试）', () => {
    const issues = preflightWorkflow(wf([{ id: 'n1', type: 'code', config: {} }], [], false), {}, [], CTX());
    expect(byCode(issues, 'NO_OUTPUT')).toEqual([
      { blocking: false, code: 'NO_OUTPUT', msg: expect.stringContaining('输出') },
    ]);
    expect(canStart(issues)).toBe(true);
  });

  it('节点 id 重复 → 阻断', () => {
    const issues = preflightWorkflow(
      wf([{ id: 'dup', type: 'code', config: {} }, { id: 'dup', type: 'code', config: {} }]),
      {}, [], CTX(),
    );
    expect(byCode(issues, 'DUP_NODE_ID').every((i) => i.blocking)).toBe(true);
    expect(byCode(issues, 'DUP_NODE_ID').length).toBeGreaterThan(0);
  });

  it('连线指向不存在的节点 → 阻断（DAG 会静默跳过后半条流程）', () => {
    const issues = preflightWorkflow(
      wf([{ id: 'a', type: 'code', config: {} }], [{ source: 'a', target: 'ghost' }]),
      {}, [], CTX(),
    );
    expect(byCode(issues, 'DANGLING_EDGE')[0]).toMatchObject({ blocking: true });
  });
});

describe('预检 · LLM 节点模型（真实故障场景）', () => {
  it('★ 引用了已下线的模型 → 阻断，并指出是哪个节点', () => {
    // 就是库里那条「模型不存在: agnes-2.5-flash」的复现
    const issues = preflightWorkflow(
      wf([{ id: 'd_llm', type: 'llm', config: { platformId: 'p1', modelId: 'agnes-2.5-flash' } }]),
      {}, [], CTX(['agnes-3.0-flash']),
    );
    expect(byCode(issues, 'MODEL_NOT_FOUND')).toEqual([
      { blocking: true, nodeId: 'd_llm', code: 'MODEL_NOT_FOUND', msg: expect.stringContaining('agnes-2.5-flash') },
    ]);
    expect(canStart(issues)).toBe(false);
  });

  it('★ 两种模型标识都要认 —— 预检集合须与运行时同口径', () => {
    // 背景：模型有主键 id（agens-guest-agnes-3.0-flash）与 API 名 model_id
    // （agnes-3.0-flash）。运行时两者都认（先主键、再回退 API 名）。
    // 预检若只收 model_id 集合，画布上选主键的合法工作流会被误拦（比不预检更糟）；
    // 反之只收主键，存量裸名会被漏放行、错误推迟到运行时。
    // 所以集合里**两个标识都必须在** —— 这条用例钉住的是 routes/workflow.ts
    // 的 preflightResources 构建口径（它据此填 availableModelIds）。
    const issues = preflightWorkflow(
      wf([
        { id: 'by_pk', type: 'llm', config: { platformId: 'agens-guest', modelId: 'agens-guest-agnes-3.0-flash' } },
        { id: 'by_name', type: 'llm', config: { platformId: 'agens-guest', modelId: 'agnes-3.0-flash' } },
      ]),
      // 集合按 preflightResources 的口径同时收录主键与 API 名
      [], [], CTX(['agens-guest-agnes-3.0-flash', 'agnes-3.0-flash']),
    );
    expect(byCode(issues, 'MODEL_NOT_FOUND')).toEqual([]);
    expect(canStart(issues)).toBe(true);
  });

  it('缺少 platformId/modelId → 阻断', () => {
    const issues = preflightWorkflow(wf([{ id: 'n', type: 'llm', config: {} }]), {}, [], CTX());
    expect(byCode(issues, 'LLM_NO_MODEL')[0]).toMatchObject({ blocking: true, nodeId: 'n' });
  });

  it('模型可用 → 无任何阻断项（避免误拦）', () => {
    const issues = preflightWorkflow(
      wf([{ id: 'n', type: 'llm', config: { platformId: 'p1', modelId: 'm-ok' } }]),
      {}, [], CTX(['m-ok']),
    );
    expect(issues).toEqual([]);
  });

  it('兼容 snake_case 写法（历史数据 platform_id/model_id）', () => {
    const issues = preflightWorkflow(
      wf([{ id: 'n', type: 'llm', config: { platform_id: 'p1', model_id: 'm-ok' } }]),
      {}, [], CTX(['m-ok']),
    );
    expect(issues).toEqual([]);
  });
});

describe('预检 · 工具节点（★ 防误报）', () => {
  it('★ API 工具在注册集合里 → 不报（短剧流水线是真实案例）', () => {
    // 修复前这里会把 api_image_generate 判成「工具未注册」，整条短剧流水线被拦死
    const issues = preflightWorkflow(
      wf([
        { id: 'd_img', type: 'tool', config: { toolName: 'api_image_generate' } },
        { id: 'd_tts', type: 'tool', config: { toolName: 'api_tts_speak' } },
      ]),
      {}, [], CTX(['m-ok'], ['api_image_generate', 'api_tts_speak']),
    );
    expect(issues).toEqual([]);
  });

  it('mcp_ 前缀的工具名一律放行（运行时才按 server 前缀解析）', () => {
    const issues = preflightWorkflow(
      wf([{ id: 'n', type: 'tool', config: { toolName: 'mcp_filesystem__read' } }]),
      {}, [], CTX(),
    );
    expect(issues).toEqual([]);
  });

  it('确实未注册的工具 → 阻断', () => {
    const issues = preflightWorkflow(
      wf([{ id: 'n', type: 'tool', config: { toolName: 'plugin_missing__do' } }]),
      {}, [], CTX(),
    );
    expect(byCode(issues, 'TOOL_NOT_REGISTERED')[0]).toMatchObject({ blocking: true });
  });

  it('工具节点没写工具名 → 不在静态预检报（交给运行期，避免噪音）', () => {
    const issues = preflightWorkflow(wf([{ id: 'n', type: 'tool', config: {} }]), {}, [], CTX());
    expect(byCode(issues, 'TOOL_NOT_REGISTERED')).toEqual([]);
  });
});

describe('预检 · 入参', () => {
  it('★ 缺必填 → 阻断，文案用中文 label 而不是英文 key', () => {
    const issues = preflightWorkflow(wf([{ id: 'o', type: 'code', config: {} }]), {}, fields({ key: 'topic', label: '主题' }), CTX());
    const missing = byCode(issues, 'INPUT_MISSING');
    expect(missing[0]).toMatchObject({ blocking: true });
    expect(missing[0].msg).toContain('主题');
    expect(missing[0].msg).not.toContain('topic');
  });

  it('可选字段缺失不报', () => {
    const issues = preflightWorkflow(
      wf([{ id: 'o', type: 'code', config: {} }]),
      { topic: 'T' }, fields({ key: 'topic' }, { key: 'roles', required: false }), CTX(),
    );
    expect(issues).toEqual([]);
  });

  it('空数组视为未填（必填数组传 [] 是常见误操作）', () => {
    const issues = preflightWorkflow(
      wf([{ id: 'o', type: 'code', config: {} }]),
      { roles: [] }, fields({ key: 'roles', type: 'array' }), CTX(),
    );
    expect(byCode(issues, 'INPUT_MISSING').length).toBe(1);
  });

  it('number 字段传了非数字 → 阻断', () => {
    const issues = preflightWorkflow(
      wf([{ id: 'o', type: 'code', config: {} }]),
      { count: 'abc' }, fields({ key: 'count', type: 'number' }), CTX(),
    );
    expect(byCode(issues, 'INPUT_TYPE').length).toBe(1);
  });

  it('array 字段传了字符串 → 阻断（roles 传 "女主" 的典型场景）', () => {
    const issues = preflightWorkflow(
      wf([{ id: 'o', type: 'code', config: {} }]),
      { roles: '女主' }, fields({ key: 'roles', label: '角色名单', type: 'array' }), CTX(),
    );
    const t = byCode(issues, 'INPUT_TYPE');
    expect(t[0].msg).toContain('角色名单');
  });

  it('全部满足 → canStart=true', () => {
    const issues = preflightWorkflow(
      wf([
        { id: 'i', type: 'input', config: {} },
        { id: 'l', type: 'llm', config: { platformId: 'p', modelId: 'm-ok' } },
      ]),
      { topic: '测试' }, fields({ key: 'topic' }), CTX(['m-ok']),
    );
    expect(issues).toEqual([]);
    expect(canStart(issues)).toBe(true);
  });
});