/**
 * 工作流型子智能体委派的转换层单测。
 *
 * 覆盖的目标不是「能不能跑通」，而是最容易静默出错的两处：
 *   1. 入参映射 —— 猜错不会抛异常，只会让整条 DAG 跑出一份看似正常、实则无意义的产出，
 *      比报错难查得多。因此多入参 + 文本入参必须**拒绝**并回传 schema，绝不兜底猜。
 *   2. 类型识别 —— type 字段与 workflow_json 任一命中即判定为工作流，
 *      漏判会让它退化成「你是一个智能助手」+ 零工具的 ReAct，返回空谈且不报错。
 */
import { describe, it, expect } from 'vitest';
import {
  isWorkflowAgent,
  parseInputsSchema,
  extractWorkflowInputFields,
  mapWorkflowInputs,
  classifyWorkflowOutput,
  buildWorkflowReceipt,
  withAbortAndTimeout,
} from '../src/services/workflow-delegate';

describe('isWorkflowAgent · 工作流型识别', () => {
  it('type=workflow 命中（seed 写入的标准形态）', () => {
    expect(isWorkflowAgent({ type: 'workflow', workflow_json: '{"nodes":[]}' })).toBe(true);
    expect(isWorkflowAgent({ type: 'workflow' })).toBe(true);
  });

  it('type 写错但 workflow_json 里确有节点 → 兜底命中（历史库脏数据）', () => {
    // 注意：兜底只在 type 缺失/无法识别时生效。type 明确是 harness 的不走兜底 ——
    // 因为 workflow_json 的列默认值是 '{"nodes":[],"edges":[]}'（非 NULL），
    // 只看「字段非空」会命中所有对话智能体。
    expect(isWorkflowAgent({ type: null, workflow_json: '{"nodes":[{"id":"a"}]}' })).toBe(true);
    expect(isWorkflowAgent({ workflow_json: '{"nodes":[{"id":"a"}]}' })).toBe(true);
  });

  it('★★ harness + 空 workflow_json（列默认值）→ 不是工作流', () => {
    // 这是实测踩到的真 bug：agent.workflow_json 列默认值是 '{"nodes":[],"edges":[]}'，
    // 所有 harness 智能体都非 NULL。旧口径 !!workflow_json 会把它们全判成工作流，
    // 在会话入口做拦截时会把「日常办公助手」等一起拦死。
    expect(isWorkflowAgent({ type: 'harness', workflow_json: '{"nodes":[],"edges":[]}' })).toBe(false);
    expect(isWorkflowAgent({ type: 'harness', workflow_json: '{"nodes":[]}' })).toBe(false);
  });

  it('type 缺失 + workflow_json 是空 workflow（无节点）→ 不是工作流', () => {
    expect(isWorkflowAgent({ workflow_json: '{"nodes":[],"edges":[]}' })).toBe(false);
    expect(isWorkflowAgent({ workflow_json: '{}' })).toBe(false);
    expect(isWorkflowAgent({ workflow_json: '{ not json' })).toBe(false);
  });

  it('对话型智能体不命中（无 workflow_json）', () => {
    expect(isWorkflowAgent({ type: 'harness', workflow_json: null })).toBe(false);
    expect(isWorkflowAgent({ type: 'harness' })).toBe(false);
  });

  it('type=harness 一律不命中，即使 workflow_json 非空（以 type 为准）', () => {
    expect(isWorkflowAgent({ type: 'harness', workflow_json: '{"nodes":[{"id":"x"}]}' })).toBe(false);
  });

  it('空值与 null 安全', () => {
    expect(isWorkflowAgent(null)).toBe(false);
    expect(isWorkflowAgent(undefined)).toBe(false);
    expect(isWorkflowAgent({})).toBe(false);
  });
});

describe('parseInputsSchema · 入参 schema 解析', () => {
  it('简写形态 { topic: "string" }', () => {
    expect(parseInputsSchema(JSON.stringify({ topic: 'string' }))).toEqual(['topic']);
  });

  it('标准 JSON Schema 形态（properties）', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: { topic: { type: 'string' }, depth: { type: 'number' } },
    });
    expect(parseInputsSchema(schema)).toEqual(['topic', 'depth']);
  });

  it('未声明 / 空 / null 都返回空数组', () => {
    expect(parseInputsSchema('')).toEqual([]);
    expect(parseInputsSchema(null)).toEqual([]);
    expect(parseInputsSchema(undefined)).toEqual([]);
    expect(parseInputsSchema('{}')).toEqual([]);
  });

  it('schema 写坏时不抛异常，退回未声明（不让整体委派失败）', () => {
    expect(parseInputsSchema('{ not json')).toEqual([]);
  });
});

