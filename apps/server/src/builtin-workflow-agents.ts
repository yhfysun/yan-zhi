// 内置「工作流·全节点冒烟」智能体：server 启动时幂等 seed（仅首次创建，不覆盖用户编辑）。
// 一条 DAG 覆盖引擎全部 10 种节点类型，方便端到端回归：
//   input → code → tool(builtin) → code → loop(loop_body: code / loop_exit: 继续)
//        → memory_write → memory_read → condition(true: sub_agent → llm / false: code)
//        → output
import type Database from 'better-sqlite3';

export const WF_SMOKE_MAIN_ID = 'a_wf_smoke_all_nodes';
export const WF_SMOKE_SUB_ID = 'a_wf_smoke_editor';

function subWorkflow() {
  return {
    nodes: [
      { id: 's_in', type: 'input', config: { schema: { topic: 'string' } }, position: { x: 60, y: 200 } },
      {
        id: 's_code', type: 'code',
        config: {
          expression:
            "const topic = ctx.inputs.topic || '未命名主题';\n" +
            "return { topic, generatedBy: '" + WF_SMOKE_SUB_ID + "', points: [topic + ' 的核心能力是否可用', topic + ' 的节点间数据是否正确传递', topic + ' 的异常分支是否可预期'] };",
        },
        position: { x: 300, y: 200 },
      },
      { id: 's_out', type: 'output', config: { key: 'brief' }, position: { x: 540, y: 200 } },
    ],
    edges: [
      { id: 's_e1', source: 's_in', target: 's_code' },
      { id: 's_e2', source: 's_code', target: 's_out' },
    ],
  };
}

function mainWorkflow() {
  const nodes = [
    {
      id: 'n_input', type: 'input',
      config: { schema: { topic: 'string' } },
      position: { x: 40, y: 220 },
    },
    {
      id: 'n_plan', type: 'code',
      config: {
        expression:
          "const topic = ctx.inputs.topic || '工作流全节点冒烟';\n" +
          "return { title: '冒烟计划：' + topic, steps: [{ title: 'input → code → tool' }, { title: 'loop → memory_write → memory_read' }, { title: 'condition → sub_agent → llm → output' }] };",
      },
      position: { x: 260, y: 220 },
    },
    {
      // arguments 为空对象 → 回落上游输出作为入参（验证「空 arguments 取上游」语义）
      id: 'n_tool', type: 'tool',
      config: { toolSource: 'builtin', toolName: 'task_plan', arguments: {} },
      position: { x: 480, y: 220 },
    },
    {
      id: 'n_tasks', type: 'code',
      config: {
        expression:
          "const topic = ctx.inputs.topic || '工作流全节点冒烟';\n" +
          "return [topic + '｜链路一：input → code → tool', topic + '｜链路二：loop → memory_write → memory_read', topic + '｜链路三：condition → sub_agent → llm → output'];",
      },
      position: { x: 700, y: 220 },
    },
    {
      id: 'n_loop', type: 'loop',
      config: { maxIterations: 3, iterateKey: 'item', bodyExpr: '' },
      position: { x: 920, y: 220 },
    },
    {
      id: 'n_loop_body', type: 'code',
      config: { expression: "return '第 ' + (ctx.inputs.index + 1) + ' 轮 · ' + ctx.inputs.item;" },
      position: { x: 920, y: 380 },
    },
    {
      id: 'n_mem_write', type: 'memory_write',
      config: { agentId: WF_SMOKE_MAIN_ID, contentKey: 'content', tags: ['workflow-smoke', '全节点冒烟'] },
      position: { x: 1140, y: 220 },
    },
    {
      id: 'n_mem_read', type: 'memory_read',
      config: { agentId: WF_SMOKE_MAIN_ID, query: '', topK: 3 },
      position: { x: 1360, y: 220 },
    },
    {
      id: 'n_cond', type: 'condition',
      config: {
        expression:
          'const last = ctx.outputs.size ? Array.from(ctx.outputs.values()).pop() : null;\n' +
          'return Array.isArray(last) && last.length > 0;',
      },
      position: { x: 1580, y: 220 },
    },
    {
      // inputsMapping 只能取 ctx.inputs.* （ctx.outputs 是 Map，路径取不到上游节点输出）
      id: 'n_sub', type: 'sub_agent',
      config: { subAgentId: WF_SMOKE_SUB_ID, inputsMapping: { topic: '${ctx.inputs.topic}' } },
      position: { x: 1800, y: 100 },
    },
    {
      // platformId/modelId 留空：启动时由 ensureBuiltinWorkflowModel() 按 agnes flash 自动回填
      id: 'n_llm', type: 'llm',
      config: {
        platformId: '', modelId: '',
        systemPrompt:
          '你是「工作流全节点冒烟」测试助手。输入是一段 JSON（子智能体产出的要点）。请输出 120 字以内中文简报，必须包含：' +
          '1) 本次主题；2) 已覆盖的节点类型清单（input/code/tool/loop/memory_write/memory_read/condition/sub_agent/llm/output）；' +
          '3) 一句话结论。不要输出代码块。',
        temperature: 0.3, maxTokens: 512,
      },
      position: { x: 2020, y: 100 },
    },
    {
      id: 'n_fallback', type: 'code',
      config: { expression: "return '[兜底分支] 未读到记忆条目，condition 走 false 分支';" },
      position: { x: 1800, y: 360 },
    },
    {
      id: 'n_output', type: 'output',
      config: { key: 'report' },
      position: { x: 2260, y: 220 },
    },
  ];

  const edges = [
    { id: 'e1', source: 'n_input', target: 'n_plan' },
    { id: 'e2', source: 'n_plan', target: 'n_tool' },
    { id: 'e3', source: 'n_tool', target: 'n_tasks' },
    { id: 'e4', source: 'n_tasks', target: 'n_loop' },
    { id: 'e5', source: 'n_loop', target: 'n_loop_body', sourceHandle: 'loop_body', label: 'body' },
    { id: 'e6', source: 'n_loop', target: 'n_mem_write', sourceHandle: 'loop_exit', label: 'exit' },
    { id: 'e7', source: 'n_mem_write', target: 'n_mem_read' },
    { id: 'e8', source: 'n_mem_read', target: 'n_cond' },
    { id: 'e9', source: 'n_cond', target: 'n_sub', sourceHandle: 'true', label: 'true' },
    { id: 'e10', source: 'n_cond', target: 'n_fallback', sourceHandle: 'false', label: 'false' },
    { id: 'e11', source: 'n_sub', target: 'n_llm' },
    { id: 'e12', source: 'n_llm', target: 'n_output' },
    { id: 'e13', source: 'n_fallback', target: 'n_output' },
  ];

  return { nodes, edges };
}

