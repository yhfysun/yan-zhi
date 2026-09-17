// 会话智能体选择器的过滤规则 —— 回归测试。
//
// 背景（真 bug）：原规则只写 `agentKind !== 'sub'`，workflow 型智能体的 agent_kind 是列默认值
// 'main'，于是它混进了聊天智能体列表（下拉 / 斜杠 / 「+」菜单三处共用 chatAgents）。
//
// 用户把「短剧流水线」选成会话智能体后，实测后果（DB 取证）：
//   会话 agent_id=a_wf_drama_pipeline，4 条消息 tool_calls 全为 None，
//   workflow_run 无任何记录，conversation_file 0 条 —— 不反问、不产出、DAG 永不启动。
// 根因是后端主链路没有类型判定，按 harness 跑了 ReAct（工作流 system_prompt 为 NULL + 工具为 0）。
//
// 这里钉住三件事：
//   1) workflow 型必须被排除（type 与 workflow_json 两种判定都要覆盖）；
//   2) sub 子智能体必须被排除（原有语义不能回归）；
//   3) 普通 harness 对话智能体必须保留 —— 过度过滤会让聊天列表变空。

import { describe, it, expect } from 'vitest';
import { isChatSelectableAgent, isWorkflowAgentLike } from './agentSelectable';

describe('isWorkflowAgentLike · 工作流识别（与后端同口径）', () => {
  it('type=workflow 命中', () => {
    expect(isWorkflowAgentLike({ type: 'workflow' })).toBe(true);
  });

  it('★★ harness + 列默认值 workflow_json → 不是工作流（真 bug 防回归）', () => {
    // agent.workflow_json 的列默认值是 '{"nodes":[],"edges":[]}'，**不是 NULL**。
    // 旧口径 !!workflow_json 会把所有 harness 对话智能体判成工作流，
    // 在会话入口做拦截时把「日常办公助手」一起拦死（后端测试实测抓到）。
    expect(isWorkflowAgentLike({ type: 'harness', workflow_json: '{"nodes":[],"edges":[]}' })).toBe(false);
    // 前端 Agent 形态：rowToAgent 把 workflow_json 解析成 workflow 对象
    expect(isWorkflowAgentLike({ type: 'harness', workflow: { nodes: [] } })).toBe(false);
  });

  it('type=harness 一律不命中，即使 workflow 真有节点（以 type 为准）', () => {
    expect(isWorkflowAgentLike({ type: 'harness', workflow_json: '{"nodes":[{"id":"x"}]}' })).toBe(false);
  });

  it('type 缺失时才用 workflow 节点数兜底（历史脏数据）', () => {
    expect(isWorkflowAgentLike({ workflow_json: '{"nodes":[{"id":"x"}]}' })).toBe(true);
    expect(isWorkflowAgentLike({ workflow: { nodes: [{ id: 'x' }] } })).toBe(true);
    expect(isWorkflowAgentLike({ workflow_json: '{"nodes":[],"edges":[]}' })).toBe(false);
    expect(isWorkflowAgentLike({ workflow_json: '{"nodes":[]}' })).toBe(false);
  });

  it('workflow_json 写坏时不抛异常', () => {
    expect(isWorkflowAgentLike({ workflow_json: '{ not json' })).toBe(false);
  });

  it('普通对话型不命中', () => {
    expect(isWorkflowAgentLike({ type: 'harness' })).toBe(false);
    expect(isWorkflowAgentLike({ type: 'harness', workflow_json: null })).toBe(false);
  });

  it('空值安全', () => {
    expect(isWorkflowAgentLike(null)).toBe(false);
    expect(isWorkflowAgentLike(undefined)).toBe(false);
    expect(isWorkflowAgentLike({})).toBe(false);
  });
});