describe('extractWorkflowInputFields · 入参字段抽取（含内置工作流回落）', () => {
  const dramaWf = JSON.stringify({
    nodes: [
      { id: 'd_in', type: 'input', config: { schema: { topic: 'string', roles: 'string[]（可选）' } } },
      { id: 'd_prompt', type: 'code', config: { expression: 'ctx.inputs.topic' } },
    ],
    edges: [],
  });

  it('inputs_schema_json 有值时优先用它', () => {
    const r = extractWorkflowInputFields({
      inputs_schema_json: JSON.stringify({ topic: 'string' }),
      workflow_json: dramaWf,
    });
    expect(r).toEqual(['topic']);
  });

  it('★ inputs_schema_json 为 NULL 时回落到 workflow_json 的 input 节点 schema', () => {
    // 这正是内置工作流（seedBuiltinWorkflowAgents 写入）的真实形态：
    // 只填 workflow_json，inputs_schema_json 恒为 NULL。
    // 不回落 → 字段为空 → 委托文本被塞进 key=input，而 DAG 读的是 ctx.inputs.topic。
    const r = extractWorkflowInputFields({ inputs_schema_json: null, workflow_json: dramaWf });
    expect(r).toEqual(['topic', 'roles']);
  });

  it('回落路径同样支持标准 JSON Schema（properties）写法', () => {
    const wf = JSON.stringify({
      nodes: [{ id: 'in', type: 'input', config: { schema: { type: 'object', properties: { topic: { type: 'string' } } } } }],
    });
    expect(extractWorkflowInputFields({ inputs_schema_json: null, workflow_json: wf })).toEqual(['topic']);
  });

  it('多 input 节点时合并字段，不丢任何一个', () => {
    const wf = JSON.stringify({
      nodes: [
        { id: 'a', type: 'input', config: { schema: { topic: 'string' } } },
        { id: 'b', type: 'input', config: { schema: { style: 'string' } } },
      ],
    });
    expect(extractWorkflowInputFields({ inputs_schema_json: null, workflow_json: wf })).toEqual(['topic', 'style']);
  });

  it('两处都没有 → 空数组（由 mapWorkflowInputs 按未声明处理）', () => {
    expect(extractWorkflowInputFields({ inputs_schema_json: null, workflow_json: null })).toEqual([]);
    expect(extractWorkflowInputFields({ inputs_schema_json: null, workflow_json: '{"nodes":[]}' })).toEqual([]);
  });

  it('workflow_json 写坏时不抛异常，退回未声明', () => {
    expect(extractWorkflowInputFields({ inputs_schema_json: null, workflow_json: '{ not json' })).toEqual([]);
  });

  it('空值/undefined 安全', () => {
    expect(extractWorkflowInputFields(null)).toEqual([]);
    expect(extractWorkflowInputFields(undefined)).toEqual([]);
  });

  it('★ 回落生效后，单入参文本会映射到 topic 而不是 input', () => {
    // 端到端语义：这是修这条缺口的真实目的 —— 委派文本必须落到 DAG 实际读取的键上
    const fields = extractWorkflowInputFields({ inputs_schema_json: null, workflow_json: dramaWf });
    const r = mapWorkflowInputs('龙珠里面打斗名场面', fields);
    expect(r.ok).toBe(false); // 两个字段（topic/roles）→ 要求对象入参，明确报错而非猜
    if (!r.ok) expect(r.error).toContain('topic');

    const r2 = mapWorkflowInputs({ topic: '龙珠里面打斗名场面' }, fields);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.inputs.topic).toBe('龙珠里面打斗名场面');
  });
});

