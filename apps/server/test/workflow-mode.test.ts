/**
 * 工作流模式（running desk）的纯函数单测。
 *
 * 覆盖的是运行台最容易静默出错的两处：
 *   1. 运行表单字段解析 —— 内置工作流的 inputs_schema_json 恒为 NULL，
 *      schema 在 workflow_json 的 input 节点 config.schema。解析不到字段时
 *      表单会是空的，用户填不了参数，而 DAG 那边读 ctx.inputs.topic 拿到 undefined，
 *      跑完返回一份看似正常实则无意义的产出（不抛异常，最难查）。
 *   2. 节点参数覆盖白名单 —— 放开全部字段会把运行表单撑爆（LLM 节点光模型/温度/提示词
 *      就有七八项），放开错字段会无声冲掉提示词。白名单必须「声明优先、默认表兜底」，
 *      且只认白名单内的键。
 */
import { describe, it, expect } from 'vitest';
import {
  buildWorkflowInputFieldDefs,
  overridableFieldsOf,
  collectOverridableNodes,
  DEFAULT_OVERRIDABLE,
} from '../src/services/workflow-delegate';

describe('buildWorkflowInputFieldDefs · 运行表单字段', () => {
  it('★ 内置工作流形态：inputs_schema_json 为 NULL，schema 在 input 节点里', () => {
    const agent = {
      inputs_schema_json: null,
      workflow_json: JSON.stringify({
        nodes: [
          { id: 'n_input', type: 'input', config: { schema: { topic: 'string', roles: 'string[]（可选）' } } },
          { id: 'n_llm', type: 'llm', config: { modelId: 'm1' } },
        ],
        edges: [],
      }),
    };
    const fields = buildWorkflowInputFieldDefs(agent);
    expect(fields.map((f) => f.key)).toEqual(['topic', 'roles']);
    expect(fields[0]).toMatchObject({ type: 'string', required: true });
    expect(fields[1]).toMatchObject({ type: 'array', required: false });
  });

  it('inputs_schema_json 优先（列上有值时以列为准）', () => {
    const fields = buildWorkflowInputFieldDefs({
      inputs_schema_json: JSON.stringify({ properties: { city: { type: 'string' } }, required: ['city'] }),
      workflow_json: JSON.stringify({ nodes: [{ id: 'i', type: 'input', config: { schema: { topic: 'string' } } }] }),
    });
    expect(fields.map((f) => f.key)).toEqual(['city']);
    expect(fields[0].required).toBe(true);
  });

  it('JSON Schema 写法：类型/必填/枚举/默认值都能带出来', () => {
    const fields = buildWorkflowInputFieldDefs({
      inputs_schema_json: JSON.stringify({
        properties: {
          lang: { type: 'string', enum: ['zh', 'en'], default: 'zh', description: '目标语言' },
          topK: { type: 'number', description: '返回条数' },
        },
        required: ['lang'],
      }),
    });
    expect(fields.map((f) => [f.key, f.label, f.type, f.required])).toEqual([
      // lang 命中中文兜底表（"语言"）；topK 无兜底、回落到 description（"返回条数"）
      ['lang', '语言', 'string', true],
      ['topK', '返回条数', 'number', false],
    ]);
    expect(fields[0].options).toEqual(['zh', 'en']);
    expect(fields[0].default).toBe('zh');
  });

  it('★ 富写法显式给 label 时优先于中文兜底表', () => {
    const fields = buildWorkflowInputFieldDefs({
      inputs_schema_json: JSON.stringify({
        properties: { topic: { type: 'string', label: '短剧主题', description: '一句话说清要拍什么' } },
        required: ['topic'],
      }),
    });
    expect(fields[0]).toMatchObject({ key: 'topic', label: '短剧主题', description: '一句话说清要拍什么' });
  });

  it('★ 简写写法：中文标签兜底 + 括号内容当描述而不是类型', () => {
    // 内置工作流写的就是这种：{ topic: 'string', roles: 'string[]（可选，限定角色名）' }
    // 修复前：label 直接用英文 key、描述显示成 'string' 这种类型占位符 —— 用户看不懂要填什么。
    const fields = buildWorkflowInputFieldDefs({
      inputs_schema_json: JSON.stringify({
        topic: 'string',
        roles: 'string[]（可选，限定角色名，如 ["女主","男主"]）',
      }),
    });
    expect(fields.map((f) => [f.key, f.label, f.type, f.required])).toEqual([
      ['topic', '主题', 'string', true],
      ['roles', '角色名单', 'array', false],
    ]);
    // 括号里的内容是说明，不是类型名
    expect(fields[1].description).toContain('限定角色名');
    expect(fields[0].description).not.toBe('string');
  });

  it('简写写法的类型推断（数字/布尔/数组）', () => {
    const fields = buildWorkflowInputFieldDefs({
      inputs_schema_json: JSON.stringify({ count: 'number', debug: 'boolean（可选）', items: 'array' }),
    });
    expect(fields.map((f) => [f.key, f.type, f.required])).toEqual([
      ['count', 'number', true],
      ['debug', 'boolean', false],
      ['items', 'array', true],
    ]);
  });

  it('无 schema / 坏 JSON → 空数组（不该让运行台崩）', () => {
    expect(buildWorkflowInputFieldDefs(null)).toEqual([]);
    expect(buildWorkflowInputFieldDefs({ workflow_json: '{ not json' })).toEqual([]);
    expect(buildWorkflowInputFieldDefs({ workflow_json: '{"nodes":[]}' })).toEqual([]);
  });
});