/** 幂等 seed：仅当 agent 不存在时插入（已存在不覆盖，保护用户在画布上的编辑）。 */
export function seedBuiltinWorkflowAgents(db: Database.Database): { seeded: string[] } {
  const seeded: string[] = [];
  const defs = [
    {
      id: WF_SMOKE_SUB_ID,
      name: '要点提炼子智能体（冒烟）',
      description: '供「工作流·全节点冒烟」的 sub_agent 节点调用：input → code → output，验证子智能体嵌套与出参回传',
      workflow: subWorkflow(),
    },
    {
      id: WF_SMOKE_MAIN_ID,
      name: '工作流·全节点冒烟',
      description:
        '一条 DAG 覆盖全部 10 种节点：input → code → tool(内置 task_plan) → code → loop(循环体 code) → memory_write → ' +
        'memory_read → condition(true: sub_agent → llm / false: code 兜底) → output。入参 { "topic": "..." }。',
      workflow: mainWorkflow(),
    },
  ];
  const has = db.prepare('SELECT id FROM agent WHERE id = ?');
  const insert = db.prepare(
    "INSERT INTO agent (id, user_id, name, description, system_prompt, type, builtin_tool_ids, sub_agent_ids, is_default, is_public, version, workflow_json, created_at, updated_at) VALUES (?, 'guest', ?, ?, NULL, 'workflow', '[]', '[]', 0, 1, 1, ?, ?, ?)"
  );
  for (const d of defs) {
    try {
      if (has.get(d.id)) continue;
      const now = Date.now();
      insert.run(d.id, d.name, d.description, JSON.stringify(d.workflow), now, now);
      seeded.push(d.id);
    } catch (e) {
      console.warn(`[builtin-wf] seed ${d.id} 失败:`, e);
    }
  }
  return { seeded };
}

/** LLM 节点模型自动回填：platformId/modelId 为空时，优先 agnes 平台的 flash 模型（免费额度友好）。 */
export function ensureBuiltinWorkflowModel(db: Database.Database): { filled: boolean } {
  try {
    const row = db.prepare('SELECT workflow_json FROM agent WHERE id = ?').get(WF_SMOKE_MAIN_ID) as { workflow_json: string } | undefined;
    if (!row) return { filled: false };
    const wf = JSON.parse(row.workflow_json);
    const llm = wf.nodes?.find((n: { type: string }) => n.type === 'llm');
    if (!llm?.config) return { filled: false };
    // modelId 非空且库中存在：跳过
    if (llm.config.modelId) {
      const hasModel = db.prepare('SELECT id FROM model WHERE platform_id = ? AND model_id = ?').get(llm.config.platformId, llm.config.modelId);
      if (hasModel) return { filled: false };
    }
    // 优先 agnes 平台 + flash；退而求其次任何平台的 flash；再退任意平台首个模型
    const pick = (sql: string) => db.prepare(sql).get() as { platform_id: string; model_id: string } | undefined;
    const m =
      pick("SELECT platform_id, model_id FROM model WHERE platform_id LIKE 'agnes-%' AND model_id LIKE '%flash%' LIMIT 1") ||
      pick("SELECT platform_id, model_id FROM model WHERE model_id LIKE '%flash%' LIMIT 1") ||
      pick('SELECT platform_id, model_id FROM model LIMIT 1');
    if (!m) return { filled: false };
    llm.config.platformId = m.platform_id;
    llm.config.modelId = m.model_id;
    db.prepare('UPDATE agent SET workflow_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(wf), Date.now(), WF_SMOKE_MAIN_ID);
    return { filled: true };
  } catch (e) {
    console.warn('[builtin-wf] 回填 LLM 模型失败:', e);
    return { filled: false };
  }
}