describe('mapWorkflowInputs · 入参映射', () => {
  it('对象入参原样透传（多入参工作流的推荐用法）', () => {
    const r = mapWorkflowInputs({ topic: '短剧', style: '悬疑' }, ['topic', 'style']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.inputs).toEqual({ topic: '短剧', style: '悬疑' });
  });

  it('单入参 + 文本 → 映射到该字段（LLM 无需感知 schema）', () => {
    const r = mapWorkflowInputs('人工智能在教育中的应用', ['topic']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.inputs).toEqual({ topic: '人工智能在教育中的应用' });
  });

  it('未声明 schema + 文本 → 落到通用 input 键', () => {
    const r = mapWorkflowInputs('随便跑一下', []);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.inputs).toEqual({ input: '随便跑一下' });
  });

  it('多入参 + 文本 → 拒绝，并把字段名与示例回传给模型', () => {
    const r = mapWorkflowInputs('短剧', ['topic', 'style']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('topic');
      expect(r.error).toContain('style');
      expect(r.error).toContain('JSON 对象');
    }
  });

  it('空字符串入参不视为缺失（单入参时映射为空值而不是报错）', () => {
    const r = mapWorkflowInputs('', ['topic']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.inputs).toEqual({ topic: '' });
  });
});

describe('buildWorkflowReceipt · 后台启动回执', () => {
  it('回执带上名称与 runId，供后续回查', () => {
    const r = buildWorkflowReceipt('调研报告生成助手', 'wfr_abc123');
    expect(r).toContain('调研报告生成助手');
    expect(r).toContain('wfr_abc123');
  });

  it('明确告知是异步、结果会反写（避免模型误以为已拿到结果）', () => {
    const r = buildWorkflowReceipt('X', 'wfr_1');
    expect(r).toContain('后台');
    expect(r).toContain('自动写入');
  });
});

describe('classifyWorkflowOutput · 产物形态分类', () => {
  it('空产物 → 给出明确说明而不是静默', () => {
    const r = classifyWorkflowOutput({});
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('text');
    if (r[0].kind === 'text') expect(r[0].text).toContain('没有 output 节点产物');
  });

  it('普通字符串 → 文字，直接输出', () => {
    const r = classifyWorkflowOutput({ report: '调研简报正文' });
    expect(r).toEqual([{ kind: 'text', text: '调研简报正文' }]);
  });

  it('绝对路径 + 扩展名 → 文件，带出文件名', () => {
    const r = classifyWorkflowOutput({ out: '/tmp/artifacts/report.md' });
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('file');
    if (r[0].kind === 'file') {
      expect(r[0].name).toBe('report.md');
      expect(r[0].path).toBe('/tmp/artifacts/report.md');
    }
  });

  it('对象带 path / file 字段 → 文件', () => {
    expect(classifyWorkflowOutput({ a: { path: '/x/y.png' } })[0].kind).toBe('file');
    expect(classifyWorkflowOutput({ a: { file: '/x/y.png' } })[0].kind).toBe('file');
  });

  it('对象带 content + filename → 文件（内容需要落盘）', () => {
    const r = classifyWorkflowOutput({ a: { filename: 'out.txt', content: 'hello' } });
    expect(r[0].kind).toBe('file');
    if (r[0].kind === 'file') {
      expect(r[0].name).toBe('out.txt');
      expect(r[0].content).toBe('hello');
      expect(r[0].encoding).toBe('utf8');
    }
  });

  it('base64 编码被识别并保留', () => {
    const r = classifyWorkflowOutput({ a: { filename: 'a.png', content: 'iVBORw0', encoding: 'base64' } });
    if (r[0].kind === 'file') expect(r[0].encoding).toBe('base64');
  });

  it('无文件特征的对象 → 文字（序列化）', () => {
    const r = classifyWorkflowOutput({ a: { title: 'T' } });
    expect(r[0].kind).toBe('text');
    if (r[0].kind === 'text') expect(JSON.parse(r[0].text)).toEqual({ title: 'T' });
  });

  it('多产物按序保留，允许文字与文件混排', () => {
    const r = classifyWorkflowOutput({ a: '正文', b: '/tmp/x.png' });
    expect(r.map((d) => d.kind)).toEqual(['text', 'file']);
  });
});

describe('withAbortAndTimeout · 超时与中止', () => {
  it('正常返回时透传结果', async () => {
    const v = await withAbortAndTimeout(Promise.resolve(42), new AbortController().signal, 1000);
    expect(v).toBe(42);
  });

  it('超时按失败处理，避免一条流水线挂死整轮对话', async () => {
    await expect(
      withAbortAndTimeout(new Promise((r) => setTimeout(r, 5000)), new AbortController().signal, 20),
    ).rejects.toThrow(/超时/);
  });

  it('任务中止时抛 AbortError', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      withAbortAndTimeout(Promise.resolve(1), ac.signal, 5000),
    ).rejects.toThrow();
  });
});
