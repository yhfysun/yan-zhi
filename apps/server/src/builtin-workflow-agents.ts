// 内置「调研报告生成助手」智能体：server 启动时幂等 seed。
// 定义版本 WF_DEF_VERSION 升级时强制覆盖库中副本（用于下发修正），平时仅首次创建、不覆盖用户编辑。
// 一条 DAG 以真实调研流程覆盖引擎全部 10 种节点类型：
//   input(主题) → code(生成提纲) → tool(builtin task_plan) → code(拆分调研维度)
//        → loop(loop_body: code 逐维度加工 / loop_exit: 继续)
//        → memory_write(归档) → memory_read(回查历史) → condition(true: sub_agent → llm 成稿 / false: code 兜底)
//        → output(调研报告)
import type Database from 'better-sqlite3';

export const WF_MAIN_ID = 'a_wf_smoke_all_nodes';
export const WF_SUB_ID = 'a_wf_smoke_editor';
/** 内置工作流定义版本：内容/结构修正时 +1，seed 会覆盖库中旧副本。 */
export const WF_DEF_VERSION = 3;

function subWorkflow() {
  return {
    nodes: [
      { id: 's_in', type: 'input', config: { schema: { topic: 'string' } }, position: { x: 60, y: 200 } },
      {
        id: 's_code', type: 'code',
        config: {
          expression:
            "const topic = ctx.inputs.topic || '未命名主题';\n" +
            "return { topic, generatedBy: '" + WF_SUB_ID + "', points: [topic + ' 的发展现状与核心事实', topic + ' 的关键驱动因素', topic + ' 的主要风险与待验证点'] };",
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
      id: 'n_outline', type: 'code',
      config: {
        expression:
          "const topic = ctx.inputs.topic || '未命名主题';\n" +
          "return { title: '调研提纲：' + topic, steps: [{ title: '现状梳理：核心事实与数据' }, { title: '关键要点：驱动因素与机会' }, { title: '结论建议：风险与下一步' }] };",
      },
      position: { x: 260, y: 220 },
    },
    {
      // arguments 为空对象 → 回落上游输出作为入参（保留「空 arguments 取上游」语义）
      id: 'n_plan', type: 'tool',
      config: { toolSource: 'builtin', toolName: 'task_plan', arguments: {} },
      position: { x: 480, y: 220 },
    },
    {
      id: 'n_dimensions', type: 'code',
      config: {
        expression:
          "const topic = ctx.inputs.topic || '未命名主题';\n" +
          "return [topic + '｜维度一：现状梳理（核心事实与数据）', topic + '｜维度二：关键要点（驱动因素与机会）', topic + '｜维度三：结论建议（风险与下一步）'];",
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
      config: { expression: "return '【调研维度 ' + (ctx.inputs.index + 1) + '/3】' + ctx.inputs.item;" },
      position: { x: 920, y: 380 },
    },
    {
      id: 'n_mem_write', type: 'memory_write',
      config: { agentId: WF_MAIN_ID, contentKey: 'content', tags: ['调研流水线', 'builtin-workflow'] },
      position: { x: 1140, y: 220 },
    },
    {
      id: 'n_mem_read', type: 'memory_read',
      config: { agentId: WF_MAIN_ID, query: '', topK: 3 },
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
      config: { subAgentId: WF_SUB_ID, inputsMapping: { topic: '${ctx.inputs.topic}' } },
      position: { x: 1800, y: 100 },
    },
    {
      // platformId/modelId 留空：启动时由 ensureBuiltinWorkflowModel() 按 agnes flash 自动回填
      id: 'n_llm', type: 'llm',
      config: {
        platformId: '', modelId: '',
        systemPrompt:
          '你是「调研报告生成助手」的成稿助手。输入是一段 JSON（子智能体提炼的调研要点）。请输出 150 字以内中文调研简报，结构包含：' +
          '1) 调研主题；2) 核心发现（合并要点中的现状/驱动/风险三部分）；' +
          '3) 一句话结论与建议。语气客观、条理清晰，不要输出代码块。',
        temperature: 0.3, maxTokens: 512,
      },
      position: { x: 2020, y: 100 },
    },
    {
      id: 'n_fallback', type: 'code',
      config: { expression: "return '[兜底分支] 记忆库中暂无历史调研归档，condition 走 false 分支，跳过成稿环节';" },
      position: { x: 1800, y: 360 },
    },
    {
      id: 'n_output', type: 'output',
      config: { key: 'report' },
      position: { x: 2260, y: 220 },
    },
  ];

  const edges = [
    { id: 'e1', source: 'n_input', target: 'n_outline' },
    { id: 'e2', source: 'n_outline', target: 'n_plan' },
    { id: 'e3', source: 'n_plan', target: 'n_dimensions' },
    { id: 'e4', source: 'n_dimensions', target: 'n_loop' },
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

/**
 * 幂等 seed：
 * - 不存在 → 插入；
 * - 存在且 version < WF_DEF_VERSION → 覆盖（下发定义修正，如还原被改坏的画布）；
 * - 其余情况跳过，保护用户在画布上的编辑。
 */
export function seedBuiltinWorkflowAgents(db: Database.Database): { seeded: string[]; restored: string[] } {
  const seeded: string[] = [];
  const restored: string[] = [];
  const defs = [
    {
      id: WF_SUB_ID,
      name: '调研要点提炼子助手',
      description: '供「调研报告生成助手」的 sub_agent 节点调用：input → code → output，从主题提炼现状/驱动/风险三方面要点',
      workflow: subWorkflow(),
    },
    {
      id: WF_MAIN_ID,
      name: '调研报告生成助手',
      description:
        '以真实调研流程覆盖全部 10 种节点：input(主题) → code(生成提纲) → tool(内置 task_plan) → code(拆分维度) → loop(逐维度加工) → ' +
        'memory_write(归档) → memory_read(回查) → condition(有归档: 子智能体提炼 → LLM 成稿 / 否则: code 兜底) → output。入参 { "topic": "..." }。',
      workflow: mainWorkflow(),
    },
  ];
  const has = db.prepare('SELECT id, version FROM agent WHERE id = ?');
  const insert = db.prepare(
    "INSERT INTO agent (id, user_id, name, description, system_prompt, type, builtin_tool_ids, sub_agent_ids, is_default, is_public, version, workflow_json, created_at, updated_at) VALUES (?, 'guest', ?, ?, NULL, 'workflow', '[]', '[]', 0, 1, ?, ?, ?, ?)"
  );
  const update = db.prepare(
    'UPDATE agent SET name = ?, description = ?, version = ?, workflow_json = ?, updated_at = ? WHERE id = ?'
  );
  for (const d of defs) {
    try {
      const now = Date.now();
      const row = has.get(d.id) as { id: string; version: number } | undefined;
      if (!row) {
        insert.run(d.id, d.name, d.description, WF_DEF_VERSION, JSON.stringify(d.workflow), now, now);
        seeded.push(d.id);
      } else if ((row.version ?? 1) < WF_DEF_VERSION) {
        update.run(d.name, d.description, WF_DEF_VERSION, JSON.stringify(d.workflow), now, d.id);
        restored.push(d.id);
      }
    } catch (e) {
      console.warn(`[builtin-wf] seed ${d.id} 失败:`, e);
    }
  }
  return { seeded, restored };
}

/** LLM 节点模型自动回填：platformId/modelId 为空时，优先 agnes 平台的 flash 模型（免费额度友好）。 */
export function ensureBuiltinWorkflowModel(db: Database.Database): { filled: boolean } {
  try {
    const row = db.prepare('SELECT workflow_json FROM agent WHERE id = ?').get(WF_MAIN_ID) as { workflow_json: string } | undefined;
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
    db.prepare('UPDATE agent SET workflow_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(wf), Date.now(), WF_MAIN_ID);
    return { filled: true };
  } catch (e) {
    console.warn('[builtin-wf] 回填 LLM 模型失败:', e);
    return { filled: false };
  }
}