describe('isChatSelectableAgent · 会话选择器可见性', () => {
  it('★ workflow 型被排除（本次修复的核心）', () => {
    // 真实形态：seedBuiltinWorkflowAgents 写入的 agent 只有 type='workflow' + workflow_json，
    // agent_kind 是列默认值 'main' —— 旧规则只按 agentKind 过滤，正好漏掉它。
    expect(isChatSelectableAgent({ type: 'workflow', agentKind: 'main' })).toBe(false);
    expect(isChatSelectableAgent({ type: 'workflow', agentKind: 'main', workflow_json: '{"nodes":[]}' })).toBe(false);
  });

  it('★ type 缺失 + workflow 有节点 → 兜底排除（历史库脏数据）', () => {
    expect(isChatSelectableAgent({ agentKind: 'main', workflow_json: '{"nodes":[{"id":"x"}]}' })).toBe(false);
  });

  it('★★ harness + 空 workflow_json 必须保留（防把全部对话智能体隐藏）', () => {
    // 这是后端测试抓到的真 bug 在前端侧的对应断言：列默认值非 NULL，
    // 旧口径会把「日常办公助手」等一起藏掉，聊天列表直接空掉。
    expect(isChatSelectableAgent({ type: 'harness', agentKind: 'main', workflow_json: '{"nodes":[],"edges":[]}' })).toBe(true);
  });

  it('sub 子智能体被排除（原有语义不回归）', () => {
    expect(isChatSelectableAgent({ type: 'harness', agentKind: 'sub' })).toBe(false);
  });

  it('普通 harness 对话智能体保留（不过度过滤）', () => {
    expect(isChatSelectableAgent({ type: 'harness', agentKind: 'main' })).toBe(true);
    expect(isChatSelectableAgent({ type: 'harness' })).toBe(true);
    expect(isChatSelectableAgent({ agentKind: 'main' })).toBe(true);
  });

  it('默认助手（isDefault/isBuiltin 但无 agentKind）仍可选', () => {
    // 老库无 agent_kind 列时 rowToAgent 兜底成 'main'；这里直接不传该字段也应保留
    expect(isChatSelectableAgent({ type: 'harness', agentKind: null })).toBe(true);
  });

  it('空值安全（不因脏数据崩掉 computed）', () => {
    expect(isChatSelectableAgent(null)).toBe(false);
    expect(isChatSelectableAgent(undefined)).toBe(false);
    expect(isChatSelectableAgent({})).toBe(true); // 无任何标记 → 按可对话处理，避免误藏
  });
});

describe('组合场景 · 模拟真实 agents 列表', () => {
  // 注意：harness 的 workflow_json 用**列默认值**（非 NULL），这是真实形态
  const agents = [
    { id: 'a_default_assistant', type: 'harness', agentKind: 'main', workflow_json: '{"nodes":[],"edges":[]}' },
    { id: 'a_builtin_code_agent', type: 'harness', agentKind: 'main', workflow_json: '{"nodes":[],"edges":[]}' },
    { id: 'a_builtin_storyboard_agent', type: 'harness', agentKind: 'main', workflow_json: '{"nodes":[],"edges":[]}' },
    { id: 'a_builtin_code_explorer', type: 'harness', agentKind: 'sub', workflow_json: '{"nodes":[],"edges":[]}' },
    { id: 'a_builtin_page_agent', type: 'harness', agentKind: 'main', workflow_json: '{"nodes":[],"edges":[]}' },
    { id: 'a_wf_drama_pipeline', type: 'workflow', agentKind: 'main', workflow_json: '{"nodes":[{"id":"d_in"}]}' },
    { id: 'a_wf_smoke_all_nodes', type: 'workflow', agentKind: 'main', workflow_json: '{"nodes":[{"id":"n_input"}]}' },
    { id: 'diag_min_loop', type: 'workflow', agentKind: 'main', workflow_json: '{"nodes":[{"id":"i"}]}' },
  ];

  it('3 个工作流 + 1 个 sub 全部被藏，其余 4 个对话智能体保留', () => {
    const visible = agents.filter((a) => isChatSelectableAgent(a)).map((a) => a.id);
    expect(visible).toEqual([
      'a_default_assistant',
      'a_builtin_code_agent',
      'a_builtin_storyboard_agent',
      'a_builtin_page_agent',
    ]);
    expect(visible).not.toContain('a_wf_drama_pipeline');
    expect(visible).not.toContain('diag_min_loop');
  });

  it('★ 这条会话绑定的工作流一定不可再被选中（防回归到本次事故）', () => {
    const drama = agents.find((a) => a.id === 'a_wf_drama_pipeline');
    expect(isChatSelectableAgent(drama)).toBe(false);
  });
});