describe('overridableFieldsOf · 节点参数覆盖白名单', () => {
  it('未声明时按节点类型给默认白名单', () => {
    expect(overridableFieldsOf({ type: 'llm', config: {} })).toEqual(DEFAULT_OVERRIDABLE.llm);
    expect(overridableFieldsOf({ type: 'llm' })).toEqual(DEFAULT_OVERRIDABLE.llm);
  });

  it('★ 显式声明优先于默认表（画布勾了什么就放开什么）', () => {
    expect(overridableFieldsOf({ type: 'llm', config: { runtimeOverridable: ['modelId'] } })).toEqual(['modelId']);
  });

  it('声明为空数组 = 明确不放开（不能回落默认表）', () => {
    expect(overridableFieldsOf({ type: 'llm', config: { runtimeOverridable: [] } })).toEqual([]);
  });

  it('未知节点类型 → 不放开任何字段', () => {
    expect(overridableFieldsOf({ type: 'output', config: {} })).toEqual([]);
    expect(overridableFieldsOf({})).toEqual([]);
  });
});

describe('collectOverridableNodes · 运行台「覆盖节点配置」数据源', () => {
  it('只返回有可覆盖字段的节点，空节点不占位', () => {
    const wf = JSON.stringify({
      nodes: [
        { id: 'n_llm', type: 'llm', config: { modelId: 'm1' } },
        { id: 'n_out', type: 'output', config: { key: 'result' } },
        { id: 'n_code', type: 'code', config: { expression: 'return 1;' } },
      ],
      edges: [],
    });
    const list = collectOverridableNodes(wf);
    // code 节点的 expression 不在默认白名单里（改它等于改流程逻辑，属于「改画布」而非「改一次运行」）
    expect(list.map((n) => n.nodeId)).toEqual(['n_llm']);
    expect(list[0].nodeType).toBe('llm');
    // 字段带上了控件类型与画布当前值，运行面板据此渲染下拉与「当前：xxx」
    expect(list[0].fields.map((f) => f.key)).toEqual(DEFAULT_OVERRIDABLE.llm);
    expect(list[0].fields.find((f) => f.key === 'modelId')).toMatchObject({ control: 'model' });
    expect(list[0].fields.find((f) => f.key === 'temperature')).toMatchObject({ control: 'number' });
  });

  it('★ 覆盖项带上画布当前值（否则用户不知道不填会用哪个模型）', () => {
    const wf = JSON.stringify({
      nodes: [{ id: 'n_llm', type: 'llm', config: { platformId: 'p1', modelId: 'm-1', temperature: 0.7 } }],
      edges: [],
    });
    const f = collectOverridableNodes(wf)[0].fields;
    expect(f.find((x) => x.key === 'modelId')?.current).toBe('m-1');
    expect(f.find((x) => x.key === 'platformId')?.current).toBe('p1');
    expect(f.find((x) => x.key === 'temperature')?.current).toBe(0.7);
    // 中文标签，不再是裸英文 key
    expect(f.find((x) => x.key === 'modelId')?.label).toBe('模型');
  });

  it('显式声明的节点不受默认表限制（画布勾了 expression 也能覆盖）', () => {
    const wf = JSON.stringify({
      nodes: [{ id: 'n_code', type: 'code', config: { expression: 'return 1;', runtimeOverridable: ['expression'] } }],
      edges: [],
    });
    expect(collectOverridableNodes(wf)).toEqual([
      { nodeId: 'n_code', nodeType: 'code', label: 'n_code', fields: [{ key: 'expression', label: 'expression', control: 'string', current: 'return 1;' }] },
    ]);
  });

  it('坏 JSON / 空值 → 空数组', () => {
    expect(collectOverridableNodes(null)).toEqual([]);
    expect(collectOverridableNodes('{ bad')).toEqual([]);
  });
});
