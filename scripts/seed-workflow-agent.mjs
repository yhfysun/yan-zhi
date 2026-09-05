#!/usr/bin/env node
// 创建「工作流·全节点冒烟」智能体（幂等，可重复执行覆盖同一批 id）。
//
// 目的：一条 DAG 覆盖引擎全部 10 种节点类型，方便端到端回归：
//   input → code → tool(builtin) → code → loop(loop_body: code / loop_exit: 继续)
//        → memory_write → memory_read → condition(true: sub_agent → llm / false: code)
//        → output
//
// 用法：
//   node scripts/seed-workflow-agent.mjs                     # 只创建/更新智能体
//   node scripts/seed-workflow-agent.mjs --run               # 创建后直接跑一遍冒烟（SSE 打印节点级进度）
//   node scripts/seed-workflow-agent.mjs --run --topic=xxx   # 指定入参 topic
//   node scripts/seed-workflow-agent.mjs --platform=<id> --model=<id>   # 指定 LLM 节点用的平台/模型
//
// 依赖：server 已启动（默认 http://127.0.0.1:3001），用 guest token（免登录，与桌面端一致）。

const BASE = (argOf('base') || process.env.YZ_API_BASE || 'http://127.0.0.1:3001').replace(/\/$/, '');

const MAIN_ID = 'a_wf_smoke_all_nodes';
const SUB_ID = 'a_wf_smoke_editor';

function argOf(name) {
  for (const a of process.argv.slice(2)) {
    const m = a.match(new RegExp(`^--${name}=(.*)$`));
    if (m) return m[1];
  }
  return process.argv.includes(`--${name}`) ? 'true' : '';
}

// ── HTTP ──
let TOKEN = '';
async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${body?.error || text.slice(0, 200)}`);
  return body.data !== undefined ? body.data : body;
}

async function guestLogin() {
  const r = await fetch(`${BASE}/api/auth/guest`, { method: 'POST' });
  const j = await r.json();
  if (!j?.token) throw new Error(`获取 guest token 失败：${JSON.stringify(j).slice(0, 200)}`);
  TOKEN = j.token;
  return j.user;
}

// ── 挑选 LLM 节点用的平台/模型：优先 agnes（云端），其次其它可用平台 ──
async function pickModel() {
  const forcedP = argOf('platform');
  const forcedM = argOf('model');
  const platforms = await api('/api/platforms');
  const ordered = [...platforms].sort((a, b) => {
    const score = (p) => (forcedP && p.id === forcedP ? -1 : /agnes/i.test(p.name || p.id) ? 0 : 1);
    return score(a) - score(b);
  });
  for (const p of ordered) {
    if (forcedP && p.id !== forcedP) continue;
    let models = [];
    try { models = await api(`/api/platforms/${p.id}/models`); } catch { continue; }
    const llm = models.filter((m) => {
      if (forcedM) return m.id === forcedM;
      const t = (m.type || '').toLowerCase();
      return t === '' || t === 'llm' || t === 'chat';
    });
    // 冒烟用轻量请求：同一平台内优先 flash 等便宜模型（agnes pro 级预扣费高，guest 余额容易不够）
    llm.sort((a, b) => (/flash/i.test(a.id) ? -1 : 0) - (/flash/i.test(b.id) ? -1 : 0));
    const pick = llm.find((m) => m.id === forcedM) || llm[0];
    if (pick) return { platformId: p.id, platformName: p.name, modelId: pick.id, modelName: pick.alias || pick.modelId };
  }
  return null;
}

// ── 工作流定义 ──
function mainWorkflow({ platformId, modelId }) {
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
      config: { agentId: MAIN_ID, contentKey: 'content', tags: ['workflow-smoke', '全节点冒烟'] },
      position: { x: 1140, y: 220 },
    },
    {
      id: 'n_mem_read', type: 'memory_read',
      config: { agentId: MAIN_ID, query: '', topK: 3 },
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
      config: { subAgentId: SUB_ID, inputsMapping: { topic: '${ctx.inputs.topic}' } },
      position: { x: 1800, y: 100 },
    },
    {
      id: 'n_llm', type: 'llm',
      config: {
        platformId, modelId,
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

function subWorkflow() {
  return {
    nodes: [
      { id: 's_in', type: 'input', config: { schema: { topic: 'string' } }, position: { x: 60, y: 200 } },
      {
        id: 's_code', type: 'code',
        config: {
          expression:
            "const topic = ctx.inputs.topic || '未命名主题';\n" +
            "return { topic, generatedBy: '" + SUB_ID + "', points: [topic + ' 的核心能力是否可用', topic + ' 的节点间数据是否正确传递', topic + ' 的异常分支是否可预期'] };",
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

// ── 幂等 upsert ──
async function upsertAgent({ id, name, description, type, workflow }) {
  const list = await api('/api/agents');
  const exists = list.some((a) => a.id === id);
  if (exists) {
    await api(`/api/agents/${id}`, { method: 'PATCH', body: JSON.stringify({ name, description, type, workflow }) });
    return 'updated';
  }
  await api('/api/agents', {
    method: 'POST',
    body: JSON.stringify({ id, name, description, type: type || 'workflow', workflow, version: 1 }),
  });
  return 'created';
}

// ── 冒烟运行：SSE 打印节点级进度 ──
async function smokeRun(agentRow, subRow, inputs) {
  const bundle = {
    agent: { id: agentRow.id, name: agentRow.name, workflow: JSON.parse(agentRow.workflow_json) },
    subAgents: {
      [subRow.id]: { id: subRow.id, name: subRow.name, workflow: JSON.parse(subRow.workflow_json) },
    },
  };
  const { runId } = await api('/api/workflow/run', { method: 'POST', body: JSON.stringify({ agent: bundle.agent, subAgents: bundle.subAgents, inputs }) });
  console.log(`\n▶ 运行已创建 runId=${runId}`);

  console.log('── 节点级事件 ──');
  await streamEvents(runId);

  const r = await api(`/api/workflow/runs/${runId}`);
  console.log(`\n状态：${r.status}${r.error ? '  错误：' + r.error : ''}`);
  if (r.result) console.log('输出：\n' + JSON.stringify(r.result, null, 2));
  return r.status;
}

async function streamEvents(runId) {
  const url = `${BASE}/api/workflow/runs/${runId}/stream?since=0`;
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  } catch (e) {
    console.log(`  (SSE 连接失败：${e.message}，改为轮询结果)`);
    return;
  }
  if (!res.ok || !res.body) { console.log('  (SSE 不可用，改为轮询结果)'); return; }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let ended = null;
  const deadline = Date.now() + 180000;
  try {
    while (!ended && Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const raw of parts) {
        const line = raw.trim();
        if (!line.startsWith('data: ')) continue;
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        if (ev.type === 'node:start') console.log(`  ⏳ ${pad(ev.nodeType)} ${ev.nodeId}`);
        else if (ev.type === 'node:ok') console.log(`  ✅ ${pad(ev.nodeType)} ${ev.nodeId}`);
        else if (ev.type === 'node:error') console.log(`  ❌ ${pad(ev.nodeType)} ${ev.nodeId}  ${ev.msg || ''}`);
        else if (ev.type === 'run:completed') ended = 'completed';
        else if (ev.type === 'run:failed') { ended = 'failed'; console.log(`  ❌ run:failed  ${ev.msg || ''}`); }
      }
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  if (!ended) console.log('  (等待超时，稍后用 runId 回查)');
}

function pad(s) { return String(s || '').padEnd(13, ' '); }

// ── main ──
async function main() {
  const user = await guestLogin();
  console.log(`身份：${user.username}  接口：${BASE}`);

  const model = await pickModel();
  if (!model) {
    console.warn('⚠️  没找到可用的平台/模型，LLM 节点将留空（请在画布里手动选择后保存）');
  } else {
    console.log(`LLM 节点：${model.platformName} / ${model.modelName}（${model.platformId} / ${model.modelId}）`);
  }

  const subRes = await upsertAgent({
    id: SUB_ID,
    name: '要点提炼子智能体（冒烟）',
    description: '供「工作流·全节点冒烟」的 sub_agent 节点调用：input → code → output，验证子智能体嵌套与出参回传',
    type: 'workflow',
    workflow: subWorkflow(),
  });
  console.log(`子智能体 ${SUB_ID}：${subRes}`);

  const mainRes = await upsertAgent({
    id: MAIN_ID,
    name: '工作流·全节点冒烟',
    description:
      '一条 DAG 覆盖全部 10 种节点：input → code → tool(内置 task_plan) → code → loop(循环体 code) → memory_write → ' +
      'memory_read → condition(true: sub_agent → llm / false: code 兜底) → output。入参 { "topic": "..." }。',
    type: 'workflow',
    workflow: mainWorkflow(model || { platformId: '', modelId: '' }),
  });
  console.log(`主智能体 ${MAIN_ID}：${mainRes}`);

  const rows = await api('/api/agents');
  const agentRow = rows.find((a) => a.id === MAIN_ID);
  const subRow = rows.find((a) => a.id === SUB_ID);

  const types = JSON.parse(agentRow.workflow_json).nodes.map((n) => n.type);
  console.log(`\n覆盖节点类型（${new Set(types).size} 种）：${[...new Set(types)].join(', ')}`);
  console.log(`打开画布：${BASE}/agents/${MAIN_ID}（桌面端同路径）`);
  console.log(`默认入参：{ "topic": "工作流引擎" }`);

  if (argOf('run')) {
    const topic = argOf('topic') || '工作流引擎';
    const status = await smokeRun(agentRow, subRow, { topic });
    process.exitCode = status === 'completed' ? 0 : 1;
  }
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  process.exitCode = 1;
});
